/**
 * MemeGraph 서비스 (P3-W8 8.2 — meme intent 팀별 밈 랜덤 응답)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (meme intent),
 *       CLAUDE.md "Service Subgraph 추가 절차"
 *
 * 책임:
 *  - meme intent 에서 팀별(또는 공통) 밈을 1건 랜덤 선택해 응답 텍스트로 반환한다.
 *  - getPrisma() best-effort 로 memes 테이블에서 `teamId 일치 OR teamId=null` 밈을 읽어
 *    랜덤 1건의 content 를 고른다. DB 비활성/빈 결과/에러 시 STATIC_MEMES 폴백.
 *  - 순수 헬퍼 pickRandom(배열에서 랜덤 1건)은 분리해 단위테스트가 직접 검증한다.
 *
 * ⚠️ 밈은 랜덤이라 **비결정** → L0 캐시 write 하지 않는다(현 meme=chat 경로가 이미 write
 *    안 함, emit-a2ui 에서 meme 분기도 write 생략으로 유지).
 * ⚠️ STATIC_MEMES 는 시드(seed-memes.ts)와 별개의 최소 정적 폴백 세트다(getPrisma 미동작/
 *    DB 빈 경우용). 전 연령 안전·실명 비방 금지·수치 없음.
 *
 * best-effort: fetchRandomMeme 은 절대 throw 하지 않고 항상 비어있지 않은 문자열을 반환한다.
 */
import { getPrisma } from '../utils/prisma';

/**
 * 정적 폴백 밈 세트 — 4팀 + 'default'(공통) 각 2~3건.
 * getPrisma 미동작(테스트/DATABASE_URL 없음) 또는 DB 빈 결과 시 여기서 랜덤 폴백.
 * 팀 톤 반영(한화 충청/기아 전라/롯데 부산/두산 서울 여유).
 */
export const STATIC_MEMES: Record<string, string[]> = {
  hanwha: [
    '어차피 우승은 한화여~ 올해는 느낌이 달러유!',
    '독수리 떴다~ 오늘도 화끈하게 날아보자유!',
    '괜찮어유, 야구는 9회말이 진짜여~',
  ],
  doosan: [
    '역시 잠실의 주인은 우리 베어스지~',
    '미라클 두산, 오늘도 믿고 본다',
    '천천히 가도 결국 우리가 웃는다니까',
  ],
  kia: [
    '아따 호랑이 기운이 넘쳐부러~ 오늘도 이긴다잉!',
    '우리 기아가 최고제~ 끝까지 믿고 가부러!',
    '광주 챔피언스필드로 다 모태부러~ 같이 응원허세!',
  ],
  lotte: [
    '마! 사직 가면 다 부산 사나이 아이가~',
    '갈매기 떴다 아이가~ 오늘도 신나게 응원하자!',
    '우리 롯데는 끝까지 안 죽는다 아이가~',
  ],
  default: [
    '야구는 인생이야, 9회말 투아웃에도 희망은 있어!',
    '오늘도 직관 가는 사람? 같이 목 터지게 응원하자!',
    '내 팀이 최고야, 그게 야구 팬의 국룰이지~',
  ],
};

/**
 * 배열에서 랜덤 1건을 반환하는 순수 헬퍼.
 * 빈 배열이면 undefined(호출부가 폴백 처리). Math.random() 사용(agent 런타임 OK).
 */
export function pickRandom<T>(arr: readonly T[]): T | undefined {
  if (arr.length === 0) {
    return undefined;
  }
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

/**
 * STATIC_MEMES 에서 팀(없으면 default) 밈을 랜덤 1건 반환(항상 비어있지 않음).
 * 팀 키가 없으면 default 로 폴백. default 마저 비면(이론상 없음) 안전 문구.
 */
function staticFallback(teamId: string | null | undefined): string {
  const key = teamId && STATIC_MEMES[teamId] ? teamId : 'default';
  const candidates: string[] = STATIC_MEMES[key] ?? STATIC_MEMES.default ?? [];
  const picked = pickRandom(candidates);
  // STATIC_MEMES.default 는 비어있지 않으므로 picked 는 사실상 항상 string.
  return picked ?? '오늘도 같이 야구 보면서 신나게 응원하자!';
}

/**
 * meme intent 응답용 밈 1건을 반환한다(팀별 또는 공통, 랜덤).
 *
 * best-effort:
 *  - getPrisma() 있으면 memes 테이블에서 `teamId 일치 OR teamId=null` 밈을 읽어 랜덤 1건
 *    content. 빈 content 는 제외하고 고른다.
 *  - getPrisma 없음/빈 결과/throw → STATIC_MEMES 랜덤 폴백.
 *  - **항상 비어있지 않은 문자열 반환**(throw 금지).
 *
 * @param teamId 사용자 응원 팀 코드(undefined/null 가능 → 공통 + default 폴백).
 * @returns 밈 텍스트(비어있지 않음)
 */
export async function fetchRandomMeme(
  teamId: string | null | undefined,
): Promise<string> {
  const prisma = getPrisma();
  if (!prisma) {
    return staticFallback(teamId); // DB 비활성(테스트/DATABASE_URL 없음) → 정적 폴백
  }

  try {
    const rows = (await prisma.meme.findMany({
      where: {
        // 팀 밈 + 팀 무관(공통) 밈을 함께 후보로 둔다.
        OR: [{ teamId: teamId ?? null }, { teamId: null }],
      },
    })) as Array<{ content: string | null }>;

    // 빈 content 제외(스키마상 content 는 nullable).
    const candidates = rows
      .map((r) => r.content)
      .filter((c): c is string => typeof c === 'string' && c.trim() !== '');

    const picked = pickRandom(candidates);
    if (picked === undefined) {
      return staticFallback(teamId); // 빈 결과 → 정적 폴백
    }
    return picked;
  } catch {
    // 연결/쿼리 실패 → best-effort 정적 폴백(그래프 실행 막지 않음).
    return staticFallback(teamId);
  }
}
