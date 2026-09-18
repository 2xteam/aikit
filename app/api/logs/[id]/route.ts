import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { badRequest, notFound, requireViewer, serverError } from "@/lib/auth";
import { deleteKeys } from "@/lib/images";
import { getLogModel } from "@/models/Log";
import { getLogImageModel } from "@/models/LogImage";
import { getLogPromptModel } from "@/models/LogPrompt";

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
      prompts: prompts.map((p) => ({
        id: String(p._id),
        version: p.version,
        request: p.request,
        text: p.text,
        summary: p.summary,
        mood: p.mood,
        ratio: p.ratio,
        parentVersion: p.parentVersion,
        basePromptId: p.basePromptId ? String(p.basePromptId) : null,
        createdAt: p.createdAt,
      })),
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
