/**
 * EmitA2UI 노드 (W2 종단)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-017/019),
 *       batdi-a2ui-palette-schema.md §5.4 (validate 실패 → L1 fallback, LLM 재호출 금지)
 *
 * 책임:
 *  1) intent → L1 템플릿 해석 (resolveTemplate)
 *  2) authoring `{{bind:"..."}}` → JSON Pointer 슬롯 컴파일 (compileBindings)
 *  3) 팩트 데이터 모델 준비 (getStubDataModel — W2 stub)
 *  4) createSurface/updateComponents/updateDataModel ops 빌드 + validateBatdiA2UI 검증
 *     - valid  → state.a2uiEnvelope = ops
 *     - invalid→ 최소 Text 카드 폴백 (LLM 재호출 금지)
 *     - /reaction 슬롯에는 state.reaction(TeamPersona 생성 → OutputGuardrail 검증값)을 주입.
 *       리액션 생성은 더 이상 이 노드에서 하지 않는다(W6 분리). 미설정 시 '' 폴백.
 *  5) **messages에 AIMessage도 반환** (기존 채팅 E2E 유지)
 *     - score: "롯데 5 : 두산 3 (7회말)" 텍스트
 *     - chat : Gemini 실응답(키 있음) 또는 캔드 응답(키 없음)
 *
 * ⚠️ a2uiEnvelope는 state에 빌드·보관만 한다. 렌더러로의 transport는 W2-B 범위.
 */
import { AIMessage } from '@langchain/core/messages';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { CoreGraphState, CoreGraphUpdate } from '../state';
import {
  resolveTemplate,
  resolveScoreTemplate,
  resolveStatsTemplate,
} from '../templates/registry';
import { compileBindings, scoreSummaryText } from '../databind/compile';
import { cannedReactionFor } from '../utils/prompt-builder';
import {
  buildA2UIOps,
  BATDI_SURFACE_ID,
  type BuildA2UIResult,
} from '../databind/emit';
import { logUiInvalidEvent, logResponseLevel } from '../utils/langfuse';
import { generateChatReply } from '../services/chat-graph';
import { composeL3 } from '../services/l3-composer';
import { getPrisma } from '../utils/prisma';
import { isPersonalized } from '../personal/personal-agent';
import { buildCacheKey, personaScopeFor } from './cache-lookup';

/**
 * A2UI 렌더 툴 이름 (ADR-020). 백엔드 a2ui 미들웨어의 a2uiToolNames 기본값과 일치해야
 * 미들웨어가 이 툴콜의 args(surfaceId/components/data)를 읽어 `a2ui-surface`로 렌더한다.
 */
const RENDER_A2UI_TOOL_NAME = 'render_a2ui';

/**
 * @ag-ui/langgraph CustomEventNames.ManuallyEmitToolCall 값.
 * 노드가 이 커스텀 이벤트를 dispatch 하면 어댑터가 스트리밍
 * TOOL_CALL_START(name) → TOOL_CALL_ARGS(args 문자열) → TOOL_CALL_END 을 방출한다.
 * (값은 @ag-ui/langgraph d.ts 의 enum 과 일치 — 의존성 추가 없이 리터럴 사용)
 */
const MANUALLY_EMIT_TOOL_CALL = 'manually_emit_tool_call';

/**
 * A2UI 폴백 발생 시 관측 신호.
 * SSOT: palette-schema §5.4(2)/ADR-019 — 검증 실패 페이로드는 `llm_ui_invalid`
 * 이벤트로 비동기 기록한다. 깊이/노드 게이트(§5.4.1) 위반도 동일 경로로 폴백·기록된다.
 *
 * console.warn(로컬 흔적) + Langfuse `llm_ui_invalid` 비동기 이벤트(키 있을 때만, best-effort).
 */
