/**
 * ScoreGraph 서비스 (P2-W5.5 — score intent 실데이터 배선)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.5 (ServiceSubgraph summary/ref 분리),
 *       CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만"
 *
 * 책임:
 *  - 크롤러가 적재한 `kbo_games`(Prisma KboGame)에서 score 카드용 실데이터를 읽어
 *    템플릿(score_compact)의 ScoreData 모양으로 변환한다.
 *  - 핵심 매핑/선택 로직(pickRelevantGame/gameRowToScoreData/TEAM_DISPLAY_NAME)은
 *    **순수 함수**로 분리해 단위테스트가 DB 없이 직접 검증한다.
 *  - DB 접근(fetchScoreData)은 getPrisma() best-effort — DATABASE_URL 없음/연결 실패/
 *    쿼리 에러 시 null 을 반환하고 절대 throw 하지 않는다(graceful degradation).
 *
 * ⚠️ ScoreData 모양(home/away/inning)은 score_compact 템플릿 bind 경로와 1:1 이라 불변.
 *    숫자(점수)는 home.score/away.score 슬롯에만 싣고, inning 은 "월/일 상태라벨" 문자열로
 *    repurpose 한다(리액션 텍스트엔 숫자 금지 계약 불변).
 */
import type { GameStatusName, ScoreData } from '../databind/compile';
import { getPrisma } from '../utils/prisma';

// ScoreData/GameStatusName 모양은 compile.ts 가 SSOT. score-graph 소비자가 한 곳에서
// import 하도록 re-export.
export type { ScoreData, GameStatusName } from '../databind/compile';

/**
 * KboGame 행에서 ScoreGraph 가 읽는 필드의 최소 구조(읽기 전용).
 * Prisma KboGame 모델의 부분집합이라 prisma.kboGame 결과를 그대로 받는다.
 */
export interface KboGameRow {
  gameKey: string;
  season: number;
  date: Date;
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
  gameStatus: string; // SCHEDULED|PLAYING|FINISHED|CANCELLED
  cancellationReason: string | null;
}

/** 팀 코드 → 한글 표기 맵 (DB 팀코드는 임의 문자열이라 string 키) */
export const TEAM_DISPLAY_NAME: Record<string, string> = {
  doosan: '두산',
  samsung: '삼성',
  lotte: '롯데',
  hanwha: '한화',
  lg: 'LG',
  kia: 'KIA',
  heroes: '키움',
  nc: 'NC',
  kt: 'KT',
  ssg: 'SSG',
};

/** gameStatus → 한글 상태 라벨 (취소는 사유 있으면 괄호로 덧붙임) */
function statusKo(status: string, cancellationReason: string | null): string {
  switch (status) {
    case 'FINISHED':
      return '경기 종료';
    case 'SCHEDULED':
      return '경기 예정';
    case 'PLAYING':
      return '경기 중';
    case 'CANCELLED': {
      const reason = cancellationReason?.trim();
      return reason ? `취소(${reason})` : '취소';
    }
    default:
      return status;
  }
}

/** gameStatus 원본 → 정규화 상태명. 알 수 없는 값은 'UNKNOWN' 으로 수렴(템플릿 선택용) */
function normalizeStatus(status: string): GameStatusName {
  switch (status) {
    case 'FINISHED':
    case 'SCHEDULED':
    case 'PLAYING':
    case 'CANCELLED':
      return status;
    default:
      return 'UNKNOWN';
  }
}

/** 팀 코드 → 한글명. 미지/빈 코드는 '??' (코드 자체가 있으면 코드 그대로 노출하지 않음) */
function teamName(code: string | null | undefined): string {
  if (code === null || code === undefined || code.trim() === '') {
    return '??';
  }
  return TEAM_DISPLAY_NAME[code] ?? code;
}

/**
 * kbo_games 행 배열에서 가장 관련 깊은 1경기를 선택한다(순수 함수).
 *
 * 우선순위:
 *  ① gameStatus === 'FINISHED' 중 date 최신
 *  ② (FINISHED 없으면) 상태 무관 date 최신
 *
 * @param rows  이미 해당 팀+시즌 필터된 행 배열로 가정(추가 필터 안 함).
 * @returns 선택된 행, 빈 배열이면 null.
 */
