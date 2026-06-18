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
import type { NewsData } from './services/news-graph';
import type { ScheduleData } from './services/schedule-graph';
import type { LineupData } from './services/lineup-graph';
import type { ConversationMemory } from './services/memory';

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

  // ── 대화 식별자 (P3-W9 9.3/9.4 영속화 배선) ──
  // LangGraph run 의 thread_id 로 resolveConversation 이 upsert 한 Conversation.id.
  //   - personalContext 노드가 config.configurable.thread_id → resolveConversation 으로 채운다.
  //   - persistTurnNode 가 이 값으로 Message 2건(user/assistant)을 영속화한다.
  //   - thread_id 미배선(테스트 invoke)/익명/미등록 사용자 시 undefined → 영속화 skip(best-effort).
  conversationId: Annotation<string | undefined>(
    lastValue<string | undefined>(),
  ),

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
  // P3-W9 9.1: composite 복합 질의 감지용 — IntentRouter 가 모든 INTENT_RULES 를 순회해
  //   매칭된 intent 를 중복 제거해 수집한 배열(첫 매칭=대표 intent 는 state.intent 와 동일).
  //   서로 다른 intent 2개 이상 매칭(예: score+stats) 또는 접속표현+2매칭이면 complexity='composite'.
  //   ServiceData 가 composite 일 때 이 배열을 따라 여러 데이터를 동시 조회(Promise.all)하고,
  //   EmitA2UI 가 L3 폴백 시 대표 intent(matchedIntents[0])의 L1 템플릿으로 폴백한다.
  //   단일 intent 경로면 길이 0~1(회귀 영향 없음).
  matchedIntents: Annotation<Intent[]>(lastValue<Intent[]>()),
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

  // ── 대화 메모리 (PersonalContext 노드, P3-W9 9.2) ──
  // 3단계 메모리(working 카운트 + session 증분 요약 + long-term 프로필 요약) 묶음.
  //   - MISS 경로에서 personalContext 노드가 buildConversationMemory 로 조립한다.
  //   - PromptBuilder 가 `<conversation_memory priority="3">` 블록 주입에 사용한다
  //     (session_summary/long_term_profile 하위 태그, 값 있을 때만).
  // best-effort: DB/LLM 비활성·실패 시 요약은 null(블록 생략). per-request 인메모리 계산
  //   (conversationId 미배선 — DB 영속화는 9.4 범위).
  conversationMemory: Annotation<ConversationMemory | undefined>(
    lastValue<ConversationMemory | undefined>(),
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

  // ── 서비스 실데이터 (ServiceData, news NewsGraph, P3-W7 7.5 ADR-048) ──
  // ServiceData 가 news intent 에서 fetchNewsData(teamId) 로 채운다(cache_news 실데이터).
  //   - EmitA2UI 가 news 분기에서 news_compact 카드 데이터 모델(rows)로 주입한다.
  //   - 뉴스는 LLM 감정 리액션을 생성하지 않으므로 reaction 슬롯 없음(L1).
  // best-effort: DB 비활성/없음/만료/빈 결과 시 null → EmitA2UI 가 폴백 텍스트 카드로 방출.
  //   news 외 intent 면 미설정(undefined).
  newsData: Annotation<NewsData | null | undefined>(
    lastValue<NewsData | null | undefined>(),
  ),

  // ── 서비스 실데이터 (ServiceData, schedule ScheduleGraph, ADR-052) ──
  // ServiceData 가 schedule intent 에서 fetchScheduleData(teamId) 로 채운다(kbo_games 실데이터).
  //   - EmitA2UI 가 schedule 분기에서 schedule_compact 카드 데이터 모델(date + rows)로 주입한다.
  //   - 일정은 LLM 감정 리액션을 생성하지 않으므로 reaction 슬롯 없음(L1).
  // best-effort: DB 비활성/없음/예정 경기 없음 시 null → EmitA2UI 가 폴백 텍스트 카드로 방출.
  //   schedule 외 intent 면 미설정(undefined).
  scheduleData: Annotation<ScheduleData | null | undefined>(
    lastValue<ScheduleData | null | undefined>(),
  ),

  // ── 서비스 실데이터 (ServiceData, lineup LineupGraph, ADR-052) ──
  // ServiceData 가 lineup intent 에서 fetchLineupData(teamId) 로 채운다.
  //   - 현재 선발 라인업 테이블 부재라 항상 null(정상 경로) → EmitA2UI 가 팀 톤 폴백 텍스트 카드.
  //   - 선발/타순 크롤러 도입(ADR-052 잔여) 시 실데이터(team + rows 9타순)로 채워진다.
  //   - 라인업은 LLM 감정 리액션을 생성하지 않으므로 reaction 슬롯 없음(L1).
  //   lineup 외 intent 면 미설정(undefined).
  lineupData: Annotation<LineupData | null | undefined>(
    lastValue<LineupData | null | undefined>(),
  ),

  // ── 리액션 (TeamPersona → OutputGuardrail → EmitA2UI) ──
  // L2 감정 리액션 텍스트. TeamPersona 가 score+template 경로에서만 생성하고,
  // OutputGuardrail 이 검증(수치 팩트체크·일베/비속어 재검증)해 정제한 뒤
  // EmitA2UI 가 data model `/reaction` 슬롯에 주입한다. score 외 intent 면 undefined.
  reaction: Annotation<string | undefined>(lastValue<string | undefined>()),

  // ── 프론트엔드 액션 passthrough (P4-W10 10.1 ADR-050) ──
  // CopilotKit 클라이언트가 POST /copilotkit body 의 `tools`(또는 `copilotkit.actions`)로
  // 보낸 프론트 액션 정의는 @ag-ui/langgraph 가 LangGraph run **input(그래프 state)** 에
  // 병합한다(신원 config.configurable 과는 다른 채널). ⚠️ CoreStateAnnotation 에 채널을
  // 선언하지 않으면 input 의 이 키들이 노드 진입 전에 드롭되므로, passthrough 채널로 선언해
  // 노드(chat-graph)까지 살아남게 한다. 값 가공은 services/frontend-actions 가 담당.
  //   - tools: @ag-ui 가 직접 병합하는 표준 채널([{type:'function',name,function:{...}}] 등).
  //   - copilotkit: 일부 버전이 actions 를 copilotkit.actions 하위로 보내는 경우 방어.
  // 느슨한 타입(unknown[]) — 정규화는 extractFrontendActions 가 방어적으로 파싱한다.
  tools: Annotation<unknown[] | undefined>(lastValue<unknown[] | undefined>()),
  copilotkit: Annotation<{ actions?: unknown[] } | undefined>(
    lastValue<{ actions?: unknown[] } | undefined>(),
  ),

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
