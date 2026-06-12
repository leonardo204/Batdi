---
id: batdi-platform-ops
title: 밧디 플랫폼 & 운영 설계
type: design
version: 0.1.0
status: approved
scope: Data Agent 크롤링·안정성/성능/환각방지·캐시/DB·회원·레벨·푸시·Admin
related: [batdi-service-plan, batdi-architecture, batdi-db-schema, batdi-development-plan]
updated: 2026-06-12
---

# 밧디 플랫폼 & 운영 설계

> 본 문서는 [batdi-service-plan](./batdi-service-plan.md)에서 분할되었다(기획 SSOT 일부).

## 9. Data Agent — 크롤링 전용

### 9.1 설계 원칙

크롤링으로만 진행(API 사용 안 함), 부하를 주지 않음(요청 간격 최소 10초, 동시 1개), robots.txt 준수, 법적 위험 낮은 소스 우선.

### 9.2 데이터 소스 — 3단계 분리 전략

크롤링 유지보수 리스크(DOM 변경·Cloudflare 차단)를 분산하기 위해 **서비스 가동 의존도**에 따라 3단계로 나눈다. 상위 단계 실패 시에도 하위 단계는 정상 동작해야 한다.

| Tier | 데이터 | 출처 | 주기 | MVP 포함 | 실패 시 |
|------|--------|------|------|---------|--------|
| **T1 필수** | 실시간 스코어 | KBO 공식 정적 페이지 | 경기 중 5분 | **P2** | 서비스 치명. 다중 소스 fallback + Admin 긴급 알림 |
| **T1 필수** | KBO 뉴스 | Google News RSS | 30분 | **P2** | Fallback 메시지 |
| **T2 기본** | 기본 스탯 (AVG/HR/ERA) | KBO 공식 | 일 1회 | **P3** | 3일 전 데이터 재사용 + "데이터 점검 중" 표시 |
| **T2 기본** | 일정/순위 | KBO 공식 | 일 1회 | **P3** | 캐시 재사용 |
| **T3 선택** | 세이버 스탯 (WAR/wRC+/FIP) | Statiz/KBReport | 주 1회 배치 | **P3 옵션** | StatsGraph의 세이버 응답만 비활성, 기본 스탯으로 degrade |
| **T3 선택** | 커뮤니티 밈 | 야구 커뮤니티 | 3시간 | **P4** | 사전 seed 밈 DB로 대체 |

**healthScore 자동 비활성**
```typescript
class CrawlerHealthManager {
  // 연속 실패 3회 → 자동 비활성 + Admin 알림
  // T3 비활성 시 StatsGraph가 "기본 스탯만 제공" 모드로 degrade
}
```

**T1 다중 소스 Fallback**: KBO 공식 실패 → Google News RSS에서 최신 스코어 파싱 → Search Grounding 최후 보루.

**세이버 스탯 (T3)**: P0 단계에서 Statiz/KBReport 대안 조사 (공식 계정 연락, **유료 API 조기 전환 플래그**). 지속 실패 시 과감히 P4로 연기 또는 유료 전환.

### 9.3 자체 통계 DB

> 정식 DDL SSOT: [batdi-db-schema](../interface/batdi-db-schema.md) (C. 도메인 데이터). 아래는 설계 맥락 예시.

