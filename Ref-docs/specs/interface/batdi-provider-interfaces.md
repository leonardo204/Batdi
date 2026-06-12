---
id: batdi-provider-interfaces
title: 밧디 Auth · Push Provider 인터페이스
type: interface
version: 1.0.0
status: approved
scope: AuthProvider/PushProvider 추상화 메서드 시그니처 — 로컬(이메일+JWT, VAPID) 구현 + P6 어댑터(Google OAuth, FCM) 교체 계약
related: [batdi-architecture, batdi-development-plan, batdi-platform-ops, batdi-db-schema]
updated: 2026-06-12
---

# 밧디 Auth · Push Provider 인터페이스

> **목적**: 인증/푸시를 외부 벤더에 직접 결합하지 않고 인터페이스로 추상화한다.
> 로컬(P0~P5)은 이메일+JWT / VAPID Web Push로 구현하고, P6에서 같은 인터페이스를
> 만족하는 Google OAuth / FCM 어댑터로 **호출부 무변경** 교체한다.
> 근거: [architecture §13](../design/batdi-architecture.md) (인증/푸시 행),
> [development-plan](../impl/batdi-development-plan.md) (1.2 AuthModule, 11.1 PushProvider, 14.5/14.6 P6 어댑터 교체),
> [platform-ops §12·§14](../design/batdi-platform-ops.md), [db-schema](batdi-db-schema.md) (`users.auth_provider`/`auth_id`).

이 문서는 **시그니처 계약**만 정의한다. 구현 코드는 없다(빌드/테스트 대상 아님).

---

## 1. 공유 타입

```typescript
// ── 인증 ─────────────────────────────────────────────

/** 외부/로컬 인증 주체를 표준화한 식별자.
 *  db-schema `users.auth_provider`('email'|'google') + `auth_id`(VARCHAR(255))에 1:1 매핑된다. */
export interface AuthIdentity {
  provider: AuthProviderId;   // 'local' → users.auth_provider='email', 'google' → 'google'
  authId: string;             // → users.auth_id. 로컬=이메일 정규화 키, Google=sub 클레임
  email?: string;             // → users.email (검증된 경우만)
  displayName?: string;       // → users.display_name 초기값 후보
}

/** 세션 토큰 쌍. 로컬은 JWT(access)+refresh, P6 OAuth는 어댑터가 자체 토큰을 동일 형태로 래핑. */
export interface TokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;          // epoch ms (access 만료)
}

export type AuthProviderId = 'local' | 'google';

// ── 푸시 ─────────────────────────────────────────────

/** Web Push 구독 정보. 로컬은 PushSubscription(JSON), FCM은 registration token을 endpoint로 정규화. */
export interface PushSubscription {
  endpoint: string;           // Web Push endpoint URL 또는 FCM 토큰
  keys?: { p256dh: string; auth: string };  // VAPID Web Push 전용. FCM 어댑터는 미사용
  expirationTime?: number | null;
}

/** 단건 발송 결과. */
export interface DeliveryResult {
  ok: boolean;
  endpoint: string;
  statusCode?: number;        // 410/404 → 만료된 구독, 호출부가 unsubscribe 수행
  expired?: boolean;          // true면 해당 구독 폐기 대상
  error?: string;
}

export type PushProviderId = 'webpush' | 'fcm';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;  // 딥링크 등. 트리거 종류는 platform-ops §14 참조
}
```

> **PII 주의**: `PushSubscription.endpoint`/`keys`와 `AuthIdentity.email`/`authId`는 PII다.
> 사용자 탈퇴 시 db-schema LAW-2 ON DELETE 정책(`users` 연관 CASCADE)에 따라 함께 파기한다
> (푸시 구독 저장 테이블 신설 시 `users(id) ON DELETE CASCADE` 적용 — db-schema 후속 반영 대상).

---

## 2. AuthProvider