function reportA2UIResult(stage: string, result: BuildA2UIResult): void {
  if (result.usedFallback) {
    const errorCodes = result.errors.map((e) => e.code);
    // eslint-disable-next-line no-console
    console.warn(`[emit-a2ui] ${stage}: A2UI 검증 실패 → L1 폴백 사용`, errorCodes);
    logUiInvalidEvent({ stage, errorCodes, surfaceId: BATDI_SURFACE_ID });
  }
}

/**
 * render_a2ui 툴콜을 **스트리밍 이벤트**로 방출한다 (ADR-020 Path C).
 *
 * 노드가 만든 AIMessage.tool_calls 는 스냅샷(MESSAGES_SNAPSHOT)으로만 전달돼
 * 미들웨어의 surface 빌드(TOOL_CALL_START/ARGS 의존)를 트리거하지 못한다(헤드리스 SSE
 * 실측). 대신 manually_emit_tool_call 커스텀 이벤트를 dispatch 하면 @ag-ui/langgraph
 * 어댑터가 TOOL_CALL_START/ARGS/END 를 방출 → a2ui 미들웨어가 args 로 surface 렌더.
 * args 는 delta(문자열)로 흘러가므로 JSON.stringify 한다.
 * tool_call id 는 run 당 단일 surface 라 안정 상수(Date/random 미사용).
 */
async function emitRenderA2UIToolCall(
  result: Pick<BuildA2UIResult, 'components' | 'data'>,
  config: RunnableConfig | undefined,
): Promise<void> {
  await dispatchCustomEvent(
    MANUALLY_EMIT_TOOL_CALL,
    {
      id: `render-${BATDI_SURFACE_ID}`,
      name: RENDER_A2UI_TOOL_NAME,
      args: JSON.stringify({
        surfaceId: BATDI_SURFACE_ID,
        components: result.components,
        data: result.data,
      }),
    },
    config,
  );
}

/**
 * 캐시된 envelope ops 에서 render_a2ui 툴콜용 components/data 를 추출한다.
 * ops 구조: [createSurface, updateComponents{components}, updateDataModel{value}].
 * updateDataModel 이 없으면(폴백 envelope) data 는 빈 객체.
 */
function extractFromEnvelope(ops: Array<Record<string, unknown>>): {
  components: Array<Record<string, unknown>>;
  data: Record<string, unknown>;
} {
  let components: Array<Record<string, unknown>> = [];
  let data: Record<string, unknown> = {};
  for (const op of ops) {
    if ('updateComponents' in op) {
      const uc = op.updateComponents as {
        components?: Array<Record<string, unknown>>;
      };
      components = uc.components ?? [];
    } else if ('updateDataModel' in op) {
      const ud = op.updateDataModel as { value?: Record<string, unknown> };
      data = ud.value ?? {};
    }
  }
  return { components, data };
}

/**
 * L0 캐시 write (best-effort, MISS 경로 종단 — architecture §4.2).
 *
 * score template 경로에서 생성한 완성 envelope 를 비개인화 키로 upsert 한다.
 * - TTL 5분: score 는 점수 변동이 잦아 짧게(만료 후 자동 MISS → 재생성).
 * - cacheKey 미설정(가드레일 차단 등)이면 write skip.
 * - DB 비활성/에러는 무시(응답 정상). hit_count 는 신규 0(증분은 조회 시).
 *
 * ⚠️ 개인화 응답(custom_persona/personal_profile/favorites 주입) write 금지 — Cache
 *    Poisoning 방지(CLAUDE.md 불변식·§4.2). P2-W6 6.3: state.personalContext 가
 *    isPersonalized() true 면(커스텀 페르소나/관심 선수 보유) 개인화 reaction 이
 *    비개인화 키로 캐시돼 다른 사용자에게 누출되므로 write 를 SKIP 한다.
 */
