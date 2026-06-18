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
import {
  PLAYER_STAT_COMPACT_COMPONENTS,
  PLAYER_STAT_COMPACT_BIND_SCHEMA,
  PLAYER_STAT_COMPACT_TEMPLATE_ID,
} from './player_stat_compact';
import {
  PLAYER_CHIP_COMPONENTS,
  PLAYER_CHIP_BIND_SCHEMA,
  PLAYER_CHIP_WIDGET_ID,
} from './player_chip_widget';
import {
  GAME_SCHEDULE_COMPONENTS,
  GAME_SCHEDULE_BIND_SCHEMA,
  GAME_SCHEDULE_WIDGET_ID,
} from './game_schedule_widget';
import {
  HEAD_TO_HEAD_COMPONENTS,
  HEAD_TO_HEAD_BIND_SCHEMA,
  HEAD_TO_HEAD_WIDGET_ID,
} from './head_to_head_widget';
import {
  TREND_SPARKLINE_COMPONENTS,
  TREND_SPARKLINE_BIND_SCHEMA,
  TREND_SPARKLINE_WIDGET_ID,
} from './trend_sparkline_widget';
import {
  LEVEL_PROGRESS_COMPONENTS,
  LEVEL_PROGRESS_BIND_SCHEMA,
  LEVEL_PROGRESS_WIDGET_ID,
} from './level_progress_widget';

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

/** stats 순위 템플릿 (standings_compact). statType 미지정/standings 의 기본. */
const STANDINGS_COMPACT_TEMPLATE: L1Template = {
  templateId: STANDINGS_COMPACT_TEMPLATE_ID,
  components: STANDINGS_COMPACT_COMPONENTS,
  bindSchema: STANDINGS_COMPACT_BIND_SCHEMA,
};

/** stats 선수 리더보드 템플릿 (player_stat_compact). statType='player' 전용. */
const PLAYER_STAT_COMPACT_TEMPLATE: L1Template = {
  templateId: PLAYER_STAT_COMPACT_TEMPLATE_ID,
  components: PLAYER_STAT_COMPACT_COMPONENTS,
  bindSchema: PLAYER_STAT_COMPACT_BIND_SCHEMA,
};

/**
 * stats intent 의 statType 기반 템플릿 선택(순수 함수, P3-W7 7.3b).
 *
 *  - statType==='player' → player_stat_compact (팀 선수 리더보드)
 *  - else(standings/undefined) → standings_compact (팀 순위)
 *
 * 두 템플릿 모두 동일 bind 경로(rows.N.line)라 EmitA2UI 의 data={rows} 주입 로직을
 * 그대로 공유한다. TEMPLATE_BY_INTENT.stats 는 standings 매핑을 유지(하위호환).
 */
export function resolveStatsTemplate(
  statType: 'standings' | 'player' | undefined,
): L1Template {
  return statType === 'player'
    ? PLAYER_STAT_COMPACT_TEMPLATE
    : STANDINGS_COMPACT_TEMPLATE;
}

/**
 * A2UI 위젯 (P3-W8 8.3, ADR-046) — 기본 카탈로그 조합 빌딩블록.
 *
 * L3 UIComposer(ADR-040) 동적 조합·8.4 템플릿 풀세트의 빌딩블록으로 widgetId 로 조회한다.
 * intent 직접 매핑은 8.4/P4 범위(TEMPLATE_BY_INTENT 는 회귀 방지 차 미수정).
 */
export interface A2UIWidget {
  /** 위젯 식별자 */
  widgetId: string;
  /** authoring 컴포넌트 트리 (`{{bind:"..."}}` 표기 포함) */
  components: Array<Record<string, unknown>>;
  /** bind 점경로 목록 */
  bindSchema: ReadonlyArray<string>;
}

/** widgetId → A2UI 위젯 (8.3 신규 5종) */
export const WIDGET_REGISTRY: Record<string, A2UIWidget> = {
  [PLAYER_CHIP_WIDGET_ID]: {
    widgetId: PLAYER_CHIP_WIDGET_ID,
    components: PLAYER_CHIP_COMPONENTS,
    bindSchema: PLAYER_CHIP_BIND_SCHEMA,
  },
  [GAME_SCHEDULE_WIDGET_ID]: {
    widgetId: GAME_SCHEDULE_WIDGET_ID,
    components: GAME_SCHEDULE_COMPONENTS,
    bindSchema: GAME_SCHEDULE_BIND_SCHEMA,
  },
  [HEAD_TO_HEAD_WIDGET_ID]: {
    widgetId: HEAD_TO_HEAD_WIDGET_ID,
    components: HEAD_TO_HEAD_COMPONENTS,
    bindSchema: HEAD_TO_HEAD_BIND_SCHEMA,
  },
  [TREND_SPARKLINE_WIDGET_ID]: {
    widgetId: TREND_SPARKLINE_WIDGET_ID,
    components: TREND_SPARKLINE_COMPONENTS,
    bindSchema: TREND_SPARKLINE_BIND_SCHEMA,
  },
  [LEVEL_PROGRESS_WIDGET_ID]: {
    widgetId: LEVEL_PROGRESS_WIDGET_ID,
    components: LEVEL_PROGRESS_COMPONENTS,
    bindSchema: LEVEL_PROGRESS_BIND_SCHEMA,
  },
};

/** widgetId 로 A2UI 위젯 조회 (미등록 → undefined) */
export function resolveWidget(widgetId: string): A2UIWidget | undefined {
  return WIDGET_REGISTRY[widgetId];
}
