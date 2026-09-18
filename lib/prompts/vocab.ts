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

/* ─────────────────────── 사진에서 뽑는 것 — **피사체만** ─────────────────────── */

/**
 * ⚠️ **2026-09-18 기획 정정.** 전에는 장면·조명·색·구도까지 뽑았다.
 *
 * 그게 문제였다 — 기초 프롬프트가 이미 장면과 분위기를 정해 두는데 사진에서도
 * 같은 것을 뽑아 오니 **둘이 경쟁해서 논점이 흐려졌다.** 결과가 이도 저도 아니게 된다.
 *
 * 이제 역할을 자른다.
 *
 * | | 누가 정하나 |
 * |---|---|
 * | 장면 · 조명 · 색 · 구도 · 카메라 · **자세** | **기초 프롬프트** |
 * | 피사체의 생김새 — 얼굴 · 머리 · 장신구 · 옷 · 로고 · 신발 | **사진** (그대로 옮긴다) |
 *
 * 사진에서 뽑는 것은 **피사체의 생김새와 화면 속 문자**뿐이다.
 */

/** 피사체의 종류 */
export const SUBJECT_KINDS = ["person", "animal", "object", "product", "scene_element"] as const;

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
export const CAUTIONS = [
  "identifiable_face",
  "multiple_people",
  "possible_bystander",
  "possible_minor",
  "private_document",
  "low_quality",
] as const;

/** A-1 프롬프트에 끼워 넣을 값 후보. 표를 손으로 베끼지 않는다 */
export function renderPhotoVocab(): string {
  return [
    `subject kind: ${SUBJECT_KINDS.join(" | ")}`,
    `cautions: ${CAUTIONS.join(" | ")}`,
  ].join("\n");
}

/**
 * 라이브러리 쪽 태그 어휘 — **원본 데이터셋에서 온 것**이고 A-1 과 무관하다.
 * `prompts.tags` 가 이 값을 쓴다. 사진 분석과 맞물릴 일이 없어졌으므로
 * 더는 "같은 어휘를 봐야 한다" 는 제약이 없다.
 */
export const LIBRARY_TAG_VOCAB = {
  suitable_for: ["poster", "portrait", "social_card", "thumbnail", "product", "illustration"],
  framing: ["full_body", "half", "close_up", "wide", "object_only"],
  time_of_day: ["day", "golden_hour", "night"],
} as const;

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

/* ─────────────────────────────── 생성 비율 ─────────────────────────────── */

/**
 * 만들 이미지의 가로세로비 — **사용자가 UI 에서 고른다** (2026-09-18 사용자 지정).
 *
 * 왜 자동으로 정하지 않는가 — 같은 사진으로도 인스타 피드(4:5)와 스토리(9:16)는
 * 완전히 다른 구도를 요구한다. 원본 사진의 비율에서 유추하면 **거의 틀린다.**
 * 쓸 곳을 아는 것은 사용자뿐이다.
 *
 * 프롬프트에는 지식베이스의 여덟 토막 골격 중 **8절(OUTPUT)** 로 들어간다
 * (`vars` 의 `{RATIO}`). 기초 프롬프트에 박힌 비율이 있어도 **사용자 선택이 이긴다.**
 *
 * `hint` 는 칩 아래 작은 글씨다. 숫자만 보여 주면 무엇에 쓰는지 모른다.
 *
 * → my-obsidian-vault / 30-Patterns/프롬프트 지식베이스.md "바꿔 끼우는 자리"
 */
export const RATIOS = [
  { id: "4:5", ko: "세로 4:5", hint: "인스타 피드 · 포스터", value: 0.8 },
  { id: "9:16", ko: "세로 9:16", hint: "스토리 · 릴스 · 쇼츠", value: 0.5625 },
  { id: "1:1", ko: "정사각 1:1", hint: "프로필 · 썸네일", value: 1 },
  { id: "3:2", ko: "가로 3:2", hint: "사진 기본 · 블로그", value: 1.5 },
  { id: "16:9", ko: "가로 16:9", hint: "유튜브 · 배너 · 발표자료", value: 1.7778 },
] as const;

export type RatioId = (typeof RATIOS)[number]["id"];

/**
 * 기본값은 **세로 4:5**.
 *
 * 원본 데이터셋 27,549건의 비율 분포가 세로 19,573 · 정사각 4,259 · 가로 3,717 로
 * 세로가 압도적이었다(2026-09-18 실측). 기초 프롬프트 대부분이 세로 구도를
 * 전제로 쓰여 있다는 뜻이라, 기본값을 세로로 두는 쪽이 덜 어긋난다.
 */
export const DEFAULT_RATIO: RatioId = "4:5";

export function isRatioId(v: unknown): v is RatioId {
  return typeof v === "string" && RATIOS.some((r) => r.id === v);
}

export function ratioLabel(id: string): string {
  return RATIOS.find((r) => r.id === id)?.ko ?? id;
}

/**
 * 원본의 숫자 비율(1.49 · 0.56 …)을 가장 가까운 칩으로 옮긴다.
 * 라이브러리 카드에 "이 프롬프트는 원래 세로용" 을 보여 주는 데 쓴다.
 * **사용자의 선택을 덮지 않는다** — 참고 표시일 뿐이다.
 */
export function nearestRatio(value: number | null | undefined): RatioId | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  let best: RatioId | null = null;
  let bestGap = Infinity;
  for (const r of RATIOS) {
    const gap = Math.abs(Math.log(value) - Math.log(r.value));
    if (gap < bestGap) {
      bestGap = gap;
      best = r.id;
    }
  }
  return best;
}
