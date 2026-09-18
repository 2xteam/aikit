import { NextResponse } from "next/server";
import { badRequest, requireViewer, serverError } from "@/lib/auth";
import { listPrompts } from "@/lib/prompts/library";
import { isMoodId } from "@/lib/prompts/vocab";

/**
 * 2단계 — 한 분위기 안의 프롬프트 목록.
 *
 * `mood` 는 **필수다.** 없이 부르면 720건이 통째로 나가는데, 그러면 화면이
 * 범용 프롬프트 갤러리가 된다. 고르는 축은 분위기다
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ⑤
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const found = await requireViewer(req);
  if ("error" in found) return found.error;

  const url = new URL(req.url);
  const mood = url.searchParams.get("mood");
  if (!isMoodId(mood)) {
    return badRequest("분위기를 먼저 골라 주세요.", { field: "mood" });
  }

  const limit = Number(url.searchParams.get("limit") ?? 24);
  const skip = Number(url.searchParams.get("skip") ?? 0);

  try {
    const { items, total } = await listPrompts(mood, {
      limit: Number.isFinite(limit) ? limit : 24,
      skip: Number.isFinite(skip) ? skip : 0,
    });
    return NextResponse.json({ ok: true, mood, total, items });
  } catch (e) {
    return serverError(e);
  }
}
