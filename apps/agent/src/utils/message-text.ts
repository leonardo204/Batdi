/**
 * BaseMessage.content(string | 복합 블록)을 안전하게 평문으로 환원한다.
 */
import type { BaseMessage } from '@langchain/core/messages';

export function messageText(message: BaseMessage | undefined): string {
  if (message === undefined) {
    return '';
  }
  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }
  // 복합 콘텐츠 블록 배열 → text 블록만 이어붙임
  return content
    .map((block) => {
      if (typeof block === 'string') {
        return block;
      }
      if (block != null && typeof block === 'object' && 'text' in block) {
        const text = (block as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join(' ')
    .trim();
}
