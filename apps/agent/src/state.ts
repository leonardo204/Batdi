/**
 * Core 그래프 State 정의 (LangGraph Annotation)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.1 (CoreState, W2 subset)
 *
 * messages 채널은 반드시 보존한다 (CopilotKit 라운드트립 — 기존 채팅 E2E 유지).
 * MessagesAnnotation.spec를 스프레드하여 messages reducer를 그대로 가져온다.
 */
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type {
  A2UIEnvelope,
  GuardrailResult,
  Intent,
  TeamId,
} from '@batdi/types';

/** 마지막-쓰기-우선(last-write-wins) reducer 헬퍼 */
function lastValue<T>() {
  return {
    reducer: (_prev: T, next: T): T => next,
  };
}

/**
 * Core State Annotation — MessagesAnnotation(messages) + W2 커스텀 채널.
 */
export const CoreStateAnnotation = Annotation.Root({
  // messages 채널 보존 (AIMessage 출력 — 브라우저 채팅 동작 유지)
  ...MessagesAnnotation.spec,

  // ── 입력 (Normalizer) ──
  userMessage: Annotation<string>(lastValue<string>()),
  userMessageNormalized: Annotation<string>(lastValue<string>()),
  userMessageDisplay: Annotation<string>(lastValue<string>()),

  // ── 식별자 ──
  userId: Annotation<string>(lastValue<string>()),
  teamId: Annotation<TeamId>(lastValue<TeamId>()),

  // ── 가드레일 (W2: pass stub) ──
  inputGuardrailResult: Annotation<GuardrailResult | undefined>(
    lastValue<GuardrailResult | undefined>(),
  ),
  outputGuardrailResult: Annotation<GuardrailResult | undefined>(
    lastValue<GuardrailResult | undefined>(),
  ),

  // ── 라우팅 (IntentRouter) ──
  intent: Annotation<Intent>(lastValue<Intent>()),
  intentConfidence: Annotation<'high' | 'default'>(
    lastValue<'high' | 'default'>(),
  ),
  complexity: Annotation<'simple' | 'general' | 'composite'>(
    lastValue<'simple' | 'general' | 'composite'>(),
  ),

  // ── 캐시 (CacheLookup) ──
  cacheHit: Annotation<'L0' | 'L1' | 'L2' | 'L3' | 'miss'>(
    lastValue<'L0' | 'L1' | 'L2' | 'L3' | 'miss'>(),
  ),

  // ── 리액션 (TeamPersona → OutputGuardrail → EmitA2UI) ──
  // L2 감정 리액션 텍스트. TeamPersona 가 score+template 경로에서만 생성하고,
  // OutputGuardrail 이 검증(수치 팩트체크·일베/비속어 재검증)해 정제한 뒤
  // EmitA2UI 가 data model `/reaction` 슬롯에 주입한다. score 외 intent 면 undefined.
  reaction: Annotation<string | undefined>(lastValue<string | undefined>()),

  // ── 출력 (EmitA2UI) ──
  a2uiEnvelope: Annotation<A2UIEnvelope | undefined>(
    lastValue<A2UIEnvelope | undefined>(),
  ),

  // ── 관측 ──
  llmCallCount: Annotation<number | undefined>(lastValue<number | undefined>()),
  traceId: Annotation<string | undefined>(lastValue<string | undefined>()),
});

/** Core State 런타임 타입 */
export type CoreGraphState = typeof CoreStateAnnotation.State;
/** 노드 반환용 Partial 타입 */
export type CoreGraphUpdate = Partial<CoreGraphState>;
