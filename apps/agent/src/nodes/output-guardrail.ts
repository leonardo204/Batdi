/**
 * OutputGuardrail 노드 (P2-W6, 6.6) — 출력(리액션) 가드레일 실구현
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md §6.3 (출력 가드레일),
 *       Ref-docs/specs/design/batdi-architecture.md §3.2
 *       (DataBinder → TeamPersona → OutputGuardrail → EmitA2UI 흐름)
 *
 * 책임: TeamPersona 가 생성한 state.reaction(L2 감정 리액션)을 방출 직전 검증·정제한다.
 *
 *  1) 수치 팩트체크(§6.3 통계 팩트체크): 리액션에 아라비아 숫자([0-9])가 있으면 위반.
 *     수치는 카드 {{bind}} 슬롯에만 존재해야 하고 리액션은 감정만 담아야 한다(CLAUDE.md
 *     수치 분리 계약). 위반 시 숫자 없는 캔드 한화 문구로 reaction 을 교체한다.
 *     (한글 수사 '하나/둘' 등은 MVP 범위 외 — 아라비아 숫자만 차단.)
 *
 *  2) 일베/비속어 출력 재검증(§6.3): input-guardrail 의 IlbeMimFilter/비속어 룰을
 *     리액션(normalized)에 재적용. 위반 시 안전 캔드 문구로 교체한다.
 *
 * ⚠️ reaction 이 undefined(score 아닌 경로 — TeamPersona 미생성)면 검사를 스킵하고 pass:true.
 *    UIValidator 실패 시 LLM 재호출 금지 원칙과 동일하게, 위반 시에도 재생성 없이 캔드 교체.
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import type { GuardrailResult } from '@batdi/types';
import { checkOutputGuardrail } from './input-guardrail';
import { toNormalizedForm } from './normalizer';
import { CANNED_REACTION_HANWHA } from '../utils/prompt-builder';

/**
 * 수치 팩트체크용 안전 캔드 문구 (숫자 없는 한화 톤 고정 응원).
 * 리액션에 아라비아 숫자가 새어 들어왔을 때 이 문구로 교체한다.
 */
const CANNED_REACTION_NO_NUMBER = CANNED_REACTION_HANWHA;

/** 일베/비속어 출력 위반 시 교체할 안전 문구 (수치 없음) */
const CANNED_REACTION_SAFE = '우리 즐겁게 야구 얘기하자~ 끝까지 응원이여! 화이팅!';

/** 아라비아 숫자 포함 여부 (수치 환각 탐지) */
function hasArabicDigit(text: string): boolean {
  return /[0-9]/.test(text);
}

/**
 * OutputGuardrail — reaction 을 검증·정제한다.
 *
 * @returns
 *  - reaction undefined → { reaction: undefined 미반환, outputGuardrailResult: pass }
 *  - 위반 → { reaction: 캔드교체값, outputGuardrailResult: { pass:false, violationType } }
 *  - 통과 → { reaction: 원본, outputGuardrailResult: { pass:true } }
 */
export function outputGuardrail(state: CoreGraphState): CoreGraphUpdate {
  const reaction = state.reaction;

  // ── reaction 없음(score 외 경로) → 검사 스킵 ──
  if (reaction === undefined) {
    return { outputGuardrailResult: { pass: true } };
  }

  // ── 1) 일베/비속어 출력 재검증 (normalized 기준) ──
  // 우회(자모 분리·이모지·반복 등)를 흡수하려면 입력과 동일하게 normalized 로 검사한다.
  const normalized = toNormalizedForm(reaction);
  const recheck: GuardrailResult = checkOutputGuardrail(normalized);
  if (recheck.pass === false) {
    return {
      reaction: CANNED_REACTION_SAFE,
      outputGuardrailResult: {
        pass: false,
        violationType: recheck.violationType,
      },
    };
  }

  // ── 2) 수치 팩트체크 (아라비아 숫자 차단) ──
  if (hasArabicDigit(reaction)) {
    return {
      reaction: CANNED_REACTION_NO_NUMBER,
      outputGuardrailResult: {
        pass: false,
        violationType: 'numeric_hallucination',
      },
    };
  }

  // ── 위반 없음 → reaction 그대로 통과 ──
  return { reaction, outputGuardrailResult: { pass: true } };
}
