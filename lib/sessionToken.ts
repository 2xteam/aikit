import crypto from "node:crypto";

/**
 * 통합 세션 쿠키에 실려 오는 **서명 토큰**의 검증기.
 *
 * `snap_user` 쿠키는 클라이언트가 읽고 쓸 수 있는 평문 JSON이다. 그 안의 `id`를
 * 그대로 믿으면 아무나 남의 계정으로 API를 부를 수 있다. TypeLog 는 **admin 이
 * 있으므로** 처음부터 이 토큰만 신뢰한다 — 서명은 포털이 하고 여기서는 검증만 한다.
 *
 * `SESSION_SECRET` 이 포털과 **같은 값**이어야 한다. 다르면 전부 401 이다.
 * → my-obsidian-vault / 30-Patterns/인증과 세션 공유.md
 */

const TTL_SEC = 30 * 24 * 60 * 60;

export type TokenClaims = {
  /** 통합 회원의 Mongo `_id` */
  uid: string;
  /** 2hbk 도메인 식별자. TypeLog 는 쓰지 않지만 토큰에 들어 있다 */
  u: string;
  /** 만료 시각 (epoch 초) */
  exp: number;
  /** 세션 버전 — `users.sessionVersion` 과 같아야 한다. 옛 토큰에는 없다(= 0) */
  sv?: number;
  /** 자녀 프로필로 들어온 세션이면 보호자 `_id`. 없으면 본인 → myjane/lib/family.ts */
  gid?: string;
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET 환경 변수가 없거나 너무 짧습니다.");
  }
  return secret;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

function hmac(body: string): string {
  return b64url(crypto.createHmac("sha256", getSecret()).update(body).digest());
}

/* 서명(signSessionToken)은 포털에만 둔다. 앱이 서명할 수 있으면 신뢰의 의미가 없다 */

export function verifySessionToken(token: string | undefined | null): TokenClaims | null {
  if (!token || typeof token !== "string") return null;

  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // 길이가 다르면 timingSafeEqual이 예외를 던지므로 먼저 거른다
  const expected = hmac(body);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenClaims;
    if (typeof claims.uid !== "string" || typeof claims.u !== "string") return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    if (claims.sv !== undefined && typeof claims.sv !== "number") return null;
    if (claims.gid !== undefined && typeof claims.gid !== "string") return null;
    return claims;
  } catch {
    return null;
  }
}
