/**
 * InputGuardrail 노드 (P2-W4.1) — rule-based 입력 가드레일
 *
 * SSOT: Ref-docs/specs/design/batdi-persona-guardrail.md §6.2
 *   B. 일베 밈/혐오, C. 프롬프트 해킹, D. 비속어/비하/위협/도박/자해
 *
 * 매칭은 반드시 `userMessageNormalized` 기준으로 수행한다(원문 금지).
 *   normalizer 가 공백·구분자·이모지 제거 + 반복 축소 + homoglyph 치환을 마친 문자열이라
 *   `노_무현`·`노🔥무현`·`노 무 현`·`노오오무현` 같은 우회가 흡수된 상태로 들어온다.
 *
 * 검사 순서(첫 위반에서 즉시 차단): 일베/혐오 → 프롬프트해킹 → 비속어/비하/위협/도박/자해.
 * 차단 시 { pass:false, violationType, fallbackResponse }, 통과 시 { pass:true }.
 *
 * ⚠️ rule-based 전용(LLM 호출 금지). SemanticGuardrail(§6.2-E)은 본 범위 밖.
 *   오탐(정상 야구 질의 차단) 최소화를 위해 패턴은 보수적으로 좁게 잡는다.
 */
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import type { GuardrailResult } from '@batdi/types';

/** 한 검사 단위 — 패턴 묶음 + 위반 유형 + 응답 문구 */
interface GuardrailRule {
  violationType: string;
  fallbackResponse: string;
  patterns: RegExp[];
}

/**
 * B. 일베 밈 / 혐오 표현 (SSOT §6.2-B)
 *
 * normalized 는 공백 제거 상태이므로 `[가-힣]+노$` 류의 "문장 끝 ~노" 체는
 * 문장부호도 사라져 과탐(정상어 '비싸노'? 등) 위험이 있다. SSOT 패턴을 따르되
 * 명백한 일베 키워드 위주로 구성하고, ~노/~누 체는 노무현 결합형으로 한정한다.
 */
const ILBE_RULE: GuardrailRule = {
  violationType: 'ilbe_expression',
  fallbackResponse:
    '그런 표현은 여기선 안 돼유~ 야구는 모두가 즐겁게! 다른 얘기 하자~',
  patterns: [
    // 노무현 변형 + ~노/~누 결합 (SSOT: /노무(현|노|시계|씨)/ 등).
    // 노·무 사이 모음 늘림 우회(노오무현)도 흡수: 사이에 같은 계열 모음 0~2회 허용.
    /노[오우]{0,2}무(현|노|시계|씨|뉴|현이)/,
    /운지/,
    /(부엉이|봉하).{0,4}(바위|마을)/,
    // 일베 직접 지칭
    /일베/,
    /일간베스트/,
    // 지역 비하 (SSOT: 충|홍어|전라디언|경상디언)
    /홍어/,
    /전라디언/,
    /경상디언/,
    /전라디/,
    // 비하 접미사 밈 (틀딱/한남/한녀) — 단독 키워드
    /틀딱/,
    /한남(충|virus)?/,
    /한녀/,
    /김치녀/,
    /된장녀/,
    /맘충/,
    /급식충/,
    // 장애인 비하
    /장애인.{0,3}비하/,
    /병신새끼/,
    // 일베식 줄임말 (ㅂㅅ=병신, ㄴㅁㅎ=노무현 초성). 초성 시퀀스는 normalizer 가 보존.
    /ㅂㅅ/,
    /ㄴㅁㅎ/,
    /ㅗㅈㅇ/,
  ],
};

/**
 * C. 프롬프트 해킹 / LLM 부정사용 (SSOT §6.2-C)
 * 한/영 패턴. normalized 는 공백 제거 상태이므로 영문 구문은 공백 없는 형태로 매칭한다.
 */
const PROMPT_INJECTION_RULE: GuardrailRule = {
  violationType: 'prompt_injection',
  fallbackResponse:
    '음~ 그런 요청은 들어줄 수 없어유! 우리 야구 얘기나 하자~ ⚾',
  patterns: [
    // 영문 (공백 제거됨) — 대표 jailbreak 문구
    /ignore(all|the|your)?(previous|above|prior)(instruction|prompt)/,
    /disregard(all|the|your)?(previous|above|prior)?(instruction|prompt)/,
    /systemprompt/,
    /developermode/,
    /jailbreak/,
    /danmode/,
    /youarenow/,
    /actas(a|an)?(dan|admin|developer)/,
    /pretendtobe/,
    /bypass(the|all|your)?(restriction|filter|rule|guardrail)/,
    // 한글
    /시스템\s*프롬프트/,
    /시스템프롬프트/,
    /이전\s*(지시|명령|지침).{0,4}(무시|잊)/,
    /이전(지시|명령|지침).{0,4}(무시|잊)/,
    /지시(사항)?\s*무시/,
    /지시(사항)?무시/,
    /역할\s*변경/,
    /역할변경/,
    /제한\s*(해제|풀어|해제해)/,
    /제한(해제|풀어)/,
    /관리자\s*모드/,
    /관리자모드/,
    /개발자\s*모드/,
    /개발자모드/,
    /프롬프트.{0,3}(알려|보여|출력)/,
    /너의\s*규칙.{0,3}(무시|어겨)/,
  ],
};

/**
 * D. 비속어/비하/위협/도박/자해 (SSOT §6.2-D 응답표)
 * 유형별 분리 — 첫 매칭 유형의 응답 문구를 사용.
 */