async function writeL0Cache(
  state: CoreGraphState,
  ops: Array<Record<string, unknown>>,
): Promise<void> {
  if (state.cacheKey === undefined || state.cacheKey.trim() === '') {
    return; // 키 미생성 → skip
  }
  // L0 캐시 포이즌 가드(§4.2): 개인화 응답은 비개인화 키로 write 금지.
  if (isPersonalized(state.personalContext)) {
    return; // 개인화 응답 → L0 write SKIP(Cache Poisoning 방지)
  }
  const prisma = getPrisma();
  if (!prisma) {
    return; // DB 비활성 → skip(best-effort)
  }

  const { paramsHash } = buildCacheKey(state);
  const personaScope = personaScopeFor(state.intent);
  const envelopeJsonl = JSON.stringify(ops);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // +5분

  try {
    await prisma.cacheUiEnvelope.upsert({
      where: { cacheKey: state.cacheKey },
      create: {
        cacheKey: state.cacheKey,
        intent: state.intent,
        paramsHash,
        teamId: state.teamId ?? null,
        personaScope,
        envelopeJsonl,
        hitCount: 0,
        expiresAt,
      },
      update: {
        envelopeJsonl,
        personaScope,
        teamId: state.teamId ?? null,
        expiresAt,
      },
    });
  } catch {
    // write 실패는 무시(응답은 이미 방출됨). 다음 요청 시 MISS → 재생성.
  }
}

/**
 * score intent 인데 실데이터(state.scoreData)가 없을 때의 팀 톤 폴백 문구(P2-W5.5).
 * cannedReactionFor 처럼 간단히 — 수치 없음, 경기 없는 날 톤. 캐시 금지(데이터 부재).
 */
function scoreNoDataText(teamId: CoreGraphState['teamId']): string {
  // 팀 톤 캔드 리액션을 앞에 붙여 자연스럽게(둘 다 수치 없음).
  const tone = cannedReactionFor(teamId);
  return `${tone} 아직 경기 정보가 없어유~ 다음 경기 기대해보자!`;
}

/**
 * stats intent 인데 실데이터(state.standingsData)가 없을 때의 팀 톤 폴백 문구.
 * scoreNoDataText 와 동일 패턴 — 수치 없음, 순위 미적재 톤. 캐시 금지(데이터 부재).
 */
function standingsNoDataText(teamId: CoreGraphState['teamId']): string {
  const tone = cannedReactionFor(teamId);
  return `${tone} 아직 순위 정보가 없어유~ 조금만 기다려보자!`;
}

/**
 * stats(player) intent 인데 선수 리더보드 실데이터(state.playerStats)가 없을 때의 팀 톤
 * 폴백 문구(P3-W7 7.3b). standingsNoDataText 와 평행 — 4팀 외/미적재/팀 미지정 톤.
 * 수치 없음, 캐시 금지(데이터 부재).
 */
function playerStatsNoDataText(teamId: CoreGraphState['teamId']): string {
  const tone = cannedReactionFor(teamId);
  return `${tone} 아직 선수 기록이 없어유~ 조금만 기다려보자!`;
}

/**
 * composite L3 게이트 실패/생성 불가 시 대표 intent 의 L1 템플릿으로 즉시 폴백한다(P3-W9 9.1).
 *
 * SSOT: palette-schema §5.4 "검증 실패 → 해당 intent L1 기본 Template 통째 폴백(재호출 금지)".
 *   대표 intent(repIntent = matchedIntents[0] ?? state.intent)의 정형 데이터가 state 에 있으면
 *   그 L1 템플릿(+data)로 렌더하고, 없으면 단일 Text 카드로 폴백한다. LLM 재호출은 하지 않는다.
 *
 * @returns 폴백 BuildA2UIResult(렌더용 components/data + summary 라벨).
 */
