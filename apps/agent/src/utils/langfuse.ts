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
