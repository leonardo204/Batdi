---
id: batdi-db-schema
title: 밧디 DB 스키마 / DDL
type: interface
version: 1.0.0
status: approved
scope: PostgreSQL 16 단일 인스턴스 전체 테이블(사용자·도메인·캐시·관측) 통합 SSOT — DDL·인덱스·FK·ON DELETE 정책·커넥션 풀 전략. 이 문서만 보고 Prisma 스키마 작성 가능
related: [batdi-architecture, batdi-service-plan, batdi-persona-guardrail, batdi-platform-ops, batdi-pre-dev-checklist]
updated: 2026-06-12
---

# 밧디 DB 스키마 / DDL

> **DB SSOT**: 모든 테이블의 정식 DDL은 이 문서에 모인다. 설계 문서(persona-guardrail·platform-ops)의 `CREATE TABLE`은 설계 맥락 예시이며, 충돌 시 본 문서가 우선한다.
> **대상**: PostgreSQL 16 단일 인스턴스 (Docker, 포트 `54329`). Prisma ORM 경유.
> **범위**: 본 문서만 보고 Prisma 스키마를 작성할 수 있도록 전체 테이블을 논리 그룹으로 정리한다.

## 0. 테이블 인덱스 (논리 그룹)

| 그룹 | 테이블 | 출처(설계 맥락) |
|------|--------|-----------------|
| **A. 사용자·대화** | `users`, `conversations`, `messages` | platform-ops §12.2 |
| **B. Personal Agent** | `personal_agent_state`, `user_favorites` | persona-guardrail §3.4 / platform-ops §12.2 |
| **C. 도메인 데이터(선수·스탯)** | `players`, `batting_stats`, `pitching_stats` | platform-ops §9.3 |
| **D. 캐시** | `cache_ui_envelopes`, `a2ui_templates`, `cache_scores`, `cache_news`, `memes` | platform-ops §11.2 / architecture §4.2·§4.3 |
| **E. 관측** | `agent_traces`, `tool_call_logs` | platform-ops §11.2 / architecture §10.3 |

### ON DELETE 정책 요약 (탈퇴 시 파기 — pre-dev-checklist LAW-2 1차 제안)

> 탈퇴(`users` 행 삭제) 시 사용자 연관 데이터의 처리 정책. **본 절은 LAW-2 매트릭스의 1차 제안이며, P1 법무 검토 후 확정**한다. 미확정 항목은 `TBD` 표기.

| 테이블 | user_id FK 정책 | 근거 |
|--------|-----------------|------|
| `conversations` | **CASCADE** | 대화는 사용자 소유물 → 함께 파기 |
| `messages` | **CASCADE** (conversation 경유) | conversations CASCADE에 연쇄 |
| `personal_agent_state` | **CASCADE** | 개인화 상태 전량 파기 |
| `user_favorites` | **CASCADE** | 사용자 관심 데이터 파기 |
| `agent_traces` | **SET NULL** (익명화 후 보존) | 운영·비용 통계 보존 필요 → `user_id` 익명화. *TBD: 법무 검토 후 CASCADE 전환 여부 결정* |
| `tool_call_logs` | trace_id 경유(직접 user_id 없음) | `agent_traces` SET NULL 시 trace는 유지(익명) |

비-사용자 FK(`players` 등 도메인 데이터)는 사용자 탈퇴와 무관하므로 `RESTRICT`(기본) 유지.

---

## A. 사용자·대화

> 정식 DDL SSOT. 설계 맥락: [batdi-platform-ops §12.2](../design/batdi-platform-ops.md).

