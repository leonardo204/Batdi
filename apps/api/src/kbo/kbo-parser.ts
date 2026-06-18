/**
 * kbo-parser.ts — KBO HTML 파서 (cheerio, 순수 함수, SSOT).
 *
 * 레퍼런스: github.com/colabear754/kbo-scraper 의 parseGameSchedule/parseTeamRank 포팅.
 * 네트워크/Playwright 와 분리된 순수 파서 — 픽스처 HTML 로 단위 테스트한다.
 * 픽스처(apps/api/test/fixtures/kbo/*.html)가 셀렉터 동작의 진실의 원천이다.
 */

import * as cheerio from 'cheerio';
import {
  cancellationReasonFromString,
  toTeamCode,
  type CancellationReason,
  type GameStatus,
  type SeriesTypeName,
  type TeamCode,
} from './kbo-teams';
import { GAMECENTER_TEAM_NAME_TO_ID } from './kbo.constants';

/** 파싱된 경기 1건 (KboGame 모델에 그대로 write 가능한 행) */
export interface KboGameRow {
  gameKey: string;
  season: number;
  seriesType: SeriesTypeName;
  /** "yyyy-MM-dd" ISO 날짜 문자열 (DB DateTime @db.Date 로 저장) */
  date: string;
  gameTime: string | null;
  awayTeam: TeamCode;
  homeTeam: TeamCode;
  awayScore: number | null;
  homeScore: number | null;
  relay: string | null;
  stadium: string | null;
  gameStatus: GameStatus;
  cancellationReason: CancellationReason | null;
}

/** 파싱된 타자 기본 스탯 1건 (BattingStat 모델에 write 가능한 행) */
export interface HitterStatRow {
  /** 선수명 (td[1]) */
  name: string;
  /** 내부 팀 코드 (인자로 받음 — td[2] 팀명은 무시) */
  teamId: string;
  season: number;
  /** 타율 (td[3], float, NaN→null) */
  avg: number | null;
  /** 경기수 (td[4], int, NaN→null) */
  games: number | null;
  /** 홈런 (td[11], int, NaN→null) */
  hr: number | null;
  /** 타점 (td[13], int, NaN→null) */
  rbi: number | null;
  /** 행 전체 td 텍스트 배열 (나머지 컬럼 보존, rawData 로 저장) */
  raw: string[];
}

/** 파싱된 투수 기본 스탯 1건 (PitchingStat 모델에 write 가능한 행) */
export interface PitcherStatRow {
  /** 선수명 (td[1]) */
  name: string;
  /** 내부 팀 코드 (인자로 받음 — td[2] 팀명은 무시) */
  teamId: string;
  season: number;
  /** 평균자책점 (td[3], float, NaN→null) */
  era: number | null;
  /** 경기수 (td[4], int, NaN→null) */
  games: number | null;
  /** 탈삼진 (td[15], int, NaN→null) */
  strikeouts: number | null;
  /** WHIP (td[18], float, NaN→null) */
  whip: number | null;
  /** 행 전체 td 텍스트 배열 (IP "81 1/3" 등 나머지 보존, rawData 로 저장) */
  raw: string[];
}

/** 파싱된 팀 시즌 기록 1건 (TeamSeasonRecord 모델에 그대로 write 가능한 행) */
export interface TeamSeasonRecordRow {
  season: number;
  team: TeamCode;
  teamRank: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  gamesBehind: number;
  recent10Games: string;
  streak: string;
}

/**
 * 표 HTML 을 cheerio 로 안전하게 로드한다.
 *
 * ⚠️ cheerio v1(parse5)은 HTML 명세대로 `<table>` 조상이 없는 `<tbody>/<tr>/<td>` 를
 *   foster-parenting 으로 폐기한다. 스크래퍼는 `#... > tbody` 의 outerHTML(= 맨몸 `<tbody>`)
 *   을 넘기므로, 그대로 load 하면 `$('tr')` 가 0건이 된다(픽스처는 full `<table>` 라 통과해
 *   회귀가 안 잡혔다). `<table>` 래퍼가 없으면 감싸서 table 컨텍스트를 보장한다.
 */
function loadRows(html: string): cheerio.CheerioAPI {
  const wrapped = /<table[\s>]/i.test(html) ? html : `<table>${html}</table>`;
  return cheerio.load(wrapped);
}

