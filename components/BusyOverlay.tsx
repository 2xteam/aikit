"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";

/**
 * 화면을 덮는 진행 표시 (2026-09-19 사용자 지정).
 *
 * 업로드와 생성은 합쳐 10초가 넘는다. 그동안 버튼 글자만 바뀌면 사람은
 * **누른 것이 먹었는지 모르고 또 누른다** — 그러면 묶음이 둘 만들어지고
 * 생성 요청도 두 번 나간다(과금도 두 번).
 *
 * 그래서 화면을 덮는다. 덮는 것 자체가 "지금은 아무것도 누르지 말라"는 말이다.
 *
 * ⚠️ **닫는 버튼을 두지 않는다.** 서버가 이미 일하고 있는데 화면만 닫으면
 * 사용자는 취소된 줄 알고 다시 시도한다. 끝나면 부모가 내린다.
 */
export function BusyOverlay({
  message,
  detail,
}: {
  /** 지금 무엇을 하는지. 없으면 화면을 덮지 않는다 */
  message: string | null;
  /** 한 줄 더 — "10초쯤 걸려요" 같은 것 */
  detail?: string;
}) {
  /*
    덮는 동안 뒤 화면이 스크롤되면 어디를 보고 있었는지 잃는다.
    ⚠️ 원래 값을 기억했다가 되돌린다 — 빈 문자열로 덮어쓰면 페이지가 원래
    갖고 있던 overflow 설정을 지운다.
  */
  useEffect(() => {
    if (!message) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [message]);

  if (!message) return null;

  return (
    <div style={backdropStyle} role="status" aria-live="polite" aria-busy="true">
      <style>{`@keyframes aik-spin { to { transform: rotate(360deg) } }`}</style>
      <div style={cardStyle}>
        <span style={spinnerStyle} aria-hidden="true" />
        <p style={msgStyle}>{message}</p>
        {detail ? <p style={detailStyle}>{detail}</p> : null}
      </div>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  /* TopNav 가 40 이다. 그 위를 덮어야 메뉴도 못 누른다 */
  zIndex: 200,
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "rgba(4, 22, 27, 0.72)",
  backdropFilter: "blur(3px)",
};

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 14,
  padding: "30px 34px",
  maxWidth: 320,
  textAlign: "center",
  background: "var(--bg-card)",
  borderRadius: "var(--radius-sm)",
  boxShadow: "0 24px 60px rgba(4, 22, 27, 0.4)",
};

const spinnerStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  /* 한 바퀴의 3/4 만 진하게 — 어디가 도는지 보인다 */
  border: "3px solid var(--border)",
  borderTopColor: "var(--accent)",
  animation: "aik-spin 0.8s linear infinite",
};

const msgStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.9rem",
  fontWeight: 800,
  lineHeight: 1.6,
  color: "var(--text-primary)",
  wordBreak: "keep-all",
};

const detailStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.78rem",
  lineHeight: 1.7,
  color: "var(--text-secondary)",
  wordBreak: "keep-all",
};
