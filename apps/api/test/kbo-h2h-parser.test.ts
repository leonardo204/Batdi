/**
 * kbo-h2h-parser.test.ts — parseHeadToHead 단위 테스트 (ADR-057).
 *
 * 상대전적 매트릭스 표 HTML(실측 구조 축소판)을 파싱해:
 *  - 각 (행팀, 컬럼상대) 쌍 분해, ■(자기)·합계 컬럼 제외, "W-L-D" 분해,
 *  - 한글 팀명 → teamId 매핑(행팀/컬럼팀 모두), 미지원 컬럼 opponentId=null 보존,
 *  - 행팀 unknown 행 전체 skip
 * 를 검증한다. 픽스처 없이 인라인 HTML 로 셀렉터 동작을 고정한다.
 */
import { describe, it, expect } from 'vitest';
import { parseHeadToHead } from '../src/kbo/kbo-parser';

/**
 * 실측 매트릭스 축소판: 3행(LG/KT/삼성) × 헤더(팀명 + LG/KT/삼성 + 합계).
 * 실제 페이지는 10팀이지만 파싱 규칙(쌍 분해/■/합계 제외)은 동일하다.
 */
const MATRIX_HTML = `
<table class="tData">
  <thead>
    <tr>
      <th>팀명</th>
      <th>LG(승-패-무)</th>
      <th>KT(승-패-무)</th>
      <th>삼성(승-패-무)</th>
      <th>합계</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>LG</td><td>■</td><td>3-5-0</td><td>2-3-0</td><td>5-8-0</td></tr>
    <tr><td>KT</td><td>5-3-0</td><td>■</td><td>3-5-0</td><td>8-8-0</td></tr>
    <tr><td>삼성</td><td>3-2-0</td><td>5-3-0</td><td>■</td><td>8-5-0</td></tr>
  </tbody>
</table>
`;

describe('parseHeadToHead', () => {
  it('각 (행팀, 컬럼상대) 쌍 분해 — ■(자기)·합계 컬럼 제외', () => {
    const rows = parseHeadToHead(MATRIX_HTML, 2026);
    // 3팀 × (자기 제외 2상대) = 6쌍. 합계 컬럼은 제외.
    expect(rows).toHaveLength(6);
    // 합계 셀(5-8-0 등)이 행으로 들어오지 않았는지: opponentName 에 '합계' 없음.
    expect(rows.some((r) => r.opponentName === '합계')).toBe(false);
  });

  it('W-L-D 분해 + 행팀/컬럼팀 teamId 매핑(LG vs KT 3-5-0)', () => {
    const rows = parseHeadToHead(MATRIX_HTML, 2026);
    const lgVsKt = rows.find(
      (r) => r.teamId === 'lg' && r.opponentId === 'kt',
    );
    expect(lgVsKt).toBeDefined();
    expect(lgVsKt).toMatchObject({
      season: 2026,
      teamId: 'lg',
      opponentId: 'kt',
      opponentName: 'KT',
      wins: 3,
      losses: 5,
      draws: 0,
    });
  });

  it('자기자신(■) 셀은 행으로 만들지 않는다(LG vs LG 없음)', () => {
    const rows = parseHeadToHead(MATRIX_HTML, 2026);
    expect(rows.some((r) => r.teamId === 'lg' && r.opponentId === 'lg')).toBe(
      false,
    );
  });

  it('삼성 vs LG 3-2-0 — 컬럼명에서 "(승-패-무)" 제거', () => {
    const rows = parseHeadToHead(MATRIX_HTML, 2026);
    const samVsLg = rows.find(
      (r) => r.teamId === 'samsung' && r.opponentId === 'lg',
    );
    expect(samVsLg?.opponentName).toBe('LG');
    expect(samVsLg).toMatchObject({ wins: 3, losses: 2, draws: 0 });
  });

  it('미지원 컬럼팀 → opponentId null + opponentName 보존', () => {
    const html = `
      <table class="tData">
        <thead><tr><th>팀명</th><th>LG(승-패-무)</th><th>미래구단(승-패-무)</th><th>합계</th></tr></thead>
        <tbody>
          <tr><td>LG</td><td>■</td><td>4-2-0</td><td>4-2-0</td></tr>
        </tbody>
      </table>`;
    const rows = parseHeadToHead(html, 2026);
    const vsUnknown = rows.find((r) => r.opponentName === '미래구단');
    expect(vsUnknown).toBeDefined();
    expect(vsUnknown?.opponentId).toBeNull();
    expect(vsUnknown).toMatchObject({ teamId: 'lg', wins: 4, losses: 2 });
  });

  it('행팀이 미식별(unknown)이면 그 행 전체 skip', () => {
    const html = `
      <table class="tData">
        <thead><tr><th>팀명</th><th>LG(승-패-무)</th><th>합계</th></tr></thead>
        <tbody>
          <tr><td>미래구단</td><td>2-1-0</td><td>2-1-0</td></tr>
          <tr><td>LG</td><td>■</td><td>0-0-0</td></tr>
        </tbody>
      </table>`;
    const rows = parseHeadToHead(html, 2026);
    expect(rows.every((r) => r.teamId !== 'unknown')).toBe(true);
    // 미래구단 행은 전부 skip → LG 행만 남는데 ■뿐이라 0쌍.
    expect(rows).toHaveLength(0);
  });

  it('헤더 미발견(매트릭스 표 아님) → 빈 배열', () => {
    const html = `<table><tbody><tr><td>아무거나</td></tr></tbody></table>`;
    expect(parseHeadToHead(html, 2026)).toEqual([]);
  });
});
