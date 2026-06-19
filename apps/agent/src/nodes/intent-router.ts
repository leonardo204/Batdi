/**
 * IntentRouter 노드 — LLM 미사용, 키워드/정규식 라우팅
 *
 * SSOT: Ref-docs/specs/interface/batdi-routing.md §2~§3 (canonical 7종 + 사전)
 *
 *  - userMessageNormalized 기준으로 순차 매칭, 첫 매칭 채택.
 *  - 미매칭 → intent='chat', intentConfidence='default'.
 *  - 매칭 → intentConfidence='high'.
 *  - W2 범위: complexity는 'simple' 고정 (UIComposer L1 Template only).
 *
 * NOTE: routing.md의 전량 사전을 그대로 옮겼다(W2 구현 대상은 score+chat이지만
 *       나머지 intent도 분류만 해 둔다 — 라우팅은 결정론이므로 무비용).
 *       statType('standings') 보조 분기는 W2 state에 미포함이므로 분류만 한다.
 */
import type { Intent } from '@batdi/types';
import type { CoreGraphState, CoreGraphUpdate } from '../state';

interface IntentRule {
  intent: Exclude<Intent, 'chat'>;
  pattern: RegExp;
  /**
   * stats intent 보조 분기(P3-W7 7.3b). stats 규칙만 설정:
   *   - 'standings' → 팀 순위 카드, 'player' → 팀 선수 리더보드 카드.
   * stats 외 규칙(score 등)은 미설정(undefined).
   */
  statType?: 'standings' | 'player';
}

/**
 * KBO 10팀 별칭 (normalized 기준: 소문자·공백제거·NFKC). 정식명·구단명·약칭·영문.
 * ⚠️ normalizer 가 숫자→문자 homoglyph 치환(1→i 등)·공백 제거를 하므로 숫자/공백 별칭은 금지.
 *   팀명 단독은 intent 를 정하지 않고(=chat 가능), "경기/어때/잘해" 등 맥락어와 결합 시에만
 *   score 로 본다(맨 끝 contextual 규칙). 향후 teamId override(메시지 팀 지정)에도 재사용 가능.
 */
export const TEAM_ALIAS =
  '두산|베어스|doosan|삼성|라이온즈|samsung|롯데|자이언츠|lotte|한화|이글스|hanwha|lg|엘지|트윈스|기아|kia|타이거즈|키움|히어로즈|heroes|nc|엔씨|다이노스|kt|케이티|위즈|ssg|에스에스지|랜더스|쓱';

/**
 * routing.md §3 키워드/정규식 사전 (순서 = 우선순위, 첫 매칭 채택).
 * P2 키워드 확장(routing.md "실제 키워드 전량은 P2 구현 시 확정"):
 *  - score 에 결과·승패·득점 표현 추가("경기 결과"가 chat 으로 새던 실측 갭 해소).
 *  - 특정 키워드 규칙(score·stats·news·schedule·lineup) 을 먼저, 팀명+맥락 score 를 맨 끝에
 *    두어 "기아 순위"→stats, "기아 뉴스"→news, "기아 어때"→score 로 분기.
 */
export const INTENT_RULES: ReadonlyArray<IntentRule> = [
  // score — 명시적 스코어/득점 표현
  { intent: 'score', pattern: /스코어|점수|몇\s*대\s*몇|득점|스코어보드/ },
  // score — 경기 결과·승패 표현 ("경기 결과", "이겼어?", "졌어", "역전")
  {
    intent: 'score',
    pattern:
      /지금.*경기|이기고|지고\s*있|이겼|이긴|이김|졌|패배|승리|완승|완패|역전|끝내기|경기.*결과|결과/,
  },
  // 상대전적(h2h) — stats/score 보다 먼저(“상대전적”이 stats/순위로 새지 않게, ADR-057).
  { intent: 'h2h', pattern: /상대전적|맞대결|천적|상대\s*전적/ },
  // 순위/승률(standings) 우선 — 일반 stats보다 먼저
  {
    intent: 'stats',
    statType: 'standings',
    pattern: /순위|몇\s*위|승률|게임\s*차|연승|연패|선두|꼴찌|상위권|하위권/,
  },
  {
    intent: 'stats',
    statType: 'player',
    pattern:
      /타율|방어율|홈런|era|war|ops|세이버|타점|도루|출루율|장타율|탈삼진|wrc|fip|whip|성적|기록/,
  },
  { intent: 'news', pattern: /뉴스|소식|기사|근황|이슈|화제/ },
  {
    intent: 'schedule',
    pattern: /일정|언제.*경기|다음.*경기|다음경기|내일.*경기|경기.*언제|개막/,
  },
  { intent: 'lineup', pattern: /선발|라인업|누가.*던져|선발투수|출전/ },
  { intent: 'meme', pattern: /밈|ㅋㅋ|웃긴|드립|짤/ },
  // score — 팀명 + 맥락어("경기/어때/어땠/잘해/어떻"). 특정 intent 미매칭 시에만 적용.
  {
    intent: 'score',
    pattern: new RegExp(`(?:${TEAM_ALIAS}).*(?:경기|어때|어땠|잘해|잘하|어떻)`),
  },
];

