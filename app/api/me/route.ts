import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * 내 프로필 — 화면이 필요할 때 **서버에서** 받는다.
 *
 * 세션 쿠키에는 더 이상 전화번호·이메일이 없다(HttpOnly 토큰 + 표시용 id·이름만).
 * my 화면처럼 연락처를 보여 줘야 하는 자리는 이 라우트를 부른다.
 * 서명 토큰으로 본인을 확인하므로 남의 것을 받을 수 없다.
 * → my-obsidian-vault / 50-Plans/E 개인정보 보호 보강.md 5번
 */
export async function GET(req: Request) {
  const auth = await requireViewer(req);
  if ("error" in auth) return auth.error;
  const { doc } = auth.viewer;

  return NextResponse.json({
    ok: true,
    me: {
      id: String(doc._id),
      name: doc.nickname ?? doc.name ?? "",
      nickname: doc.nickname ?? null,
      phone: doc.phone ?? null,
      email: doc.email ?? null,
      emailVerified: Boolean(doc.emailVerified),
      userId: doc.userId ?? null,
      hasPinLogin: Boolean(doc.pin),
      hasPassword: Boolean(doc.password),
    },
  });
}
