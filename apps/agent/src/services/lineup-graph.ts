/**
 * LineupGraph 서비스 (lineup intent — 선발 라인업/타순 카드 실데이터 배선, ADR-052)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md ADR-052, §3.5,
 *       CLAUDE.md "팩트(수치)는 DB → DataBinder → 템플릿 참조만".
 *
 * 책임:
 *  - lineup_compact 템플릿 슬롯(team + rows.N.line 9타순)에 실릴 선발 라인업 데이터를 조립한다.
 *  - 라인업/타순은 현재 DB 스키마에 전용 테이블이 없어(선발 크롤러 미도입) **null 이 정상 경로**다.
 *    fetchLineupData 는 가능한 선발 정보 조회를 시도하되, 라인업 테이블이 없으므로 항상 null 을
 *    반환한다 → EmitA2UI 가 "라인업은 경기 임박 시 공개돼요" 류 팀 톤 폴백 텍스트 카드로 방출.
 *  - 포맷 로직(formatLineupLine)은 **순수 함수**로 분리해(향후 실데이터 도입 시 그대로 재사용)
 *    DB 없이 단위테스트한다.
 *
 * news-graph.ts/schedule-graph.ts 평행 패턴. ⚠️ 라인업은 LLM 감정 리액션을 생성하지 않으므로
 * lineup_compact 에는 /reaction 슬롯이 없다(L1).
 *
 * 🚧 ADR-052 잔여: 선발/타순 크롤러(예: 경기 임박 시 발표되는 선발 라인업) 도입 시
 *    fetchLineupData 가 실데이터(타순 1~9번 + 포지션 + 선수명)를 반환하도록 확장한다.
 *    현재는 데이터 소스 부재라 null 폴백만 동작한다.
 */
import { getPrisma } from '../utils/prisma';

/** 라인업 한 줄 (미리 포맷된 문자열 — 카드의 단일 Text 노드 1개에 대응) */
export interface LineupRow {
  line: string;
}

/**
 * 라인업 데이터 (lineup_compact 템플릿 bind 경로와 1:1).
 *   - team: 헤더 캡션(팀명)
 *   - rows.N.line: N번째 타순 한 줄(사전 포맷 문자열, 9타순)
 */
export interface LineupData {
  team: string;
  rows: LineupRow[];
}

/**
 * 단일 타순 정보(향후 선발 라인업 크롤러가 채울 최소 구조).
 * 현재는 데이터 소스가 없어 포맷 함수 단위테스트 용도로만 사용한다.
 */
export interface LineupSlot {
  order: number; // 타순(1~9)
  position: string | null; // 포지션(예: "중", "유", "지" 등). 없으면 생략.
  playerName: string | null; // 선수명. 없으면 '미정'.
}

/**
 * 타순 1슬롯 → 라인업 카드 한 줄 문자열(순수 함수).
 *
 * 포맷: `N번 (포지션) 선수명`
 *   예) "1번 (중) 홍길동" / 포지션 없으면 "1번 홍길동"
 *
 *  - 선수명 없으면 '미정' 폴백. 포지션 없으면 괄호 생략.
 *  - 향후 선발 라인업 실데이터 도입(ADR-052 잔여) 시 그대로 재사용한다.
 */
export function formatLineupLine(slot: LineupSlot): string {
  const name = (slot.playerName ?? '').trim();
  const safeName = name !== '' ? name : '미정';
  const pos = (slot.position ?? '').trim();
  const posTag = pos !== '' ? `(${pos}) ` : '';
  return `${slot.order}번 ${posTag}${safeName}`;
}

/**
 * lineup 카드용 실데이터를 조립해 LineupData 로 반환한다.
 *
 * ⚠️ 현재 DB 스키마에 선발 라인업/타순 테이블이 없어 **항상 null** 을 반환한다(정상 경로).
 *    EmitA2UI 가 null → "라인업은 경기 임박 시 공개돼요" 류 팀 톤 폴백 텍스트 카드로 방출한다.
 *    getPrisma() best-effort 로 접근만 시도하고(향후 확장 지점 명시), throw 하지 않는다.
 *
 * 🚧 ADR-052 잔여: 선발/타순 크롤러 도입 시 여기서 실데이터(타순 1~9번)를 조회해
 *    formatLineupLine 으로 9줄을 만들고 { team, rows } 로 반환한다.
 *
 * @param _teamId 팀 코드(향후 팀 라인업 조회용 — 현재 미사용)
 * @returns 항상 null(라인업 테이블 부재)
 */
export async function fetchLineupData(
  _teamId?: string,
): Promise<LineupData | null> {
  const prisma = getPrisma();
  if (!prisma) {
    return null; // DB 비활성(테스트/DATABASE_URL 없음) → best-effort null
  }

  // 현재 스키마에 선발 라인업 테이블이 없으므로 실데이터 조회 경로가 없다.
  // (크롤러 도입 전까지 null 이 정상 경로 — emit 폴백 텍스트 카드)
  return null;
}
