/**
 * A2UI JSON Schema (초안)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (§5 팔레트 계약, ADR-017)
 * 깊이 제한(4단계, 30노드)·팔레트 화이트리스트는 추후 강화. P0 는 구조 검증 골격.
 */
import type { JSONSchemaType } from 'ajv';

/** A2UI 컴포넌트 노드 — 재귀 구조 (깊이 제한은 별도 검증) */
export const componentNodeSchema = {
  $id: 'https://batdi.kr/schemas/a2ui/component-node.json',
  type: 'object',
  required: ['type'],
  additionalProperties: false,
  properties: {
    type: { type: 'string', minLength: 1 },
    id: { type: 'string', nullable: true },
    props: { type: 'object', nullable: true, additionalProperties: true },
    bindings: {
      type: 'object',
      nullable: true,
      additionalProperties: { type: 'string' },
    },
    children: {
      type: 'array',
      nullable: true,
      items: { $ref: 'component-node.json' },
    },
  },
} as const;

/** A2UI Envelope 스키마 */
export const envelopeSchema = {
  $id: 'https://batdi.kr/schemas/a2ui/envelope.json',
  type: 'object',
  required: ['version', 'surfaceUpdate', 'dataModelUpdate', 'beginRendering'],
  additionalProperties: false,
  properties: {
    version: { type: 'string', minLength: 1 },
    surfaceUpdate: {
      type: 'object',
      required: ['kind', 'surfaceId', 'root'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'surfaceUpdate' },
        surfaceId: { type: 'string', minLength: 1 },
        root: { $ref: 'component-node.json' },
      },
    },
    dataModelUpdate: {
      type: 'object',
      required: ['kind', 'surfaceId', 'data'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'dataModelUpdate' },
        surfaceId: { type: 'string', minLength: 1 },
        data: { type: 'object', additionalProperties: true },
      },
    },
    beginRendering: {
      type: 'object',
      required: ['kind', 'surfaceId'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string', const: 'beginRendering' },
        surfaceId: { type: 'string', minLength: 1 },
      },
    },
  },
  // ajv 의 JSONSchemaType 정밀 타입 추론은 재귀 $ref 와 충돌하므로
  // 런타임 검증용으로만 사용 (타입은 @batdi/types 의 A2UIEnvelope 사용).
} as unknown as JSONSchemaType<unknown>;