function buildCompositeFallback(state: CoreGraphState): {
  result: BuildA2UIResult;
  level: 'L1';
} {
  const repIntent: CoreGraphState['intent'] =
    state.matchedIntents?.[0] ?? state.intent ?? 'chat';

  // 대표 intent 가 score 이고 실데이터 있음 → score L1 템플릿.
  if (repIntent === 'score' && state.scoreData) {
    const template = resolveScoreTemplate(state.scoreData);
    const compiled = compileBindings(template.components);
    const data: Record<string, unknown> = {
      ...(state.scoreData as unknown as Record<string, unknown>),
      reaction: state.reaction ?? '',
    };
    return {
      result: buildA2UIOps(compiled, data, scoreSummaryText(state.scoreData)),
      level: 'L1',
    };
  }

  // 대표 intent 가 stats 이고 실데이터 있음 → stats L1 템플릿(player/standings).
  if (repIntent === 'stats') {
    if (state.statType === 'player' && state.playerStats) {
      const template = resolveStatsTemplate('player');
      const compiled = compileBindings(template.components);
      return {
        result: buildA2UIOps(
          compiled,
          { rows: state.playerStats.rows },
          '선수 기록',
        ),
        level: 'L1',
      };
    }
    if (state.standingsData) {
      const template = resolveStatsTemplate('standings');
      const compiled = compileBindings(template.components);
      return {
        result: buildA2UIOps(
          compiled,
          { rows: state.standingsData.rows },
          '팀 순위',
        ),
        level: 'L1',
      };
    }
  }

  // 데이터 없음/그 외 intent → 단일 Text 폴백 카드.
  const fallbackText = '복합 질문이라 한 화면에 담기 어려워유~ 하나씩 물어봐줘!';
  return {
    result: buildA2UIOps(
      [{ id: 'root', component: 'Text', text: fallbackText }],
      {},
      fallbackText,
    ),
    level: 'L1',
  };
}

