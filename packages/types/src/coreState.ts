/**
 * Core LangGraph State (W2 subset)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.1 (CoreState)
 *
 * 이 타입은 architecture §3.1 CoreState의 **W2 부분집합**이다. 직선 파이프라인
 * (Normalizer → InputGuardrail → IntentRouter → CacheLookup → UIComposer →
 *  DataBinder → OutputGuardrail → EmitA2UI)이 읽고 쓰는 채널만 포함한다.
 *
 * W2 제외 필드 (P2+에서 추가):
 *   - personalContext / teamPersona  (PersonalAgent·Team 페르소나)
 *   - serviceDataSummary / serviceDataRef  (ServiceSubgraph 출력 분리)
 *   - parallelResults / ioPhase  (LangGraph 병렬 실행 단계)
 *   - envelopeCacheKey  (CacheLookup stub이라 키 산출 불필요)
 *   - llmReactionText  (L2 감정 리액션 미구현 — W2는 UIComposer L1 only)
 *
 * W2 고정 값:
 *   - complexity = 'simple'      (UIComposer는 L1 Template only)
 *   - intentConfidence = 'high' | 'default'  (매칭/미매칭)
 *   - cacheHit = 'miss'          (CacheLookup stub)
 */
import type { GuardrailResult, Intent, TeamId } from './domain';
import type { A2UIEnvelope } from './a2ui';

/**
 * Core 그래프 State (messages 채널은 별도 — LangGraph MessagesAnnotation 보존)
 *
 * messages(AIMessage 등)는 graph.ts의 Annotation에서 MessagesAnnotation.spec로
 * 병합한다. 본 타입은 그 외 커스텀 채널의 형태를 문서화한다.
 */
export interface CoreState {
  // ── 입력 (Normalizer) ───────────────────────────────────────────
  /** 원문 (저장·LLM 전달용) */
  userMessage: string;
  /** 필터 매칭용 normalized form (사용자 노출 금지) */
  userMessageNormalized: string;
  /** 화면 표시용 NFKC 정규화 form */
  userMessageDisplay: string;

  // ── 식별자 ──────────────────────────────────────────────────────
  userId: string;
  teamId: TeamId;

  // ── 가드레일 (W2: 항상 pass stub) ───────────────────────────────
  inputGuardrailResult?: GuardrailResult;
  outputGuardrailResult?: GuardrailResult;

  // ── 라우팅 (IntentRouter) ───────────────────────────────────────
  intent: Intent;
  /** 매칭 시 'high', 미매칭(chat fallthrough) 시 'default' */
  intentConfidence: 'high' | 'default';
  /** W2: 'simple' 고정 (UIComposer L1 only) */
  complexity: 'simple' | 'general' | 'composite';

  // ── 캐시 (CacheLookup) ──────────────────────────────────────────
  /** W2: 'miss' 고정 (stub) */
  cacheHit: 'L0' | 'L1' | 'L2' | 'L3' | 'miss';

  // ── 출력 (EmitA2UI) ─────────────────────────────────────────────
  /** 최종 A2UI operations 배열 (transport는 W2-B) */
  a2uiEnvelope?: A2UIEnvelope;

  // ── 관측 (optional) ─────────────────────────────────────────────
  llmCallCount?: number;
  traceId?: string;
}

/**
 * UIComposer → DataBinder 간 전달되는 L1 템플릿 산출물 (내부 stub).
 *
 * authoring 표기(`{{bind:"home.score"}}`)가 포함된 컴포넌트 트리와, 이를
 * JSON Pointer로 컴파일하기 위한 bind 경로 목록(bind_schema)을 담는다.
 * (state 채널은 아니며, 노드 간 함수 반환으로만 사용)
 */
export interface ComposedTemplate {
  /** 템플릿 식별자 (예: 'score_compact') */
  templateId: string;
  /** authoring 컴포넌트 트리 (평탄 인접 리스트, `{{bind:"..."}}` 표기 포함) */
  components: Array<Record<string, unknown>>;
  /** bind 경로 목록 (점경로, 예: ['home.name','home.score', …]) */
  bindSchema: string[];
}