```sql
CREATE TABLE players (
  id SERIAL PRIMARY KEY, name VARCHAR(50), team_id VARCHAR(20),
  position VARCHAR(10), birth_year INT, throws VARCHAR(5), bats VARCHAR(5)
);
CREATE TABLE batting_stats (
  id SERIAL PRIMARY KEY, player_id INT REFERENCES players(id),
  season INT, team_id VARCHAR(20), games INT,
  avg DECIMAL(4,3), obp DECIMAL(4,3), slg DECIMAL(4,3), ops DECIMAL(4,3),
  hr INT, rbi INT, war DECIMAL(4,2), wrc_plus DECIMAL(5,1), babip DECIMAL(4,3),
  raw_data JSONB, source VARCHAR(20), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE pitching_stats (
  id SERIAL PRIMARY KEY, player_id INT REFERENCES players(id),
  season INT, team_id VARCHAR(20), games INT,
  era DECIMAL(4,2), whip DECIMAL(4,2), fip DECIMAL(4,2), war DECIMAL(4,2),
  strikeouts INT, raw_data JSONB, source VARCHAR(20), updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 10. 안정성 · 성능 · 환각 방지

### 10.1 크롤링 Fallback — 페르소나를 유지하는 장애 대응

Statiz, KBO 공식 등은 DOM 구조 변경이나 봇 차단 솔루션(Cloudflare 등)이 작동할 수 있다. 크롤링 실패 시 에러를 뱉지 않고, 페르소나를 유지하며 자연스럽게 넘긴다.

```typescript
class DataFallbackHandler {
  // 팀별 Fallback 응답 템플릿
  private fallbackMessages: Record<string, string[]> = {
    hanwha: [
      "아이고, 지금 KBO 전광판이 고장 났나 봐유~ 조금 이따 다시 물어봐 줘유!",
      "어라? 데이터가 좀 늦게 오네유~ 잠시만 기다려봐유, 금방 올 거여~",
      "음, 지금 기록실이 점검 중인가 봐유. 대신 다른 얘기 할까유?",
    ],
    doosan: [
      "음~ 지금 데이터가 좀 늦네. 뭐 기다리면 오겠지~",
      "전광판이 잠깐 쉬나 봐. 곧 돌아올 거야, 걱정 마~",
    ],
    kia: [
      "아따, 지금 데이터가 안 오네! 잠깐만 기다려봐, 금방 찾아올께!",
      "허맛나, 기록실이 막혀부렀네~ 조금 이따 다시 물어봐!",
    ],
    lotte: [
      "아이가, 데이터가 좀 늦네~ 잠깐만 기다리소!",
      "마 전광판이 쉬나 봐~ 조금 이따 다시 물어봐라!",
    ],
  };

  getFallbackResponse(teamId: string, errorType: string): AgentResponse {
    const messages = this.fallbackMessages[teamId] || this.fallbackMessages.hanwha;
    const message = messages[Math.floor(Math.random() * messages.length)];

    return {
      text: message,
      uiComponent: null,  // 카드 없이 텍스트만
      metadata: { fallback: true, errorType, retryAfter: 60 },
    };
  }
}
```

**Fallback 전략 계층:**

```
1차: 캐시 DB 조회 (최신 데이터가 아니어도 반환)
  → "5분 전 데이터여~" 표시
2차: 다른 소스로 전환 (KBO 실패 → News RSS → Search Grounding)
3차: 페르소나 유지 Fallback 메시지
4차: "지금은 확인이 어려워유~ [수동 확인 링크]" + KBO 공식 사이트 링크
```

크롤링 실패는 Admin 모니터링에 자동 알림. 연속 실패 시 해당 Crawler 자동 비활성화 + Admin 긴급 알림.

### 10.2 레이턴시 최적화 — 체감 속도 관리

> 정식 IntentRouter intent enum·complexity·키워드 사전 SSOT: [batdi-routing](../interface/batdi-routing.md) §G2-4. 아래 `standings`는 routing에서 `stats` 하위(`statType='standings'`)로 통일됨 — 본 절 코드는 설계 맥락.

에이전트 체이닝(Intent 분류 → 컨텍스트 로드 → 데이터 획득 → 페르소나 응답)으로 여러 홉을 거치면 체감 속도가 느려진다.

**원칙: LLM 호출 횟수를 최소화하고, 첫 토큰 도달 시간(TTFB)을 줄인다.**

#### A. Intent 분류를 LLM 없이 처리

```typescript
class LightweightIntentRouter {
  // LLM 호출 없이 키워드 + 정규식으로 90% 분류
  private rules: IntentRule[] = [
    { pattern: /스코어|점수|몇\s*대\s*몇|지금.*경기|이기고/, intent: 'score' },
    { pattern: /순위|몇\s*위|승률/, intent: 'standings' },
    { pattern: /타율|방어율|홈런|ERA|WAR|OPS|세이버/, intent: 'stats' },
    { pattern: /뉴스|소식|기사/, intent: 'news' },
    { pattern: /일정|언제.*경기|다음.*경기/, intent: 'schedule' },
    { pattern: /선발|라인업|누가.*던져/, intent: 'lineup' },
    { pattern: /밈|ㅋㅋ|웃긴/, intent: 'meme' },
  ];

