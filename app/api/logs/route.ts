import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { badRequest, requireViewer, serverError } from "@/lib/auth";
import { getLogModel } from "@/models/Log";

/**
 * 묶음 목록·생성.
 *
 * ⚠️ 목록은 `logs` 에 복사해 둔 미리보기 값(대표 이미지·마지막 요약)만 읽는다.
 * 매번 이미지·프롬프트 컬렉션을 조인하면 목록 한 페이지가 세 번 질의한다.
 */
export const runtime = "nodejs";

/** 회원당 상한 — 미결 ① 이 확정되기 전의 잠정값. 무료로 열어 두면 용량이 선형으로 는다 */
const MAX_LOGS_PER_USER = 200;

export async function GET(req: Request) {
  const found = await requireViewer(req);
  if ("error" in found) return found.error;

  try {
    await connectDB();
    const url = new URL(req.url);
    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit") ?? 24) || 24));
    const skip = Math.max(0, Number(url.searchParams.get("skip") ?? 0) || 0);

    const Log = getLogModel();
    const filter = { userId: found.viewer.userId };
    const [docs, total] = await Promise.all([
      Log.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean().exec(),
      Log.countDocuments(filter).exec(),
    ]);

    return NextResponse.json({
      ok: true,
      total,
      items: docs.map((d) => ({
        id: String(d._id),
        title: d.title || "이름 없는 묶음",
        latestSummary: d.latestSummary,
        latestVersion: d.latestVersion,
        inputCount: d.inputCount,
        outputCount: d.outputCount,
        /* ⚠️ r2Key 가 아니라 **이미지 id** 다. 주소는 앱 라우트가 만든다 */
        coverImageId: d.coverImageId ? String(d.coverImageId) : null,
        updatedAt: d.updatedAt,
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  const found = await requireViewer(req);
  if ("error" in found) return found.error;

  try {
    await connectDB();
    const Log = getLogModel();

    const mine = await Log.countDocuments({ userId: found.viewer.userId }).exec();
    if (mine >= MAX_LOGS_PER_USER) {
      return badRequest(
        `묶음은 ${MAX_LOGS_PER_USER}개까지 만들 수 있어요. 쓰지 않는 묶음을 지우고 다시 시도해 주세요.`,
      );
    }

    let body: { title?: string } = {};
    try {
      body = await req.json();
    } catch {
      /* 본문 없이 만들 수 있다 — 제목은 첫 요청문에서 자동으로 짓는다 */
    }

    const doc = await Log.create({
      userId: found.viewer.userId,
      title: (body.title ?? "").trim().slice(0, 80),
    });

    return NextResponse.json({ ok: true, id: String(doc._id) }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
