"use client";

import { useEffect, useState } from "react";
import { accountEmailUrl, usesPortal } from "@/lib/portal";
import { useSession } from "@/lib/useSession";

/**
 * 이메일이 없는 계정에게 **포털 링크만** 보여 주는 띠.
 *
 * ⚠️ 여기서 이메일을 받지 않는다. 여섯 앱이 각자 물으면 같은 사람에게 여섯 번
 * 묻게 되므로, 등록·인증 화면은 포털에만 둔다
 * → my-obsidian-vault / 50-Plans/B 로그인·회원가입 개편.md 의 작업 3
 *
 * 판단은 **세션 쿠키의 `email` 하나**로 한다. 인증 여부(`emailVerified`)는
 * 쿠키에 없고, 알려면 포털 API를 교차 출처로 불러야 한다. 안내 띠 하나를 위해
 * CORS를 여는 것보다 "이메일이 아예 없는 사람"만 여기서 챙기고 나머지는
 * 포털에 맡기는 편이 낫다.
 *
 * 무엇도 막지 않는다. 닫으면 하루 동안 다시 뜨지 않는다.
 */

const SNOOZE_KEY = "myjane_email_banner_until";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function snoozedNow(): boolean {
  try {
    const until = Number(window.localStorage.getItem(SNOOZE_KEY) ?? "0");
    return Number.isFinite(until) && until > Date.now();
  } catch {
    // 시크릿 모드 등에서 막힐 수 있다. 막히면 미루기만 없는 셈이다
    return false;
  }
}

function snooze() {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + ONE_DAY_MS));
  } catch {
    /* ignore */
  }
}

export function EmailBanner() {
  const session = useSession();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (session.status !== "signed-in") return;
    // 이메일이 이미 있으면 여기서 할 말이 없다. 인증 여부는 포털이 챙긴다
    if (session.user.hasEmail || session.user.child) return;
    /*
      포털과 세션을 나눠 쓰지 못하는 곳(로컬 개발·`*.vercel.app`)에서는 띄우지
      않는다. 링크를 눌러 운영 포털에 가 봐야 그 세션이 여기로 돌아오지 않는다
      → lib/portal.ts
    */
    if (!usesPortal()) return;
    if (snoozedNow()) return;

    setShow(true);
  }, [session]);

  if (!show) return null;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        margin: "0 0 16px",
        padding: "12px 14px",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        fontSize: 14,
        color: "var(--text-primary)",
      }}
    >
      <span style={{ flex: "1 1 220px", lineHeight: 1.5 }}>
        이메일을 등록해 두면 비밀번호를 잊어도 되찾을 수 있어요.
      </span>

      <a
        href={accountEmailUrl()}
        style={{
          padding: "8px 14px",
          borderRadius: "var(--radius-md)",
          background: "var(--accent)",
          color: "var(--on-accent)",
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        등록하기
      </a>

      <button
        type="button"
        onClick={() => {
          snooze();
          setShow(false);
        }}
        style={{
          background: "none",
          border: "none",
          padding: "8px 4px",
          font: "inherit",
          color: "var(--text-secondary)",
          textDecoration: "underline",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        나중에
      </button>
    </div>
  );
}
