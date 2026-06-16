/**
 * SemanticGuardrail 노드 (P2-W4.3, 2단계 의미 가드레일)
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md §6.2-E (LLM 기반 시맨틱 가드레일)
 *       Ref-docs/specs/design/batdi-architecture.md §4.3 (Guardrail Semantic = Flash-Lite)
 *
 * 정규식/키워드(InputGuardrail, 1단계)만으로는 비속어 없는 우회 표현을 못 막는다.
 *   예: "그 선수 집에 찾아가서 혼내주고 싶다"(위협), "저 팀 팬들은 다 수준이 그래"(비하).
 * 본 노드는 **1단계 통과 후**, 의심 신호(suspicionSignals)가 있을 때만 Flash-Lite 를
 *   1회 호출해 맥락상 부적절 여부를 분류한다(비용 최적화 — 전체의 5~10%만 LLM 도달).
 *
 * 2단계 전략 (SSOT §6.2-E):
 *   [1단계 Rule-based] InputGuardrail(0ms, 정규식) — 명확한 위반 즉시 차단
 *   [2단계 LLM Semantic] 본 노드 — 1단계 통과 + 의심 신호 있을 때만 Flash-Lite 호출
 *
 * best-effort(fail-open): GOOGLE_API_KEY 없음/LLM 오류/파싱 실패 시 **통과**시킨다.
 *   1단계 rule-based 가 명확한 위반의 하드 보장을 이미 제공하므로, 의미 판정 불가 시
 *   정상 질의(의심 신호만 우연히 포함)를 막는 오탐보다 통과가 UX·정합상 안전하다.
 *
 * 차단 시 inputGuardrailResult={pass:false,...} 로 같은 채널을 갱신한다 → 그래프
 *   조건부 엣지가 1단계와 동일하게 emitA2UI fallback 경로로 라우팅(EmitA2UI 가
 *   fallbackResponse 를 단일 Text 카드로 방출). 통과 시 {} 반환(1단계 pass:true 유지).
 *
 * ⚠️ 의심 신호 매칭은 `userMessageNormalized`(공백·구분자 제거본) 기준 — 우회 흡수.
 *   단, LLM 에 보내는 메시지는 사람이 읽을 수 있는 `userMessageDisplay`(맥락 보존)를 쓴다.
 */
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import type { GuardrailResult } from '@batdi/types';
import { getLangfuseHandler } from '../utils/langfuse';

/** 의미 가드레일 차단 시 응답 문구 (SSOT §6.2-E fallbackResponse). */
export const SEMANTIC_FALLBACK =
  '그런 얘기는 좀 그런 거 같아유~ 즐겁게 야구 얘기 하자!';

/**
 * 의심 신호 — 1단계 통과 후 LLM 호출 여부를 결정하는 게이트(SSOT §6.2-E suspicionSignals).
 *
 * ⚠️ `userMessageNormalized` 는 공백 제거본이므로 패턴도 공백 없는 형태로 둔다.
 *   (예: SSOT 의 `/가만 안/` → `/가만안/`, `/그런 애들/` → `/그런애들/`)
 * 게이트 오탐(예: "수준 높은 경기")은 차단이 아니라 저가 LLM 호출 1회만 유발하고,
 *   LLM 이 정상으로 분류하면 통과한다. 따라서 신호는 SSOT 를 따르되 보수적으로 둔다.
 */
const SUSPICION_SIGNALS: RegExp[] = [
  // 위협 우회
  /찾아가/,
  /혼내/,
  /가만안/,
  /두고봐|두고보/,
  /본때/,
  /손좀봐|손봐줄/,
  // 비하 우회 (선수/팀 팬 수준·부류 비하)
  /수준/,
  /부류/,
  /걔네|걔들/,
  /그런애들|그런애|그런것들/,
  // 혐오 접미사 밈 (맥락형 — 정규식 단독 차단이 애매한 것)
  /틀딱|줌마|개저씨/,
];

/**
 * 정규화된 입력에 의심 신호가 있는지(LLM 호출 게이트). 순수 함수, 테스트 직접 호출용.
 * @param normalized userMessageNormalized
 */
