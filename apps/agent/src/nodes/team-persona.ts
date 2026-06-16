/**
 * TeamPersona 노드 (P2-W6, 리액션 생성)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.2
 *       (DataBinder → TeamPersona → OutputGuardrail → EmitA2UIEnvelope 흐름),
 *       Ref-docs/specs/design/batdi-persona-guardrail.md §4.3 (한화 페르소나)
 *
 * 책임:
 *  - L2 감정 리액션 텍스트를 1회 생성해 state.reaction 에 보관한다.
 *  - 이전엔 emit-a2ui(종단 노드)가 직접 생성해 OutputGuardrail 이 검증할 수 없었으나,
 *    architecture §3.2 순서(TeamPersona 생성 → OutputGuardrail 검증 → EmitA2UI 방출)에
 *    맞춰 생성 책임을 이 노드로 분리한다.
 *
 * 생성 조건 (그 외엔 reaction 미설정 = undefined → OutputGuardrail 스킵):
 *  - score intent + L1 템플릿 경로일 때만 리액션 생성.
 *  - 입력 가드레일 차단(inputGuardrailResult.pass === false) 시엔 생성하지 않는다
 *    (차단 흐름은 graph 조건부 엣지로 이 노드를 우회하지만, 방어적으로도 미생성).
 *
 * 모델 설정: ChatGoogleGenerativeAI('gemini-2.5-flash', maxOutputTokens:96,
 *   thinkingConfig.thinkingBudget:0) — thinking OFF 필수(짧은 리액션엔 추론 불필요,
 *   안 끄면 reasoning 토큰이 출력을 잠식해 답변이 잘린다). 키 없으면 캔드 한화 문구.
 *
 * ⚠️ 리액션 텍스트엔 숫자(점수/이닝) 금지 — system_base(priority=1)에서 강하게 지시(1차 방어).
 *   수치 슬롯은 카드 {{bind}} 전용(CLAUDE.md 수치 분리 계약). 최종 방어는 OutputGuardrail.
 */
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import { resolveTemplate } from '../templates/registry';
import { getStubScoreData, scoreSummaryText } from '../databind/compile';
import { getLangfuseHandler } from '../utils/langfuse';
import {
  buildReactionPrompt,
  CANNED_REACTION_HANWHA,
} from '../utils/prompt-builder';

/**
 * L2 감정 리액션 생성 (score 경로 전용).
 *
 * GOOGLE_API_KEY 있으면 PromptBuilder(XML system_base/team_persona/current_situation)로
 * 시스템 프롬프트를 조립해 Gemini Flash 로 짧은 리액션(~50토큰)을 1회 생성한다.
 * 키 없거나 호출 실패 시 한화 톤 캔드 문구(수치 없음)로 graceful 폴백한다(전체 실패 금지).
 *
 * @returns data model `/reaction` 에 주입할 리액션 문자열 (항상 비어있지 않음)
 */
async function generateReaction(
  state: CoreGraphState,
  scoreSummary: string,
  config: RunnableConfig | undefined,
): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    // 키 없음 → 캔드 리액션(수치 없는 한화 톤 고정 문구).
    return CANNED_REACTION_HANWHA;
  }

  try {
    const systemPrompt = buildReactionPrompt({
      teamId: state.teamId,
      scoreSummary,
      userMessage: state.userMessage,
    });
    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      // gemini-2.5-flash 는 thinking 모델 — 짧은 감정 리액션엔 추론이 불필요하다.
      // thinkingBudget:0 으로 thinking 을 끄지 않으면 maxOutputTokens 가 reasoning
      // 토큰에 소진돼 답변이 잘린다(예: "오잉"). 리액션은 1~2문장이라 96토큰이면 충분.
      maxOutputTokens: 96,
      thinkingConfig: { thinkingBudget: 0 },
    });
    const handler = getLangfuseHandler();
    const response = await model.invoke(
      [new SystemMessage(systemPrompt), new HumanMessage(state.userMessage)],
      handler ? { callbacks: [handler] } : undefined,
    );
    const content = response.content;
    const text =
      typeof content === 'string' ? content : JSON.stringify(content);
    const trimmed = text.trim();
    // 빈 응답 방어 → 캔드 폴백.
    return trimmed === '' ? CANNED_REACTION_HANWHA : trimmed;
  } catch {
    // 리액션 LLM 호출 실패 → 캔드 문구로 graceful (전체 응답 실패 금지).
    return CANNED_REACTION_HANWHA;
  }
}

/**
 * TeamPersona 노드 — score+template 경로에서만 리액션을 생성해 state.reaction 에 보관.
 *
 * 생성하지 않는 경우(reaction 미설정 → undefined):
 *  - 입력 가드레일 차단(pass === false)
 *  - score 외 intent (chat/meme 등 — L1 템플릿 없음)
 */
export async function teamPersona(
  state: CoreGraphState,
  config?: RunnableConfig,
): Promise<CoreGraphUpdate> {
  // 입력 가드레일 차단 흐름이면 리액션 미생성(방어적 — graph 에서도 우회).
  if (state.inputGuardrailResult?.pass === false) {
    return {};
  }

  const template = resolveTemplate(state.intent);
  // score intent + L1 템플릿 경로일 때만 리액션 생성.
  if (state.intent !== 'score' || !template) {
    return {};
  }

  // scoreSummary 는 LLM 맥락용으로만 전달(숫자 출력은 프롬프트로 금지).
  const summary = scoreSummaryText(getStubScoreData());
  const reaction = await generateReaction(state, summary, config);
  return { reaction };
}
