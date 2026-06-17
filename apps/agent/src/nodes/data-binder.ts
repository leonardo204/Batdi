/**
 * DataBinder 노드 (W2 → P2-W5.5 ScoreGraph 실데이터 배선)
 *
 * SSOT: CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만",
 *       Ref-docs/specs/design/batdi-architecture.md §3.5 (ServiceSubgraph summary/ref)
 *
 * 책임: score intent 일 때 ScoreGraph(fetchScoreData)로 kbo_games 실데이터를 읽어
 * state.scoreData 에 보관한다. TeamPersona(리액션 맥락)·EmitA2UI(카드 데이터)가 소비한다.
 *
 *  - 입력 가드레일 차단 흐름은 graph 조건부 엣지로 이 노드를 우회하므로, 도달 = 통과.
 *    (방어적으로도 pass===false 면 조회하지 않는다.)
 *  - fetchScoreData 는 best-effort — DB 비활성/경기 없음 시 null(throw 금지). null 이면
 *    EmitA2UI 가 폴백 텍스트 카드로 방출한다(DataFallbackHandler).
 *  - score 외 intent 는 no-op({}). (템플릿/슬롯 컴파일 자체는 EmitA2UI 가 수행.)
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import { fetchScoreData } from '../services/score-graph';

export async function dataBinder(
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

  return {};
}
