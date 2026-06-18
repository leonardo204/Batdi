/**
 * Identity/thread 해석 헬퍼 (P3-W9 9.3 신원 배선)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.5
 *
 * thread_id 도달 경로(조사 결과): LangGraph 런타임이 run 의 thread_id 를
 *   `config.configurable.thread_id` 로 노출한다(표준 동작). 일부 어댑터/버전은 camelCase
 *   `threadId` 로 노출할 수 있어 방어적으로 둘 다 확인한다.
 */
import type { RunnableConfig } from '@langchain/core/runnables';

/**
 * RunnableConfig 에서 thread_id 를 방어적으로 추출한다.
 *   우선순위: config.configurable.thread_id → config.configurable.threadId.
 * 둘 다 없거나 빈 문자열이면 undefined(영속화 skip).
 */
export function resolveThreadId(
  config: RunnableConfig | undefined,
): string | undefined {
  const configurable = config?.configurable as
    | { thread_id?: unknown; threadId?: unknown }
    | undefined;

  const snake =
    typeof configurable?.thread_id === 'string' &&
    configurable.thread_id.trim() !== ''
      ? configurable.thread_id
      : undefined;
  if (snake !== undefined) {
    return snake;
  }

  const camel =
    typeof configurable?.threadId === 'string' &&
    configurable.threadId.trim() !== ''
      ? configurable.threadId
      : undefined;
  return camel;
}