const PROFANITY_RULE: GuardrailRule = {
  violationType: 'profanity',
  fallbackResponse: '그런 말은 좀... 야구장에서도 매너가 중요하잖아~',
  patterns: [
    // 대표 비속어 (반복 축소 후 형태 포함: 씨이발→씨발 류는 collapse 로 흡수)
    /씨발|시발|씨바|쌍놈|쌍년/,
    /개새끼|개색기|개세끼|개자식/,
    /병신/,
    /지랄/,
    /좆|좃같|존나|졸라\s?짜증/,
    /fuck|fck|shit|bitch/,
    /엿먹/,
    /닥쳐|닥치라/,
  ],
};

const INSULT_RULE: GuardrailRule = {
  violationType: 'insult',
  fallbackResponse: '선수들도 열심히 하는 거니까 응원하자!',
  patterns: [
    // 선수/감독 비하 — '먹튀' 같은 표현 + 비하 결합. 너무 넓지 않게.
    /(선수|감독|코치).{0,6}(쓰레기|병신|개같|먹튀|퇴출시켜|꺼져)/,
    /(쓰레기|병신|먹튀).{0,6}(선수|감독|코치)/,
  ],
};

const THREAT_RULE: GuardrailRule = {
  violationType: 'threat',
  fallbackResponse: '그런 말은 좀 위험한데... 야구 얘기 하자!',
  patterns: [
    /죽여버려|죽여버린|죽여버릴|죽여버리|죽일거|죽인다|죽여줄/,
    /패버려|패버린|패버릴|패버리|때려죽|밟아버려|밟아버린|밟아버릴|밟아버리/,
    /칼로|흉기로|찾아가서.{0,6}(죽|패|때리)/,
    /불태워버리|테러/,
  ],
};

const GAMBLING_RULE: GuardrailRule = {
  violationType: 'gambling',
  fallbackResponse: '도박은 안 돼! 순수하게 야구를 즐기자 ㅎㅎ',
  patterns: [
    /사설\s?토토|사설토토/,
    /불법\s?(베팅|도박)|불법베팅|불법도박/,
    /스포츠\s?(토토|배팅|베팅).{0,4}(사이트|추천|먹튀)/,
    /배당.{0,4}(사이트|추천)/,
    /(승부|경기).{0,4}(배팅|베팅)\s?(사이트|추천|얼마)/,
    /도박\s?사이트|도박사이트/,
  ],
};

const SELF_HARM_RULE: GuardrailRule = {
  violationType: 'self_harm',
  // SSOT §6.2-D: 자해/자살은 전문 상담 안내(정신건강 위기상담 1577-0199)
  fallbackResponse:
    '많이 힘들구나... 혼자 견디지 말고 꼭 도움을 받았으면 좋겠어. ' +
    '정신건강 위기상담 전화 1577-0199 로 24시간 상담받을 수 있어. ' +
    '너는 소중한 사람이야. 우리 야구 얘기도 또 하자, 응? 💙',
  patterns: [
    /자살(하고싶|할거|하고\s?싶|충동|방법)/,
    /죽고싶|죽고\s?싶/,
    /(목숨|생을|삶을).{0,4}(끊|마감)/,
    /자해(하고싶|할거|방법)/,
    /살기싫|살기\s?싫|사는게의미없|사는게\s?의미없/,
  ],
};

/** 검사 순서 (첫 위반에서 차단) */
const RULES: GuardrailRule[] = [
  ILBE_RULE,
  PROMPT_INJECTION_RULE,
  SELF_HARM_RULE, // 비속어보다 먼저 — '죽고싶' 류를 self_harm 으로 분류
  THREAT_RULE,
  GAMBLING_RULE,
  INSULT_RULE,
  PROFANITY_RULE,
];

/**
 * 정규화된 입력에 대해 rule-based 가드레일을 적용한다(순수 함수, 테스트 직접 호출용).
 * @param normalized userMessageNormalized
 */
export function checkInputGuardrail(normalized: string): GuardrailResult {
  if (normalized.trim() === '') {
    return { pass: true };
  }
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(normalized))) {
      return {
        pass: false,
        violationType: rule.violationType,
        fallbackResponse: rule.fallbackResponse,
      };
    }
  }
  return { pass: true };
}

/**
 * 출력(리액션) 재검증용 일베/비속어 룰 부분집합 (SSOT §6.3 출력 가드레일).
 *
 * 입력 가드레일의 전체 룰 중 LLM 출력에 다시 적용해야 하는 것(일베 밈 + 비속어)만 추린다.
 * 프롬프트해킹/도박/자해/위협/비하는 사용자 입력 의도 차단용이라 출력 재검증 대상이 아니다.
 * OutputGuardrail 이 reaction(normalized)에 이 룰들을 재적용한다.
 */
const OUTPUT_RECHECK_RULES: GuardrailRule[] = [ILBE_RULE, PROFANITY_RULE];

/**
 * 리액션 등 LLM 출력 텍스트(정규화본)에 일베/비속어 룰을 재적용한다(순수 함수).
 * SSOT §6.3: "LLM 출력도 IlbeMimFilter + SafetyFilter 통과".
 * @param normalized 정규화된 출력 텍스트
 */
export function checkOutputGuardrail(normalized: string): GuardrailResult {
  if (normalized.trim() === '') {
    return { pass: true };
  }
  for (const rule of OUTPUT_RECHECK_RULES) {
    if (rule.patterns.some((p) => p.test(normalized))) {
      return {
        pass: false,
        violationType: rule.violationType,
        fallbackResponse: rule.fallbackResponse,
      };
    }
  }
  return { pass: true };
}

export function inputGuardrail(state: CoreGraphState): CoreGraphUpdate {
  const normalized = state.userMessageNormalized ?? '';
  return { inputGuardrailResult: checkInputGuardrail(normalized) };
}
