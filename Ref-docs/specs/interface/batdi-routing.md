---
id: batdi-routing
title: 밧디 라우팅 계약 (Intent · LLM)
type: interface
version: 1.0.0
status: approved
scope: IntentRouter intent enum·complexity 판정·키워드 사전 구조 + MultiLLMAdapter 모델 결정표·무료할당 폴백
related: [batdi-architecture, batdi-platform-ops, batdi-persona-guardrail]
updated: 2026-06-12
---

# 밧디 라우팅 계약 (Intent · LLM)

> 본 문서는 두 라우팅 계약을 계약 수준(타입·결정표·자료구조)으로 고정한다.
> - **G2-4 IntentRouter** — LLM 없이 키워드/정규식으로 의도 분류 + complexity 판정
> - **G2-5 MultiLLMAdapter** — intent·complexity·무료할당 상태로 LLM 모델 선택
>
> SSOT 관계: 기술 결정은 [batdi-architecture](../design/batdi-architecture.md)가 SSOT다.
> 본 문서는 architecture가 개요로만 둔 라우팅 규칙을 계약으로 구체화하며, **architecture와 모순이 생기면 architecture를 따른다**.
> 본 문서는 [batdi-platform-ops](../design/batdi-platform-ops.md) §10.2(IntentRouter 키워드 사전)와
> [batdi-persona-guardrail](../design/batdi-persona-guardrail.md) §5(스마트 모델 라우팅)의 설계 맥락을 계약화한 것이다.

---

## G2-4 — IntentRouter (LLM 미사용)

IntentRouter는 **LLM을 호출하지 않는다**. Normalizer를 통과한 `userMessageNormalized`에 대해
키워드/정규식 사전을 순차 매칭하여 intent를 결정한다 (architecture §3.2 노드 흐름의 `IntentRouter` 노드).
미매칭 시 `chat`을 기본값으로 둔다. 소요 시간 목표 < 2ms (platform-ops §10.2 D).

### 1. Canonical Intent Enum (단일화)

#### 1.1 불일치 현황과 해소

두 설계 문서의 intent 집합이 달랐다.

| 출처 | intent 집합 | 차이점 |
|------|-------------|--------|
| architecture §3.1 (기술 SSOT) | `score · stats · news · chat · schedule · lineup · meme · composite` | `standings` 없음(= `stats` 하위로 흡수), 라우팅용 `composite` 표기 혼입 |
| platform-ops §10.2 (설계 맥락) | `score · standings · stats · news · schedule · lineup · meme · chat` | `standings`를 별도 intent로 분리, `composite` 없음 |

**해소 (architecture 기준 통일):**

- **`standings`는 별도 canonical intent로 채택하지 않고 `stats` 하위로 흡수한다.**
  - 근거: architecture §3.1 `Intent` 타입 정의가 기술 SSOT이며 `standings`를 별도 enum 값으로 두지 않는다. 순위/승률 질의는 StatsGraph가 처리하는 팀 단위 통계의 한 종류로, 별도 Service Subgraph(architecture §7.2)가 없다 → intent를 늘릴 근거가 없다. `intent=stats` + `statType='standings'` 파라미터로 분기한다.
- **`composite`는 intent가 아니라 complexity 값이다.** architecture §3.1에서 `Intent` 주석에 `composite`가 섞여 있으나, 같은 절의 별도 필드 `complexity: 'simple' | 'general' | 'composite'`가 SSOT다. canonical intent enum에서 `composite`를 제거하고 complexity 축으로만 둔다 (§G2-4.2).
- 그 결과 canonical intent enum은 **7종**: `score · stats · news · schedule · lineup · meme · chat`.

#### 1.2 Canonical Intent Enum (7종)

```typescript
type Intent =
  | 'score'     // 실시간 스코어·경기 진행
  | 'stats'     // 선수/팀 통계 (순위·승률 = statType:'standings' 하위)
  | 'news'      // 뉴스·기사·소식
  | 'schedule'  // 경기 일정
  | 'lineup'    // 선발·라인업
  | 'meme'      // 밈·유머
  | 'chat';     // 잡담 (미매칭 기본값)
```

