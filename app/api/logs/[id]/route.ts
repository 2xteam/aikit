import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { badRequest, notFound, requireViewer, serverError } from "@/lib/auth";
import { deleteKeys } from "@/lib/images";
import { getLogModel } from "@/models/Log";
import { getLogImageModel } from "@/models/LogImage";
import { getLogPromptModel } from "@/models/LogPrompt";
import { getPromptModel } from "@/models/Prompt";
import { moodLabel } from "@/lib/prompts/vocab";

/**
 * 묶음 하나 — 상세 / 제목·메모 수정 / 삭제.
 *
 * ⚠️ 모든 조회가 `{_id, userId}` 를 **함께** 본다. id 만 보고 읽거나 지우면
 * 남의 묶음 id 를 넣어 건드릴 수 있다
 * → my-obsidian-vault / 30-Patterns/인증과 세션 공유.md "기록 API의 소유자 확인"
 */
export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) return notFound("그 묶음이 없어요.");

  const found = await requireViewer(req);
  if ("error" in found) return found.error;
  const userId = found.viewer.userId;

  try {
    await connectDB();
    const log = await getLogModel().findOne({ _id: id, userId }).lean().exec();
    if (!log) return notFound("그 묶음이 없어요.");

    const [images, prompts] = await Promise.all([
      getLogImageModel().find({ logId: id, userId }).sort({ role: 1, order: 1 }).lean().exec(),
      getLogPromptModel().find({ logId: id, userId }).sort({ version: 1 }).lean().exec(),
    ]);

    /*
      **어느 기초 프롬프트에서 출발했는지**를 함께 준다 (2026-09-19 사용자 지정).
      두 달 뒤에 열었을 때 "무엇을 골랐더라" 가 남아 있어야 한다.

      ⚠️ 라이브러리에서 그 프롬프트가 내려가도(원저작자 요청) 묶음은 살아야 하므로
      **없으면 없는 대로** 넘어간다. `log_prompts.mood` 에 분위기가 따로 남아 있어
      최소한 무엇을 골랐는지는 안다.

      ⚠️ `body`(기초 프롬프트 본문)는 **싣지 않는다.** 사용자가 받는 것은 완성된
      프롬프트이지 기초가 아니다 → lib/prompts/library.ts
    */
    const baseIds = [...new Set(prompts.map((p) => p.basePromptId).filter(Boolean))];
    const bases = baseIds.length
      ? await getPromptModel()
          .find({ _id: { $in: baseIds } }, { body: 0 })
          .lean()
          .exec()
      : [];
    const baseById = new Map(bases.map((b) => [String(b._id), b]));

    return NextResponse.json({
      ok: true,
      log: {
        id: String(log._id),
        title: log.title,
        memo: log.memo,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt,
      },
      /* ⚠️ `r2Key` 를 싣지 않는다. 주소는 앱 라우트가 만든다 */
      images: images.map((i) => ({
        id: String(i._id),
        role: i.role,
        promptVersion: i.promptVersion,
        width: i.width,
        height: i.height,
        bytes: i.bytes,
        order: i.order,
      })),
      prompts: prompts.map((p) => {
        const b = p.basePromptId ? baseById.get(String(p.basePromptId)) : null;
        return {
          id: String(p._id),
          version: p.version,
          request: p.request,
          text: p.text,
          summary: p.summary,
          mood: p.mood,
          moodKo: p.mood ? moodLabel(p.mood) : "",
          ratio: p.ratio,
          parentVersion: p.parentVersion,
          /*
            고른 기초 프롬프트. 두 갈래다 —
              library  라이브러리에서 골랐다. 썸네일과 출처가 있다.
                       내려갔으면 `base` 가 null 이지만 제목은 baseTitle 에 남는다
              image    레퍼런스 이미지에서 뽑았다. 그 이미지는 **저장하지 않았으므로**
                       썸네일이 없다. 본문은 baseText 에 있다
          */
          baseSource: p.baseSource ?? "library",
          baseTitle: p.baseTitle || (b ? b.titleKo || b.title || b.slug : ""),
          /* 뽑아낸 본문은 보여 준다 — 어디에도 다시 찾을 곳이 없다 */
          baseText: p.baseSource === "image" ? p.baseText : "",
          /* 무엇을 보고 만들었는지. 지운 이미지를 가리킬 수 있으니 화면이 감당한다 */
          referenceImageId: p.referenceImageId ? String(p.referenceImageId) : null,
          base: b
            ? {
                id: String(b._id),
                title: b.titleKo || b.title || b.slug,
                blurb: b.blurb || "",
                thumb: (b.examples ?? []).find((e) => !e.broken)?.url ?? null,
                credit: {
                  author: b.sourceAuthor || "",
                  link: b.sourceLink || "",
                  license: b.license || "",
                  modified: b.modified,
                },
              }
            : null,
          createdAt: p.createdAt,
        };
      }),
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) return notFound("그 묶음이 없어요.");

  const found = await requireViewer(req);
  if ("error" in found) return found.error;

  let body: { title?: string; memo?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("JSON 본문이 필요합니다.");
  }

  const set: Record<string, string> = {};
  if (typeof body.title === "string") set.title = body.title.trim().slice(0, 80);
  if (typeof body.memo === "string") set.memo = body.memo.trim().slice(0, 2000);
  if (Object.keys(set).length === 0) return badRequest("바꿀 값이 없어요.");

  try {
    await connectDB();
    const res = await getLogModel()
      .updateOne({ _id: id, userId: found.viewer.userId }, { $set: set })
      .exec();
    if (res.matchedCount === 0) return notFound("그 묶음이 없어요.");
    return NextResponse.json({ ok: true, set });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * 삭제 — **R2 객체까지 함께 지운다.** 고아 객체는 눈에 안 보이면서 용량만 먹는다.
 *
 * 순서가 중요하다. 키를 **먼저 모으고**, R2 를 지우고, 그 다음 DB 를 지운다.
 * DB 를 먼저 지우면 R2 지우기가 실패했을 때 어떤 키가 남았는지 알 길이 없다.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) return notFound("그 묶음이 없어요.");

  const found = await requireViewer(req);
  if ("error" in found) return found.error;
  const userId = found.viewer.userId;

  try {
    await connectDB();
    const log = await getLogModel().findOne({ _id: id, userId }, { _id: 1 }).lean().exec();
    if (!log) return notFound("그 묶음이 없어요.");

    const images = await getLogImageModel().find({ logId: id, userId }, { r2Key: 1 }).lean().exec();
    const { failed } = await deleteKeys(images.map((i) => i.r2Key));

    await Promise.all([
      getLogImageModel().deleteMany({ logId: id, userId }).exec(),
      getLogPromptModel().deleteMany({ logId: id, userId }).exec(),
      getLogModel().deleteOne({ _id: id, userId }).exec(),
    ]);

    /* 지우지 못한 객체가 있어도 삭제는 성공이다. 사용자에게는 끝난 일이다 */
    return NextResponse.json({ ok: true, orphanKeys: failed.length });
  } catch (e) {
    return serverError(e);
  }
}
