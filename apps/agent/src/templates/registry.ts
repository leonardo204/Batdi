/**
 * L1 템플릿 레지스트리 — intent → template 매핑
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §4 (L1 Template)
 *
 * 구현된 intent: score → score_compact, stats → standings_compact.
 * 그 외 intent는 템플릿 미구현이며 UIComposer/EmitA2UI가 텍스트 카드 폴백 또는
 * 텍스트-only로 처리한다.
 */
import type { Intent } from '@batdi/types';
import type { ScoreData } from '../databind/compile';
import {
  SCORE_COMPACT_COMPONENTS,
  SCORE_COMPACT_BIND_SCHEMA,
  SCORE_COMPACT_TEMPLATE_ID,
} from './score_compact';
import {
  SCORE_DEFAULT_COMPONENTS,
  SCORE_DEFAULT_BIND_SCHEMA,
  SCORE_DEFAULT_TEMPLATE_ID,
} from './score_default';
import {
  SCORE_EMPHASIZED_COMPONENTS,
  SCORE_EMPHASIZED_BIND_SCHEMA,
  SCORE_EMPHASIZED_TEMPLATE_ID,
} from './score_emphasized';
import {
  STANDINGS_COMPACT_COMPONENTS,
  STANDINGS_COMPACT_BIND_SCHEMA,
  STANDINGS_COMPACT_TEMPLATE_ID,
} from './standings_compact';

export interface L1Template {
  templateId: string;
  /** authoring 컴포넌트 트리 (`{{bind:"..."}}` 표기 포함) */
  components: Array<Record<string, unknown>>;
  /** bind 점경로 목록 */
  bindSchema: ReadonlyArray<string>;
}

/** intent → L1 템플릿 (score, stats) */
const TEMPLATE_BY_INTENT: Partial<Record<Intent, L1Template>> = {
  score: {
    templateId: SCORE_COMPACT_TEMPLATE_ID,
    components: SCORE_COMPACT_COMPONENTS,
    bindSchema: SCORE_COMPACT_BIND_SCHEMA,
  },
  stats: {
    templateId: STANDINGS_COMPACT_TEMPLATE_ID,
    components: STANDINGS_COMPACT_COMPONENTS,
    bindSchema: STANDINGS_COMPACT_BIND_SCHEMA,
  },
};

/** intent에 매핑된 L1 템플릿 반환 (없으면 undefined → 텍스트 폴백) */
export function resolveTemplate(intent: Intent): L1Template | undefined {
  return TEMPLATE_BY_INTENT[intent];
}

/** score 템플릿 3종 (gameStatus 기반 선택용). 모두 동일 bind 경로/데이터 계약. */
const SCORE_COMPACT_TEMPLATE: L1Template = {
  templateId: SCORE_COMPACT_TEMPLATE_ID,
  components: SCORE_COMPACT_COMPONENTS,
  bindSchema: SCORE_COMPACT_BIND_SCHEMA,
};

const SCORE_DEFAULT_TEMPLATE: L1Template = {
  templateId: SCORE_DEFAULT_TEMPLATE_ID,
  components: SCORE_DEFAULT_COMPONENTS,
  bindSchema: SCORE_DEFAULT_BIND_SCHEMA,
};

const SCORE_EMPHASIZED_TEMPLATE: L1Template = {
  templateId: SCORE_EMPHASIZED_TEMPLATE_ID,
  components: SCORE_EMPHASIZED_COMPONENTS,
  bindSchema: SCORE_EMPHASIZED_BIND_SCHEMA,
};

/**
 * score intent 의 gameStatus 기반 템플릿 선택(순수 함수, P2-W5.4).
 *
 *  - status==='FINISHED'  → score_emphasized (최종 결과 대형 강조)
 *  - status==='PLAYING'   → score_default    (진행 중, 표준 강조)
 *  - 그 외(SCHEDULED/CANCELLED/UNKNOWN/null/undefined) → score_compact (최소)
 *
 * 세 템플릿은 동일 bind 경로(home/away/inning + /reaction 슬롯)라 EmitA2UI 의
 * data=scoreData 주입 로직을 그대로 공유한다. TEMPLATE_BY_INTENT.score 매핑은
 * 폴백/하위호환으로 유지(resolveTemplate 호출부는 기본 compact 를 받는다).
 *
 * @param scoreData ScoreGraph 실데이터(null/undefined 면 최소 카드 선택).
 */
export function resolveScoreTemplate(
  scoreData: ScoreData | null | undefined,
): L1Template {
  switch (scoreData?.status) {
    case 'FINISHED':
      return SCORE_EMPHASIZED_TEMPLATE;
    case 'PLAYING':
      return SCORE_DEFAULT_TEMPLATE;
    default:
      return SCORE_COMPACT_TEMPLATE;
  }
}