| intent | 의미 | 대표 발화 예시 | 매칭 키워드군(대표) | 처리 Subgraph |
|--------|------|----------------|---------------------|----------------|
| `score` | 진행 중/종료 경기의 점수·이닝 | "지금 몇 대 몇이야", "이기고 있어?" | 스코어·점수·몇 대 몇·지금 경기·이기고 | ScoreGraph |
| `stats` | 선수/팀 통계, **순위·승률 포함** | "타율 얼마야", "우리 몇 위야", "방어율" | 타율·방어율·홈런·ERA·WAR·OPS·세이버 / 순위·몇 위·승률 | StatsGraph |
| `news` | 팀·선수 관련 뉴스 | "무슨 소식 있어", "오늘 기사" | 뉴스·소식·기사 | NewsGraph |
| `schedule` | 경기 일정 | "다음 경기 언제야", "내일 누구랑 해" | 일정·언제 경기·다음 경기 | ScheduleGraph |
| `lineup` | 선발 투수·라인업 | "오늘 선발 누구야", "라인업 알려줘" | 선발·라인업·누가 던져 | LineupGraph |
| `meme` | 밈·유머 | "ㅋㅋ", "웃긴 거 보여줘" | 밈·ㅋㅋ·웃긴 | MemeGraph |
| `chat` | 잡담·기타 (미매칭 기본값) | "안녕", "오늘 기분 어때" | (없음 — fallthrough) | ChatGraph |

> `stats`의 `standings` 하위 분기: `statType ∈ { 'player' | 'team' | 'standings' | 'saber' }`. 순위/승률 키워드가 매칭되면 `statType='standings'`로 표시해 StatsGraph가 StandingsTable 응답을 선택한다 (platform-ops §10.3 응답 유형 "순위").

### 2. Complexity 판정 규칙

`complexity: 'simple' | 'general' | 'composite'` 3단계를 결정한다. 이 값은
**캐시 경로 분기(L0~L3)의 직접 입력**이다 (architecture §3.2 `UIComposer` 분기, §4.0 캐시 결정 플로우의 `complexity 판정`).

#### 2.1 판정 입력

판정은 IntentRouter가 매칭한 결과 위에서 수행한다. 입력은 다음 3가지다.

1. **매칭된 intent 개수** — 한 메시지에서 둘 이상의 서로 다른 intent 키워드군이 동시 매칭되는지.
2. **접속 표현 존재** — 복수 요구를 잇는 접속사/구분자(`그리고`, `랑`, `하고`, `+`, `,`, `또`, `이랑`).
3. **intent 종류** — `chat`/`meme`는 정형 데이터가 없어 단독 처리(아래 표 참조).

#### 2.2 판정 결정 규칙

| complexity | 판정 조건 | 캐시 경로 | LLM 호출 |
|------------|-----------|-----------|----------|
| `simple` | 단일 intent + 정형 데이터 카드 1종으로 답 가능 (예: 단일 `score`/`stats`/`schedule`/`lineup`). 개인화 슬롯 주입 없음 | L0 HIT 시도 → MISS면 L1 Template | 0회 |
| `general` | 단일 intent지만 감정 리액션/해석 1문장이 필요 (대부분의 단일 intent 기본값). 또는 `chat`/`meme` 단독 | L1 Template + L2 리액션 | 1회 (Flash) |
| `composite` | 복수 intent 동시 매칭(예: `score` + `stats`) **또는** 접속 표현으로 복수 요구 연결 **또는** 개인화(custom_persona) 주입으로 동적 UI 조립 필요 | L3 Full UIComposer | 1~2회 (Flash) |

**결정 알고리즘 (의사코드):**

```typescript
function classifyComplexity(
  matchedIntents: Intent[],
  hasConjunction: boolean,
  personalized: boolean,
): Complexity {
  // 복수 intent 동시 출현 또는 접속 표현 → 복합 질의
  if (matchedIntents.length >= 2 || hasConjunction) return 'composite';
  // 개인화 응답(custom_persona 주입)은 동적 UI 조립 필요 → L3
  if (personalized) return 'composite';
  const [intent] = matchedIntents;
  // 잡담/밈은 카드 없이 리액션만 → general(L2)
  if (intent === 'chat' || intent === 'meme') return 'general';
  // 단일 정형 intent: 기본은 general(L1+리액션), L0 HIT면 캐시가 우선
  return 'general';
}
```

> 주: `simple`은 L0/L1만으로 답이 끝나는 캐시 우선 경로다. UIComposer 진입 시점에 L0 HIT면 IntentRouter 단계의 complexity와 무관하게 즉시 envelope을 반환한다 (architecture §4.0). complexity는 MISS 이후 경로 선택에 쓰인다.

### 3. 키워드/정규식 사전 구조

LLM 없이 매칭하는 사전의 자료구조다. 실제 키워드 전량은 P2 구현 시 확정하며,
여기서는 **구조 + 대표 예시**만 고정한다.

#### 3.1 자료구조 (intent → 규칙 배열)

