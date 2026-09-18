import { AuthGate } from "@/components/AuthGate";
import { TopNav } from "@/components/TopNav";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * 로그인한 사람이 쓰는 화면들의 껍데기 — 세션은 AuthGate 가 지킨다.
 *
 * 예전에는 세션이 없어도 빈 껍데기를 그리고 API 만 401 로 조용히 실패했다.
 * → my-obsidian-vault / 20-Design/앱 공통 UI와 아이콘.md
 */
export default function AppShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <TopNav />
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "calc(var(--nav-height) + 1rem) 1rem 2rem",
        }}
      >
        <AuthGate>{children}</AuthGate>
        <SiteFooter />
      </div>
    </div>
  );
}
