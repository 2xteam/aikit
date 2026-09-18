"use client";

import { useEffect, useState } from "react";
import { AccountWithdrawLink } from "@/components/AccountWithdrawLink";
import { Sheet } from "@/components/Sheet";
import { useSession } from "@/lib/useSession";

/**
 * 관리 화면 링크를 여기 두지 않는다. **관리는 포털(`www.myjane.co.kr/admin`)에서 한다**
 * → my-obsidian-vault / 30-Patterns/통합 admin.md
 */
export default function MyPage() {
  const session = useSession();
  /* 전화번호는 세션 쿠키에 없다 — 서버에서 받는다 → app/api/me */
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== "signed-in") return;
    void fetch("/api/me")
      .then((r) => r.json() as Promise<{ ok: boolean; me?: { phone?: string | null } }>)
      .then((j) => { if (j.ok) setPhone(j.me?.phone ?? ""); })
      .catch(() => {});
  }, [session.status]);

  if (session.status !== "signed-in") return null;

  return (
    <Sheet eyebrow="MY" headline="내 정보">
      <dl style={{ margin: "18px 0 0", display: "grid", gap: 12 }}>
        <div>
          <dt style={labelStyle}>이름</dt>
          <dd style={valueStyle}>{session.user.name || "—"}</dd>
        </div>
        <div>
          <dt style={labelStyle}>전화번호</dt>
          <dd style={valueStyle}>{phone === null ? "…" : phone || "—"}</dd>
        </div>
      </dl>
      <p className="lead">
        이름과 연락처는 myjane 계정 정보예요. 바꾸려면 포털에서 고쳐요.
      </p>

      <AccountWithdrawLink />
    </Sheet>
  );
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.3px",
  color: "var(--text-muted)",
} as const;

const valueStyle = {
  margin: "4px 0 0",
  fontSize: 15,
  fontWeight: 700,
  color: "var(--text-primary)",
} as const;
