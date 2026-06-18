/**
 * 지식 레벨 적응 footnote (P3-W9 9.5) — stats 카드 하단 정적 안내 노드 주입
 *
 * SSOT: Ref-docs/specs/design/batdi-architecture.md §5 (A2UI 팔레트),
 *       Ref-docs/specs/impl/batdi-development-plan.md 9.5 (지식 레벨 적응 UI)
 *
 * 사용자 지식 레벨(PersonalContext.profile.knowledgeLevel)에 따라 stats 카드(순위
 * standings / 선수 리더보드 player) 하단에 **정적 안내 footnote(Text 1노드)**를 덧붙인다.
 *  - beginner → 용어 설명 footnote
 *  - core     → 추가 없음(기본 카드 그대로)
 *  - expert   → 세이버메트릭스 안내 footnote
 *
 * ⚠️ CLAUDE.md 불변식 "팩트(수치)는 절대 LLM 생성 금지": 여기 텍스트는 LLM 미사용 정적
 *    용어 설명/세이버 안내일 뿐 수치·팩트를 일절 담지 않는다. footnote 노드는 bind 슬롯이
 *    없는 순수 정적 Text 라 DataBinder/데이터 모델 변경이 필요 없다.
 *
 * ⚠️ 캐시 포이즌(architecture §4.2): cacheKey 에 knowledgeLevel 차원이 없으므로, 레벨
 *    적응이 적용된(adapted=true) 카드는 호출부(emit-a2ui)에서 L0 write 를 SKIP 해야 한다.
 *    (이 모듈은 순수 함수로 적응 결과만 돌려주고, write 정책은 호출부가 책임진다.)
 */

/** 적응 가능한 stats 카드 종류 */
type StatType = 'standings' | 'player';

/** footnote 가 붙는 레벨(core 는 없음 — 기본 카드 그대로) */
type NoteLevel = 'beginner' | 'expert';

/**
 * statType × level 별 정적 안내 문구.
 * 밧디 톤, 수치/팩트 없음. player 는 타자/투수 구분 없이 일반 야구 용어로만 설명한다.
 */
const LEVEL_NOTES: Record<StatType, Record<NoteLevel, string>> = {
  standings: {
    beginner: '💡 승률은 이긴 경기 비율이고, 게임차는 1위 팀과 벌어진 정도예요.',
    expert: '📊 피타고리안 기대승률과 견줘 보면 운·실력의 괴리를 가늠할 수 있어요.',
  },
  player: {
    beginner: '💡 타율은 안타÷타수, OPS는 출루율+장타율을 더한 값이에요.',
    expert: '📊 wRC+·WAR 같은 세이버 지표까지 보면 기여도를 더 정확히 알 수 있어요.',
  },
};

/** level_note 노드 id (root.children 끝에 append) */
const LEVEL_NOTE_ID = 'level_note';

export interface LevelAdaptationResult {
  /** 적응 후 컴포넌트 인접 리스트 (적용 없으면 입력 원본 그대로) */
  components: Array<Record<string, unknown>>;
  /** footnote 노드가 실제로 추가됐는지 — true 면 호출부가 L0 캐시 write 를 SKIP */
  adapted: boolean;
}

/**
 * statType + knowledgeLevel 에 맞는 정적 안내 문구를 찾는다.
 * core 또는 statType undefined/매핑 없음 → undefined(적용 안 함).
 */
function resolveNote(
  statType: StatType | undefined,
  knowledgeLevel: 'beginner' | 'core' | 'expert',
): string | undefined {
  if (statType === undefined) {
    return undefined;
  }
  if (knowledgeLevel === 'core') {
    return undefined; // core 는 기본 카드 그대로(footnote 없음)
  }
  return LEVEL_NOTES[statType]?.[knowledgeLevel];
}

/**
 * stats 카드에 지식 레벨 footnote 를 주입한다(순수 함수).
 *
 * 적용 노트가 있으면(beginner/expert + 해당 statType 매핑 존재):
 *  - 입력 components 를 얕은 복제한 새 배열을 만들고,
 *  - root(id==='root') 노드의 children 끝에 'level_note' id 를 append,
 *  - `{ id:'level_note', component:'Text', text:<노트>, variant:'caption' }` 노드를 배열에 추가,
 *  - { components: 새배열, adapted: true } 반환.
 *
 * 적용할 노트가 없거나(core / statType undefined / 매핑 없음), root 식별 실패/children 부재면
 *  - 입력 components 원본을 변형 없이 그대로 반환하고 adapted:false (불변).
 *
 * ⚠️ 입력 배열·노드는 변형하지 않는다(원본 불변). 호출부는 adapted=true 일 때 L0 write 를 SKIP.
 */
export function applyLevelAdaptation(
  components: Array<Record<string, unknown>>,
  opts: {
    statType: StatType | undefined;
    knowledgeLevel: 'beginner' | 'core' | 'expert';
  },
): LevelAdaptationResult {
  const note = resolveNote(opts.statType, opts.knowledgeLevel);
  if (note === undefined) {
    // core / 미지원 statType / 매핑 없음 → 원본 그대로(불변).
    return { components, adapted: false };
  }

  // root(id==='root', 통상 Column) 식별 — children 배열을 가진 컨테이너여야 append 가능.
  const rootIndex = components.findIndex((c) => c.id === 'root');
  const root = rootIndex === -1 ? undefined : components[rootIndex];
  if (root === undefined) {
    return { components, adapted: false }; // root 없음 → 방어적 폴백
  }
  const children = root.children;
  if (!Array.isArray(children)) {
    return { components, adapted: false }; // children 부재/비배열 → 방어적 폴백
  }

  // 입력 불변: 새 배열 + root 노드 얕은 복제 + children 끝에 'level_note' append.
  const newRoot: Record<string, unknown> = {
    ...root,
    children: [...children, LEVEL_NOTE_ID],
  };
  const noteNode: Record<string, unknown> = {
    id: LEVEL_NOTE_ID,
    component: 'Text',
    text: note,
    variant: 'caption',
  };

  const next = components.slice();
  next[rootIndex] = newRoot;
  next.push(noteNode);

  return { components: next, adapted: true };
}