  classify(message: string): Intent {
    for (const rule of this.rules) {
      if (rule.pattern.test(message)) return { type: rule.intent, confidence: 'high' };
    }
    // 매칭 안 되면 → 잡담(chat)으로 기본 처리
    // LLM 분류는 하지 않음 → 0ms 소요
    return { type: 'chat', confidence: 'default' };
  }
}
```

#### B. Typing Indicator — 중간 상태 즉시 전송

```typescript
// SSE 이벤트 순서
async handleMessage(message: string, userId: string): AsyncIterable<SSEEvent> {
  // 1. 즉시 전송 — 사용자에게 "처리 중" 표시 (0ms)
  yield { event: 'thinking', data: { message: getThinkingMessage(teamId) } };
  // "잠깐, 밧디가 찾아볼게유~" (한화) / "음~ 밧디가 좀 볼게~" (두산)

  // 2. Intent 분류 + 데이터 획득 (병렬 가능한 건 병렬로)
  const intent = this.intentRouter.classify(message);  // <1ms
  const [data, personalCtx] = await Promise.all([
    this.getAgentData(intent),           // DB 캐시 히트 시 <5ms
    this.personalAgent.buildContext(),   // DB 조회 <5ms
  ]);

  // 3. A2UI 카드 먼저 전송 (데이터가 있으면)
  if (data.uiComponent) {
    yield { event: 'ui-component', data: data.uiComponent };
  }

  // 4. LLM 스트리밍 응답 (감정 리액션)
  for await (const chunk of this.generateReaction(data, personalCtx)) {
    yield { event: 'content', data: { text: chunk } };
  }

  yield { event: 'done', data: {} };
}
```

#### C. 병렬 실행 (LangGraph)

`CacheLookup` L0 MISS 이후 `PersonalContext`와 `ServiceSubgraph`는 **의존성이 없으므로 병렬 실행**한다. LangGraph `add_edge` 다중 분기로 동시 디스패치 후 `Join` 노드에서 state 병합.

```
[CacheLookup MISS]
  ├─→ PersonalContext (DB 조회)  ─┐
  └─→ ServiceSubgraph (크롤링/DB) ┤  Promise.all
                                   ↓
                              [Join → UIComposer]
```

`ServiceSubgraph` 내부도 외부 I/O와 DB 조회는 `Promise.all`로 병렬화.

#### D. 예상 레이턴시 (병렬 적용 후)

| 단계 | L0 HIT | L1/L2 | L3 MISS (크롤링) |
|------|--------|-------|------------------|
| Typing Indicator 전송 | **0ms** | **0ms** | **0ms** |
| Normalizer + Intent 분류 | <2ms | <2ms | <2ms |
| 병렬: PersonalContext + ServiceSubgraph | — | ~50~100ms | ~2~3s |
| A2UI 카드 전송 | **즉시** | ~300ms | 데이터 후 즉시 |
| LLM 첫 토큰 (TTFB) | — | ~300ms | ~400ms |
| **사용자 체감 첫 응답** | **~200ms** | **~500~600ms** | **~1.5~2s** |

**병렬 실행 효과**: 기존 순차 대비 L2 약 30%, L3 약 40% 단축. 경기 중 "스코어" 질의는 100% L0 캐시 히트 → 즉시 카드 + 감정 스트리밍.

### 10.3 팩트/페르소나/UI 분리 — 환각 방지 + 동적 UI

LLM에게 사투리 페르소나 + 정확한 수치를 동시에 요구하면 환각이 발생한다. 반면 UI 구조는 수치 자체가 아니므로 LLM이 선택해도 환각과 무관하다.

**3원칙**
1. **팩트(수치·이름)**: DB → DataBinder로만 주입. LLM 리터럴 값 출력 금지
2. **페르소나(감정 텍스트)**: LLM이 자유롭게, 단 수치 언급 금지 (`{{llm.reaction}}` 슬롯에만 주입)
3. **UI 구조(컴포넌트·레이아웃·강조)**: LLM이 동적 선택, Agent가 팔레트·Schema·바인딩으로 통제

**LLM 권한 범위**

| 항목 | LLM 권한 |
|------|---------|
| 수치 값 | ✕ (DB 전용) |
| 선수/팀 이름 | ✕ (DB 전용) |
| 감정 리액션 문장 | ○ (자유) |
| 컴포넌트 선택 (scoreboardWidget vs battingLineWidget) | ○ (팔레트 내) |
| 레이아웃 배치 (column/row/grid) | ○ (Schema 범위 내) |
| 강조 variant (emphasized vs compact) | ○ |
| 바인딩 경로 | ○ (스키마 검증) |
| 바인딩 값 | ✕ (DB 치환) |

#### 응답 유형별 전략

| 응답 유형 | 정형 데이터 (A2UI 카드) | LLM 텍스트 | 예시 |
|-----------|----------------------|-----------|------|
| 실시간 스코어 | **ScoreCard**: 팀, 점수, 이닝, 투수, 구수 | 짧은 리액션 1~2문장 | 카드 + "와 이기고 있어유!!" |
| 선수 통계 | **StatsCard**: 이름, 타율, HR, OPS, WAR | 해석/코멘트 | 카드 + "타율이 많이 올랐네유~" |
| 순위 | **StandingsTable**: 팀, 승, 패, 승률 | 간단한 감상 | 테이블 + "우리 2위여! 화이팅!" |
| 일정 | **ScheduleCard**: 날짜, 상대, 시간, 구장 | 기대감 표현 | 카드 + "내일 기아전이네~ 기대된다유!" |
| 뉴스 | **NewsList**: 제목, 출처, 요약 | 뉴스에 대한 반응 | 리스트 + "이 기사 봤어유? 대박!" |
| 잡담/밈 | 없음 | 자유 대화 | "ㅋㅋ 맞어유~ 오늘 경기 기대되지!" |

#### LLM 리액션 프롬프트

```
아래 데이터에 대한 짧은 감정적 리액션을 1~2문장으로 생성해주세요.
수치를 직접 언급하지 마세요 — 수치는 별도 UI로 표시됩니다.
대신 그 수치에 대한 느낌, 기대, 응원을 표현하세요.