export function pickRelevantGame(
  rows: KboGameRow[],
  _teamId?: string,
): KboGameRow | null {
  if (rows.length === 0) {
    return null;
  }
  const byDateDesc = (a: KboGameRow, b: KboGameRow): number =>
    b.date.getTime() - a.date.getTime();

  // ① FINISHED 중 date 최신
  const finished = rows
    .filter((r) => r.gameStatus === 'FINISHED')
    .sort(byDateDesc);
  if (finished.length > 0) {
    return finished[0] ?? null;
  }

  // ② 상태 무관 date 최신
  const all = [...rows].sort(byDateDesc);
  return all[0] ?? null;
}

/**
 * KboGame 행 → ScoreData 변환(순수 함수).
 *
 *  - home.name/away.name = TEAM_DISPLAY_NAME 한글 매핑
 *  - home.score/away.score = homeScore/awayScore ?? 0 (숫자 슬롯)
 *  - inning = "M/D {상태라벨}" (상태 라벨로 repurpose — 숫자는 점수 슬롯에만)
 */
export function gameRowToScoreData(
  row: KboGameRow,
  _teamId?: string,
): ScoreData {
  const month = row.date.getMonth() + 1; // 0-base → 1-base
  const day = row.date.getDate();
  const label = statusKo(row.gameStatus, row.cancellationReason);
  return {
    home: { name: teamName(row.homeTeam), score: row.homeScore ?? 0 },
    away: { name: teamName(row.awayTeam), score: row.awayScore ?? 0 },
    inning: `${month}/${day} ${label}`,
    // 템플릿 선택 전용 정규화 상태(카드 bind 슬롯 아님 — resolveScoreTemplate 가 소비).
    status: normalizeStatus(row.gameStatus),
  };
}

/**
 * score 카드용 실데이터를 DB(kbo_games)에서 읽어 ScoreData 로 반환한다.
 *
 * best-effort: getPrisma() undefined(테스트/DATABASE_URL 없음) 또는 쿼리 실패 시 null.
 * 절대 throw 하지 않는다(호출부 DataBinder 가 null → emit 폴백 처리).
 *
 *  - 현재 시즌(연도 = new Date().getFullYear())
 *  - ⚠️ `date <= 오늘` 상한 필수: KBO 시즌은 11월까지라 상한 없이 date desc 하면 최신 10건이
 *    전부 먼 미래 SCHEDULED 가 잡혀(예: 9월 예정) 최근 결과(FINISHED)를 놓친다. 오늘 이전
 *    경기로 좁혀 pickRelevantGame 이 최근 FINISHED 를 고르게 한다("스코어 어땠어"=최근 결과).
 *  - teamId 있으면 homeTeam=teamId OR awayTeam=teamId, 없으면 팀 필터 없이 최신 FINISHED
 *  - date desc, take 10 → pickRelevantGame → gameRowToScoreData
 *
 * @returns ScoreData | null
 */
export async function fetchScoreData(
  teamId?: string,
): Promise<ScoreData | null> {
  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성(테스트/DATABASE_URL 없음) → best-effort null
  }

  const now = new Date();
  const season = now.getFullYear();
  // 오늘 끝(23:59:59.999)까지 포함 — 오늘 경기(예정/진행/종료)는 잡고 미래는 제외.
  const today = new Date(now);
  today.setHours(23, 59, 59, 999);

  try {
    const rows = (await prisma.kboGame.findMany({
      where:
        teamId && teamId.trim() !== ''
          ? {
              season,
              date: { lte: today },
              OR: [{ homeTeam: teamId }, { awayTeam: teamId }],
            }
          : // 팀 미지정: 최신 FINISHED 위주로 선택 (pickRelevantGame 이 우선순위 처리)
            { season, gameStatus: 'FINISHED', date: { lte: today } },
      orderBy: { date: 'desc' },
      take: 10,
    })) as KboGameRow[];

    const picked = pickRelevantGame(rows, teamId);
    if (!picked) {
      return null;
    }
    return gameRowToScoreData(picked, teamId);
  } catch {
    // 연결/쿼리 실패 → best-effort null (그래프 실행 막지 않음, emit 폴백)
    return null;
  }
}
