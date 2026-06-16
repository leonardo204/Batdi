/**
 * ChildSafety — 아동/청소년 보호 (P2-W4.2)
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md §6.2-F
 *
 * 밧디는 전 연령 대상 서비스이므로, 어떤 커스텀 프롬프트로도 우회할 수 없는
 * 안전 지시(SYSTEM_INSTRUCTION)를 System Base(불변 계층)에 항상 포함한다.
 *
 * ⚠️ 본 단계(W4)에서는 PromptBuilder(System Base 조립 지점)가 아직 없으므로
 *   상수/함수를 export 만 하고 입력 차단에는 사용하지 않는다.
 *   TODO(W4.8 PromptBuilder): SYSTEM_INSTRUCTION 을 System Base(priority=1)에 주입,
 *     detectMinorSignals 가 true 면 getEnhancedSafetyPrompt 를 추가 주입.
 */

/** 아동/청소년 보호 가드레일 상수·헬퍼 묶음 */
export const ChildSafetyGuardrail = {
  /**
   * System Base 프롬프트(불변 계층)에 항상 포함되는 지시.
   * SSOT §6.2-F 원문 그대로 유지.
   */
  SYSTEM_INSTRUCTION: `
밧디(batdi)는 전 연령 대상 서비스입니다. 어린 사용자도 있으므로:
- 성적인 내용, 성인 유머 절대 금지
- 음주/흡연을 미화하거나 권장하지 않음
- 폭력적인 표현 자제
- 도박(스포츠 도박 포함) 관련 내용 금지
- 개인정보(나이, 학교, 주소 등) 물어보지 않음
- 욕설이나 비속어 사용하지 않음
- 모든 응답은 초등학생이 읽어도 문제없는 수준으로 유지
`,

  /**
   * 미성년자 신호 감지 시 추가 안전 프롬프트.
   * TODO(W4.8): detectMinorSignals 가 true 면 System Base 에 이어 주입.
   */
  getEnhancedSafetyPrompt(): string {
    return `
이 사용자는 미성년자일 수 있습니다. 더욱 조심해서:
- 존댓말을 기본으로 사용하되 딱딱하지 않게
- 야구 규칙이나 용어를 친절하게 설명
- 건전한 응원 문화를 자연스럽게 전달
- 어떤 경우에도 부적절한 내용 포함 금지
`;
  },
} as const;

/**
 * 입력에서 미성년자 신호를 감지한다.
 * @param normalized userMessageNormalized (매칭 전용 정규화 문자열)
 *
 * ⚠️ 입력 차단 용도가 아니다. 감지 시 응답 톤을 강화하는 PromptBuilder 신호로만 사용.
 */
export function detectMinorSignals(normalized: string): boolean {
  const signals: RegExp[] = [
    /학교/,
    /숙제/,
    /엄마|아빠/,
    /선생님/,
    /몇\s*학년/,
    /중학|고등|초등/,
  ];
  return signals.some((p) => p.test(normalized));
}
