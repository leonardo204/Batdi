/**
 * ScheduleGraph 서비스 (schedule intent — 오늘 이후 경기 일정 리스트 카드 실데이터 배선, ADR-052)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-052, §3.5,
 *       CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만".
 *
 * 책임:
 *  - 크롤러가 적재한 `kbo_games`(Prisma KboGame)에서 오늘 이후 예정 경기 5건을 한 줄씩
 *    미리 포맷된 문자열(line)로 변환해 schedule_compact 템플릿 슬롯(date + rows.N.line)에 싣는다.
 *  - 포맷 로직(formatScheduleLine)은 **순수 함수**로 분리해 DB 없이 단위테스트한다.
 *  - DB 접근(fetchScheduleData)은 getPrisma() best-effort — DATABASE_URL 없음/연결 실패/쿼리
 *    에러/빈 결과 시 null 을 반환하고 절대 throw 하지 않는다(emit 폴백 텍스트 카드).
 *
 * news-graph.ts(formatNewsLine + fetchNewsData + 5슬롯 패딩)·score-graph.ts(kbo_games 조회)
 * 평행 패턴. ⚠️ 일정은 LLM 감정 리액션을 생성하지 않으므로 schedule_compact 에는 /reaction 슬롯이 없다(L1).
 */
import { getPrisma } from '../utils/prisma';
import { TEAM_DISPLAY_NAME } from './score-graph';

/** 경기 일정 한 줄 (미리 포맷된 문자열 — 카드의 단일 Text 노드 1개에 대응) */
export interface ScheduleRow {
  line: string;
}

/**
 * 경기 일정 데이터 (schedule_compact 템플릿 bind 경로와 1:1).
 *   - date: 헤더 캡션(예: "6월 18일 기준")
 *   - rows.N.line: N번째 경기 한 줄(사전 포맷 문자열, 최대 5건 — 부족분은 공백 패딩)
 */
export interface ScheduleData {
  date: string;
  rows: ScheduleRow[];
}

/**
 * kbo_games 행에서 ScheduleGraph 가 읽는 필드의 최소 구조(읽기 전용).
 * Prisma KboGame 모델의 부분집합이라 prisma.kboGame 결과를 그대로 받는다.
 */
export interface KboScheduleRow {
  date: Date;
  homeTeam: string;
  awayTeam: string;
  gameTime: string | null;
  stadium: string | null;
}

/** 경기 일정 줄 개수 (schedule_compact rows.0.line..rows.4.line 과 일치 — 오늘 이후 5경기) */
const SCHEDULE_ROW_COUNT = 5;

/** 요일 한글 라벨(0=일 .. 6=토) */
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** 팀 코드 → 한글명. 미지/빈 코드는 코드 그대로(없으면 '??') */
function teamName(code: string | null | undefined): string {
  if (code === null || code === undefined || code.trim() === '') {
    return '??';
  }
  return TEAM_DISPLAY_NAME[code] ?? code;
}

/**
 * kbo_games 1행 → 경기 일정 카드 한 줄 문자열(순수 함수).
 *
 * 포맷: `M/D(요일) 홈 vs 원정 · 구장/시각`
 *   예) "6/18(수) 한화 vs 두산 · 대전/18:30"
 *
 *  - 날짜(M/D)와 요일은 row.date 에서 파생. 홈/원정은 한글 팀명.
 *  - 구장(stadium)·시각(gameTime)이 모두 없으면 ` · ` 꼬리표를 생략한다.
 *  - 수치(날짜/시각)는 사전 포맷 문자열 안에만 존재(LLM 미생성, ADR-019).
 */
export function formatScheduleLine(game: KboScheduleRow): string {
  const month = game.date.getMonth() + 1; // 0-base → 1-base
  const day = game.date.getDate();
  const weekday = WEEKDAY_KO[game.date.getDay()] ?? '';
  const home = teamName(game.homeTeam);
  const away = teamName(game.awayTeam);

  const stadium = (game.stadium ?? '').trim();
  const time = (game.gameTime ?? '').trim();
  // 구장/시각 꼬리표: 둘 다 있으면 "구장/시각", 하나만 있으면 그것만, 없으면 생략.
  let tail = '';
  if (stadium !== '' && time !== '') {
    tail = ` · ${stadium}/${time}`;
  } else if (stadium !== '') {
    tail = ` · ${stadium}`;
  } else if (time !== '') {
    tail = ` · ${time}`;
  }

  return `${month}/${day}(${weekday}) ${home} vs ${away}${tail}`;
}

/**
 * schedule 카드용 실데이터를 DB(kbo_games)에서 읽어 ScheduleData 로 반환한다.
 *
 * best-effort: getPrisma() undefined(테스트/DATABASE_URL 없음) 또는 쿼리 실패/빈 결과 시 null.
 * 절대 throw 하지 않는다(호출부 emit 이 null → 폴백 텍스트 카드 처리).
 *
 *  - 오늘 0시 이후(date >= 오늘 0시)
 *  - 팀 관련(teamId 있으면 homeTeam=teamId OR awayTeam=teamId, 없으면 전체)
 *  - 미종료(gameStatus 'SCHEDULED' 또는 'PLAYING' — 종료/취소 제외)
 *  - date asc, take 5 → 각 행 formatScheduleLine
 *  - 빈 결과 → null
 *  - news-graph 와 동일하게 5슬롯(rows.0..rows.4) 전부 바인딩되도록 공백 줄 패딩.
 *
 * @param teamId 팀 코드(undefined 면 전체 경기)
 * @returns ScheduleData | null
 */
export async function fetchScheduleData(
  teamId?: string,
): Promise<ScheduleData | null> {
  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성(테스트/DATABASE_URL 없음) → best-effort null
  }

  const now = new Date();
  // 오늘 0시(자정) — 오늘 이후(오늘 경기 포함) 예정 경기만.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // teamId 있으면 홈/원정 OR 필터, 없으면 팀 필터 없음.
  const teamFilter =
    teamId !== undefined && teamId.trim() !== ''
      ? { OR: [{ homeTeam: teamId }, { awayTeam: teamId }] }
      : {};

  try {
    const rows = (await prisma.kboGame.findMany({
      where: {
        date: { gte: today },
        // 미종료(예정/진행) 경기만 — 종료/취소는 제외.
        gameStatus: { in: ['SCHEDULED', 'PLAYING'] },
        ...teamFilter,
      },
      orderBy: { date: 'asc' },
      take: SCHEDULE_ROW_COUNT,
    })) as KboScheduleRow[];

    if (rows.length === 0) {
      return null; // 예정 경기 없음 → 폴백
    }

    // 헤더 캡션: "M월 D일 기준" (오늘 날짜 — 수치는 캡션 문자열 안에만).
    const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 기준`;

    // schedule_compact 는 rows.0.line..rows.4.line 5슬롯을 전부 바인딩한다(validateBindings).
    // 예정 경기가 5건 미만이어도 카드가 렌더되도록 빈 줄(공백)로 패딩해 5건을 채운다.
    const lines = rows.map((r) => ({ line: formatScheduleLine(r) }));
    while (lines.length < SCHEDULE_ROW_COUNT) {
      lines.push({ line: ' ' });
    }
    return { date: dateLabel, rows: lines };
  } catch {
    // 연결/쿼리 실패 → best-effort null (그래프 실행 막지 않음, emit 폴백)
    return null;
  }
}
