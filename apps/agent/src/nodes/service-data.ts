/**
 * ServiceData 노드 (P2-W4.7 — ServiceSubgraph stub, 병렬 실행 분기)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.2(병렬 실행 규칙)·ADR-011
 *   "CacheLookup L0 MISS 이후 PersonalContext 와 ServiceSubgraph 는 의존성 없음 →
 *    LangGraph add_edge 분기로 동시 디스패치(Promise.all 효과)."
 *
 * 책임: intent 별 정형 데이터(서비스 데이터)를 DB 에서 읽어 state 에 적재한다.
 *  - score → ScoreGraph(fetchScoreData) → state.scoreData
 *  - stats → StatsGraph(fetchStandings) → state.standingsData
 *  - 그 외 intent → no-op({}).
 *
 * ⚠️ PersonalContext 노드와 **병렬**로 실행된다(graph: cacheLookup MISS →
 *   [personalContextNode, serviceData] 동시 디스패치 → uiComposer 에서 join).
 *   둘은 서로 다른 state 채널만 갱신(personalContext vs scoreData/standingsData)하므로
 *   lastValue reducer 충돌이 없다.
 *
 * best-effort: fetch* 는 DB 비활성/데이터 없음 시 null(throw 금지). null 이면 EmitA2UI 가
 *   폴백 텍스트 카드로 방출한다(DataFallbackHandler).
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import { fetchScoreData } from '../services/score-graph';
import {
  fetchStandings,
  fetchPlayerLeaderboard,
  detectStatKind,
} from '../services/stats-graph';
import { fetchRandomMeme } from '../services/meme-graph';

export async function serviceData(
  state: CoreGraphState,
): Promise<CoreGraphUpdate> {
  // 방어적: 가드레일 차단 흐름이면 조회하지 않는다(graph 에서도 우회).
  if (state.inputGuardrailResult?.pass === false) {
    return {};
  }

  if (state.intent === 'score') {
    // best-effort: DB 비활성/경기 없음 → null (EmitA2UI 폴백 처리).
    const scoreData = await fetchScoreData(state.teamId);
    return { scoreData };
  }

  if (state.intent === 'stats') {
    // statType 분기(P3-W7 7.3b):
    //  - 'player'    → 팀 선수 리더보드(타율/방어율 등). detectStatKind 로 타자/투수 판정.
    //  - else(standings/undefined) → 팀 순위(기존).
    if (state.statType === 'player') {
      const kind = detectStatKind(state.userMessageNormalized);
      // best-effort: DB 비활성/teamId 없음/4팀 외/미적재 → null (EmitA2UI 폴백 처리).
      const playerStats = await fetchPlayerLeaderboard(state.teamId, kind);
      return { playerStats, standingsData: undefined };
    }
    // best-effort: DB 비활성/순위 미적재 → null (EmitA2UI 폴백 처리).
    const standingsData = await fetchStandings();
    return { standingsData };
  }

  if (state.intent === 'meme') {
    // P3-W8 8.2: 팀별 밈을 랜덤 1건 선택(memes 테이블). best-effort 로 항상 비어있지
    // 않은 문자열 반환(DB 없음/빈 결과 → STATIC_MEMES 폴백). EmitA2UI 가 meme 분기에서
    // 단일 Text 카드로 방출(chat LLM 미경유). 랜덤이라 L0 캐시 write 안 함(emit 에서 생략).
    const memeContent = await fetchRandomMeme(state.teamId);
    return { memeContent };
  }

  return {};
}