```typescript
export interface AuthProvider {
  /** 어댑터 식별. 'local'=이메일+JWT, 'google'=P6 OAuth. → users.auth_provider 매핑. */
  getProviderId(): AuthProviderId;

  /** 토큰(로컬 JWT access / P6 OAuth id_token·code)을 검증해 표준 신원으로 변환.
   *  @param token 클라이언트가 제시한 인증 토큰
   *  @returns 검증된 AuthIdentity
   *  @throws InvalidTokenError(만료/서명불일치), ProviderUnavailableError(P6 OAuth 검증 엔드포인트 장애) */
  verify(token: string): Promise<AuthIdentity>;

  /** 로그인 성공한 사용자에게 세션 토큰을 발급.
   *  @param user 발급 대상 (id·email·providerId)
   *  @returns access(+refresh) 토큰 쌍
   *  @throws TokenIssueError */
  issue(user: { id: string; email?: string; providerId: AuthProviderId }): Promise<TokenPair>;

  /** P6 OAuth 도입 시: 외부 신원을 기존 로컬(이메일) 유저에 병합.
   *  db-schema `users.auth_provider`/`auth_id`를 외부 신원으로 갱신·연결한다.
   *  로컬 단독 운영 시점에는 no-op 또는 미구현 가능(로컬 어댑터는 throw NotSupported 허용).
   *  @param existingUserId 이미 존재하는 users.id (이메일 가입분)
   *  @param externalIdentity Google 등 외부 검증 신원
   *  @returns 병합 후 최종 AuthIdentity (provider/authId 갱신 반영)
   *  @throws IdentityConflictError(다른 유저에 이미 연결된 authId), MergeNotSupportedError(로컬 어댑터) */
  mergeIdentity(existingUserId: string, externalIdentity: AuthIdentity): Promise<AuthIdentity>;
}
```

| 구현 | providerId | verify | issue | mergeIdentity |
|------|-----------|--------|-------|----------------|
| `LocalAuthProvider` (P1, 이메일+JWT) | `'local'` | JWT 서명·만료 검증 | JWT access(+refresh) 발급 | `MergeNotSupportedError` (no-op) |
| `GoogleOAuthProvider` (P6 어댑터) | `'google'` | Google id_token/sub 검증 | 세션 토큰 래핑 발급 | `users.auth_id`에 sub 연결·병합 |

두 구현은 **동일한 `AuthProvider` 인터페이스**를 만족한다 → 호출부(AuthModule·가드)는 교체를 인지하지 못한다.

---

## 3. PushProvider

```typescript
export interface PushProvider {
  /** 어댑터 식별. 'webpush'=로컬 VAPID, 'fcm'=P6. */
  getProviderId(): PushProviderId;

  /** 사용자 디바이스 구독 등록(idempotent — 동일 endpoint 재등록 시 갱신).
   *  @param userId users.id
   *  @param subscription 클라이언트 PushSubscription (FCM 어댑터는 token→endpoint 정규화)
   *  @throws InvalidSubscriptionError */
  subscribe(userId: string, subscription: PushSubscription): Promise<void>;

  /** 단건 푸시 발송. 트리거 로직(경기 30분 전/역전·동점/관심선수/레벨업)은 호출부 소유.
   *  @returns DeliveryResult — expired=true면 호출부가 unsubscribe 수행
   *  @throws PushSendError(재시도 가능한 일시 오류) */
  send(userId: string, payload: PushPayload): Promise<DeliveryResult>;

  /** 만료/철회된 구독 제거.
   *  @param userId users.id
   *  @param endpoint 폐기할 구독 endpoint */
  unsubscribe(userId: string, endpoint: string): Promise<void>;
}
```

| 구현 | providerId | 전송 매체 |
|------|-----------|-----------|
| `WebPushProvider` (P4 W11, VAPID) | `'webpush'` | Web Push API + VAPID, p256dh/auth 키 사용 |
| `FcmPushProvider` (P6 어댑터) | `'fcm'` | Firebase Cloud Messaging, registration token |

---

## 4. P6 교체 계약 (인터페이스 안정성)

1. **호출부 무변경 보장**: AuthModule·PushModule·트리거 로직은 `AuthProvider`/`PushProvider`
   인터페이스 타입에만 의존한다. 구체 클래스(`LocalAuthProvider`→`GoogleOAuthProvider`,
   `WebPushProvider`→`FcmPushProvider`) 교체로 호출 코드를 수정하지 않는다.
2. **환경변수 선택**: 런타임에 `AUTH_PROVIDER`(`local`|`google`),
   `PUSH_PROVIDER`(`webpush`|`fcm`) 환경변수로 DI 바인딩을 선택한다(NestJS provider 토큰).
3. **신원 병합 경로 사전 확보**: P6 OAuth 도입 시 이메일 가입 유저는 `mergeIdentity`로
   `users.auth_provider`/`auth_id`를 Google 신원으로 연결한다(development-plan 14.5).
4. **계약 안정성 = 시그니처 불변**: 메서드 시그니처·공유 타입 변경은 본 문서 `version` bump를
   동반하며, related 문서(architecture·db-schema)의 영향도를 함께 검토한다.

---

*최종 업데이트: 2026-06-12*
