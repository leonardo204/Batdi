/**
 * Langfuse 트레이싱 유틸 (P1-W1 1.5)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (관측), development-plan 1.5
 *
 * langfuse-langchain 의 CallbackHandler 를 LangChain LLM 호출(model.invoke)의
 * `callbacks` 로 주입하면 generation(prompt/completion/토큰/비용/latency)이 자동으로
 * Langfuse 에 기록된다. 키(LANGFUSE_PUBLIC_KEY/SECRET_KEY)가 없으면 트레이싱을
 * 비활성(no-op)해 키 미설정 환경(테스트·CI)에서도 그래프가 정상 동작한다.
 *
 * 키는 루트 .env(langgraph.json `env:"../../.env"`)에서 로드되며, Langfuse 셀프호스팅
 * 컨테이너의 headless init(LANGFUSE_INIT_*)으로 시드된 값과 일치한다.
 */
import { CallbackHandler } from 'langfuse-langchain';

let cached: CallbackHandler | null = null;
let resolved = false;

/**
 * 프로세스 단일 CallbackHandler 를 반환한다(없으면 1회 생성). 키 미설정 시 undefined.
 */
export function getLangfuseHandler(): CallbackHandler | undefined {
  if (resolved) {
    return cached ?? undefined;
  }
  resolved = true;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_HOST;

  if (
    publicKey === undefined ||
    publicKey.trim() === '' ||
    secretKey === undefined ||
    secretKey.trim() === ''
  ) {
    // 키 없음 → 트레이싱 비활성(no-op). 그래프 실행에는 영향 없음.
    return undefined;
  }

  cached = new CallbackHandler({ publicKey, secretKey, baseUrl });
  return cached;
}

/** llm_ui_invalid 이벤트 페이로드 (palette-schema §5.4(2)) */
export interface UiInvalidEvent {
  /** 발생 단계 (예: 'score', 'chat', 'cache-l0') */
  stage: string;
  /** validateBatdiA2UI 위반 코드 목록 (머신리더블) */
  errorCodes: string[];
  /** surface id (디버그용) */
  surfaceId?: string;
}

/**
 * A2UI 검증 실패(깊이/노드/카탈로그/바인딩) → L1 폴백 시 `llm_ui_invalid` 이벤트를
 * Langfuse 에 비동기 기록한다(palette-schema §5.4(2)/ADR-019, 개발자 프롬프트 튜닝용).
 *
 * best-effort: 키 미설정(handler undefined)·SDK 형상 차이·전송 실패는 모두 삼킨다
 *   (관측 실패가 그래프 실행/레이턴시를 막지 않는다 — UIValidator 재호출 금지 원칙과 일관).
 * CallbackHandler 가 노출하는 코어 `langfuse` 클라이언트로 trace+event 를 1건 남긴다.
 */
export function logUiInvalidEvent(event: UiInvalidEvent): void {
  const handler = getLangfuseHandler();
  if (handler === undefined) return;
  try {
    const client = (handler as unknown as {
      langfuse?: {
        trace: (b: Record<string, unknown>) => {
          event: (e: Record<string, unknown>) => unknown;
        };
      };
    }).langfuse;
    if (client === undefined) return;
    client
      .trace({
        name: 'llm_ui_invalid',
        metadata: { stage: event.stage, surfaceId: event.surfaceId },
      })
      .event({
        name: 'llm_ui_invalid',
        level: 'WARNING',
        metadata: { stage: event.stage, errorCodes: event.errorCodes },
      });
  } catch {
    // best-effort — 관측 실패는 무시
  }
}

/** 응답 레벨 (캐시/렌더 경로). 분포 관측용. */
export type ResponseLevel = 'L0' | 'L1' | 'L2' | 'chat' | 'blocked';

/**
 * 응답의 캐시/렌더 레벨을 Langfuse 에 기록한다(P2 완료조건: "L0/L1/L2 분포 확인 가능").
 *
 *  - L0: 완성 envelope 캐시 HIT(LLM 0)
 *  - L1: L1 템플릿 렌더(LLM 0, 리액션 없음 — 예: stats 순위 카드, score SCHEDULED)
 *  - L2: 템플릿 + L2 감정 리액션(LLM 1 — 예: score FINISHED 카드)
 *  - chat: 템플릿 없는 잡담/밈 경로, blocked: 가드레일 차단
 *
 * best-effort(키 없음/오류 삼킴). 코어 langfuse 클라이언트로 trace 1건(name='response_level',
 * metadata.level/intent). Langfuse 에서 name·level 로 그룹핑하면 분포가 보인다.
 * LLM 호출이 있는 L2 는 별도 generation trace 도 남으나, 본 이벤트로 L0/L1 무LLM 경로까지 포괄한다.
 */
export function logResponseLevel(level: ResponseLevel, intent: string): void {
  const handler = getLangfuseHandler();
  if (handler === undefined) return;
  try {
    const client = (handler as unknown as {
      langfuse?: { trace: (b: Record<string, unknown>) => unknown };
    }).langfuse;
    if (client === undefined) return;
    client.trace({
      name: 'response_level',
      metadata: { level, intent },
      tags: [`level:${level}`, `intent:${intent}`],
    });
  } catch {
    // best-effort — 관측 실패는 무시
  }
}
