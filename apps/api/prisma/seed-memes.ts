/**
 * 밈 시드 데이터 (P3-W8 8.2 MemeGraph)
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md (meme intent),
 *       Ref-docs/specs/interface/batdi-db-schema.md D그룹 memes
 *
 * 책임:
 *  - 밧디 **자체 창작** 밈/응원 드립을 memes 테이블에 시드한다(저작권 무관, 전 연령 안전).
 *    우선 4팀(hanwha/doosan/kia/lotte) × 각 10건 + 팀 무관(teamId=null) 공통 5건.
 *  - 팀 톤 반영: 한화(충청), 기아(전라), 롯데(부산), 두산(서울 여유). 수치/실명 비방 금지.
 *  - source='seed' 가 이미 있으면 skip(idempotent), 없으면 createMany(재실행 안전).
 *
 * ⚠️ 시드 데이터는 LLM 이 아니라 사람이 작성한 정적 콘텐츠다(팩트 생성 금지 규칙 무관 — 유머).
 * ⚠️ MEME_SEED_DATA 상수는 단위테스트가 구조(개수/팀 분포)를 DB 없이 직접 검증한다.
 *
 * 실행(tsx 또는 ts-node):
 *   DATABASE_URL="postgresql://..." pnpm --filter @batdi/api exec tsx prisma/seed-memes.ts
 *   (tsx 미설치 시: pnpm --filter @batdi/api exec ts-node prisma/seed-memes.ts)
 */
import { PrismaClient } from '@prisma/client';

/** 시드 1건 입력 구조 (Prisma Meme 의 시드 대상 필드 부분집합) */
export interface MemeSeedInput {
  teamId: string | null;
  content: string;
  category: string;
  source: 'seed';
}

/** 시드 카테고리 — 응원/드립(자학금지 정신은 전 연령 안전 콘텐츠로 충족) */
type MemeCategory = '응원' | '드립';

/** 팀별 밈 생성 헬퍼 — teamId + (content, category) 쌍 배열 → MemeSeedInput[] */
function buildTeamMemes(
  teamId: string | null,
  pairs: ReadonlyArray<readonly [string, MemeCategory]>,
): MemeSeedInput[] {
  return pairs.map(([content, category]) => ({
    teamId,
    content,
    category,
    source: 'seed' as const,
  }));
}

/** 한화(충청 톤) — 각 10건 */
const HANWHA_MEMES = buildTeamMemes('hanwha', [
  ['어차피 우승은 한화여~ 올해는 느낌이 달러유!', '응원'],
  ['독수리 떴다~ 오늘도 화끈하게 날아보자유!', '응원'],
  ['괜찮어유, 야구는 9회말이 진짜여~', '드립'],
  ['대전 가면 다 가족이여~ 같이 응원하자!', '응원'],
  ['느긋하게 보자유, 우리 애들 결국 해낼 거여~', '드립'],
  ['오늘 경기 보러 대전 가야 쓰겄네유~', '드립'],
  ['한화 팬은 인내심이 보살이여~ 그래서 더 멋져!', '응원'],
  ['독수리 군단 화이팅이여~ 끝까지 응원혀!', '응원'],
  ['졌어도 괜찮어유, 내일 또 이기면 되는 거여~', '드립'],
  ['우리 팀 좋아하는 게 죄는 아니자녀~ 자랑스러워유!', '응원'],
]);

/** 두산(서울 여유 톤) — 각 10건 */
const DOOSAN_MEMES = buildTeamMemes('doosan', [
  ['역시 잠실의 주인은 우리 베어스지~', '응원'],
  ['곰들 오늘도 차분하게 한 점씩 쌓아보자고', '드립'],
  ['두산은 가을이 진짜야, 여유롭게 가자', '드립'],
  ['미라클 두산, 오늘도 믿고 본다', '응원'],
  ['잠실 직관 가는 길이 제일 설레는 거 알지?', '드립'],
  ['베어스 팬은 우아하게 응원하는 거야~', '응원'],
  ['천천히 가도 결국 우리가 웃는다니까', '드립'],
  ['곰 같은 뚝심으로 끝까지 밀어붙이자', '응원'],
  ['오늘도 잠실 가득 채우고 함성 한번 가자!', '응원'],
  ['두산은 클래스가 다르지, 여유 있게 보자고', '드립'],
]);

