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
