"use client";

import { loginUrl, signupUrl } from "@/lib/portal";
import { useSession } from "@/lib/useSession";

/**
 * 소개 페이지에서 **로그인 상태에 따라 갈리는 조각**만 떼어 둔 것.
 *
 * 세션은 클라이언트가 읽는 쿠키에 있어 서버 컴포넌트에서는 알 수 없다.
 * 상태가 정해지기 전에는 아무것도 그리지 않고 자리만 잡아 둔다 —
 * 로그인한 사람에게 "로그인" 버튼이 한 번 스쳐 보이는 것보다 낫다.
 * → my-obsidian-vault / 30-Patterns/인증과 세션 공유.md
 */
export function LandingCta({ variant }: { variant: "hero" | "closing" }) {
  const session = useSession();

  if (session.status === "loading") return <div style={{ height: 48 }} />;

  if (session.status === "signed-in") {
    if (variant === "closing") return null;
    return (
      <div className="row row--wrap" style={{ gap: 10 }}>
        <a className="btn btn--primary" href="/home">
          내 기록 보러 가기 →
        </a>
      </div>
    );
  }

  return (
    <div className="row row--wrap" style={{ gap: 10 }}>
      <a className="btn btn--primary" href={signupUrl("/home")}>
        시작하기 →
      </a>
      <a className="btn btn--ghost" href={loginUrl("/home")}>
        로그인
      </a>
    </div>
  );
}

/** 헤더 우측 — 로그인한 사람에게는 앱으로 들어가는 링크만 보인다 */
export function LandingHeaderAuth() {
  const session = useSession();

  if (session.status === "loading") return <div style={{ height: 34 }} />;

  if (session.status === "signed-in") {
    return (
      <a className="btn btn--ghost btn--sm" href="/home">
        내 기록
      </a>
    );
  }

  return (
    <a className="btn btn--ghost btn--sm" href={loginUrl("/home")}>
      로그인
    </a>
  );
}