export interface IntentClassification {
  intent: Intent;
  confidence: 'high' | 'default';
  /** 매칭된 규칙의 statType(stats 규칙만). 미매칭/비-stats 규칙은 undefined. */
  statType?: 'standings' | 'player';
  /**
   * P3-W9 9.1: 매칭된 모든 intent(중복 제거, 등장 순서 보존, 첫 매칭=대표 intent 가 [0]).
   * 모든 INTENT_RULES 를 순회해 수집한다(첫 매칭에서 멈추지 않음). 미매칭이면 [].
   *   - 단일 intent 만 매칭 → 길이 1(대표 intent 와 동일, 회귀 영향 없음).
   *   - 서로 다른 intent 2개 이상(예: score+stats) → composite 판정 입력.
   */
  matchedIntents: Intent[];
}

/**
 * 접속표현 정규식 — composite 판정 보조 신호(routing.md §2 "접속표현").
 * ⚠️ normalized 기준: 공백·"+"(SEPARATORS) 는 제거되므로 한글 접속어만 검사한다.
 *   '그리고|랑|이랑|하고|및|와|과' 가 normalized 에 남는다. 단독으로는 무의미하고
 *   "2개 이상 intent 매칭"과 결합할 때만 composite 보강 신호로 쓴다.
 */
export const CONNECTIVE_PATTERN = /그리고|이랑|랑|하고|및|와|과/;

/** 순수 분류 함수 (테스트 직접 호출용) — 입력은 normalized form */
export function classifyIntent(normalized: string): IntentClassification {
  // 대표 intent(첫 매칭)는 기존 동작 그대로 — 단일 intent 경로 회귀 방지.
  let primary: Intent = 'chat';
  let confidence: 'high' | 'default' = 'default';
  let statType: 'standings' | 'player' | undefined;
  let primaryFound = false;

  // P3-W9: 모든 규칙을 순회해 매칭된 intent 를 등장 순서대로 수집(중복 제거).
  const matched: Intent[] = [];
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(normalized)) {
      if (!primaryFound) {
        // 첫 매칭 = 대표 intent(기존 classifyIntent 반환값과 동일).
        primary = rule.intent;
        confidence = 'high';
        statType = rule.statType;
        primaryFound = true;
      }
      if (!matched.includes(rule.intent)) {
        matched.push(rule.intent);
      }
    }
  }

  if (!primaryFound) {
    // 미매칭 → chat(default), matchedIntents 빈 배열.
    return { intent: 'chat', confidence: 'default', matchedIntents: [] };
  }

  return {
    intent: primary,
    confidence,
    statType,
    matchedIntents: matched,
  };
}

/**
 * complexity 판정(순수 함수, P3-W9 9.1, routing.md §2 근사).
 *
 *  - composite: 서로 다른 intent 2개 이상 매칭(예: score+stats), 또는 접속표현이 있으면서
 *    매칭 intent 가 2개 이상. (정형 데이터 카드 2종을 한 화면에 합성할 가치가 있는 질의.)
 *  - general : chat/meme 단독(정형 카드 없는 잡담/밈 경로).
 *  - simple  : 그 외 단일 정형 intent(score/stats/news/schedule/lineup 단독).
 *
 * ⚠️ 단일 intent 면 절대 composite 가 되지 않는다(matchedIntents 길이 < 2) — 기존 경로 회귀 방지.
 */
export function decideComplexity(
  matchedIntents: Intent[],
  _normalized: string,
): 'simple' | 'general' | 'composite' {
  const distinct = matchedIntents.length; // 이미 중복 제거됨

  // 서로 다른 정형 intent 2개 이상 매칭(예: score+stats) → composite.
  //   접속표현(CONNECTIVE_PATTERN)은 routing.md §2 의 보조 신호지만, 단독으로는 단일 intent 를
  //   복합으로 끌어올리지 못한다(2매칭이 본질 게이트). 따라서 distinct>=2 를 1차 조건으로 둔다.
  if (distinct >= 2) {
    return 'composite';
  }

  // 단일 매칭(또는 0). chat/meme 단독은 general, 그 외 단일 정형 intent 는 simple.
  const primary = matchedIntents[0];
  if (primary === undefined || primary === 'chat' || primary === 'meme') {
    return 'general';
  }
  return 'simple';
}

export function intentRouter(state: CoreGraphState): CoreGraphUpdate {
  const { intent, confidence, statType, matchedIntents } = classifyIntent(
    state.userMessageNormalized,
  );
  const complexity = decideComplexity(
    matchedIntents,
    state.userMessageNormalized,
  );
  return {
    intent,
    intentConfidence: confidence,
    complexity,
    statType, // stats 규칙이면 'standings'|'player', 아니면 undefined
    matchedIntents, // P3-W9: composite 데이터 다중 조회 + L3 폴백 대표 intent 결정용
  };
}
