/**
 * @batdi/guardrail — 입력 정규화 (순수 함수, ADR-051)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.3 (입력 정규화 3-form)
 *       Ref-docs/specs/design/batdi-persona-guardrail.md §6.2 Normalizer
 *
 * 보안 가드레일 로직을 복제(drift=우회 위험)하지 않기 위해, agent 의 정규화 순수
 * 함수를 본 공유 패키지로 추출한다(단일 SSOT). agent(LangGraph 노드)와
 * api(custom_persona 저장 전 검증)가 동일 함수를 import 한다.
 *
 *  - userMessage          : 원문 그대로 (LLM 전달·저장용) — 변경 안 함
 *  - userMessageDisplay   : NFKC만 적용 (화면 표시용) → toDisplayForm
 *  - userMessageNormalized: NFKC + 공백/zero-width/이모지·구분자 제거 +
 *                           반복 문자 축소 + homoglyph 치환 + 소문자 → toNormalizedForm
 *                           (필터 매칭용, 사용자 노출 금지)
 *
 * ⚠️ 한글 자모 재조합(decomposed Hangul)은 완전 구현이 까다로워(중성/종성 결합 규칙)
 *   본 단계에서는 미수행한다. 대신 분리된 자모 시퀀스(예: 초성 `ㄴㅁㅎ`)를 normalized
 *   에 **그대로 보존**하여, 필터가 초성 패턴으로 직접 매칭하도록 한다(자모는 구분자
 *   제거 대상이 아니다). 완전 재조합은 추후 보강 대상으로 남긴다.
 */

/** zero-width 문자 (ZWSP/ZWNJ/ZWJ/BOM) */
const ZERO_WIDTH = /[​-‍﻿]/g;
/** 이모지 (확장 픽토그래픽 + 변이 셀렉터) */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;
/** 연속 공백 */
const MULTI_SPACE = /\s+/g;

/**
 * 글자 사이에 끼워 넣어 우회하는 구분자 (예: `노_무현`, `노-무-현`, `노.무.현`).
 * ⚠️ 자모(ㄱ-ㅎ, ㅏ-ㅣ)는 매칭 신호이므로 제거하지 않는다. 공백은 별도 처리.
 */
const SEPARATORS = /[_\-.·*~`'"|/\\#@^=+·•・･]/g;

/**
 * homoglyph(유사 문자) 최소 매핑 테이블 — 라틴/키릴 등으로 한글·숫자를 흉내내는 우회 차단.
 * 작은 테이블로 시작(자주 쓰이는 전각/유사 알파벳·숫자 위주). NFKC 이후 잔존분만 처리.
 * 키는 소문자화 이전 기준이 아니라 매핑 후 toLowerCase 로 통일된다.
 */
const HOMOGLYPH: Record<string, string> = {
  // 키릴 → 라틴 (외형 동일)
  а: 'a',
  е: 'e',
  о: 'o',
  с: 'c',
  р: 'p',
  х: 'x',
  у: 'y',
  к: 'k',
  м: 'm',
  т: 't',
  // 숫자 유사 (leet) → 알파벳
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
};

/** 글자 단위 homoglyph 치환 */
function replaceHomoglyphs(input: string): string {
  let out = '';
  for (const ch of input) {
    out += HOMOGLYPH[ch] ?? ch;
  }
  return out;
}

/**
 * 한글 conjoining 자모(NFKC 산출물) → compatibility 자모 복원.
 *
 * NFKC 는 호환 자모(ㄱ U+3131, ㅋ U+314B 등)를 조합용 자모(초성 U+1100~, 중성 U+1161~)로
 * 정규화한다. 이 때문에 사용자가 친 `ㄴㅁㅎ`(호환)가 `ᄂᄆᄒ`(조합용)로 바뀌어
 * 필터의 호환-자모 패턴(`/ㄴㅁㅎ/`)이 매칭되지 않는다.
 * 자주 쓰이는 초성 조합용 자모를 호환 자모로 되돌려, 분리 자모 시퀀스를 매칭 가능하게 한다.
 * (중성/종성은 일베 초성 밈에 거의 안 쓰여 초성만 최소 매핑.)
 */
const CHOSEONG_TO_COMPAT: Record<string, string> = {
  'ᄀ': 'ㄱ',
  'ᄁ': 'ㄲ',
  'ᄂ': 'ㄴ',
  'ᄃ': 'ㄷ',
  'ᄄ': 'ㄸ',
  'ᄅ': 'ㄹ',
  'ᄆ': 'ㅁ',
  'ᄇ': 'ㅂ',
  'ᄈ': 'ㅃ',
  'ᄉ': 'ㅅ',
  'ᄊ': 'ㅆ',
  'ᄋ': 'ㅇ',
  'ᄌ': 'ㅈ',
  'ᄍ': 'ㅉ',
  'ᄎ': 'ㅊ',
  'ᄏ': 'ㅋ',
  'ᄐ': 'ㅌ',
  'ᄑ': 'ㅍ',
  'ᄒ': 'ㅎ',
};

/** 조합용 초성 자모를 호환 자모로 복원 */
function restoreCompatJamo(input: string): string {
  let out = '';
  for (const ch of input) {
    out += CHOSEONG_TO_COMPAT[ch] ?? ch;
  }
  return out;
}

/**
 * 반복 문자 축소 — 동일 문자 3회 이상 연속을 2회로 축약.
 * (예: `ㅋㅋㅋㅋ`→`ㅋㅋ`, `노오오오무현`→`노오무현`, `씨이이발`→`씨이발`)
 * 2회까지는 보존하여 정상어(예: `빠빠`)·이중모음 우회 매칭 여지를 남긴다.
 */
function collapseRepeats(input: string): string {
  return input.replace(/(.)\1{2,}/gu, '$1$1');
}

/** 표시용 정규화 — NFKC만 */
export function toDisplayForm(raw: string): string {
  return raw.normalize('NFKC');
}

/**
 * 매칭용 정규화 — SSOT §6.2 Normalizer 파이프라인.
 * NFKC → zero-width 제거 → 이모지 제거 → 구분자 제거 → 공백 제거
 * → 반복 문자 축소 → homoglyph 치환 → 소문자.
 *
 * ⚠️ 매칭 전용. 공백까지 제거하므로 `노 무 현` 같은 띄어쓰기 우회도 흡수된다.
 *   (단어 경계 기반 패턴이 아닌 substring 패턴을 쓰는 IlbeMimFilter 전제)
 */
export function toNormalizedForm(raw: string): string {
  const collapsed = collapseRepeats(
    raw
      .normalize('NFKC')
      .replace(ZERO_WIDTH, '')
      .replace(EMOJI, '')
      .replace(SEPARATORS, '')
      .replace(MULTI_SPACE, ''),
  );
  return restoreCompatJamo(replaceHomoglyphs(collapsed)).trim().toLowerCase();
}
