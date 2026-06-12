import Ajv, { type ErrorObject } from 'ajv';
import type { A2UIEnvelope } from '@batdi/types';
import { componentNodeSchema, envelopeSchema } from './schema';

export { componentNodeSchema, envelopeSchema } from './schema';

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(componentNodeSchema, 'component-node.json');
const validateFn = ajv.compile(envelopeSchema);

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

/**
 * A2UI Envelope 구조 검증 (P0 stub)
 *
 * ⚠️ 깊이 제한(4단계, 30노드)·팔레트 화이트리스트는 추후 UIValidator 에서 보강.
 *    현재는 JSON Schema 구조 검증만 수행.
 */
export function validateEnvelope(value: unknown): ValidationResult {
  const valid = validateFn(value);
  return {
    valid: Boolean(valid),
    errors: validateFn.errors ?? [],
  };
}

/** 타입 가드 — 검증 통과 시 A2UIEnvelope 로 좁힘 */
export function isA2UIEnvelope(value: unknown): value is A2UIEnvelope {
  return validateEnvelope(value).valid;
}
