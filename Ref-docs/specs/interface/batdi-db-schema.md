---
id: batdi-db-schema
title: 밧디 DB 스키마 / DDL
type: interface
version: 0.1.0
status: approved
scope: PostgreSQL 16 단일 인스턴스 스키마 — 신규/확장 테이블 DDL·인덱스·커넥션 풀 전략 (DB SSOT)
related: [batdi-architecture, batdi-service-plan]
updated: 2026-06-12
---

## 10. DB 스키마 (확장)

### 10.1 신규 테이블

```sql
-- A2UI 캐시
CREATE TABLE cache_ui_envelopes (
  cache_key      VARCHAR(128) PRIMARY KEY,
  intent         VARCHAR(32) NOT NULL,
  params_hash    VARCHAR(64) NOT NULL,
  team_id        VARCHAR(20),
  persona_scope  VARCHAR(16) NOT NULL,  -- 'default' | 'team_only' (개인화 응답은 저장 금지)
  envelope_jsonl TEXT NOT NULL,      -- A2UI 3-메시지 JSONL
  data_snapshot  JSONB,              -- 원본 데이터 (디버깅용)
  hit_count      INT DEFAULT 0,
  expires_at     TIMESTAMP NOT NULL,
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cache_ui_expires ON cache_ui_envelopes(expires_at);

CREATE TABLE a2ui_templates (
  template_id    VARCHAR(64) PRIMARY KEY,
  intent         VARCHAR(32) NOT NULL,
  component_tree JSONB NOT NULL,     -- A2UI surfaceUpdate 구조 (바인딩 플레이스홀더 포함)
  bind_schema    JSONB NOT NULL,     -- 필요한 데이터 경로 명세
  variants       JSONB,              -- compact/emphasized 등
  version        INT DEFAULT 1,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- Agent 트레이스 (Langfuse 동기화 전 버퍼)
CREATE TABLE agent_traces (
  trace_id       UUID PRIMARY KEY,
  user_id        UUID REFERENCES users(id),
  conversation_id UUID REFERENCES conversations(id),
  intent         VARCHAR(32),
  complexity     VARCHAR(16),
  cache_hit      VARCHAR(8),
  llm_calls      INT DEFAULT 0,
  tokens_in      INT DEFAULT 0,
  tokens_out     INT DEFAULT 0,
  duration_ms    INT,
  error          TEXT,
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_traces_user_created ON agent_traces(user_id, created_at);
CREATE INDEX idx_traces_intent ON agent_traces(intent);

-- 툴콜 로그
CREATE TABLE tool_call_logs (
  id             SERIAL PRIMARY KEY,
  trace_id       UUID REFERENCES agent_traces(trace_id),
  action_name    VARCHAR(64),
  params         JSONB,
  result         JSONB,
  duration_ms    INT,
  created_at     TIMESTAMP DEFAULT NOW()
);
```

> `cache_ui_envelopes`·`a2ui_templates`의 DDL은 4단계 캐시 맥락(architecture §4.2·§4.3)에서 정의된 것과 동일하다. 본 문서가 DB 스키마 SSOT이므로 완전한 DDL을 여기 복제해 둔다.

### 10.2 messages 테이블 확장

```sql
ALTER TABLE messages
  ADD COLUMN a2ui_envelope JSONB,     -- 저장된 A2UI spec (감사·재생용)
  ADD COLUMN trace_id UUID REFERENCES agent_traces(trace_id);
```

### 10.2b user_favorites 테이블

```sql
CREATE TABLE user_favorites (
  user_id    UUID REFERENCES users(id),
  player_id  INT  REFERENCES players(id),
  source     VARCHAR(20),
  mention_count INT DEFAULT 0,
  PRIMARY KEY (user_id, player_id)
);
```

### 10.3 DB 커넥션 풀 전략 (Connection Exhaustion 방지)

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
