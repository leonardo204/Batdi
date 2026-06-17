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
import { fetchStandings } from '../services/stats-graph';

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
    // best-effort: DB 비활성/순위 미적재 → null (EmitA2UI 폴백 처리).
    const standingsData = await fetchStandings();
    return { standingsData };
  }

  return {};
}