데이터: {한화 3:2 기아, 7회말, 문동주 98구}
→ 좋은 예: "이기고 있어유!! 투수가 좀 힘들어 보이는데 불펜 화이팅이여~!"
→ 나쁜 예: "문동주가 7이닝 98구를 던지며 3:2로 리드 중입니다" (수치 반복 = 카드와 중복)
```

이 방식으로 LLM은 수치를 "알 필요가 없고", 카드가 보여주는 데이터에 대한 감정만 생성한다. 환각 가능성이 원천 차단된다.

**A2UI 동적 UI 예시 (L3 UIComposer, 복합 질의)**

```jsonl
{"surfaceUpdate":{"surfaceId":"result","components":[
  {"id":"sb","type":"scoreboardWidget","props":{
    "homeTeam":"{{bind:data.home.name}}","awayTeam":"{{bind:data.away.name}}",
    "homeScore":"{{bind:data.home.score}}","awayScore":"{{bind:data.away.score}}",
    "inning":"{{bind:data.inning}}","status":"{{bind:data.status}}"
  }},
  {"id":"pl","type":"pitchingLineWidget","props":{
    "player":"{{bind:data.pitcher.name}}","ip":"{{bind:data.pitcher.ip}}",
    "pitches":"{{bind:data.pitcher.pitches}}"
  }},
  {"id":"r","type":"text","props":{"variant":"body","content":"{{llm.reaction}}"}}
]}}
{"dataModelUpdate":{"surfaceId":"result","path":"/","contents":[{...DB값...}]}}
{"beginRendering":{"surfaceId":"result","root":"sb"}}
```

LLM은 `scoreboardWidget`·`pitchingLineWidget`·`text`를 **선택**했을 뿐, 실제 수치는 DataBinder가 DB에서 가져와 치환한다.

### 10.4 커스텀 페르소나 vs 자동 학습 충돌 해결

사용자가 입력한 `custom_persona`와 자동 학습된 `profile_summary`가 충돌할 수 있다. (예: 자동 학습은 "투수 분석 선호"인데 사용자는 "타자 얘기만 해"라고 설정)

**원칙: 사용자 명시 > 자동 학습 > 시스템 기본**

```typescript
function buildPersonalContext(agent: PersonalAgent): string {
  return `
## 사용자 커스텀 지시 (최우선 — 반드시 따를 것)
${agent.customPersona || '없음'}

## 자동 학습 참고 (커스텀 지시와 충돌 시 커스텀이 우선)
${agent.profile.summary}
관심사: ${agent.profile.interests.join(', ')}
야구 지식: ${agent.profile.knowledgeLevel}

★ 중요: 위 '사용자 커스텀 지시'와 '자동 학습 참고'가 상충하면,
사용자가 직접 작성한 커스텀 지시를 따르세요.
예) 자동 학습이 "투수 분석 선호"이더라도 
사용자가 "타자 얘기만 해"라고 했으면 타자 얘기만 하세요.
  `.trim();
}
```

**프롬프트 우선순위 전체:**

```
[1순위] System Base — 불변 (가드레일, 아동보호)
  ↓ 절대 우회 불가