```sql
-- 사용자 (회원)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE,
  display_name  VARCHAR(50),
  auth_provider VARCHAR(20),                    -- 'google' | 'email' (AuthProvider 추상화)
  auth_id       VARCHAR(255),
  team_id       VARCHAR(20) NOT NULL,           -- 'hanwha' | 'doosan' | 'kia' | 'lotte' ...
  persona_style VARCHAR(20) DEFAULT 'passionate',
  level         INT DEFAULT 1,
  xp_points     INT DEFAULT 0,
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMP DEFAULT NOW(),
  last_active   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_users_team ON users(team_id);
CREATE INDEX idx_users_last_active ON users(last_active DESC);

-- 대화 세션
CREATE TABLE conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- LAW-2: 탈퇴 시 파기
  title      VARCHAR(100),
  summary    TEXT,                              -- 세션 요약 (Session Memory)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at DESC);

-- 메시지 (a2ui_envelope·trace_id 통합 — db-schema 확장본 반영)
CREATE TABLE messages (
  id              SERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,  -- LAW-2: 대화 파기 시 연쇄
  role            VARCHAR(10),                  -- 'user' | 'assistant' | 'system'
  content         TEXT NOT NULL,
  a2ui_envelope   JSONB,                        -- 저장된 A2UI spec (감사·재생용)
  trace_id        UUID REFERENCES agent_traces(trace_id) ON DELETE SET NULL,
  tokens_used     INT,
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

> **충돌 통합 메모 — `messages`**: platform-ops §12.2는 `a2ui_envelope`/`trace_id`를 base 컬럼으로 inline 정의(FK·tokens_used 포함)했고, 구 db-schema §10.2는 별도 `ALTER TABLE`로 두 컬럼을 추가(`trace_id`에 FK 명시). 본 문서는 **더 완전한 쪽으로 통합** — base 컬럼에 두 컬럼을 포함하되, `trace_id`에 `REFERENCES agent_traces(trace_id) ON DELETE SET NULL` FK를 부여하고 `tokens_used`도 유지했다. ALTER 분리는 불필요하므로 단일 CREATE로 통합.

---

## B. Personal Agent

> 정식 DDL SSOT. 설계 맥락: [batdi-persona-guardrail §3.4](../design/batdi-persona-guardrail.md), [batdi-platform-ops §12.2](../design/batdi-platform-ops.md).

```sql
-- 사용자별 Personal Agent 상태 (Write-through, 인메모리는 읽기 캐시)
CREATE TABLE personal_agent_state (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,  -- LAW-2: 개인화 상태 파기
  profile_summary     TEXT,                     -- 자동 학습 요약 (~200토큰)
  profile_data        JSONB DEFAULT '{}',       -- interests, knowledgeLevel, responseStyle 등
  custom_persona      TEXT,                     -- 사용자 커스텀 프롬프트 (500자)
  favorite_players    INT[],                    -- 관심 선수 ID 목록 (빠른 읽기용 비정규화)
  message_count       INT DEFAULT 0,
  last_profile_update TIMESTAMP,
  last_active         TIMESTAMP DEFAULT NOW(),   -- cleanup 쿼리용 (30분 비활성 정리)
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_personal_agent_last_active ON personal_agent_state(last_active DESC);

-- 관심 선수 (정규화 테이블 — 출처·언급 횟수 추적)
CREATE TABLE user_favorites (
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,  -- LAW-2: 관심 데이터 파기
  player_id     INT  REFERENCES players(id),
  source        VARCHAR(20),                    -- 'explicit' | 'auto_detected'
  mention_count INT DEFAULT 0,
  PRIMARY KEY (user_id, player_id)
);
```

> **충돌 통합 메모 — `personal_agent_state`**: persona-guardrail §3.4 정의에는 `last_active` 컬럼이 없으나, 같은 문서 §3.5(Write-through)와 본 절의 cleanup 쿼리는 `last_active DESC` 인덱스를 요구한다. 따라서 **더 완전한 쪽으로 통합** — `last_active TIMESTAMP DEFAULT NOW()` 컬럼 + 인덱스를 본 SSOT에 포함했다. (구 정의는 `last_profile_update`만 보유.)
>
> **중복 정리 — `user_favorites`**: 구 db-schema §10.2b와 platform-ops §12.2에 동일 정의가 중복되어 있었다. 본 문서로 단일화(컬럼 동일, 충돌 없음).
>
> **비정규화 메모**: `personal_agent_state.favorite_players INT[]`(빠른 읽기 캐시)와 `user_favorites`(정규화 마스터)는 의도된 이중 보관이다. Write-through 시 둘 다 갱신. `user_favorites`가 source-of-truth.

---

## C. 도메인 데이터 (선수 · 스탯)

> 정식 DDL SSOT. 설계 맥락: [batdi-platform-ops §9.3](../design/batdi-platform-ops.md).
> 사용자 탈퇴와 무관한 공용 도메인 데이터 (ON DELETE 정책 비적용).

```sql
-- 선수 마스터
CREATE TABLE players (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(50),
  team_id    VARCHAR(20),
  position   VARCHAR(10),
  birth_year INT,
  throws     VARCHAR(5),
  bats       VARCHAR(5)
);
CREATE INDEX idx_players_team ON players(team_id);
CREATE INDEX idx_players_name ON players(name);

-- 타격 스탯 (시즌별)
CREATE TABLE batting_stats (
  id         SERIAL PRIMARY KEY,
  player_id  INT REFERENCES players(id),
  season     INT,
  team_id    VARCHAR(20),
  games      INT,
  avg        DECIMAL(4,3),
  obp        DECIMAL(4,3),
  slg        DECIMAL(4,3),
  ops        DECIMAL(4,3),
  hr         INT,
  rbi        INT,
  war        DECIMAL(4,2),
  wrc_plus   DECIMAL(5,1),
  babip      DECIMAL(4,3),
  raw_data   JSONB,
  source     VARCHAR(20),                       -- 'kbo' | 'statiz' | 'kbreport'
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_batting_player_season ON batting_stats(player_id, season);

-- 투구 스탯 (시즌별)
CREATE TABLE pitching_stats (
  id         SERIAL PRIMARY KEY,
  player_id  INT REFERENCES players(id),
  season     INT,
  team_id    VARCHAR(20),
  games      INT,
  era        DECIMAL(4,2),
  whip       DECIMAL(4,2),
  fip        DECIMAL(4,2),
  war        DECIMAL(4,2),
  strikeouts INT,
  raw_data   JSONB,
  source     VARCHAR(20),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_pitching_player_season ON pitching_stats(player_id, season);
```

---

## D. 캐시

> 정식 DDL SSOT. 설계 맥락: [batdi-platform-ops §11.2](../design/batdi-platform-ops.md), 4단계 캐시 맥락 [batdi-architecture §4.2·§4.3](../design/batdi-architecture.md).

```sql
-- L0 A2UI envelope 캐시 (비개인화 응답만 저장 — Cache Poisoning 방지, architecture §4.2)
CREATE TABLE cache_ui_envelopes (
  cache_key      VARCHAR(128) PRIMARY KEY,
  intent         VARCHAR(32) NOT NULL,
  params_hash    VARCHAR(64) NOT NULL,
  team_id        VARCHAR(20),
  persona_scope  VARCHAR(16) NOT NULL,          -- 'default' | 'team_only' (개인화 응답은 저장 금지)
  envelope_jsonl TEXT NOT NULL,                 -- A2UI 3-메시지 JSONL
  data_snapshot  JSONB,                         -- 원본 데이터 (디버깅용)
  hit_count      INT DEFAULT 0,
  expires_at     TIMESTAMP NOT NULL,
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cache_ui_expires ON cache_ui_envelopes(expires_at);

-- L1 A2UI 템플릿 (Template + DataBinding)
CREATE TABLE a2ui_templates (
  template_id    VARCHAR(64) PRIMARY KEY,
  intent         VARCHAR(32) NOT NULL,
  component_tree JSONB NOT NULL,                -- A2UI surfaceUpdate 구조 (바인딩 플레이스홀더 포함)
  bind_schema    JSONB NOT NULL,                -- 필요한 데이터 경로 명세
  variants       JSONB,                         -- compact/emphasized 등
  version        INT DEFAULT 1,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- 스코어 캐시 (T1 실시간 스코어 크롤링 결과)
CREATE TABLE cache_scores (
  game_id    VARCHAR(64) PRIMARY KEY,
  game_date  DATE NOT NULL,
  home_team  VARCHAR(20),
  away_team  VARCHAR(20),
  payload    JSONB NOT NULL,                    -- 스코어 전체 페이로드
  source     VARCHAR(20),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cache_scores_date ON cache_scores(game_date);

-- 뉴스 캐시 (T1 Google News RSS)
CREATE TABLE cache_news (
  id         SERIAL PRIMARY KEY,
  team_id    VARCHAR(20),
  title      VARCHAR(255),
  url        VARCHAR(512),
  summary    TEXT,
  published_at TIMESTAMP,
  source     VARCHAR(20),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cache_news_team ON cache_news(team_id, published_at DESC);

-- 밈 (T3 커뮤니티 밈 / seed 밈)
CREATE TABLE memes (
  id         SERIAL PRIMARY KEY,
  team_id    VARCHAR(20),
  content    TEXT,
  category   VARCHAR(32),
  source     VARCHAR(20),                       -- 'community' | 'seed'
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_memes_team ON memes(team_id);
```

> **보강 메모 — `cache_scores`·`cache_news`·`memes`**: platform-ops §11.2는 이들을 `( ... )` 생략 형태로만 표기("기존" 주석)했다. 본 SSOT는 4단계 캐시(L0/L1) + T1/T3 크롤링 맥락에 맞춰 **결정 변경 없이 컬럼을 1차 구체화**했다(과설계 금지). 크롤링 스키마 확정 시 platform-ops §9·§11과 동기화한다.

---

## E. 관측 (Trace · 로그)

> 정식 DDL SSOT. 설계 맥락: [batdi-platform-ops §11.2](../design/batdi-platform-ops.md), 비동기 배치 [batdi-architecture §10.3](../design/batdi-architecture.md).

```sql
-- Agent 트레이스 (Langfuse 동기화 전 버퍼, 비동기 배치 INSERT)
CREATE TABLE agent_traces (
  trace_id        UUID PRIMARY KEY,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,  -- LAW-2: 익명화 후 통계 보존 (TBD: 법무 검토)
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  intent          VARCHAR(32),
  complexity      VARCHAR(16),
  cache_hit       VARCHAR(8),                   -- 'L0' | 'L1' | 'L2' | 'L3' | 'miss'
  llm_calls       INT DEFAULT 0,
  tokens_in       INT DEFAULT 0,
  tokens_out      INT DEFAULT 0,
  duration_ms     INT,
  error           TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_traces_user_created ON agent_traces(user_id, created_at);
CREATE INDEX idx_traces_intent ON agent_traces(intent);

-- 툴콜 로그 (trace 하위, 비동기 배치)
CREATE TABLE tool_call_logs (
  id          SERIAL PRIMARY KEY,
  trace_id    UUID REFERENCES agent_traces(trace_id) ON DELETE CASCADE,
  action_name VARCHAR(64),
  params      JSONB,
  result      JSONB,
  duration_ms INT,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

> **충돌 통합 메모 — `agent_traces`**: 구 db-schema §10.1과 platform-ops §11.2가 동일 컬럼이나, platform-ops 쪽은 FK·인덱스가 생략 형태였다. 본 SSOT는 **더 완전한 db-schema 정의를 채택**하고, LAW-2에 따라 `user_id`/`conversation_id`에 `ON DELETE SET NULL`(익명화 보존)을 추가했다. `tool_call_logs.trace_id`는 trace 삭제 시 함께 정리되도록 `ON DELETE CASCADE`.

---

## 인덱스 전략 요약

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| `users` | `(team_id)`, `(last_active DESC)` | 팀별 집계, 활성 사용자 |
| `conversations` | `(user_id, updated_at DESC)` | 대화 목록 정렬 |
| `messages` | `(conversation_id, created_at)` | 세션 멀티턴 로드 |
| `personal_agent_state` | `(last_active DESC)` | cleanup(30분 비활성) |
| `players` | `(team_id)`, `(name)` | 선수 조회 |
| `batting_stats` / `pitching_stats` | `(player_id, season)` | 시즌 스탯 조회 |
| `cache_ui_envelopes` | `(expires_at)` | 만료 배치 정리 |
| `cache_scores` | `(game_date)` | 날짜별 스코어 |
| `cache_news` | `(team_id, published_at DESC)` | 팀 뉴스 |
| `memes` | `(team_id)` | 팀 밈 |
| `agent_traces` | `(user_id, created_at)`, `(intent)` | 비용·인텐트 분석 |

---

## DB 커넥션 풀 전략 (Connection Exhaustion 방지)

**문제 시나리오**: 경기 시작 시각 100명 동시 접속 → messages INSERT + personal_agent_state UPDATE(write-through) + LangGraph checkpoint + agent_traces INSERT이 한 요청에 4~6회 DB 트랜잭션 유발. Prisma 기본 풀(connection_limit=10~20)은 즉시 포화 → 대기열 폭증 → 스트리밍 레이턴시 악화.

**계층 전략**

| 계층 | 도구 | 설정 |
|------|------|------|
| App ↔ Pooler | Prisma `connection_limit` | NestJS 인스턴스당 20 |
| Pooler ↔ Postgres | **PgBouncer** (transaction pooling) | `default_pool_size=25`, `max_client_conn=200` |
| 실시간 쓰기 우선순위 | messages, personal_agent_state(write-through), conversations | 동기 트랜잭션 |
| 지연 쓰기 (Async Batch) | **agent_traces**, tool_call_logs, Langfuse raw events, cache_ui_envelopes hit_count 증분 | 인메모리 큐 → 1초·100건 배치 flush |

**비동기 배치 경로**

```
LangGraph 노드 → TraceCollector(in-memory queue)
                    ↓ (1s OR 100건)
                 TraceBatchWriter → single bulk INSERT
                    ↓ 실패 시
                 local retry buffer (최대 1MB) → 다음 tick
```

- **Langfuse SDK는 이미 비동기 배치** (out-of-the-box). 자체 `agent_traces` 테이블도 동일 방식 적용.
- `hit_count` 증분은 `UPDATE ... SET hit_count = hit_count + 1` 개별 트랜잭션 대신 5분 배치 집계 + `UPDATE` (무효화 배치와 동일 job).
- P6+ 스케일 아웃 시 PgBouncer → Postgres 16 read replica 추가 대비.

**측정**: Langfuse `db_wait_ms` 메트릭 노출, >50ms 지속 시 Admin 알람.
