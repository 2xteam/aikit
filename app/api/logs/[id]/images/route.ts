import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { badRequest, notFound, requireViewer, serverError } from "@/lib/auth";
import { describeR2Error } from "@/lib/r2";
import { isAllowedType, makeKey, MAX_UPLOAD_BYTES, putImage, deleteKeys } from "@/lib/images";
import { refreshLogPreview } from "@/lib/logs";
import { getLogModel } from "@/models/Log";
import { getLogImageModel, type LogImageRole } from "@/models/LogImage";

/**
 * 이미지 올리기 — **서버를 거친다** (버킷 CORS 가 비어 있다 → lib/images.ts).
 *
 * `multipart/form-data`
 *   file           이미지 한 장
 *   role           input | output
 *   promptVersion  output 일 때, 몇 번 프롬프트로 만들었는지
 *   width · height 화면이 리사이즈하며 안 값
 *
 * ⚠️ 한 요청에 한 장이다. 여러 장은 화면이 차례로 부른다 — 한 번에 묶으면
 * 4.5MB 벽에 금방 닿고, 한 장이 실패했을 때 어느 것인지 알기 어렵다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** 묶음당 이미지 상한 — 미결 ① 확정 전의 잠정값 */
const MAX_IMAGES_PER_LOG = 20;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) return notFound("그 묶음이 없어요.");

  const found = await requireViewer(req);
  if ("error" in found) return found.error;
  const userId = found.viewer.userId;

  try {
    await connectDB();
    const log = await getLogModel().findOne({ _id: id, userId }, { _id: 1 }).lean().exec();
    if (!log) return notFound("그 묶음이 없어요.");

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      /*
        본문이 4.5MB 를 넘으면 함수에 닿기도 전에 잘린다. 여기까지 왔는데
        파싱이 실패했다면 형식 문제다 → my-obsidian-vault / 30-Patterns/이미지 업로드 패턴.md
      */
      return badRequest("이미지를 읽지 못했어요. 파일이 너무 크거나 형식이 달라요.");
    }

    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("이미지를 넣어 주세요.");

    const role = String(form.get("role") ?? "input") as LogImageRole;
    if (role !== "input" && role !== "output") return badRequest("role 이 이상해요.");

    if (!isAllowedType(file.type)) {
      return badRequest("JPEG · PNG · WebP 만 올릴 수 있어요.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return badRequest("이미지가 너무 커요. 4MB 아래로 줄여 주세요.");
    }

    const Image = getLogImageModel();
    const count = await Image.countDocuments({ logId: id }).exec();
    if (count >= MAX_IMAGES_PER_LOG) {
      return badRequest(`한 묶음에 이미지는 ${MAX_IMAGES_PER_LOG}장까지예요.`);
    }

    const key = makeKey(id, role, file.type);
    const buf = Buffer.from(await file.arrayBuffer());

    try {
      await putImage(key, buf, file.type);
    } catch (e) {
      /* 저장소 실패는 이유를 사람 말로 돌려준다 — 403 은 원인이 둘로 갈린다 */
      return NextResponse.json({ ok: false, error: describeR2Error(e) }, { status: 502 });
    }

    /* 순서는 같은 role 안에서 이어 붙인다 */
    const inRole = await Image.countDocuments({ logId: id, role }).exec();

    let doc;
    try {
      doc = await Image.create({
        logId: id,
        userId,
        role,
        promptVersion: role === "output" ? Number(form.get("promptVersion")) || null : null,
        r2Key: key,
        contentType: file.type,
        width: Number(form.get("width")) || 0,
        height: Number(form.get("height")) || 0,
        bytes: buf.byteLength,
        order: inRole,
      });
    } catch (e) {
      /*
        R2 에는 올라갔는데 DB 가 실패하면 **고아 객체**가 남는다.
        여기서 되돌린다 — 나중에 찾을 방법이 없다.
      */
      await deleteKeys([key]);
      return serverError(e);
    }

    await refreshLogPreview(id);

    return NextResponse.json(
      {
        ok: true,
        /* ⚠️ r2Key 를 싣지 않는다 */
        image: { id: String(doc._id), role, order: doc.order, bytes: doc.bytes },
      },
      { status: 201 },
    );
  } catch (e) {
    return serverError(e);
  }
}
