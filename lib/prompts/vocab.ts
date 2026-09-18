/**
 * 어휘 원본 — **여기 하나뿐이다.**
 *
 * 사진 분석(A-1)이 뱉는 태그와 라이브러리의 태그가 같은 말을 써야 매칭이 된다.
 * 어휘가 갈리면 검색은 되는데 **추천이 조용히 빈다.** 그래서 A-1 시스템
 * 프롬프트의 "값 후보" 표도 이 파일에서 만들어 낸다 — 문서 두 벌을 손으로
 * 맞추면 언젠가 한쪽만 고쳐진다.
 *
 * → my-obsidian-vault / 30-Patterns/프롬프트 지식베이스.md
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ③
 */

/* ─────────────────────────────── 분위기 — 고르는 축 ─────────────────────────────── */

/**
 * ⚠️ **고르는 축은 소재가 아니라 분위기다.**
 *
 * "러닝 사진용"이 아니라 "시네마틱하게 / 필름 느낌으로 / 흑백 다큐로".
 * 같은 사진이 분위기에 따라 전혀 다른 결과가 된다. 소재별로 쌓으면
 * 경우의 수가 무한히 늘고, 정작 사용자는 느낌을 고른다.
 *
 * ⚠️ **12개가 한 화면에 들어가는 상한이다.** 늘리려면 칩 화면부터 본다.
 * 프롬프트 하나에 mood 는 **하나**다. 둘 이상이면 프롬프트를 쪼갠다.
 */
export const MOODS = [
  { id: "cinematic", ko: "시네마틱", hint: "낮은 채도 · 와이드 · 영화 스틸" },
  { id: "editorial", ko: "화보", hint: "잡지 · 정제된 조명 · 여백" },
  { id: "film", ko: "필름", hint: "그레인 · 색 바램 · 35mm" },
  { id: "vintage", ko: "빈티지", hint: "70~90년대 · 노랑끼 · 낡은 질감" },
  { id: "neon_night", ko: "네온 야경", hint: "도시 · 반사 · 강한 색광" },
  { id: "soft_daylight", ko: "부드러운 낮광", hint: "창가 · 확산광 · 파스텔" },
  { id: "monochrome", ko: "흑백", hint: "강한 대비 · 다큐" },
  { id: "dreamy", ko: "몽환", hint: "블룸 · 안개 · 얕은 심도" },
  { id: "bold_graphic", ko: "강한 그래픽", hint: "포스터 · 큰 타이포 · 원색" },
  { id: "minimal", ko: "미니멀", hint: "단색 배경 · 여백 · 군더더기 없음" },
  { id: "illustration", ko: "일러스트", hint: "손그림 · 수채 · 애니" },
  { id: "retro_print", ko: "레트로 인쇄", hint: "리소그래프 · 하프톤 · 종이 질감" },
] as const;

export type MoodId = (typeof MOODS)[number]["id"];

export const MOOD_IDS = MOODS.map((m) => m.id) as readonly MoodId[];

export function moodLabel(id: string): string {
  return MOODS.find((m) => m.id === id)?.ko ?? id;
}

export function isMoodId(v: unknown): v is MoodId {
  return typeof v === "string" && MOOD_IDS.includes(v as MoodId);
}

/* ─────────────────────── 사진 태그 — A-1 이 뱉고 라이브러리가 받는다 ─────────────────────── */

/**
 * A-1 시스템 프롬프트의 "값 후보" 표와 **같은 목록**이다.
 * 이 객체에서 표를 만들어 프롬프트에 끼워 넣는다 → lib/prompts/system/analyze.ts
 */
export const TAG_VOCAB = {
  framing: ["full_body", "half", "close_up", "wide", "object_only", "none"],
  place: ["street", "indoor", "nature", "gym", "stadium", "cafe", "studio", "other"],
  time_of_day: ["day", "golden_hour", "night", "unknown"],
  light_source: ["natural", "flash", "streetlight", "indoor", "mixed", "unknown"],
  contrast: ["high", "medium", "low"],
  color_mood: ["warm", "cool", "neutral"],
  suitable_for: ["poster", "portrait", "social_card", "thumbnail", "product", "illustration"],
  /**
   * ⚠️ `cautions` 는 분석용이 아니라 **제품 동작에 쓰인다.**
   *
   *   multiple_people · possible_bystander → 공유 화면의 제3자 동의 문장을 강조
   *   possible_minor                       → 공유 체크박스를 잠근다
   *   private_document                     → 업로드 단계에서 경고
   *   low_quality                          → 다시 찍으라고 안내
   *
   * ⚠️ **법적 판단으로 쓰지 않는다.** 모델이 틀린다. 한 번 더 묻는 트리거일 뿐이고
   * 동의 책임은 사용자에게 있다.
   */
  cautions: [
    "identifiable_face",
    "multiple_people",
    "possible_bystander",
    "possible_minor",
    "private_document",
    "low_quality",
  ],
} as const;

export type TagVocabKey = keyof typeof TAG_VOCAB;

/** A-1 프롬프트에 끼워 넣을 "값 후보" 블록을 만든다. 표를 손으로 베끼지 않는다 */
export function renderTagVocab(): string {
  return (Object.keys(TAG_VOCAB) as TagVocabKey[])
    .map((k) => `${k}: ${TAG_VOCAB[k].join(" | ")}`)
    .join("\n");
}

/** 모델이 어휘 밖의 값을 뱉으면 버린다. 억지로 맞추지 않는다 */
export function keepKnown<K extends TagVocabKey>(key: K, values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const allowed = TAG_VOCAB[key] as readonly string[];
  return values.filter((v): v is string => typeof v === "string" && allowed.includes(v));
}

/* ───────────────────────────── 원본 데이터셋의 category ───────────────────────────── */

/**
 * ⚠️ **`category` 로는 거를 수 없다** (2026-09-18 실측).
 *
 * 볼트의 적재 지침은 "로고 · 게임 에셋 · 이커머스 상품컷 …" 을 버리는
 * 화이트리스트를 가정했는데, 표본 565건의 category 는 **세 종류뿐**이었다 —
 * Content Creation 422 · Entertainment 96 · Commercial 47.
 * 그 축으로는 아무것도 걸러지지 않는다.
 *
 * `spec.safety_rating` 도 표본이 **100% "Safe for Work"** 라 마찬가지다.
 *
 * 그래서 실제로 거르는 축은 **태그와 mood 자동 분류**다 → scripts/prompts-filter.mjs
 */
export const SOURCE_CATEGORIES = ["Content Creation", "Entertainment", "Commercial"] as const;