[2순위] User Custom Persona — 사용자가 직접 작성
  ↓ 자동 학습보다 우선
[3순위] PersonalAgent Profile — 자동 학습
  ↓ 팀 기본보다 우선
[4순위] Team Persona — 팀별 기본
```

System Base를 제외하면, 사용자의 명시적 의사가 항상 최우선이다.

---

## 11. 캐시/DB — PostgreSQL 단일 + 4단계 캐시

> 전체 DB DDL·인덱스·커넥션 풀 SSOT: [batdi-db-schema](../interface/batdi-db-schema.md). 본 절의 테이블 정의는 설계 맥락이며 정식 DDL은 해당 문서를 따른다.

### 11.1 4단계 캐시 레이어

| 레벨 | 저장 | Key | TTL | LLM |
|------|------|-----|-----|-----|
| **L0 Envelope 캐시** | `cache_ui_envelopes` | `hash(intent,params,teamId,date,personaScope)` | 1~5분 (스코어) / 1시간 (순위) / 1일 (선수 기본스탯) | 0회 (**비개인화만**) |
| **L1 Template+Binding** | `a2ui_templates` + DB | template_id + row | 무제한 | 0회 |
| **L2 Partial LLM (리액션)** | inline | — | — | 1회 Flash ~50 tokens |
| **L3 Full UIComposer** | inline | — | — | 1~2회 Flash ~500 tokens |

**Gemini Context Caching**: MVP 미적용 (§5.3). 현재 시스템 프롬프트 ~2K 토큰이 API 최소 요건(32K 토큰) 미충족이라 매 요청마다 전체 프롬프트를 주입. 비용 영향 미미.

### 11.2 핵심 테이블

```sql
-- L0 A2UI envelope 캐시 (비개인화 응답만 저장, §11.3 참조)
CREATE TABLE cache_ui_envelopes (
  cache_key      VARCHAR(128) PRIMARY KEY,
  intent         VARCHAR(32) NOT NULL,
  params_hash    VARCHAR(64) NOT NULL,
  team_id        VARCHAR(20),
  persona_scope  VARCHAR(16) NOT NULL,  -- 'default' | 'team_only'
  envelope_jsonl TEXT NOT NULL,
  data_snapshot  JSONB,
  hit_count      INT DEFAULT 0,
  expires_at     TIMESTAMP NOT NULL,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- L1 A2UI 템플릿
CREATE TABLE a2ui_templates (
  template_id    VARCHAR(64) PRIMARY KEY,
  intent         VARCHAR(32) NOT NULL,
  component_tree JSONB NOT NULL,
  bind_schema    JSONB NOT NULL,
  variants       JSONB,
  version        INT DEFAULT 1,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- 기존
CREATE TABLE cache_scores ( ... );
CREATE TABLE cache_news ( ... );
CREATE TABLE memes ( ... );

-- 관측
CREATE TABLE agent_traces (
  trace_id UUID PRIMARY KEY, user_id UUID, conversation_id UUID,
  intent VARCHAR(32), complexity VARCHAR(16), cache_hit VARCHAR(8),
  llm_calls INT, tokens_in INT, tokens_out INT, duration_ms INT,
  error TEXT, created_at TIMESTAMP DEFAULT NOW()
);
```

### 11.3 무효화 + Cache Poisoning 방지

**무효화**
- 스코어 변경 이벤트 → 해당 경기 관련 envelope 전체 DELETE
- 5분 배치: 만료 envelope 정리
- Admin 수동 flush 지원

**L0 Cache Poisoning 방지 (개인화 격리)**

사용자 고유 정보가 주입된 응답은 L0에 **절대 저장하지 않는다** (다른 유저에게 "형님!" 같은 호칭이 잘못 재생되는 대참사 방지).

- `persona_scope='default'`: 순수 공개 응답 (팀 기본 톤만). 모든 동일 teamId 유저가 공유.
- `persona_scope='team_only'`: 팀 페르소나 + 공개 데이터만. custom_persona 미주입.
- **Bypass (write 금지)**: 프롬프트에 `custom_persona`/`personal_profile`/`favorite_players`가 주입되었거나, OutputGuardrail이 응답에서 PII 패턴(개인 호칭·이름)을 감지한 경우.
- 캐시 키에 `personaScope` 포함 → default/team_only 격리.
- CacheStore.write() 진입 전 가드 → 위반 시 `cache_bypass` trace 이벤트 + write abort.

100명 규모 PostgreSQL 단일 인스턴스 충분.

### 11.4 미채택 (Phase 6+ 재검토)

- Semantic Cache (임베딩 기반 유사질의 캐시) — 검증 부족
- Persona Reaction Cache — 검증 부족

---

## 12. 회원가입/관리

### 12.1 플로우

첫 방문 → 밧디 소개 → 회원가입 (Google OAuth 또는 이메일) → 온보딩 (팀 선택, 페르소나 스타일, 푸시 허용) → PersonalAgent 생성 → 밧디와 첫 대화 시작

### 12.2 사용자 DB

> 정식 DDL SSOT: [batdi-db-schema](../interface/batdi-db-schema.md) (A. 사용자·대화 / B. Personal Agent). 아래는 설계 맥락 예시이며, 통합본에 ON DELETE 정책(LAW-2)·인덱스가 추가되어 있다.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE, display_name VARCHAR(50),
  auth_provider VARCHAR(20), auth_id VARCHAR(255),  -- 'google' | 'email'
  team_id VARCHAR(20) NOT NULL, persona_style VARCHAR(20) DEFAULT 'passionate',
  level INT DEFAULT 1, xp_points INT DEFAULT 0,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(), last_active TIMESTAMP DEFAULT NOW()
);
CREATE TABLE conversations (
  id UUID PRIMARY KEY, user_id UUID REFERENCES users(id),
  title VARCHAR(100), summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE messages (
  id SERIAL PRIMARY KEY, conversation_id UUID REFERENCES conversations(id),
  role VARCHAR(10), content TEXT NOT NULL,
  a2ui_envelope JSONB, trace_id UUID, tokens_used INT, created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE personal_agent_state (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  profile_summary TEXT, profile_data JSONB DEFAULT '{}',
  custom_persona TEXT, favorite_players INT[],
  message_count INT DEFAULT 0, last_profile_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE user_favorites (
  user_id UUID REFERENCES users(id), player_id INT REFERENCES players(id),
  source VARCHAR(20), mention_count INT DEFAULT 0, PRIMARY KEY (user_id, player_id)
);
```

### 12.3 사용자 페이지

| 페이지 | 내용 |
|--------|------|
| **/my/conversations** | 대화 목록, 검색, 삭제 |
| **/my/stats** | 대화 수, 자주 묻는 주제, 예측 적중률, 연속 접속일, 활동 시간대 |
| **/my/level** | 현재 레벨 & XP, 다음 레벨 조건, 해금 안내, 배지, 히스토리 |
| **/settings** | 프로필, 커스텀 페르소나 편집, 알림, 대화 보존기간, 개인화 학습 동의, 계정 |

---

## 13. 레벨 시스템

| Lv | 이름 | 요구 | 해금 |
|----|------|------|------|
| 1 | 신입 팬 | 가입 | 기본 대화, 스코어 |
| 2 | 내야석 | 대화 50회 | 경기 예측, 밈 강화 |
| 3 | 응원단석 | 대화 200회 + 예측 5회 | 두 번째 페르소나 스타일 |
| 4 | 시즌권 | 대화 500회 + 연속 7일 | 상세 통계, 선수 비교 |
| 5 | 12번째 선수 | 대화 1,000회 + 적중률 55%+ | 숨겨진 페르소나, 커스텀 닉네임 |

---

## 14. 푸시 알림 (PWA)

Web Push API + Service Worker + FCM. Android/Desktop 완전 지원. iOS 16.4+ 홈 화면 추가 후 지원.

트리거: 경기 시작 30분 전, 역전/동점, 경기 종료, 레벨업, 관심 선수 활약

---

## 15. Admin 기능

```
/admin
├── /agents         Agent 목록/상태/프롬프트 편집/재시작/로그
├── /core           Intent 규칙/캐시/LLM 라우팅
├── /users          사용자 목록/상세/차단/레벨 조정
├── /personal-agents PersonalAgent 상태 조회/초기화
├── /data           스코어·뉴스·밈·통계 캐시 관리, 크롤링 로그/스케줄
├── /guardrails     금지어/일베패턴/필터/Rate Limit/위반 로그
└── /monitoring     LLM 비용/API 호출량/에러율/서버 상태
```

---

