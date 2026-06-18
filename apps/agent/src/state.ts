/**
 * Core 그래프 State 정의 (LangGraph Annotation)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §3.1 (CoreState, W2 subset)
 *
 * messages 채널은 반드시 보존한다 (CopilotKit 라운드트립 — 기존 채팅 E2E 유지).
 * MessagesAnnotation.spec를 스프레드하여 messages reducer를 그대로 가져온다.
 */
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type {
  A2UIEnvelope,
  GuardrailResult,
  Intent,
  PersonalContext,
  TeamId,
} from '@batdi/types';
import type { ScoreData } from './services/score-graph';
import type { StandingsData, StatsLeaderboard } from './services/stats-graph';

/** 마지막-쓰기-우선(last-write-wins) reducer 헬퍼 */
function lastValue<T>() {
  return {
    reducer: (_prev: T, next: T): T => next,
  };
}

/**
 * Core State Annotation — MessagesAnnotation(messages) + W2 커스텀 채널.
 */
export const CoreStateAnnotation = Annotation.Root({
  // messages 채널 보존 (AIMessage 출력 — 브라우저 채팅 동작 유지)
  ...MessagesAnnotation.spec,

  // ── 입력 (Normalizer) ──
  userMessage: Annotation<string>(lastValue<string>()),
  userMessageNormalized: Annotation<string>(lastValue<string>()),
  userMessageDisplay: Annotation<string>(lastValue<string>()),

  // ── 식별자 ──
  userId: Annotation<string>(lastValue<string>()),
  teamId: Annotation<TeamId>(lastValue<TeamId>()),

  // ── 가드레일 (W2: pass stub) ──
  inputGuardrailResult: Annotation<GuardrailResult | undefined>(
    lastValue<GuardrailResult | undefined>(),
  ),
  outputGuardrailResult: Annotation<GuardrailResult | undefined>(
    lastValue<GuardrailResult | undefined>(),
  ),

  // ── 라우팅 (IntentRouter) ──
  intent: Annotation<Intent>(lastValue<Intent>()),
  intentConfidence: Annotation<'high' | 'default'>(
    lastValue<'high' | 'default'>(),
  ),
  complexity: Annotation<'simple' | 'general' | 'composite'>(
    lastValue<'simple' | 'general' | 'composite'>(),
  ),
  // stats intent 보조 분기(P3-W7 7.3b). IntentRouter 가 매칭된 규칙의 statType 을 노출:
  //   - 'standings' → 팀 순위 카드(standings_compact)
  //   - 'player'    → 팀 선수 리더보드 카드(player_stat_compact, 타율/방어율/홈런 등)
  // stats 외 intent / statType 없는 규칙은 undefined.
  statType: Annotation<'standings' | 'player' | undefined>(
    lastValue<'standings' | 'player' | undefined>(),
  ),

  // ── 캐시 (CacheLookup) ──
  cacheHit: Annotation<'L0' | 'L1' | 'L2' | 'L3' | 'miss'>(
    lastValue<'L0' | 'L1' | 'L2' | 'L3' | 'miss'>(),
  ),
  // L0 캐시 키. CacheLookup 이 생성·보관하고, MISS 경로 종단(EmitA2UI)에서
  // 완성 envelope 를 이 키로 write(upsert) 한다(SSOT: architecture §4.2).
  //   `${intent}:${paramsHash}:${teamId ?? 'none'}:${personaScope}`
  // 미설정(undefined) 이면 write skip(가드레일 차단·키 미생성 경로).
  cacheKey: Annotation<string | undefined>(lastValue<string | undefined>()),

  // ── 개인화 (PersonalContext 노드, P2-W6 6.3) ──
  // PersonalAgent 가 DB(User·PersonalAgentState)에서 조립한 개인화 컨텍스트.
  //   - PromptBuilder 가 `<personal_profile priority="3">` 주입에 사용(개인화 정보 있을 때만).
  //   - EmitA2UI 가 isPersonalized() 로 L0 캐시 write 가드(Cache Poisoning 방지, §4.2).
  // best-effort: DB 비활성/없음 시 중립 기본값(개인화 없음). MISS 경로에서만 채워진다.
  personalContext: Annotation<PersonalContext | undefined>(
    lastValue<PersonalContext | undefined>(),
  ),

  // ── 서비스 실데이터 (DataBinder, P2-W5.5 ScoreGraph) ──
  // DataBinder 가 score intent 에서 fetchScoreData(teamId) 로 채운다(kbo_games 실데이터).
  //   - TeamPersona 가 scoreSummaryText(scoreData) 로 리액션 맥락을 만든다(없으면 미생성).
  //   - EmitA2UI 가 score_compact 카드 데이터 모델로 주입한다.
  // best-effort: DB 비활성/없음/경기 없음 시 null → EmitA2UI 가 폴백 텍스트 카드로 방출.
  //   score 외 intent 면 미설정(undefined).
  scoreData: Annotation<ScoreData | null | undefined>(
    lastValue<ScoreData | null | undefined>(),
  ),

  // ── 서비스 실데이터 (DataBinder, stats StatsGraph) ──
  // DataBinder 가 stats intent 에서 fetchStandings() 로 채운다(team_season_records 실데이터).
  //   - EmitA2UI 가 standings_compact 카드 데이터 모델(rows)로 주입한다.
  //   - stats 는 LLM 감정 리액션을 생성하지 않으므로 reaction 슬롯 없음.
  // best-effort: DB 비활성/없음/빈 결과 시 null → EmitA2UI 가 폴백 텍스트 카드로 방출.
  //   stats 외 intent 면 미설정(undefined).
  standingsData: Annotation<StandingsData | null | undefined>(
    lastValue<StandingsData | null | undefined>(),
  ),

  // ── 서비스 실데이터 (ServiceData, stats statType='player' 선수 리더보드) ──
  // ServiceData 가 stats intent + statType='player' 에서 fetchPlayerLeaderboard(teamId, kind)
  // 로 채운다(batting_stats/pitching_stats 실데이터). detectStatKind 로 타자/투수 분기.
  //   - EmitA2UI 가 player_stat_compact 카드 데이터 모델(rows)로 주입한다.
  //   - stats 는 LLM 감정 리액션을 생성하지 않으므로 reaction 슬롯 없음.
  // best-effort: DB 비활성/teamId 없음/4팀 외/빈 결과 시 null → EmitA2UI 폴백 텍스트.
  //   stats player 외 경로면 미설정(undefined).
  playerStats: Annotation<StatsLeaderboard | null | undefined>(
    lastValue<StatsLeaderboard | null | undefined>(),
  ),

  // ── 서비스 실데이터 (ServiceData, meme MemeGraph, P3-W8 8.2) ──
  // ServiceData 가 meme intent 에서 fetchRandomMeme(teamId) 로 채운다(memes 실데이터).
  //   - EmitA2UI 가 meme 분기에서 단일 Text 카드 + AIMessage 로 방출한다(chat LLM 미경유).
  //   - 밈은 랜덤이라 비결정 → L0 캐시 write 하지 않는다(emit-a2ui meme 분기 write 생략).
  // fetchRandomMeme 은 best-effort 로 항상 비어있지 않은 문자열 반환(DB 없음 → STATIC 폴백).
  //   meme 외 intent 면 미설정(undefined).
  memeContent: Annotation<string | undefined>(
    lastValue<string | undefined>(),
  ),

  // ── 리액션 (TeamPersona → OutputGuardrail → EmitA2UI) ──
  // L2 감정 리액션 텍스트. TeamPersona 가 score+template 경로에서만 생성하고,
  // OutputGuardrail 이 검증(수치 팩트체크·일베/비속어 재검증)해 정제한 뒤
  // EmitA2UI 가 data model `/reaction` 슬롯에 주입한다. score 외 intent 면 undefined.
  reaction: Annotation<string | undefined>(lastValue<string | undefined>()),

  // ── 출력 (EmitA2UI) ──
  a2uiEnvelope: Annotation<A2UIEnvelope | undefined>(
    lastValue<A2UIEnvelope | undefined>(),
  ),

  // ── 관측 ──
  llmCallCount: Annotation<number | undefined>(lastValue<number | undefined>()),
  traceId: Annotation<string | undefined>(lastValue<string | undefined>()),
});

/** Core State 런타임 타입 */
export type CoreGraphState = typeof CoreStateAnnotation.State;
/** 노드 반환용 Partial 타입 */
export type CoreGraphUpdate = Partial<CoreGraphState>;