```typescript
interface IntentRule {
  intent: Exclude<Intent, 'chat'>;   // chat은 fallthrough 기본값이므로 규칙 없음
  pattern: RegExp;                   // userMessageNormalized 기준 매칭
  statType?: 'player' | 'team' | 'standings' | 'saber';  // intent='stats' 보조 분기
}

// 순서가 곧 우선순위. 위에서부터 첫 매칭 채택.
const INTENT_RULES: IntentRule[] = [
  { intent: 'score',    pattern: /스코어|점수|몇\s*대\s*몇|지금.*경기|이기고/ },
  { intent: 'stats',    pattern: /순위|몇\s*위|승률/,            statType: 'standings' },
  { intent: 'stats',    pattern: /타율|방어율|홈런|ERA|WAR|OPS|세이버/ },
  { intent: 'news',     pattern: /뉴스|소식|기사/ },
  { intent: 'schedule', pattern: /일정|언제.*경기|다음.*경기/ },
  { intent: 'lineup',   pattern: /선발|라인업|누가.*던져/ },
  { intent: 'meme',     pattern: /밈|ㅋㅋ|웃긴/ },
];
```

#### 3.2 매칭 규칙

- **매칭 대상**: 반드시 `userMessageNormalized` (Normalizer 통과 — NFKC + 자모 재조합 + 특수문자/이모지 제거 + homoglyph 치환, architecture §3.4). 원문 `userMessage`로 매칭 금지.
- **순차 매칭, 첫 매칭 채택**: 배열 순서가 우선순위다. 순위/승률(`standings`)을 일반 `stats`보다 먼저 두어 `statType` 분기가 누락되지 않게 한다.
- **복수 매칭 수집**: complexity 판정(§2)을 위해 첫 매칭에서 멈추지 않고 **매칭된 모든 intent를 수집**한 뒤, 대표 intent(첫 매칭)와 `matchedIntents[]`를 함께 반환한다.
- **미매칭 → `chat`**: 어떤 규칙도 매칭되지 않으면 `intent='chat'`, `intentConfidence='default'`. 매칭 시 `'high'` (platform-ops §10.2 A).

```typescript
function classify(normalized: string): { intent: Intent; matchedIntents: Intent[]; confidence: 'high' | 'default' } {
  const matched: Intent[] = [];
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(normalized)) matched.push(rule.intent);
  }
  if (matched.length === 0) return { intent: 'chat', matchedIntents: ['chat'], confidence: 'default' };
  return { intent: matched[0], matchedIntents: [...new Set(matched)], confidence: 'high' };
}
```

---

## G2-5 — MultiLLMAdapter

MultiLLMAdapter는 IntentRouter 결과(intent·complexity)와 FreeQuotaTracker 상태를 입력으로
LLM 모델을 선택한다. 모델명은 기존 스펙 표기를 쓰되, **정확한 API model id 문자열은 "구현 시 확인"** (임의 생성 금지 — architecture §6.1 GeminiAdapter 구현 시 SDK 모델 id 확정).

### 1. 모델 결정표 (selectModel 함수 명세)

입력 `(usage, complexity, quota)` → 모델 1개를 결정하는 테이블. `usage`는 호출 목적(캐시 경로 또는 부가 작업)이다.

```typescript
type ModelTier = '2.5-flash' | '2.5-flash-lite' | '3-flash' | '2.5-pro';

interface ModelDecision {
  tier: ModelTier;
  apiModelId: string;   // 구현 시 확인 (SDK가 노출하는 정확한 model id)
}

// 결정표: usage × (free quota 상태) → tier
function selectModel(input: {
  usage: 'l2_reaction' | 'l3_uicomposer' | 'guardrail_semantic'
       | 'search_single' | 'search_composite' | 'batch_profile' | 'deep_analysis';
  freeQuota: FreeQuotaState;   // FreeQuotaTracker가 제공
}): ModelDecision;
```

| # | usage (사용처) | 기본 tier | 표기 모델 | 근거 | 무료할당 연동 |
|---|----------------|-----------|-----------|------|----------------|
| 1 | `l2_reaction` (L2 리액션 ~50 out) | `2.5-flash` | gemini-2.5-flash | 최저가 페르소나 리액션 | — |
| 2 | `l3_uicomposer` (L3 ~500 out) | `2.5-flash` | gemini-2.5-flash | A2UI JSONL 출력 품질 + 가격 | — |
| 3 | `guardrail_semantic` (의미적 가드레일) | `2.5-flash-lite` | gemini-2.5-flash-lite | 극저가 분류 | — |
| 4 | `search_single` (단순 검색 1회) | `3-flash` | gemini-3-flash | 무료 할당 우선 소진(5K/월) | 소진 시 §2 폴백 |
| 5 | `search_composite` (복합 검색 3+회) | `2.5-flash` | gemini-2.5-flash | 프롬프트당 과금 유리 | — |
| 6 | `batch_profile` (프로필 요약) | `2.5-flash-lite` (Batch) | gemini-2.5-flash-lite | Batch 50% 할인 | — |
| 7 | `deep_analysis` (심층 분석, 추후) | `2.5-pro` | gemini-2.5-pro | 품질 | — |

