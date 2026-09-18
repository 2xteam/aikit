import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { notFound, requireViewer, serverError } from "@/lib/auth";
import { deleteKeys } from "@/lib/images";
import { refreshLogPreview } from "@/lib/logs";
import { getLogImageModel } from "@/models/LogImage";

/**
 * 이미지 한 장 지우기 — **R2 객체도 함께.**
 *
 * 보기(GET)는 `/api/img/[imageId]` 다. 지우기를 그쪽에 두지 않은 이유는
 * 그 라우트가 브라우저의 `<img src>` 가 직접 부르는 자리라서, 메서드를
 * 늘리면 캐시·프리페치가 건드릴 면이 넓어지기 때문이다.
 */
export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await ctx.params;
  if (!Types.ObjectId.isValid(imageId)) return notFound("그 이미지가 없어요.");

  const found = await requireViewer(req);
  if ("error" in found) return found.error;

  try {
    await connectDB();
    /* ⚠️ `_id` 와 `userId` 를 함께 본다 */
    const img = await getLogImageModel()
      .findOne({ _id: imageId, userId: found.viewer.userId })
      .lean()
      .exec();
    if (!img) return notFound("그 이미지가 없어요.");

    await deleteKeys([img.r2Key]);
    await getLogImageModel().deleteOne({ _id: imageId, userId: found.viewer.userId }).exec();
    await refreshLogPreview(String(img.logId));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
