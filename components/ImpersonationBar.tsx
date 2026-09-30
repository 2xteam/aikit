"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 관리자 **대리 로그인** 경고 바 — 화면 맨 위에 고정된다.
 *
 * 포털과 여섯 앱에 **같은 파일이 복사본으로** 있다. 고치면 모두 함께 고친다.
 * 원본: myjane/components/ImpersonationBar.tsx → myjane/lib/impersonation.ts
 *
 * - `snap_imp` 표지 쿠키(JS 가 읽는 표시용)와 `snap_auth` 가 함께 있을 때만 그린다
 * - 남은 시간을 1초마다 센다. 5분 이내면 "1시간 연장" 버튼이 나온다
 * - 0 이 되면 스스로 종료를 보내 관리자 세션으로 되돌린다
 * - 연장·종료는 **포털**이 한다(서명은 포털만 한다). 폼 POST 로 넘어갔다가 돌아온다
 * - 바가 떠 있는 동안 본문과 고정 상단 메뉴(.topnav 등)를 바 높이만큼 내린다
 */

const MARK_COOKIE = "snap_imp";
const AUTH_MARK_COOKIE = "snap_auth";
const EXTEND_WINDOW_SEC = 5 * 60;
const LOCAL_PORTAL_PORT = 3000;

type Mark = { exp: number; name: string; by: string };

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = name + "=";
  for (const part of document.cookie.split(";")) {
    const t = part.trim();
    if (!t.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(t.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 표지를 읽는다. 아직 시간이 남았으면 로그인 표지(snap_auth)도 있어야 한다 — 로그아웃한 뒤
 * 남은 표지로 바를 그리지 않게. 시간이 지났으면 세션 쿠키는 이미 사라졌으므로 표지만 본다
 * (포털이 표지를 만료 뒤 10분 더 남긴다) → 바가 자동 종료를 보낸다.
 */
function readMark(): Mark | null {
  const raw = readCookie(MARK_COOKIE);
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Partial<Mark>;
    if (typeof m.exp !== "number") return null;
    const expired = m.exp * 1000 <= Date.now();
    if (!expired && !readCookie(AUTH_MARK_COOKIE)) return null;
    return { exp: m.exp, name: String(m.name ?? "고객"), by: String(m.by ?? "관리자") };
  } catch {
    return null;
  }
}

/** 연장·종료를 보낼 포털 주소. 포털 자신이면 같은 출처 */
function portalOrigin(isPortal: boolean): string {
  if (isPortal || typeof window === "undefined") return "";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) {
    return `${window.location.protocol}//${host}:${LOCAL_PORTAL_PORT}`;
  }
  return (process.env.NEXT_PUBLIC_PORTAL_ORIGIN ?? "https://www.myjane.co.kr").replace(/\/+$/, "");
}

function formatLeft(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ImpersonationBar({ portal = false }: { portal?: boolean }) {
  const [mark, setMark] = useState<Mark | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [origin, setOrigin] = useState("");
  const barRef = useRef<HTMLDivElement>(null);
  const endFormRef = useRef<HTMLFormElement>(null);
  const endingRef = useRef(false);

  useEffect(() => {
    setOrigin(portalOrigin(portal));
    const tick = () => {
      setMark(readMark());
      setNow(Math.floor(Date.now() / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [portal]);

  const left = mark ? mark.exp - now : 0;

  // 바 높이만큼 본문·고정 메뉴를 내린다
  useEffect(() => {
    const root = document.documentElement;
    if (!mark) {
      root.classList.remove("imp-active");
      root.style.removeProperty("--imp-bar-h");
      return;
    }
    root.classList.add("imp-active");
    const el = barRef.current;
    const apply = () => root.style.setProperty("--imp-bar-h", `${el?.offsetHeight ?? 0}px`);
    apply();
    const ro = el ? new ResizeObserver(apply) : null;
    if (el && ro) ro.observe(el);
    return () => ro?.disconnect();
  }, [mark]);

  // 시간이 다 되면 스스로 끝낸다 — 관리자 세션으로 돌아간다
  useEffect(() => {
    if (!mark || left > 0 || endingRef.current) return;
    endingRef.current = true;
    endFormRef.current?.requestSubmit();
  }, [mark, left]);

  if (!mark) return null;

  const canExtend = left <= EXTEND_WINDOW_SEC && left > 0;
  const here = typeof window !== "undefined" ? window.location.href : "";

  return (
    <>
      <style>{`
        html.imp-active body { padding-top: var(--imp-bar-h, 0px); }
        html.imp-active .topnav,
        html.imp-active .site-top,
        html.imp-active .auth-topbar { top: var(--imp-bar-h, 0px) !important; }
        @keyframes imp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
      `}</style>
      <div
        ref={barRef}
        role="alert"
        aria-live="polite"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2147483000,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px 12px",
          padding: "8px 16px",
          background: "var(--danger-ink, #a83447)",
          color: "var(--on-accent, #ffffff)",
          borderBottom: "3px solid var(--danger, #e0455f)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
          fontSize: 13,
          lineHeight: 1.4,
          fontWeight: 600,
        }}
      >
        <span style={{ fontWeight: 800, letterSpacing: "0.02em" }}>
          ⚠ 관리자 대리 로그인 중
        </span>
        <span>
          <strong style={{ fontWeight: 800 }}>{mark.name}</strong> 님의 계정으로 보고 있어요 · 관리자 {mark.by}
        </span>
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            fontWeight: 800,
            padding: "2px 8px",
            borderRadius: 6,
            background: "rgba(0,0,0,0.22)",
            animation: canExtend ? "imp-pulse 1s ease-in-out infinite" : undefined,
          }}
        >
          남은 시간 {formatLeft(left)}
        </span>

        {canExtend ? (
          <form method="post" action={`${origin}/api/impersonation/extend`} style={{ margin: 0 }}>
            <input type="hidden" name="next" value={here} />
            <button type="submit" style={btn(true)}>1시간 연장</button>
          </form>
        ) : null}

        <form ref={endFormRef} method="post" action={`${origin}/api/impersonation/end`} style={{ margin: 0 }}>
          <input type="hidden" name="reason" value={left <= 0 ? "expired" : "manual"} />
          <button type="submit" style={btn(false)}>종료</button>
        </form>
      </div>
    </>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: "4px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.7)",
    background: primary ? "var(--on-accent, #ffffff)" : "transparent",
    color: primary ? "var(--danger-ink, #a83447)" : "var(--on-accent, #ffffff)",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };
}