> 결정표 = 7행. architecture §6.2 + persona-guardrail §5.2와 정합 (두 표가 동일 행을 가짐 — 본 문서로 1:1 통합).
> 모든 `apiModelId`는 **구현 시 확인** — SDK(`GoogleGenerativeAIAdapter`)가 노출하는 정확한 model id 문자열로 채운다. 위 "표기 모델"은 식별용이며 API 문자열로 사용 금지.

#### intent·complexity → usage 매핑 (캐시 경로 결합)

| complexity (IntentRouter) | 캐시 경로 | usage | 모델 |
|---------------------------|-----------|-------|------|
| L0 HIT | envelope 반환 | — | LLM 없음 |
| `simple` → L1 | Template + Binding | — | LLM 없음 |
| `general` → L2 | Template + 리액션 | `l2_reaction` | 2.5-flash |
| `composite` → L3 | Full UIComposer | `l3_uicomposer` | 2.5-flash |

### 2. 무료할당 폴백 체인 (FreeQuotaTracker)

FreeQuotaTracker(persona-guardrail §5.4)가 무료 검색 할당 소진을 감지하면, 검색 usage의 tier를
다음 순서로 자동 강등한다. 응답 실패 없이 graceful하게 다음 tier로 폴백한다.

**검색 폴백 체인:**

```
3 Flash (무료 5K/월)  ──소진──▶  2.5 Flash (500 RPD 무료)  ──소진──▶  2.5 Flash-Lite
   gemini-3-flash               gemini-2.5-flash                   gemini-2.5-flash-lite
   (search_single 기본)         (search_composite 기본 = 동일 tier)  (최후 폴백)
```

- 폴백은 **무료 할당 소진 시에만** 발동한다. 평시엔 결정표 §1의 기본 tier를 쓴다.
- `2.5-pro`는 비용이 높아 폴백 체인에 포함하지 않는다 (의도적 심층 분석 usage에만 명시 선택).
- FreeQuotaState 예: `{ '3-flash': { used, limit: 5000, period: 'month' }, '2.5-flash': { used, limit: 500, period: 'day' } }`.

**사용처별 기본 모델 (폴백 전 평상시 기준):**

| 사용처 | 기본 모델 (tier) | 폴백 대상 여부 |
|--------|------------------|----------------|
| 가드레일 (의미적 분류) | gemini-2.5-flash-lite | ✕ (무료 검색 할당과 무관) |
| L2 리액션 | gemini-2.5-flash | ✕ |
| L3 UIComposer | gemini-2.5-flash | ✕ |
| 요약 (Batch 프로필) | gemini-2.5-flash-lite (Batch) | ✕ |
| 단순 검색 | gemini-3-flash | ○ (위 체인) |
| 복합 검색 | gemini-2.5-flash | ○ (위 체인) |
| 심층 분석 | gemini-2.5-pro | ✕ |

### 3. serviceAdapter = EmptyAdapter (LLM은 노드 안에서)

CopilotRuntime의 `serviceAdapter`는 **EmptyAdapter**다. LLM 호출은 런타임 어댑터가 아니라
**LangGraph 노드 내부에서만** 수행한다 (architecture ADR-016 PoC 결론과 정합 — `serviceAdapter=EmptyAdapter`, LLM은 LangGraph 노드 안에서). 따라서 MultiLLMAdapter의 `selectModel`은 각 노드(UIComposer·TeamPersona·Guardrail 등)가 호출하는 그래프 내부 컴포넌트다.

---

## 변경 영향

- 본 문서는 architecture의 라우팅 규칙을 계약화한다. **canonical intent enum이 7종으로 확정**되었으므로, architecture §3.1의 `Intent` 주석에서 `composite` 표기 혼입과 `standings` 누락은 본 문서 §G2-4.1로 해소된 것으로 본다(향후 architecture 갱신 시 본 문서를 related로 참조).
- platform-ops §10.2의 `standings` 별도 intent 표기는 `stats` 하위(`statType='standings'`)로 통일된다.
</content>
</invoke>
