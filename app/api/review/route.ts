import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { badRequest, notFound, serverError } from "@/lib/auth";
import { getPromptModel } from "@/models/Prompt";
import { isMoodId, MOOD_IDS } from "@/lib/prompts/vocab";
import { markKept, markPending, markRejected, patchCuration } from "@/lib/prompts/curation";

/**
 * ⑦ 검수 — **로컬 전용 도구다.**
 *
 * ⚠️ 판단을 `content/prompts/*.json` 에 쓴다. Vercel 의 파일 시스템은 읽기
 * 전용이라 **운영에서는 동작할 수 없다.** 그래서 프로덕션 빌드에서는 아예 404 로
 * 막는다 — 반쯤 되는 화면을 열어 두면 눌러 보고 "저장이 안 된다"고 겪게 된다.
 *
 * 세션을 요구하지 않는 유일한 라우트다. 로컬 개발에서만 닿을 수 있고(아래 가드),
 * 여기서 로그인을 요구하면 검수를 하려고 포털까지 띄워야 한다.
 * **이 가드를 지우면 안 된다.**
 */
export const runtime = "nodejs";

function devOnly(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return null;
}

/** 검수 목록 — 본문까지 준다. 프롬프트를 읽지 않고는 판단할 수 없다 */
export async function GET(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const url = new URL(req.url);
  const mood = url.searchParams.get("mood");
  if (!isMoodId(mood)) return badRequest("분위기를 골라 주세요.", { moods: MOOD_IDS });

  const status = url.searchParams.get("status") ?? "all";

  try {
    await connectDB();
    const Prompt = getPromptModel();

    const filter: Record<string, unknown> = { mood, disabled: false };
    if (status === "pending" || status === "kept" || status === "rejected") {
      filter.reviewStatus = status;
    }

    const [items, counts] = await Promise.all([
      Prompt.find(filter)
        .sort({ reviewStatus: 1, featured: -1, createdAt: -1 })
        .limit(80)
        .lean()
        .exec(),
      Prompt.aggregate([
        { $match: { mood, disabled: false } },
        { $group: { _id: "$reviewStatus", n: { $sum: 1 } } },
      ]).exec(),
    ]);

    const tally = { pending: 0, kept: 0, rejected: 0 };
    for (const c of counts) {
      if (c._id in tally) tally[c._id as keyof typeof tally] = c.n;
    }

    return NextResponse.json({
      ok: true,
      mood,
      tally,
      items: items.map((d) => ({
        id: String(d._id),
        sourceId: d.sourceId,
        title: d.titleKo || d.title,
        titleEn: d.title,
        titleKo: d.titleKo,
        /* 본문은 길다. 판단에 필요한 만큼만 자르고 전체는 펼쳐 볼 수 있게 */
        body: d.body,
        charCount: d.charCount,
        mood: d.mood,
        tags: d.tags?.raw ?? [],
        examples: (d.examples ?? []).map((e) => e.url),
        suggestedRatio: d.vars?.find((v) => v.key === "RATIO")?.defaultValue ?? null,
        featured: d.featured,
        reviewStatus: d.reviewStatus,
        credit: { author: d.sourceAuthor, link: d.sourceLink, license: d.license },
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}

/** 판단 한 건 — 파일에 먼저 쓰고 DB 에 반영한다 */
export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  let body: {
    id?: string;
    action?: "keep" | "reject" | "pending" | "feature" | "mood" | "title";
    reason?: string;
    mood?: string;
    featured?: boolean;
    titleKo?: string;
  };
  try {
    body = await req.json();
  } catch {
    return badRequest("JSON 본문이 필요합니다.");
  }

  const { id, action } = body;
  if (!id || !action) return badRequest("id 와 action 이 필요합니다.");

  try {
    await connectDB();
    const Prompt = getPromptModel();
    const doc = await Prompt.findById(id).exec();
    if (!doc) return notFound("그 프롬프트가 없어요.");

    const now = new Date();
    const set: Record<string, unknown> = { reviewedAt: now };

    switch (action) {
      case "keep":
        /*
          파일이 원본이다. 파일 쓰기가 실패하면 DB 도 건드리지 않는다 —
          둘이 어긋나면 어느 쪽이 맞는지 알 수 없게 된다.
        */
        await markKept(doc.sourceId, { mood: doc.mood ?? undefined });
        set.reviewStatus = "kept";
        break;
      case "reject":
        await markRejected(doc.sourceId, body.reason ?? "검수에서 제외");
        set.reviewStatus = "rejected";
        break;
      case "pending":
        await markPending(doc.sourceId);
        set.reviewStatus = "pending";
        set.reviewedAt = null;
        break;
      case "feature": {
        const featured = Boolean(body.featured);
        await patchCuration(doc.sourceId, { featured });
        set.featured = featured;
        break;
      }
      case "mood": {
        if (!isMoodId(body.mood)) return badRequest("모르는 분위기예요.");
        await patchCuration(doc.sourceId, { mood: body.mood });
        set.mood = body.mood;
        break;
      }
      case "title": {
        const titleKo = (body.titleKo ?? "").trim().slice(0, 80);
        await patchCuration(doc.sourceId, { titleKo });
        set.titleKo = titleKo;
        break;
      }
      default:
        return badRequest("모르는 action 이에요.");
    }

    await Prompt.updateOne({ _id: id }, { $set: set }).exec();
    return NextResponse.json({ ok: true, id, set });
  } catch (e) {
    return serverError(e);
  }
}