export async function emitA2UI(
  state: CoreGraphState,
  config?: RunnableConfig,
): Promise<CoreGraphUpdate> {
  // ── W4: 입력 가드레일 차단 분기 ──
  // graph 조건부 엣지로 intentRouter~outputGuardrail 을 우회해 직접 진입한 경우.
  // LLM/템플릿 호출 없이 fallbackResponse 를 단일 Text 카드 + AIMessage 로 방출.
  if (state.inputGuardrailResult?.pass === false) {
    const blockedText =
      state.inputGuardrailResult.fallbackResponse ??
      '그런 얘기는 좀 그런 거 같아유~ 즐겁게 야구 얘기 하자!';
    const result = buildA2UIOps(
      [{ id: 'root', component: 'Text', text: blockedText }],
      {},
      blockedText,
    );
    reportA2UIResult(
      `guardrail-blocked(${state.inputGuardrailResult.violationType ?? 'unknown'})`,
      result,
    );
    logResponseLevel('blocked', state.intent ?? 'unknown');
    return {
      a2uiEnvelope: result.ops,
      messages: [new AIMessage(blockedText)],
    };
  }

  // ── P2-W4 (4.5): L0 캐시 HIT 분기 ──
  // CacheLookup 이 완성 envelope 를 재사용하기로 결정한 경우(LLM 0). uiComposer~
  // outputGuardrail 을 우회하고 곧장 진입(graph 조건부 엣지). 캐시된 ops 에서
  // components/data 를 추출해 그대로 render_a2ui 툴콜로 재방출한다(생성·write 없음).
  if (state.cacheHit === 'L0' && state.a2uiEnvelope) {
    const cachedOps = state.a2uiEnvelope as Array<Record<string, unknown>>;
    const { components, data } = extractFromEnvelope(cachedOps);
    await emitRenderA2UIToolCall({ components, data }, config);
    logResponseLevel('L0', state.intent ?? 'unknown');
    return { a2uiEnvelope: state.a2uiEnvelope };
  }

  // ── P3-W9 9.1: L3 UIComposer (composite 복합 질의) ──
  // 서로 다른 intent 2개 이상(예: score+stats)이 매칭된 복합 질의는 LLM 이 A2UI spec 을
  // 동적 생성하고, 우리 UIValidator 게이트(buildA2UIOps → validateBatdiA2UI: maxDepth4/
  // maxNodes30/카탈로그/바인딩)가 검증한다. 통과 시 렌더(L3), 실패/생성 불가 시 대표 intent 의
  // L1 템플릿으로 **즉시 폴백**(LLM 재호출 금지, ADR-019).
  // ⚠️ L3/composite 응답은 LLM 비결정이라 L0 캐시 write 하지 않는다.
  if (state.complexity === 'composite') {
    const l3 = await composeL3(state, config);
    if (l3 !== null) {
      const result = buildA2UIOps(l3.components, l3.data, '복합 응답');
      if (result.valid) {
        // 게이트 통과 → L3 동적 카드 렌더(L0 write 안 함, 비결정).
        await emitRenderA2UIToolCall(result, config);
        logResponseLevel('L3', state.intent ?? 'composite');
        return { a2uiEnvelope: result.ops };
      }
      // 게이트 실패(maxNodes/depth/카탈로그/바인딩) → llm_ui_invalid 기록 후 L1 폴백.
      reportA2UIResult('composite(l3-invalid)', result);
    }

    // l3 == null(키 없음/파싱 실패/빈) 또는 게이트 실패 → 대표 intent L1 즉시 폴백.
    const { result: fbResult } = buildCompositeFallback(state);
    reportA2UIResult('composite(l1-fallback)', fbResult);
    await emitRenderA2UIToolCall(fbResult, config);
    // composite 는 L0 write 생략(LLM 비결정 / 데이터 합성 결과 비고정).
    logResponseLevel('composite', state.intent ?? 'composite');
    return { a2uiEnvelope: fbResult.ops };
  }

  // P2-W5.4: score intent 는 gameStatus 기반으로 3종(compact/default/emphasized) 중
  // 선택한다(resolveScoreTemplate). stats/기타 intent 는 기존 intent→템플릿 매핑 유지.
  // score 인데 실데이터 없음(scoreData==null)은 바로 아래 DataFallbackHandler 가 먼저
  // 가로채므로, 여기 template 은 실데이터 보유 경로에서만 사용된다.
  // P3-W7 7.3b: stats intent 는 statType 으로 템플릿을 고른다(resolveStatsTemplate):
  //  - 'player' → player_stat_compact(선수 리더보드), else → standings_compact(순위).
  // stats 인데 실데이터 없음(standingsData/playerStats==null)은 아래 DataFallbackHandler 가
  // 먼저 가로채므로, 여기 template 은 실데이터 보유 경로에서만 사용된다.
  const template =
    state.intent === 'score'
      ? resolveScoreTemplate(state.scoreData)
      : state.intent === 'stats'
        ? resolveStatsTemplate(state.statType)
        : resolveTemplate(state.intent);

  // ── P2-W5.5: DataFallbackHandler ──
  // score intent 인데 실데이터 없음(state.scoreData == null): 경기 정보가 없으므로
  // 점수 템플릿 대신 팀 톤 폴백 텍스트 카드(단일 Text) + AIMessage 를 방출한다.
  // ⚠️ 데이터 없는 상태는 캐시하면 안 되므로 L0 write 하지 않는다(Cache 무결성).
  if (state.intent === 'score' && state.scoreData == null) {
    const fallbackText = scoreNoDataText(state.teamId);
    const result = buildA2UIOps(
      [{ id: 'root', component: 'Text', text: fallbackText }],
      {},
      fallbackText,
    );
    reportA2UIResult('intent=score(no-data-fallback)', result);
    await emitRenderA2UIToolCall(result, config);
    // L0 write 생략 — 경기 없는 상태를 캐시하면 다음 경기일에도 stale fallback 이 나간다.
    logResponseLevel('L1', 'score');
    return {
      a2uiEnvelope: result.ops,
      messages: [new AIMessage(fallbackText)],
    };
  }

  // ── stats(player) DataFallbackHandler (P3-W7 7.3b) ──
  // stats intent + statType='player' 인데 선수 리더보드 실데이터 없음(playerStats==null):
  // 4팀 외/미적재/팀 미지정 → 리더보드 카드 대신 팀 톤 폴백 텍스트 카드 + AIMessage.
  // standings 폴백과 평행. ⚠️ 데이터 부재라 L0 write 하지 않는다(Cache 무결성).
  if (
    state.intent === 'stats' &&
    state.statType === 'player' &&
    state.playerStats == null
  ) {
    const fallbackText = playerStatsNoDataText(state.teamId);
    const result = buildA2UIOps(
      [{ id: 'root', component: 'Text', text: fallbackText }],
      {},
      fallbackText,
    );
    reportA2UIResult('intent=stats(player,no-data-fallback)', result);
    await emitRenderA2UIToolCall(result, config);
    // L0 write 생략 — 선수 기록 미적재 상태를 캐시하면 적재 후에도 stale fallback 이 나간다.
    logResponseLevel('L1', 'stats');
    return {
      a2uiEnvelope: result.ops,
      messages: [new AIMessage(fallbackText)],
    };
  }

  // ── stats(standings) DataFallbackHandler ──
  // stats intent 인데 순위 실데이터 없음(state.standingsData == null): 순위 카드 대신
  // 팀 톤 폴백 텍스트 카드(단일 Text) + AIMessage 를 방출한다. score 폴백과 동일 패턴.
  // ⚠️ statType='player' 경로는 위에서 이미 처리됐으므로 여기는 standings/undefined 만 도달.
  // ⚠️ 데이터 없는 상태는 캐시하면 안 되므로 L0 write 하지 않는다(Cache 무결성).
  if (
    state.intent === 'stats' &&
    state.statType !== 'player' &&
    state.standingsData == null
  ) {
    const fallbackText = standingsNoDataText(state.teamId);
    const result = buildA2UIOps(
      [{ id: 'root', component: 'Text', text: fallbackText }],
      {},
      fallbackText,
    );
    reportA2UIResult('intent=stats(no-data-fallback)', result);
    await emitRenderA2UIToolCall(result, config);
    // L0 write 생략 — 순위 미적재 상태를 캐시하면 적재 후에도 stale fallback 이 나간다.
    logResponseLevel('L1', 'stats');
    return {
      a2uiEnvelope: result.ops,
      messages: [new AIMessage(fallbackText)],
    };
  }

  // ── 템플릿 있음 (score: 실데이터 보유 / stats: 순위 실데이터 보유) ──
  if (template) {
    const compiled = compileBindings(template.components);

    // intent 별 summary/data 선택.
    //  - score: home/away/inning 실데이터(state.scoreData) + reaction 슬롯(state.reaction).
    //  - stats : rows 실데이터(state.standingsData). 리액션 미생성이라 reaction 슬롯 없음.
    let summary = '응답';
    let data: Record<string, unknown>;

    if (state.intent === 'stats' && state.statType === 'player' && state.playerStats) {
      // 선수 리더보드 카드: rows 만 주입(player_stat_compact 는 /reaction 슬롯이 없음).
      summary = '선수 기록';
      data = { rows: state.playerStats.rows };
    } else if (state.intent === 'stats' && state.standingsData) {
      // 순위 카드: rows 만 주입(standings_compact 는 /reaction 슬롯이 없음).
      summary = '팀 순위';
      data = { rows: state.standingsData.rows };
    } else {
      // score 카드(또는 score 데이터 있는 경로): home/away/inning + reaction.
      // P2-W6: 리액션은 TeamPersona 가 생성하고 OutputGuardrail 이 검증·정제한 값을
      // state.reaction 으로 받아 data model /reaction 에 주입한다(카드 reaction 슬롯 표시).
      // score 외 경로/차단 시엔 미설정(undefined) → 빈 문자열로 폴백(슬롯 비표시).
      summary =
        state.intent === 'score' && state.scoreData
          ? scoreSummaryText(state.scoreData)
          : '응답';
      data = {
        ...(state.intent === 'score' && state.scoreData
          ? (state.scoreData as unknown as Record<string, unknown>)
          : {}),
        reaction: state.reaction ?? '',
      };
    }

    const result = buildA2UIOps(compiled, data, summary);
    reportA2UIResult(`intent=${state.intent}`, result);

    // W2-B (ADR-020 Path C): render_a2ui 툴콜을 스트리밍 이벤트로 방출 →
    // a2ui 미들웨어가 surface 렌더. 카드 자체가 응답이므로 별도 메시지는 두지 않는다
    // (요약 reaction 텍스트는 W2 범위 밖). a2uiEnvelope 는 state 디버그 채널로만 보관.
    await emitRenderA2UIToolCall(result, config);

    // P2-W4 (4.5): MISS 경로 종단 — 완성 envelope 를 L0 캐시에 write(best-effort).
    //   같은 intent+질의+팀이면 다음 요청은 LLM 0회로 재사용. score template 경로만
    //   write(결정론적·비개인화). chat 등 LLM 응답 경로는 비결정이라 write 하지 않는다.
    //   write 실패/DB 비활성은 응답에 영향 없음(await 하되 내부 try/catch 흡수).
    await writeL0Cache(state, result.ops as Array<Record<string, unknown>>);

    // L1(리액션 없음, 예: stats 순위) vs L2(리액션 있음, 예: score FINISHED) 구분 기록.
    logResponseLevel(state.reaction ? 'L2' : 'L1', state.intent ?? 'unknown');
    return {
      a2uiEnvelope: result.ops,
    };
  }

  // ── P3-W8 8.2: meme 분기 (chat LLM 으로 빠지기 전에 가로챔) ──
  // meme intent 는 ServiceData(fetchRandomMeme)가 채운 state.memeContent 를 단일 Text 카드
  // (root Text) + AIMessage 로 방출한다. 밈은 사람이 작성한 정적/시드 콘텐츠라 LLM(chat)
  // 호출이 필요 없다. memeContent 는 best-effort 로 항상 비어있지 않지만, 방어적으로 폴백.
  // ⚠️ 밈은 랜덤이라 비결정 → L0 캐시 write 하지 않는다(chat 폴백처럼 write 생략).
  if (state.intent === 'meme') {
    const memeText =
      state.memeContent && state.memeContent.trim() !== ''
        ? state.memeContent
        : '오늘도 같이 야구 보면서 신나게 응원하자!';
    const result = buildA2UIOps(
      [{ id: 'root', component: 'Text', text: memeText }],
      {},
      memeText,
    );
    reportA2UIResult('intent=meme', result);
    await emitRenderA2UIToolCall(result, config);
    // L0 write 생략 — 밈은 랜덤(비결정)이라 캐시하면 같은 밈만 반복 노출된다.
    logResponseLevel('chat', 'meme');
    return {
      a2uiEnvelope: result.ops,
      messages: [new AIMessage(memeText)],
    };
  }

  // ── 템플릿 없음 (chat 등) → 텍스트-only + 단일 Text 카드 ──
  // P3-W8 8.1: chat 응답은 ChatGraph 서비스가 페르소나 + PersonalContext + 출력 가드레일 +
  // 팀톤 폴백을 갖춰 생성한다(이전 맨 Gemini 호출/스켈레톤 stub 교체).
  const text = await generateChatReply(state, config);
  const result = buildA2UIOps(
    [{ id: 'root', component: 'Text', text }],
    {},
    text,
  );
  reportA2UIResult(`intent=${state.intent}(no-template)`, result);

  logResponseLevel('chat', state.intent ?? 'unknown');
  return {
    a2uiEnvelope: result.ops,
    messages: [new AIMessage(text)],
  };
}
