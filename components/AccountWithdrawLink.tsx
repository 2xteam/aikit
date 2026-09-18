"use client";

import type { CSSProperties } from "react";
import { withdrawUrl } from "@/lib/portal";

/**
 * my 화면 아래에 두는 **회원 탈퇴 안내.**
 *
 * ⚠️ 이 파일은 다섯 앱에 같은 내용으로 복사돼 있다. 한 앱만 고치면 갈라진다
 * (`components/SiteFooter.tsx` 와 같다).
 *
 * 탈퇴 화면 자체는 **포털에만 있다.** 계정이 여섯 서비스 공통이라 탈퇴도
 * 공통이고, 화면을 앱마다 두면 "여기서 탈퇴하면 여섯 곳이 다 닫힙니다" 를
 * 여섯 번 다르게 쓰게 된다. 여기서는 링크만 보여 준다.
 *
 * → my-obsidian-vault / 50-Plans/C 법적 페이지.md
 */
export function AccountWithdrawLink() {
  return (
    <div style={wrapStyle}>
      <p style={headStyle}>회원 탈퇴</p>
      <p style={bodyStyle}>
        탈퇴는 <strong>myjane 계정 전체</strong>에 적용됩니다. 여섯 서비스가 함께
        닫히고, 기록은 6개월 뒤 폐기됩니다.
      </p>
      <a href={withdrawUrl()} style={linkStyle}>
        myjane 에서 탈퇴하기
      </a>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  marginTop: "2rem",
  paddingTop: "1.25rem",
  borderTop: "1px solid var(--border-subtle)",
};

const headStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
};

const bodyStyle: CSSProperties = {
  margin: "6px 0 10px",
  fontSize: "0.8rem",
  lineHeight: 1.75,
  color: "var(--text-muted)",
  wordBreak: "keep-all",
};

const linkStyle: CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  color: "var(--danger-ink)",
  textDecoration: "underline",
};
