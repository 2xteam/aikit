import { NextResponse } from "next/server";
import { requireViewer, serverError } from "@/lib/auth";
import { listMoods } from "@/lib/prompts/library";

/**
 * 1단계 — 분위기 12칸과 각 칸의 대표 이미지.
 *
 * 로그인을 요구한다. 라이브러리는 회원 데이터가 아니지만, 이 앱에서 쓰는
 * 사람만 보면 된다. 공개로 두면 우리가 큐레이션한 목록이 그대로 긁힌다.
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const found = await requireViewer(req);
  if ("error" in found) return found.error;
  try {
    return NextResponse.json({ ok: true, moods: await listMoods() });
  } catch (e) {
    return serverError(e);
  }
}
