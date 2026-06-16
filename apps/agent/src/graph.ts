/**
 * 밧디 (batdi) — Core StateGraph (P1-W2-A)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.2 (노드 흐름),
 *       Ref-docs/specs/interface/batdi-routing.md (IntentRouter)
 *
 * 직선 파이프라인 (결정론, LLM은 chat fallthrough + W6 리액션 + W4.3 의미 가드레일에서만):
 *   START → Normalizer → InputGuardrail → SemanticGuardrail → IntentRouter → CacheLookup
 *         → UIComposer → DataBinder → TeamPersona → OutputGuardrail → EmitA2UI → END
 *
 * 보존 계약:
 *  - messages 채널 보존(MessagesAnnotation.spec) → CopilotKit 라운드트립/브라우저 채팅.
 *  - EmitA2UI: score 는 render_a2ui 툴콜을 manually_emit_tool_call 커스텀 이벤트로
 *    스트리밍 방출(W2-B, ADR-020 Path C) → a2ui 미들웨어가 surface 렌더.
 *    chat 은 plain text AIMessage(기존 채팅 E2E 유지). a2uiEnvelope 는 state 디버그 채널.
 *  - langgraph.json graphId "batdi" 유지.
 *
 * W2 제외(P2+): ServiceSubgraph 분기, 실제 캐시(L0~L3), PersonalContext/TeamPersona,
 *   LangGraph 병렬 실행(Promise.all), LLM UIComposer(composite).
 */
import { END, START, StateGraph } from '@langchain/langgraph';
import { CoreStateAnnotation } from './state';
import { normalizer } from './nodes/normalizer';
import { inputGuardrail } from './nodes/input-guardrail';
import { semanticGuardrail } from './nodes/semantic-guardrail';
import { intentRouter } from './nodes/intent-router';
import { cacheLookup } from './nodes/cache-lookup';
import { personalContext } from './nodes/personal-context';
import { uiComposer } from './nodes/ui-composer';
import { dataBinder } from './nodes/data-binder';
import { teamPersona } from './nodes/team-persona';
import { outputGuardrail } from './nodes/output-guardrail';
import { emitA2UI } from './nodes/emit-a2ui';

/** Core StateGraph — 직선 배선 */
export const graph = new StateGraph(CoreStateAnnotation)
  .addNode('normalizer', normalizer)
  .addNode('inputGuardrail', inputGuardrail)
  .addNode('semanticGuardrail', semanticGuardrail)
  .addNode('intentRouter', intentRouter)
  .addNode('cacheLookup', cacheLookup)
  // 노드명은 state 채널명(personalContext)과 충돌하므로 personalContextNode 로 둔다.
  .addNode('personalContextNode', personalContext)
  .addNode('uiComposer', uiComposer)
  .addNode('dataBinder', dataBinder)
  .addNode('teamPersona', teamPersona)
  .addNode('outputGuardrail', outputGuardrail)
  .addNode('emitA2UI', emitA2UI)
  .addEdge(START, 'normalizer')
  .addEdge('normalizer', 'inputGuardrail')
  // W4: 입력 가드레일(1단계 rule-based) 차단 시 곧장 emitA2UI 로 fallbackResponse 를
  //   단일 Text 카드로 방출(조기 fallback). 통과 시 2단계 SemanticGuardrail 로.
  .addConditionalEdges(
    'inputGuardrail',
    (state) =>
      state.inputGuardrailResult?.pass === false
        ? 'emitA2UI'
        : 'semanticGuardrail',
    { emitA2UI: 'emitA2UI', semanticGuardrail: 'semanticGuardrail' },
  )
  // W4.3: 2단계 의미 가드레일(Flash-Lite). 의심 신호 있을 때만 LLM 호출(없으면 통과).
  //   차단(우회 위협/비하) 시 inputGuardrailResult.pass=false 갱신 → 1단계와 동일하게
  //   emitA2UI fallback 으로 라우팅. 통과 시 정상 흐름(intentRouter). (SSOT §6.2-E)
  .addConditionalEdges(
    'semanticGuardrail',
    (state) =>
      state.inputGuardrailResult?.pass === false ? 'emitA2UI' : 'intentRouter',
    { emitA2UI: 'emitA2UI', intentRouter: 'intentRouter' },
  )
  .addEdge('intentRouter', 'cacheLookup')
  // P2-W4 (4.5): L0 Envelope 캐시 HIT 시 완성 envelope 재사용 →
  //   personalContext/uiComposer/dataBinder/teamPersona/outputGuardrail 우회하고
  //   emitA2UI 직행(LLM 0). MISS 면 PersonalContext(개인화 조립) → uiComposer~ 로 진행 후
  //   종단에서 캐시 write. (architecture §4.2)
  // P2-W6 (6.3): MISS 경로 진입점을 personalContext 로 변경. PersonalAgent 가 DB 에서
  //   개인화 컨텍스트를 조립해 PromptBuilder 주입·L0 캐시 가드(Cache Poisoning 방지)에 쓴다.
  //   ⚠️ SSOT §4.7 의 PersonalContext || ServiceSubgraph 병렬은 ServiceSubgraph(W5)
  //      도입 시 적용. 현재는 ServiceSubgraph 부재로 순차로 둔다.
  .addConditionalEdges(
    'cacheLookup',
    (state) => (state.cacheHit === 'L0' ? 'emitA2UI' : 'personalContextNode'),
    { emitA2UI: 'emitA2UI', personalContextNode: 'personalContextNode' },
  )
  .addEdge('personalContextNode', 'uiComposer')
  .addEdge('uiComposer', 'dataBinder')
  // W6: TeamPersona(리액션 생성) → OutputGuardrail(검증) → EmitA2UI(방출).
  //   architecture §3.2 흐름. 차단 시엔 위 조건부 엣지로 emitA2UI 직행(이 경로 우회).
  .addEdge('dataBinder', 'teamPersona')
  .addEdge('teamPersona', 'outputGuardrail')
  .addEdge('outputGuardrail', 'emitA2UI')
  .addEdge('emitA2UI', END)
  .compile();
