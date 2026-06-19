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
import {
  STANDINGS_EMPHASIZED_COMPONENTS,
  STANDINGS_EMPHASIZED_BIND_SCHEMA,
  STANDINGS_EMPHASIZED_TEMPLATE_ID,
} from './standings_emphasized';
import {
  PLAYER_STAT_EMPHASIZED_COMPONENTS,
  PLAYER_STAT_EMPHASIZED_BIND_SCHEMA,
  PLAYER_STAT_EMPHASIZED_TEMPLATE_ID,
} from './player_stat_emphasized';
import {
  NEWS_COMPACT_COMPONENTS,
  NEWS_COMPACT_BIND_SCHEMA,
  NEWS_COMPACT_TEMPLATE_ID,
} from './news_compact';
import {
  SCHEDULE_COMPACT_COMPONENTS,
  SCHEDULE_COMPACT_BIND_SCHEMA,
  SCHEDULE_COMPACT_TEMPLATE_ID,
} from './schedule_compact';
import {
  LINEUP_COMPACT_COMPONENTS,
  LINEUP_COMPACT_BIND_SCHEMA,
  LINEUP_COMPACT_TEMPLATE_ID,
} from './lineup_compact';
import {
  MEME_CARD_COMPONENTS,
  MEME_CARD_BIND_SCHEMA,
  MEME_CARD_TEMPLATE_ID,
} from './meme_card';
import {
  HEAD_TO_HEAD_COMPACT_COMPONENTS,
  HEAD_TO_HEAD_COMPACT_BIND_SCHEMA,
  HEAD_TO_HEAD_COMPACT_TEMPLATE_ID,
} from './h2h_compact';

export interface L1Template {
  templateId: string;
  /** authoring 컴포넌트 트리 (`{{bind:"..."}}` 표기 포함) */
  components: Array<Record<string, unknown>>;
  /** bind 점경로 목록 */
  bindSchema: ReadonlyArray<string>;
}

