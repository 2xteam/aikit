import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getUserModel, type UserDocument } from "@/models/User";
import { verifySessionToken } from "@/lib/sessionToken";
import { readSessionTokenFromRequest } from "@/lib/sessionCookie";

/**
 * 서버에서 요청자를 확인한다.
 *
 * **쿠키 본문의 `id`는 믿지 않는다.** 클라이언트가 마음대로 쓸 수 있다.
 * 같은 쿠키 안의 `token`(HMAC 서명)만 신뢰하고, 거기 담긴 `uid`(Mongo `_id`)로
 * 회원을 찾는다.
 *
 * → my-obsidian-vault / 30-Patterns/인증과 세션 공유.md
 */


/**
 * 세션 토큰은 **쿠키에서만** 읽는다.
 *
 * 2hbk 는 `Authorization: Bearer` 도 세션 토큰으로 받지만, 이 앱에서 그 헤더는
 * 포털이 보내는 `ADMIN_API_SECRET` 이다. 둘을 같은 자리에서 읽으면 어느 쪽인지
 * 헷갈린다.
 */

export type Viewer = {
  doc: UserDocument;
  /** 통합 회원의 Mongo `_id` 문자열 */
  userId: string;
  adminRole: "master" | "operator" | null;
  /** 자녀 프로필 세션이면 보호자 `_id`. 앱은 참고만 한다 */
  guardianId: string | null;
};

export async function getViewer(req: Request): Promise<Viewer | null> {
  const claims = verifySessionToken(readSessionTokenFromRequest(req));
  if (!claims) return null;

  await connectDB();
  const doc = await getUserModel().findById(claims.uid).exec();
  if (!doc) return null;

  /*
    탈퇴한 계정은 여기서 막는다. 탈퇴는 **여섯 서비스 공통**이라
    포털에서 닫으면 이 앱도 함께 닫혀야 한다. 쿠키는 30일짜리라
    포털에서 막는 것만으로는 남아 있는 세션이 계속 통한다.
    → myjane/lib/accountLifecycle.ts · 50-Plans/C 법적 페이지.md
  */
  if (doc.withdrawnAt) return null;

  /*
    세션 버전이 다르면 폐기된 토큰이다 (비밀번호 변경·탈퇴·모든 기기 로그아웃).
    `sv` 가 없는 옛 토큰은 아직 한 번도 올리지 않은 계정(0)에서만 통한다.
  */
  if ((claims.sv ?? 0) !== (doc.sessionVersion ?? 0)) return null;


  const role = doc.adminRole === "master" || doc.adminRole === "operator" ? doc.adminRole : null;
  return { doc, userId: String(doc._id), adminRole: role, guardianId: claims.gid ?? null };
}

export async function requireViewer(
  req: Request,
): Promise<{ viewer: Viewer } | { error: NextResponse }> {
  let viewer: Viewer | null;
  try {
    viewer = await getViewer(req);
  } catch (e) {
    /*
      SESSION_SECRET 이 없으면 검증기가 던진다. 그대로 두면 본문이 빈 500 이 나가
      화면이 이유를 보여 주지 못한다 — 설정 누락은 이유가 담긴 503 으로 떨어뜨린다.
      (2026-09-09 운영에서 겪었다 → 10-Projects/FitLog.md)
    */
    const message = e instanceof Error ? e.message : "";
    if (/SESSION_SECRET/.test(message)) {
      return {
        error: NextResponse.json(
          { ok: false, error: "서버 설정이 빠졌습니다 (SESSION_SECRET). 운영자에게 알려 주세요." },
          { status: 503 },
        ),
      };
    }
    throw e;
  }
  if (!viewer) return { error: unauthorized("로그인이 필요합니다.") };
  return { viewer };
}

/**
 * 관리 API 의 문지기. **두 갈래를 모두 받는다.**
 *
 * | 부르는 쪽 | 인증 |
 * |---|---|
 * | 포털의 통합 admin (서버끼리) | `Authorization: Bearer <ADMIN_API_SECRET>` |
 * | 사람이 이 앱 화면에서 (지금은 없음) | 세션 서명 토큰 + `users.adminRole` |
 *
 * 관리 화면은 포털에 있으므로 실제로는 첫 줄이 쓰인다. 세션 갈래를 남겨 두는 이유는
 * 이 앱에서 직접 확인해야 할 일이 생길 때를 위한 것이다.
 *
 * 권한은 `users.adminRole` 로 가른다 — 이 앱은 그 값을 **읽기만** 한다.
 * 권한을 바꾸는 화면은 포털에만 있다.
 * → my-obsidian-vault / 30-Patterns/통합 admin.md
 */
export async function requireAdmin(
  req: Request,
): Promise<{ viewer: Viewer | null } | { error: NextResponse }> {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const secretError = verifyAdminApiSecret(req);
    // 공유 비밀이 맞으면 사람 정보 없이 통과한다 — 서버끼리 부르는 길이다
    if (!secretError) return { viewer: null };
    // 비밀이 설정되지 않은 경우(503)는 세션으로도 뚫리지 않게 그대로 돌려준다
    if (secretError.status === 503) return { error: secretError };
  }

  const found = await requireViewer(req);
  if ("error" in found) return found;
  if (!found.viewer.adminRole) {
    return { error: forbidden("관리자만 쓸 수 있어요.") };
  }
  return found;
}

/**
 * 포털의 통합 admin 이 이 앱의 `/api/admin/*` 을 부를 때 쓰는 공유 비밀.
 *
 * ⚠️ **비밀이 설정되지 않았으면 열지 말고 503 으로 막는다.** 비어 있을 때
 * 통과시키면 아무나 관리 API 를 부른다.
 */
export function verifyAdminApiSecret(req: Request): NextResponse | null {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json(
      { ok: false, error: "이 서버에 ADMIN_API_SECRET 이 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  // 길이가 다르면 timingSafeEqual 이 예외를 던지므로 먼저 거른다
  if (given.length !== secret.length) return unauthorized("인증에 실패했습니다.");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  if (diff !== 0) return unauthorized("인증에 실패했습니다.");
  return null;
}

export function badRequest(message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status: 400 });
}

export function unauthorized(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export function forbidden(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}

export function notFound(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 404 });
}

export function conflict(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 409 });
}

export function serverError(err: unknown) {
  const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