/** "season-MM-dd" 형태로 0-padding 한 ISO 날짜 문자열 생성 */
function toIsoDate(season: number, month: string, day: string): string {
  const mm = month.padStart(2, '0');
  const dd = day.padStart(2, '0');
  return `${season}-${mm}-${dd}`;
}

/** "yyyy-MM-dd" → "yyyyMMdd" (gameKey 용) */
function toCompactDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

/**
 * 경기일정 tbody HTML 파싱.
 *
 * 행 순회 규칙(레퍼런스 그대로):
 * - `td.play` 없으면 skip (이동일/빈 행).
 * - `td.day` 있으면 앞 5글자("05.02") split('.') → [month, day], currentDate carry-forward
 *   (rowspan 때문에 같은 날 여러 경기는 첫 행에만 td.day 가 있다).
 * - `td.time` 텍스트 trim → "HH:mm" (없거나 파싱 불가면 null).
 * - `td.play > span`(직계 span) → [awayTeamName, homeTeamName].
 * - `td.play em > span` 중 정수로 파싱되는 것만 → [awayScore?, homeScore?].
 * - `td:not([class])` 셀들(remainCells): relay=remainCells[1] innerHTML 의 <br>→',' 치환 trim,
 *   stadium=remainCells[3] text trim, cancellationReason=remainCells[last] text trim.
 * - gameStatus: cancellationReason 있으면 CANCELLED, scores 있으면 FINISHED, 아니면 SCHEDULED.
 * - gameKey: `${yyyyMMdd}-${awayCode}-${homeCode}-${count}` (더블헤더 카운트 1,2,...).
 */
export function parseGameSchedule(
  tbodyHtml: string,
  season: number,
  seriesType: SeriesTypeName,
): KboGameRow[] {
  const $ = loadRows(tbodyHtml);
  const rows: KboGameRow[] = [];

  // 같은 날 같은 대진의 더블헤더 카운트 추적: "yyyyMMdd-away-home" → count
  const gameCountMap = new Map<string, number>();
  // rowspan 때문에 td.day 가 없는 행은 직전 날짜를 이어 쓴다.
  let currentDate: string | null = null;

  $('tr').each((_, tr) => {
    const $tr = $(tr);

    // td.day 가 있으면 날짜 갱신 (앞 5글자 "MM.DD").
    const $day = $tr.find('td.day');
    if ($day.length > 0) {
      const dayText = $day.first().text().trim();
      const head = dayText.slice(0, 5); // "05.02"
      const parts = head.split('.');
      if (parts.length === 2 && parts[0] && parts[1]) {
        currentDate = toIsoDate(season, parts[0], parts[1]);
      }
    }

    // td.play 없으면 경기 행이 아니므로 skip (이동일 등).
    const $play = $tr.find('td.play');
    if ($play.length === 0) {
      return;
    }
    if (currentDate === null) {
      return;
    }

    // 시간: td.time 텍스트 trim → "HH:mm"
    const timeText = $tr.find('td.time').first().text().trim();
    const gameTime = /^\d{1,2}:\d{2}$/.test(timeText) ? timeText : null;

    // 팀명: td.play 직계 span 2개 (away, home). em > span 은 점수라 제외된다.
    const teamNames: string[] = [];
    $play
      .first()
      .children('span')
      .each((_, el) => {
        teamNames.push($(el).text().trim());
      });
    if (teamNames.length < 2) {
      return;
    }
    const awayTeam = toTeamCode(teamNames[0] ?? '');
    const homeTeam = toTeamCode(teamNames[1] ?? '');

    // 점수: td.play em > span 중 정수로 파싱되는 것만 (vs/공백 제외).
    const scores: number[] = [];
    $play
      .first()
      .find('em > span')
      .each((_, el) => {
        const t = $(el).text().trim();
        if (/^-?\d+$/.test(t)) {
          scores.push(Number.parseInt(t, 10));
        }
      });
    const awayScore = scores.length >= 1 ? (scores[0] ?? null) : null;
    const homeScore = scores.length >= 2 ? (scores[1] ?? null) : null;

    // class 없는 td 셀들 (highlight, TV, radio, stadium, 비고).
    const remainCells = $tr.find('td:not([class])').toArray();
    // relay: remainCells[1] (TV 셀) innerHTML 의 <br>→',' 치환 후 텍스트화.
    let relay: string | null = null;
    if (remainCells[1]) {
      const inner = $(remainCells[1]).html() ?? '';
      const replaced = inner.replace(/<br\s*\/?>/gi, ',');
      relay = cheerio.load(replaced).root().text().trim() || null;
    }
    // stadium: remainCells[3]
    const stadium =
      remainCells[3] != null
        ? $(remainCells[3]).text().trim() || null
        : null;
    // cancellationReason: remainCells[last] (비고 셀)
    const lastCell = remainCells[remainCells.length - 1];
    const cancelRaw = lastCell != null ? $(lastCell).text().trim() : '';
    const cancellationReason = cancellationReasonFromString(cancelRaw);

    // 경기 상태 판정.
    let gameStatus: GameStatus;
    if (cancellationReason !== null) {
      gameStatus = 'CANCELLED';
    } else if (awayScore !== null && homeScore !== null) {
      gameStatus = 'FINISHED';
    } else {
      gameStatus = 'SCHEDULED';
    }

    // gameKey: 더블헤더 카운트 부여.
    const compact = toCompactDate(currentDate);
    const baseKey = `${compact}-${awayTeam}-${homeTeam}`;
    const count = (gameCountMap.get(baseKey) ?? 0) + 1;
    gameCountMap.set(baseKey, count);
    const gameKey = `${baseKey}-${count}`;

    rows.push({
      gameKey,
      season,
      seriesType,
      date: currentDate,
      gameTime,
      awayTeam,
      homeTeam,
      awayScore,
      homeScore,
      relay,
      stadium,
      gameStatus,
      cancellationReason,
    });
  });

  return rows;
}

