/**
 * L1 템플릿 레지스트리 — intent → template 매핑
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §4 (L1 Template)
 *
 * W2 범위: score → score_compact 1종만 구현. 그 외 intent는 템플릿 미구현이며
 * UIComposer/EmitA2UI가 텍스트 카드 폴백 또는 텍스트-only로 처리한다.
 */
import type { Intent } from '@batdi/types';
import {
  SCORE_COMPACT_COMPONENTS,
  SCORE_COMPACT_BIND_SCHEMA,
  SCORE_COMPACT_TEMPLATE_ID,
} from './score_compact';

export interface L1Template {
  templateId: string;
  /** authoring 컴포넌트 트리 (`{{bind:"..."}}` 표기 포함) */
  components: Array<Record<string, unknown>>;
  /** bind 점경로 목록 */
  bindSchema: ReadonlyArray<string>;
}

/** intent → L1 템플릿 (W2: score만) */
const TEMPLATE_BY_INTENT: Partial<Record<Intent, L1Template>> = {
  score: {
    templateId: SCORE_COMPACT_TEMPLATE_ID,
    components: SCORE_COMPACT_COMPONENTS,
    bindSchema: SCORE_COMPACT_BIND_SCHEMA,
  },
};

/** intent에 매핑된 L1 템플릿 반환 (없으면 undefined → 텍스트 폴백) */
export function resolveTemplate(intent: Intent): L1Template | undefined {
  return TEMPLATE_BY_INTENT[intent];
}