/**
 * intent → L1 템플릿 (score, stats, news).
 *
 * ⚠️ P3-W7 7.5 ADR-048: news 는 NewsGraph(services/news-graph.ts·fetchNewsData) 서브그래프
 *    도입으로 **배선 해제** — news intent → news_compact. ADR-047 ④ 의 미배선 정책은 news
 *    한정 해제(서브그래프가 cache_news 실데이터를 채우므로 빈 바인딩 폴백 회귀 없음).
 * ⚠️ ADR-052: schedule/lineup 도 ScheduleGraph(fetchScheduleData)·LineupGraph(fetchLineupData)
 *    서브그래프 도입으로 **배선 해제** — schedule → schedule_compact, lineup → lineup_compact.
 *    데이터 null 인 경로는 EmitA2UI 가 팀 톤 폴백 텍스트 카드로 처리(빈 바인딩 폴백 회귀 없음).
 */
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
  news: {
    templateId: NEWS_COMPACT_TEMPLATE_ID,
    components: NEWS_COMPACT_COMPONENTS,
    bindSchema: NEWS_COMPACT_BIND_SCHEMA,
  },
  schedule: {
    templateId: SCHEDULE_COMPACT_TEMPLATE_ID,
    components: SCHEDULE_COMPACT_COMPONENTS,
    bindSchema: SCHEDULE_COMPACT_BIND_SCHEMA,
  },
  lineup: {
    templateId: LINEUP_COMPACT_TEMPLATE_ID,
    components: LINEUP_COMPACT_COMPONENTS,
    bindSchema: LINEUP_COMPACT_BIND_SCHEMA,
  },
  h2h: {
    templateId: HEAD_TO_HEAD_COMPACT_TEMPLATE_ID,
    components: HEAD_TO_HEAD_COMPACT_COMPONENTS,
    bindSchema: HEAD_TO_HEAD_COMPACT_BIND_SCHEMA,
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

/** stats 순위 강조 템플릿 (standings_emphasized). variant='emphasized' 전용(8.4 ADR-047). */
const STANDINGS_EMPHASIZED_TEMPLATE: L1Template = {
  templateId: STANDINGS_EMPHASIZED_TEMPLATE_ID,
  components: STANDINGS_EMPHASIZED_COMPONENTS,
  bindSchema: STANDINGS_EMPHASIZED_BIND_SCHEMA,
};

/** stats 선수 리더보드 강조 템플릿 (player_stat_emphasized). variant='emphasized' 전용. */
const PLAYER_STAT_EMPHASIZED_TEMPLATE: L1Template = {
  templateId: PLAYER_STAT_EMPHASIZED_TEMPLATE_ID,
  components: PLAYER_STAT_EMPHASIZED_COMPONENTS,
  bindSchema: PLAYER_STAT_EMPHASIZED_BIND_SCHEMA,
};

/**
 * stats intent 의 statType 기반 템플릿 선택(순수 함수, P3-W7 7.3b · P3-W8 8.4 ADR-047).
 *
 *  - statType==='player' → player_stat_* (팀 선수 리더보드)
 *  - else(standings/undefined) → standings_* (팀 순위)
 *  - variant==='emphasized' → 상위권 강조 레이아웃(_emphasized), 그 외 → 기본(_compact)
 *
 * 모든 템플릿이 동일 bind 경로(rows.N.line)라 EmitA2UI 의 data={rows} 주입 로직을 그대로
 * 공유한다. **variant 인자는 additive — 미지정/'compact' 면 기존 동작 불변(회귀 0)**.
 * emit-a2ui 호출부(`resolveStatsTemplate(state.statType)`)는 기본 compact 를 받는다.
 * TEMPLATE_BY_INTENT.stats 는 standings_compact 매핑을 유지(하위호환).
 */
export function resolveStatsTemplate(
  statType: 'standings' | 'player' | undefined,
  variant: 'compact' | 'emphasized' = 'compact',
): L1Template {
  if (statType === 'player') {
    return variant === 'emphasized'
      ? PLAYER_STAT_EMPHASIZED_TEMPLATE
      : PLAYER_STAT_COMPACT_TEMPLATE;
  }
  return variant === 'emphasized'
    ? STANDINGS_EMPHASIZED_TEMPLATE
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

/**
 * a2ui_templates 카탈로그 한 행(P3-W8 8.4, ADR-047).
 *
 * **런타임 SSOT** 는 in-memory registry(L1 0-LLM·~500ms — DB 왕복 안 함). DB `a2ui_templates`
 * 테이블은 본 카탈로그에서 **파생 시드**한 catalog-of-record(드리프트 0). 런타임 DB 로드는
 * 의도적 보류. seed-a2ui-templates 스크립트가 TEMPLATE_CATALOG 를 upsert(by template_id)한다.
 */
export interface A2UITemplateRow {
  /** 템플릿 식별자 (DB template_id PK) */
  templateId: string;
  /** DB intent 컬럼(VARCHAR) — 자연 intent 매핑. 위젯도 자연 intent 로 분류. */
  intent: string;
  /** authoring 컴포넌트 트리(`{{bind:"..."}}` 플레이스홀더 포함 — §4.3 component_tree) */
  componentTree: Array<Record<string, unknown>>;
  /** bind 점경로 목록 */
  bindSchema: ReadonlyArray<string>;
  /** 같은 intent+role 묶음의 variant 라벨. 단일은 null 또는 ['default']. */
  variants: string[] | null;
}

/**
 * 전 템플릿 16종 단일 카탈로그(SSOT). 기존 10종 + 신규 6종.
 *  - score(3): score_compact/default/emphasized — gameStatus 기반 resolveScoreTemplate 선택.
 *  - stats(6): standings_compact/emphasized + player_stat_compact/emphasized + 위젯 2종
 *    (player_chip/head_to_head/trend_sparkline).
 *  - schedule(1): game_schedule_widget.
 *  - chat(1): level_progress_widget.
 *  - 신규 6: standings_emphasized·player_stat_emphasized(stats), news_compact(news),
 *    schedule_compact(schedule), lineup_compact(lineup), meme_card(meme).
 *
 * ⚠️ news/schedule/lineup 은 데이터 서브그래프 부재라 TEMPLATE_BY_INTENT 라우팅 미배선(ADR-047 ④).
 *    카탈로그·DB 시드에는 포함(빌딩블록), 서브그래프 도입 시 배선.
 */
export const TEMPLATE_CATALOG: A2UITemplateRow[] = [
  // ── score(3) — resolveScoreTemplate(gameStatus) 로 선택 ──
  {
    templateId: SCORE_COMPACT_TEMPLATE_ID,
    intent: 'score',
    componentTree: SCORE_COMPACT_COMPONENTS,
    bindSchema: SCORE_COMPACT_BIND_SCHEMA,
    variants: ['compact', 'default', 'emphasized'],
  },
  {
    templateId: SCORE_DEFAULT_TEMPLATE_ID,
    intent: 'score',
    componentTree: SCORE_DEFAULT_COMPONENTS,
    bindSchema: SCORE_DEFAULT_BIND_SCHEMA,
    variants: ['compact', 'default', 'emphasized'],
  },
  {
    templateId: SCORE_EMPHASIZED_TEMPLATE_ID,
    intent: 'score',
    componentTree: SCORE_EMPHASIZED_COMPONENTS,
    bindSchema: SCORE_EMPHASIZED_BIND_SCHEMA,
    variants: ['compact', 'default', 'emphasized'],
  },
  // ── stats: standings 2종 + player 2종 + 위젯 3종 ──
  {
    templateId: STANDINGS_COMPACT_TEMPLATE_ID,
    intent: 'stats',
    componentTree: STANDINGS_COMPACT_COMPONENTS,
    bindSchema: STANDINGS_COMPACT_BIND_SCHEMA,
    variants: ['compact', 'emphasized'],
  },
  {
    templateId: STANDINGS_EMPHASIZED_TEMPLATE_ID,
    intent: 'stats',
    componentTree: STANDINGS_EMPHASIZED_COMPONENTS,
    bindSchema: STANDINGS_EMPHASIZED_BIND_SCHEMA,
    variants: ['compact', 'emphasized'],
  },
  {
    templateId: PLAYER_STAT_COMPACT_TEMPLATE_ID,
    intent: 'stats',
    componentTree: PLAYER_STAT_COMPACT_COMPONENTS,
    bindSchema: PLAYER_STAT_COMPACT_BIND_SCHEMA,
    variants: ['compact', 'emphasized'],
  },
  {
    templateId: PLAYER_STAT_EMPHASIZED_TEMPLATE_ID,
    intent: 'stats',
    componentTree: PLAYER_STAT_EMPHASIZED_COMPONENTS,
    bindSchema: PLAYER_STAT_EMPHASIZED_BIND_SCHEMA,
    variants: ['compact', 'emphasized'],
  },
  {
    templateId: PLAYER_CHIP_WIDGET_ID,
    intent: 'stats',
    componentTree: PLAYER_CHIP_COMPONENTS,
    bindSchema: PLAYER_CHIP_BIND_SCHEMA,
    variants: null,
  },
  {
    templateId: HEAD_TO_HEAD_WIDGET_ID,
    intent: 'stats',
    componentTree: HEAD_TO_HEAD_COMPONENTS,
    bindSchema: HEAD_TO_HEAD_BIND_SCHEMA,
    variants: null,
  },
  {
    templateId: TREND_SPARKLINE_WIDGET_ID,
    intent: 'stats',
    componentTree: TREND_SPARKLINE_COMPONENTS,
    bindSchema: TREND_SPARKLINE_BIND_SCHEMA,
    variants: null,
  },
  // ── schedule: 위젯(단일 경기) + schedule_compact(멀티게임) ──
  {
    templateId: GAME_SCHEDULE_WIDGET_ID,
    intent: 'schedule',
    componentTree: GAME_SCHEDULE_COMPONENTS,
    bindSchema: GAME_SCHEDULE_BIND_SCHEMA,
    variants: null,
  },
  {
    templateId: SCHEDULE_COMPACT_TEMPLATE_ID,
    intent: 'schedule',
    componentTree: SCHEDULE_COMPACT_COMPONENTS,
    bindSchema: SCHEDULE_COMPACT_BIND_SCHEMA,
    variants: ['compact'],
  },
  // ── chat: level_progress_widget ──
  {
    templateId: LEVEL_PROGRESS_WIDGET_ID,
    intent: 'chat',
    componentTree: LEVEL_PROGRESS_COMPONENTS,
    bindSchema: LEVEL_PROGRESS_BIND_SCHEMA,
    variants: null,
  },
  // ── 신규 단독 intent (미배선 — 빌딩블록 시드) ──
  {
    templateId: NEWS_COMPACT_TEMPLATE_ID,
    intent: 'news',
    componentTree: NEWS_COMPACT_COMPONENTS,
    bindSchema: NEWS_COMPACT_BIND_SCHEMA,
    variants: ['compact'],
  },
  {
    templateId: LINEUP_COMPACT_TEMPLATE_ID,
    intent: 'lineup',
    componentTree: LINEUP_COMPACT_COMPONENTS,
    bindSchema: LINEUP_COMPACT_BIND_SCHEMA,
    variants: ['compact'],
  },
  {
    templateId: MEME_CARD_TEMPLATE_ID,
    intent: 'meme',
    componentTree: MEME_CARD_COMPONENTS,
    bindSchema: MEME_CARD_BIND_SCHEMA,
    variants: ['card'],
  },
  // ── h2h(ADR-057): 팀 상대전적 카드 — h2h intent 배선(TEMPLATE_BY_INTENT.h2h) ──
  {
    templateId: HEAD_TO_HEAD_COMPACT_TEMPLATE_ID,
    intent: 'h2h',
    componentTree: HEAD_TO_HEAD_COMPACT_COMPONENTS,
    bindSchema: HEAD_TO_HEAD_COMPACT_BIND_SCHEMA,
    variants: ['compact'],
  },
];
