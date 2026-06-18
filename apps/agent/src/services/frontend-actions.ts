/**
 * FrontendActions 서비스 (P4-W10 10.1 — useCopilotAction → LLM tool_call 키스톤)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-050)
 *
 * 책임:
 *  - CopilotKit 클라이언트가 POST /copilotkit body 의 `tools`(또는 `copilotkit.actions`)로
 *    보낸 프론트엔드 액션 정의를 그래프 state(passthrough 채널)에서 꺼내 정규화한다.
 *  - @ag-ui/langgraph 가 병합하는 형태가 버전/경로별로 다르므로 두 가지 형태를 방어적으로 파싱:
 *      A. 함수 래퍼:  { type:'function', name?, function:{ name, description, parameters } }
 *      B. flat 액션:  { name, description, parameters }
 *  - A2UI 내부 툴(render_a2ui / log_a2ui_event)은 미들웨어가 소유하므로 LLM 바인딩 대상에서 제외한다.
 *  - 빈/누락/형식 불명은 [] 반환(회귀 0 — chat 기존 동작 유지).
 *
 * ⚠️ 순수 함수 — DB/LLM/IO 없음. chat-graph 가 이 결과로 model.bindTools 한다.
 */
import type { CoreGraphState } from '../state';

/** A2UI 미들웨어가 소유하는 내부 툴 — LLM 바인딩에서 제외. */
const A2UI_RESERVED_NAMES = new Set(['render_a2ui', 'log_a2ui_event']);

/** 정규화된 프론트엔드 액션(LLM bindTools 용 최소 형태). */
export interface FrontendAction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** 비어있지 않은 문자열 가드. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** object(배열/널 아님) 가드. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 단일 raw 액션 항목을 정규화한다. 두 형태(함수 래퍼 / flat) 모두 방어적으로 파싱.
 * name 을 추출하지 못하면 null(스킵).
 */
function normalizeOne(raw: unknown): FrontendAction | null {
  if (!isObject(raw)) {
    return null;
  }
  // 형태 A: { type:'function', name?, function:{ name, description, parameters } }
  const fn = isObject(raw.function) ? raw.function : undefined;

  const name =
    (isNonEmptyString(raw.name) ? raw.name : undefined) ??
    (fn && isNonEmptyString(fn.name) ? fn.name : undefined);
  if (!isNonEmptyString(name)) {
    return null;
  }

  const description =
    (fn && isNonEmptyString(fn.description) ? fn.description : undefined) ??
    (isNonEmptyString(raw.description) ? raw.description : undefined) ??
    '';

  const rawParams =
    (fn && isObject(fn.parameters) ? fn.parameters : undefined) ??
    (isObject(raw.parameters) ? raw.parameters : undefined);

  return {
    name,
    description,
    parameters: rawParams ?? {},
  };
}

/**
 * state 에서 프론트엔드 액션 정의를 추출·정규화한다.
 *
 * 우선순위: state.tools ?? state.copilotkit?.actions ?? []
 * render_a2ui / log_a2ui_event 는 제외. 정규화 실패 항목은 스킵. 빈 → [].
 */
export function extractFrontendActions(
  state: Pick<CoreGraphState, 'tools' | 'copilotkit'>,
): FrontendAction[] {
  const rawList: unknown[] = Array.isArray(state.tools)
    ? state.tools
    : Array.isArray(state.copilotkit?.actions)
      ? (state.copilotkit?.actions as unknown[])
      : [];

  const out: FrontendAction[] = [];
  for (const raw of rawList) {
    const action = normalizeOne(raw);
    if (action === null) {
      continue;
    }
    if (A2UI_RESERVED_NAMES.has(action.name)) {
      continue; // A2UI 내부 툴은 미들웨어 소유 — LLM 바인딩 제외.
    }
    out.push(action);
  }
  return out;
}
