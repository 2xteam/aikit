import { connectDB } from "@/lib/db";
import { getPromptModel, type PromptDocument } from "@/models/Prompt";
import { MOODS, type MoodId } from "@/lib/prompts/vocab";

/**
 * 라이브러리 읽기 — **2단 구조**로 보여 준다 (2026-09-18 사용자 지정).
 *
 * ```
 * 1단계  분위기 12칸 격자. 각 칸에 대표 이미지 한 장
 * 2단계  고른 분위기 안의 60건. 예시 이미지로 고른다
 * ```
 *
 * 720건을 한 줄로 늘어놓으면 carat.im · yolly.ai 와 똑같은 범용 프롬프트
 * 갤러리가 된다. **고르는 축은 분위기다** — 소재가 아니라 느낌.
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ⑤
 */

/** 화면에 나가는 모양. ⚠️ `body` 는 목록에 싣지 않는다 — 720건이면 응답이 2MB 가 넘는다 */
export type PromptCard = {
  id: string;
  slug: string;
  title: string;
  blurb: string;
  mood: string;
  charCount: number;
  examples: string[];
  /** 원본이 전제한 비율. **사용자 선택을 덮지 않는다** — 참고 표시일 뿐이다 */
  suggestedRatio: string | null;
  verified: boolean;
  featured: boolean;
  /** CC BY 4.0 의 표기 조건. 카드 하단에 그대로 찍는다 */
  credit: { author: string; link: string; license: string; modified: boolean };
};

export type MoodCard = {
  id: MoodId;
  ko: string;
  hint: string;
  count: number;
  /** 대표 이미지. 그 분위기에 쓸 만한 게 하나도 없으면 null */
  coverUrl: string | null;
};

/**
 * 목록의 정렬 — **검증된 것을 위로.**
 *
 * `verified` 는 실제로 이미지를 만들어 확인한 것만 true 다. 지금은 전부 false 라
 * 사실상 `featured` → 최신 순으로 동작한다. 검수를 하면 자연히 위로 올라온다.
 */
const ORDER = { verified: -1 as const, featured: -1 as const, createdAt: -1 as const };

function toCard(d: PromptDocument): PromptCard {
  return {
    id: String(d._id),
    slug: d.slug,
    /* 한국어 제목이 있으면 그걸 쓴다. 번역은 큐레이션이 채운다 */
    title: d.titleKo || d.title || d.slug,
    blurb: d.blurb || "",
    mood: d.mood ?? "",
    charCount: d.charCount,
    examples: (d.examples ?? []).filter((e) => !e.broken).map((e) => e.url),
    suggestedRatio: d.vars?.find((v) => v.key === "RATIO")?.defaultValue || null,
    verified: d.verified,
    featured: d.featured,
    credit: {
      author: d.sourceAuthor || "",
      link: d.sourceLink || "",
      license: d.license || "",
      modified: d.modified,
    },
  };
}

/**
 * 1단계 — 분위기 12칸.
 *
 * 대표 이미지는 **질의 한 번으로** 뽑는다. 12번 따로 물으면 화면이 12번 기다린다.
 * 정렬을 고정해 두었으므로 열 때마다 대표가 바뀌지 않는다 — 바뀌면 같은 칸을
 * 못 알아본다.
 */
export async function listMoods(): Promise<MoodCard[]> {
  await connectDB();

  const rows = await getPromptModel()
    .aggregate<{ _id: string; count: number; cover: string[] }>([
      { $match: { disabled: false, mood: { $ne: null } } },
      /* 정렬을 그룹보다 **먼저** 해야 $first 가 대표를 집는다 */
      { $sort: { mood: 1, ...ORDER } },
      {
        $group: {
          _id: "$mood",
          count: { $sum: 1 },
          /* 깨진 것을 거를 수 있게 첫 문서의 예시를 통째로 가져온다 */
          cover: { $first: "$examples.url" },
        },
      },
    ])
    .exec();

  const byId = new Map(rows.map((r) => [r._id, r]));

  /* 건수가 0인 분위기도 **자리를 지킨다.** 칸이 사라지면 구멍인지 알 수 없다 */
  return MOODS.map((m) => {
    const row = byId.get(m.id);
    return {
      id: m.id,
      ko: m.ko,
      hint: m.hint,
      count: row?.count ?? 0,
      coverUrl: row?.cover?.[0] ?? null,
    };
  });
}

/**
 * 2단계 — 한 분위기 안의 목록.
 *
 * `body` 를 빼고 보낸다. 60건의 본문이면 응답이 100KB 를 넘는데, 목록에서는
 * 한 글자도 쓰지 않는다. 본문은 고른 뒤에 서버가 직접 읽는다 — 브라우저로
 * 내려보낼 이유가 없다.
 */
export async function listPrompts(
  mood: MoodId,
  { limit = 24, skip = 0 }: { limit?: number; skip?: number } = {},
): Promise<{ items: PromptCard[]; total: number }> {
  await connectDB();
  const Prompt = getPromptModel();
  const filter = { disabled: false, mood };

  const [docs, total] = await Promise.all([
    Prompt.find(filter, { body: 0 })
      .sort(ORDER)
      .skip(Math.max(0, skip))
      .limit(Math.min(60, Math.max(1, limit)))
      .lean<PromptDocument[]>()
      .exec(),
    Prompt.countDocuments(filter).exec(),
  ]);

  return { items: docs.map(toCard), total };
}

/**
 * 프롬프트 하나 — **본문까지.** 생성 요청이 이걸 기초로 쓴다.
 *
 * ⚠️ 이 함수의 결과를 그대로 브라우저에 내려보내지 않는다. `body` 는 서버가
 * OpenAI 에 보낼 때만 쓴다. 사용자가 받는 것은 **완성된 프롬프트**이지
 * 기초 프롬프트가 아니다.
 */
export async function getPromptForGeneration(id: string) {
  await connectDB();
  return getPromptModel().findOne({ _id: id, disabled: false }).lean<PromptDocument>().exec();
}
