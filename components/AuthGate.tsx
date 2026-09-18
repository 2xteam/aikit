"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { EmailBanner } from "@/components/EmailBanner";
import { Sheet } from "@/components/Sheet";
import { clearSession } from "@/lib/session";
import { loginUrl } from "@/lib/portal";
import { useSession } from "@/lib/useSession";

/** 이 횟수를 넘으면 리다이렉트를 멈추고 화면에 상황을 보여준다 */
const MAX_BOUNCES = 3;
const BOUNCE_KEY = "aikit_auth_bounce";

function readBounces(): number {
  try {
    return Number(window.sessionStorage.getItem(BOUNCE_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeBounces(n: number) {
  try {
    if (n === 0) window.sessionStorage.removeItem(BOUNCE_KEY);
    else window.sessionStorage.setItem(BOUNCE_KEY, String(n));
  } catch {
    /* 시크릿 모드 등에서 막힐 수 있다. 막히면 보호 장치만 없는 셈이다 */
  }
}

/**
 * 로그인이 필요한 화면을 감싼다.
 *
 * 예전에는 각 화면이 `loadSession()`을 읽고 **없어도 그냥 그렸다.** 그래서
 * 로그아웃한 사람에게도 빈 껍데기가 보이고, API는 401로 조용히 실패했다.
 *
 * 상태가 정해지기 전에는 아무것도 그리지 않는다. 로그인 화면과 이 게이트가
 * 서로에게 넘기며 왕복하는 사고가 있었으므로(2026-09-03, 2hbk) 횟수를 세어
 * 한계를 넘으면 **무한 이동 대신 눈에 보이는 안내**로 끝낸다.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const next = pathname || "/home";
  const session = useSession();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (session.status === "loading") return;

    if (session.status === "signed-in") {
      writeBounces(0);
      return;
    }

    const bounces = readBounces() + 1;
    if (bounces > MAX_BOUNCES) {
      setStuck(true);
      return;
    }
    writeBounces(bounces);
    window.location.replace(loginUrl(next));
  }, [session.status, next]);

  if (stuck) {
    return (
      <Sheet eyebrow="SIGN IN" headline="로그인이 계속 풀려요">
        <p className="lead">
          로그인 화면과 이 화면 사이를 계속 오갔어요. 저장된 로그인 정보가 이 앱에서
          쓸 수 없는 상태일 수 있습니다.
        </p>
        <div className="row row--wrap" style={{ gap: 8, marginTop: 18 }}>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => {
              clearSession();
              writeBounces(0);
              window.location.replace(loginUrl(next, { relogin: true }));
            }}
          >
            로그인 정보 지우고 다시 로그인
          </button>
        </div>
        <p className="note-block">
          <strong>NOTE</strong>
          이 버튼은 myjane 로그인을 초기화합니다. 다른 myjane 앱도 다시 로그인해야 해요.
        </p>
      </Sheet>
    );
  }

  if (session.status !== "signed-in") return null;
  return (
    <>
      {/* 이메일이 없는 계정에만 뜨는 안내 띠. 아무것도 막지 않는다 */}
      <EmailBanner />
      {children}
    </>
  );
}
