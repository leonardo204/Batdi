/**
 * 밧디 A2UI 기본 카탈로그 (5종 화이트리스트)
 *
 * SSOT: Ref-docs/specs/interface/batdi-a2ui-palette-schema.md,
 *       Ref-docs/specs/design/batdi-architecture.md §5 (팔레트 계약)
 *
 * required props는 추측이 아니라 `@a2ui/web_core` v0.9 basic_catalog의
 * 실제 zod 스키마(`basic_components.js`)를 확인하여 도출했다:
 *   - Text:      `text` (required), variant (optional)
 *   - Row:       `children` (required), justify/align (optional)
 *   - Column:    `children` (required), justify/align (optional)
 *   - Button:    `child` (required), variant/action/checks (optional)
 *   - TextField: `label` (required), value/variant/… (optional)
 *
 * 이 5종만으로 L1 결정론 템플릿을 구성한다(도메인 widget 금지 — 렌더 실패 리스크).
 */
import type { A2UIValidationCatalog } from '@ag-ui/a2ui-toolkit';

/**
 * `validateA2UIComponents`에 주입할 inline 카탈로그.
 *
 * components[name].required 만으로 missing_required_prop / unknown_component 검사를
 * 수행한다(toolkit validator는 required 목록만 본다 — properties는 참고용).
 */
export const BATDI_BASIC_CATALOG: A2UIValidationCatalog = {
  components: {
    Text: {
      required: ['text'],
      properties: {
        text: { type: 'string' },
        variant: {
          type: 'string',
          enum: ['h1', 'h2', 'h3', 'h4', 'h5', 'caption', 'body'],
        },
      },
    },
    Row: {
      required: ['children'],
      properties: {
        children: { type: 'array' },
        justify: { type: 'string' },
        align: { type: 'string' },
      },
    },
    Column: {
      required: ['children'],
      properties: {
        children: { type: 'array' },
        justify: { type: 'string' },
        align: { type: 'string' },
      },
    },
    Button: {
      required: ['child'],
      properties: {
        child: { type: 'string' },
        variant: { type: 'string' },
      },
    },
    TextField: {
      required: ['label'],
      properties: {
        label: { type: 'string' },
        value: { type: 'string' },
      },
    },
  },
};

/** 화이트리스트 컴포넌트명 목록 (검증·문서용) */
export const BATDI_CATALOG_COMPONENT_NAMES = Object.keys(
  BATDI_BASIC_CATALOG.components,
) as ReadonlyArray<string>;
