/**
 * DataBinder 컴파일 로직 (순수 함수 — 테스트 직접 호출용)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (ADR-017 바인딩),
 *       CLAUDE.md "팩트(수치)는 절대 LLM이 생성 금지 — DataBinder 경유"
 *
 *  - authoring 표기 `{{bind:"home.score"}}` → A2UI 값 슬롯 `{ path: "/home/score" }`
 *    (점경로 → JSON Pointer, 선행 슬래시, 점은 슬래시로 치환)
 *  - 정적 문자열/숫자/불리언/children(id 배열)은 그대로 보존.
 */
import type { Intent } from '@batdi/types';

/** `{{bind:"path"}}` 형태 문자열을 감지하는 정규식 (전체 일치) */
const BIND_RE = /^\{\{bind:"([^"]+)"\}\}$/;

/** 점경로(`home.score`) → JSON Pointer(`/home/score`) */
export function dotPathToJsonPointer(dotPath: string): string {
  return '/' + dotPath.split('.').join('/');
}

/**
 * authoring 컴포넌트 트리의 `{{bind:"..."}}` 표기를 JSON Pointer 값 슬롯으로 컴파일.
 * (평탄 인접 리스트의 각 노드 prop을 순회. children/component/id는 보존)
 */
export function compileBindings(
  components: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return components.map((node) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        const m = BIND_RE.exec(value);
        if (m && m[1] !== undefined) {
          out[key] = { path: dotPathToJsonPointer(m[1]) };
          continue;
        }
      }
      out[key] = value;
    }
    return out;
  });
}

/** 스코어 데이터 모델 (W2 stub — P2에서 ScoreGraph 실데이터로 교체) */
export interface ScoreData {
  home: { name: string; score: number };
  away: { name: string; score: number };
  inning: string;
}

/** W2 stub 스코어 데이터 */
export function getStubScoreData(): ScoreData {
  return {
    home: { name: '롯데', score: 5 },
    away: { name: '두산', score: 3 },
    inning: '7회말',
  };
}

/**
 * intent별 데이터 모델 stub 반환.
 * (W2: score만 데이터 보유. 그 외는 빈 객체 — 텍스트 폴백)
 */
export function getStubDataModel(intent: Intent): Record<string, unknown> {
  if (intent === 'score') {
    return getStubScoreData() as unknown as Record<string, unknown>;
  }
  return {};
}

/** 스코어 데이터 → 평문 요약 ("롯데 5 : 두산 3 (7회말)") */
export function scoreSummaryText(data: ScoreData): string {
  return `${data.home.name} ${data.home.score} : ${data.away.name} ${data.away.score} (${data.inning})`;
}