/** 안전한 정수 파싱 (실패 시 0) */
function parseIntSafe(raw: string): number {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** 안전한 실수 파싱 (실패 시 0) */
function parseFloatSafe(raw: string): number {
  const n = Number.parseFloat(raw.trim());
  return Number.isNaN(n) ? 0 : n;
}

/** best-effort 정수 파싱 (NaN→null). 선수 스탯 전용 — "-"/빈값/'-' 은 null. */
function parseIntOrNull(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isNaN(n) ? null : n;
}

/** best-effort 실수 파싱 (NaN→null). 선수 스탯 전용. */
function parseFloatOrNull(raw: string): number | null {
  const n = Number.parseFloat(raw.trim());
  return Number.isNaN(n) ? null : n;
}

/**
 * 팀순위 tbody HTML 파싱.
 *
 * 각 행 td 배열:
 * [0]rank [1]team명 [2]gamesPlayed [3]wins [4]losses [5]draws
 * [6]winRate(float) [7]gamesBehind(float) [8]recent10 [9]streak.
 */
export function parseTeamSeasonRecord(
  tbodyHtml: string,
  season: number,
): TeamSeasonRecordRow[] {
  const $ = loadRows(tbodyHtml);
  const rows: TeamSeasonRecordRow[] = [];

  $('tr').each((_, tr) => {
    const cells = $(tr).find('td').toArray();
    if (cells.length < 10) {
      return;
    }
    const cellText = (i: number): string =>
      cells[i] != null ? $(cells[i]).text().trim() : '';

    rows.push({
      season,
      team: toTeamCode(cellText(1)),
      teamRank: parseIntSafe(cellText(0)),
      gamesPlayed: parseIntSafe(cellText(2)),
      wins: parseIntSafe(cellText(3)),
      losses: parseIntSafe(cellText(4)),
      draws: parseIntSafe(cellText(5)),
      winRate: parseFloatSafe(cellText(6)),
      gamesBehind: parseFloatSafe(cellText(7)),
      recent10Games: cellText(8),
      streak: cellText(9),
    });
  });

  return rows;
}

/**
 * 타자 기본기록(table.tData01) HTML 파싱.
 *
 * thead 순서(td 인덱스): [0]순위 [1]선수명 [2]팀명 [3]AVG [4]G [5]PA [6]AB
 * [7]R [8]H [9]2B [10]3B [11]HR [12]TB [13]RBI [14]SAC [15]SF.
 * - 팀명(td[2])은 무시하고 인자 teamId 를 사용한다(드롭다운으로 이미 팀 필터됨).
 * - 순위행만(td[0] 가 정수로 파싱되는 행) — 합계/빈 행은 skip.
 * - 숫자는 best-effort(NaN→null). 전체 td 텍스트 배열을 raw 로 보존한다.
 */
export function parseHitterBasic(
  tableHtml: string,
  season: number,
  teamId: string,
): HitterStatRow[] {
  const $ = loadRows(tableHtml);
  const rows: HitterStatRow[] = [];

  $('tbody tr').each((_, tr) => {
    const cells = $(tr).find('td').toArray();
    if (cells.length < 14) {
      return; // 컬럼 부족 — 합계/빈 행 skip.
    }
    const cellText = (i: number): string =>
      cells[i] != null ? $(cells[i]).text().trim() : '';

    // 순위행만: td[0] 가 정수여야 한다(합계행은 "합계" 등 → skip).
    if (parseIntOrNull(cellText(0)) === null) {
      return;
    }

    const raw = cells.map((_c, i) => cellText(i));
    rows.push({
      name: cellText(1),
      teamId,
      season,
      avg: parseFloatOrNull(cellText(3)),
      games: parseIntOrNull(cellText(4)),
      hr: parseIntOrNull(cellText(11)),
      rbi: parseIntOrNull(cellText(13)),
      raw,
    });
  });

  return rows;
}

/**
 * 투수 기본기록(table.tData01) HTML 파싱.
 *
 * thead 순서(td 인덱스): [0]순위 [1]선수명 [2]팀명 [3]ERA [4]G [5]W [6]L
 * [7]SV [8]HLD [9]WPCT [10]IP [11]H [12]HR [13]BB [14]HBP [15]SO [16]R
 * [17]ER [18]WHIP.
 * - 팀명(td[2])은 무시하고 인자 teamId 사용. 순위행만(td[0] 정수). 합계/빈행 skip.
 * - IP "81 1/3" 같은 값은 파싱하지 않고 raw 에만 보존한다.
 * - 숫자는 best-effort(NaN→null). 전체 td 텍스트 배열을 raw 로 보존.
 */
export function parsePitcherBasic(
  tableHtml: string,
  season: number,
  teamId: string,
): PitcherStatRow[] {
  const $ = loadRows(tableHtml);
  const rows: PitcherStatRow[] = [];

  $('tbody tr').each((_, tr) => {
    const cells = $(tr).find('td').toArray();
    if (cells.length < 16) {
      return; // 컬럼 부족 — 합계/빈 행 skip.
    }
    const cellText = (i: number): string =>
      cells[i] != null ? $(cells[i]).text().trim() : '';

    if (parseIntOrNull(cellText(0)) === null) {
      return;
    }

    const raw = cells.map((_c, i) => cellText(i));
    rows.push({
      name: cellText(1),
      teamId,
      season,
      era: parseFloatOrNull(cellText(3)),
      games: parseIntOrNull(cellText(4)),
      strikeouts: parseIntOrNull(cellText(15)),
      whip: parseFloatOrNull(cellText(18)),
      raw,
    });
  });

  return rows;
}

/** 파싱된 경기 라인업 1건 (GameLineup 모델에 그대로 write 가능한 행, ADR-056) */
export interface GameLineupRow {
  /** g_id — gameKey (예 "20260618KTOB0") */
  gameKey: string;
  /** "yyyy-MM-dd" ISO 날짜 문자열 (g_dt 에서 파생, DB @db.Date) */
  gameDate: string;
  /** 한글명→teamId 매핑(미지원 팀 null) */
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** home_nm / away_nm (한글 표시명) */
  homeTeamName: string;
  awayTeamName: string;
  /** 선발투수명("선" 접두 제거). 미발표 시 null. */
  homeStarter: string | null;
  awayStarter: string | null;
  /** s_nm (구장) */
  stadium: string | null;
  /** "HH:mm" (top ul 마지막 li). 없으면 null. */
  gameTime: string | null;
  /** 경기 상태 원문(.staus, 예 "경기예정"). 없으면 "경기예정" 폴백. */
  status: string;
}

/** 한글 팀명 → 내부 teamId(미지원/빈값 null) */
export function teamNameToId(name: string | null | undefined): string | null {
  const key = (name ?? '').trim();
  if (key === '') {
    return null;
  }
  return GAMECENTER_TEAM_NAME_TO_ID[key] ?? null;
}

/** "yyyyMMdd" → "yyyy-MM-dd" (g_dt → ISO). 형식 불일치 시 그대로 반환. */
function gdtToIso(gdt: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(gdt.trim());
  if (!m) {
    return gdt.trim();
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * `.today-pitcher p` 텍스트에서 선발투수명을 추출한다("선" 접두/공백 제거).
 *   예) "선소형준 " → "소형준". 빈 문자열/없음 → null(미발표).
 *  - span.before("선") 가 텍스트에 포함되므로 선두 "선"을 1회 제거한다.
 */
export function extractStarterName(
  raw: string | null | undefined,
): string | null {
  let s = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (s === '') {
    return null;
  }
  // 선두 "선" 접두(span.before) 제거 — 한글 선발투수명이 "선X" 형태이므로 1회만 제거.
  if (s.startsWith('선')) {
    s = s.slice(1).trim();
  }
  return s === '' ? null : s;
}

/**
 * GameCenter 메인 HTML 파싱 → 경기별 선발 라인업 행 (ADR-056, 순수 함수).
 *
 * 입력: GameCenter 의 `li.game-cont` 들을 포함하는 HTML(전체 페이지 또는 game-cont 묶음).
 * 각 `li.game-cont` 의 데이터 속성(g_id/g_dt/s_nm/home_nm/away_nm) +
 * `.team.away/.team.home .today-pitcher` 텍스트(선발투수명) + `.staus`(상태) + `.top ul li`(시각)을
 * 읽어 GameLineupRow 로 변환한다.
 *
 *  - g_id(gameKey) 없는 항목은 skip(불완전 행).
 *  - away/home 은 .team.away / .team.home 구획을 **직접** 읽어 순서 모호성을 제거한다(실측 확정).
 *  - teamId 는 한글명(home_nm/away_nm) → teamNameToId(미지원 null).
 *  - 시각: `.top ul li` 중 "HH:mm" 패턴인 마지막 li. 없으면 null.
 *  - 상태: `.staus` 텍스트(원문 클래스 오타 그대로). 없으면 "경기예정" 폴백.
 */
export function parseLineups(html: string): GameLineupRow[] {
  const $ = cheerio.load(html);
  const rows: GameLineupRow[] = [];

  $('li.game-cont').each((_, li) => {
    const $li = $(li);
    const gameKey = ($li.attr('g_id') ?? '').trim();
    if (gameKey === '') {
      return; // gameKey 없으면 skip.
    }

    const gdt = ($li.attr('g_dt') ?? '').trim();
    const homeTeamName = ($li.attr('home_nm') ?? '').trim();
    const awayTeamName = ($li.attr('away_nm') ?? '').trim();
    const stadiumAttr = ($li.attr('s_nm') ?? '').trim();

    const homeStarter = extractStarterName(
      $li.find('.team.home .today-pitcher').first().text(),
    );
    const awayStarter = extractStarterName(
      $li.find('.team.away .today-pitcher').first().text(),
    );

    // 상태(.staus — 원문 클래스 오타 그대로). 없으면 예정 폴백.
    const statusText = $li
      .find('.staus')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    const status = statusText !== '' ? statusText : '경기예정';

    // 시각: top ul 의 li 중 "HH:mm" 패턴(마지막). 없으면 null.
    let gameTime: string | null = null;
    $li.find('.top ul li').each((_i, el) => {
      const t = $(el).text().trim();
      if (/^\d{1,2}:\d{2}$/.test(t)) {
        gameTime = t;
      }
    });

    rows.push({
      gameKey,
      gameDate: gdtToIso(gdt),
      homeTeamId: teamNameToId(homeTeamName),
      awayTeamId: teamNameToId(awayTeamName),
      homeTeamName,
      awayTeamName,
      homeStarter,
      awayStarter,
      stadium: stadiumAttr !== '' ? stadiumAttr : null,
      gameTime,
      status,
    });
  });

  return rows;
}