export function hasSuspicionSignal(normalized: string): boolean {
  if (normalized.trim() === '') return false;
  return SUSPICION_SIGNALS.some((p) => p.test(normalized));
}

/** LLM 분류 응답 형태 */
interface SemanticVerdict {
  safe: boolean;
  reason: string;
}

/** 코드펜스/잡텍스트가 섞여도 첫 JSON 객체를 관대하게 추출해 파싱한다. */
function parseVerdict(text: string): SemanticVerdict | undefined {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    const parsed = JSON.parse(match[0]) as Partial<SemanticVerdict>;
    if (typeof parsed.safe !== 'boolean') return undefined;
    return {
      safe: parsed.safe,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'unspecified',
    };
  } catch {
    return undefined;
  }
}

/**
 * Flash-Lite 의미 분류(SSOT §6.2-E 프롬프트). 전 연령 기준 엄격 판정.
 * @returns 판정 결과. 키 없음/오류/파싱 실패는 undefined(→ 호출부에서 fail-open).
 */
async function classifySemantic(
  displayMessage: string,
  config: RunnableConfig | undefined,
): Promise<SemanticVerdict | undefined> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    return undefined; // 키 없음 → 분류 불가(fail-open)
  }

  try {
    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash-lite',
      apiKey,
      // 분류는 짧은 JSON 1개 — thinking 불필요(켜두면 출력 토큰을 추론이 잠식).
      maxOutputTokens: 128,
      thinkingConfig: { thinkingBudget: 0 },
      temperature: 0,
    });
    const handler = getLangfuseHandler();
    const system = new SystemMessage(
      [
        '다음 메시지가 KBO 야구 팬 채팅에서 부적절한지 판단해주세요.',
        '부적절 기준: 선수/감독 비하, 팀 팬 비하, 위협, 차별/혐오 (비속어 없이도 해당).',
        '전 연령 이용 서비스이므로 엄격하게 판단하세요.',
        '정상적인 경기 분석·응원·질문은 안전(safe:true)입니다.',
        'JSON 으로만 응답: {"safe": true/false, "reason": "간단한 사유"}',
      ].join('\n'),
    );
    const response = await model.invoke(
      [system, new HumanMessage(`메시지: "${displayMessage}"`)],
      handler ? { callbacks: [handler], ...config } : config,
    );
    const content = response.content;
    const text =
      typeof content === 'string' ? content : JSON.stringify(content);
    return parseVerdict(text);
  } catch {
    return undefined; // LLM 오류 → fail-open
  }
}

/**
 * SemanticGuardrail 노드 — 1단계 통과 + 의심 신호 있을 때만 Flash-Lite 로 의미 판정.
 *
 * 반환:
 *  - 통과/스킵: {} (inputGuardrailResult 미변경 → 1단계 pass:true 유지)
 *  - 차단: { inputGuardrailResult: {pass:false, violationType:'semantic_...', fallbackResponse} }
 */
export async function semanticGuardrail(
  state: CoreGraphState,
  config?: RunnableConfig,
): Promise<CoreGraphUpdate> {
  // 1단계에서 이미 차단됐으면 호출 안 함(방어적 — 그래프도 이 노드를 우회).
  if (state.inputGuardrailResult?.pass === false) {
    return {};
  }

  const normalized = state.userMessageNormalized ?? '';
  // 의심 신호 없으면 LLM 호출 안 함(비용 절약 — 전체의 ~90%).
  if (!hasSuspicionSignal(normalized)) {
    return {};
  }

  const display = state.userMessageDisplay ?? state.userMessage ?? '';
  const verdict = await classifySemantic(display, config);

  // 분류 불가(키 없음/오류/파싱 실패) → fail-open(1단계 rule-based 가 하드 보장).
  if (verdict === undefined || verdict.safe) {
    return {};
  }

  const blocked: GuardrailResult = {
    pass: false,
    violationType: `semantic_${verdict.reason}`,
    fallbackResponse: SEMANTIC_FALLBACK,
  };
  return { inputGuardrailResult: blocked };
}
