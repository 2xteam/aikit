import { NextResponse } from "next/server";
import { clearSessionCookieHeaders, withSetCookies } from "@/lib/sessionCookie";

export const runtime = "nodejs";

/**
 * 로그아웃 — 이 기기의 세션 쿠키를 지운다.
 *
 * `snap_session` 은 HttpOnly 라 JS 가 못 지운다. 그래서 `clearSession()` 이 이 라우트를
 * 부른다. 토큰 자체는 만료(30일)까지 유효하다 — **모든 기기에서 끊으려면** 포털의
 * `/api/auth/logout` 에 `{ all: true }` 로 (그쪽이 `sessionVersion` 을 올린다).
 * → my-obsidian-vault / 50-Plans/E 개인정보 보호 보강.md 5번
 */
export async function POST(req: Request) {
  return withSetCookies(NextResponse.json({ ok: true }), clearSessionCookieHeaders(req));
}