/** 기아(전라 톤) — 각 10건 */
const KIA_MEMES = buildTeamMemes('kia', [
  ['아따 호랑이 기운이 넘쳐부러~ 오늘도 이긴다잉!', '응원'],
  ['광주 챔피언스필드로 다 모태부러~ 같이 응원허세!', '응원'],
  ['타이거즈는 우승 DNA가 있응께 걱정 말랑께', '드립'],
  ['오메 오늘 경기 겁나게 재밌겄네잉~', '드립'],
  ['우리 기아가 최고제~ 끝까지 믿고 가부러!', '응원'],
  ['호랑이는 굶어도 풀은 안 묵는당께, 자존심으로 간다!', '드립'],
  ['광주 양반들 다 일어나서 응원 한번 허세!', '응원'],
  ['긍께 우리 타이거즈가 젤로 멋지당께~', '응원'],
  ['졌어도 괜찮해야~ 다음에 또 이기면 되제잉', '드립'],
  ['기아 팬인 게 자랑스러워부러~ 화이팅이여!', '응원'],
]);

/** 롯데(부산 톤) — 각 10건 */
const LOTTE_MEMES = buildTeamMemes('lotte', [
  ['마! 사직 가면 다 부산 사나이 아이가~', '드립'],
  ['갈매기 떴다 아이가~ 오늘도 신나게 응원하자!', '응원'],
  ['우리 롯데는 끝까지 안 죽는다 아이가~', '드립'],
  ['주황색 봉다리 흔들 준비 됐나~ 가자!', '응원'],
  ['사직 노래방 오픈! 다 같이 응원가 부르자 아이가', '드립'],
  ['롯데 팬은 의리로 똘똘 뭉친다 아이가~', '응원'],
  ['오늘 경기 무조건 이긴다, 내가 다 봤다 아이가', '드립'],
  ['부산 갈매기들 다 모여라~ 함성 한번 가자!', '응원'],
  ['졌다고 우나? 내일 또 이기면 된다 아이가~', '드립'],
  ['우리 롯데 사랑하는 거 자랑이다 아이가~ 화이팅!', '응원'],
]);

/** 팀 무관 공통(teamId=null) — 5건 */
const COMMON_MEMES: MemeSeedInput[] = [
  { teamId: null, content: '야구는 인생이야, 9회말 투아웃에도 희망은 있어!', category: '드립', source: 'seed' },
  { teamId: null, content: '오늘도 직관 가는 사람? 같이 목 터지게 응원하자!', category: '응원', source: 'seed' },
  { teamId: null, content: '내 팀이 최고야, 그게 야구 팬의 국룰이지~', category: '드립', source: 'seed' },
  { teamId: null, content: '비 안 오면 무조건 야구 보는 날이지!', category: '드립', source: 'seed' },
  { teamId: null, content: '승패를 떠나 끝까지 응원하는 게 진짜 팬이야!', category: '응원', source: 'seed' },
];

/**
 * 전체 밈 시드 데이터 상수(테스트 검증용 export).
 * 4팀 × 10건 + 공통 5건 = 45건. createMany 입력으로 그대로 사용한다.
 */
export const MEME_SEED_DATA: MemeSeedInput[] = [
  ...HANWHA_MEMES,
  ...DOOSAN_MEMES,
  ...KIA_MEMES,
  ...LOTTE_MEMES,
  ...COMMON_MEMES,
];

/**
 * memes 테이블에 시드 데이터를 적재한다(idempotent).
 *
 *  - source='seed' 가 이미 있으면(count>0) skip → 재실행 안전.
 *  - 없으면 MEME_SEED_DATA 를 createMany 로 일괄 삽입.
 *
 * @param prisma PrismaClient (엔트리 또는 다른 시드 스크립트가 주입)
 * @returns 삽입한 건수(skip 시 0)
 */
export async function seedMemes(prisma: PrismaClient): Promise<number> {
  const existing = await prisma.meme.count({ where: { source: 'seed' } });
  if (existing > 0) {
    // 이미 시드됨 → 중복 삽입 방지(idempotent).
    // eslint-disable-next-line no-console
    console.log(`[seed-memes] skip — source='seed' 이미 ${existing}건 존재`);
    return 0;
  }
  const result = await prisma.meme.createMany({ data: MEME_SEED_DATA });
  // eslint-disable-next-line no-console
  console.log(`[seed-memes] ${result.count}건 시드 완료`);
  return result.count;
}

/**
 * tsx/ts-node 직접 실행 엔트리(`require.main === module`).
 * DATABASE_URL 환경변수로 PostgreSQL 에 연결해 seedMemes 실행 후 disconnect.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedMemes(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// CommonJS 엔트리 가드 — import 로 쓰일 땐 실행 안 함, 직접 실행 시에만 main().
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed-memes] 실패:', err);
    process.exitCode = 1;
  });
}
