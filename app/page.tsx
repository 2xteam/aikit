import type { CSSProperties } from "react";
import { AppIcon } from "@/components/AppIcon";
import { LandingCta, LandingHeaderAuth } from "@/components/LandingAuth";
import { ScrollProgress } from "@/components/ScrollProgress";
import { Sheet } from "@/components/Sheet";

/**
 * 소개 페이지 — 루트(`/`).
 *
 * 골격은 fitlog 의 랜딩과 같다(헤더 sticky + 시트 쌓기 + 어두운 푸터).
 * 라이트 전용이라 `ThemeProvider` 는 두지 않는다 — typelog 과 같다.
 * 근거: my-obsidian-vault → 20-Design/결쩜사 페이지 패턴.md
 *
 * ⚠️ 카피에서 **일곱 앱을 묶어 한 제품처럼 소개하지 않는다.** AIKit 만 쓰는
 * 사람이 정상이다 → my-obsidian-vault / 20-Design/서비스 카테고리와 카피 원칙.md
 */
export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <header style={headerStyle}>
        <div className="page" style={{ ...headerInner, paddingTop: 14, paddingBottom: 14 }}>
          <span className="row" style={{ gap: 9 }}>
            <AppIcon size={30} priority />
            <span style={{ fontWeight: 900, letterSpacing: "-0.02em" }}>AIKit</span>
          </span>
          <LandingHeaderAuth />
        </div>
        {/* 헤더가 sticky 라서 띠가 스크롤을 따라온다 */}
        <ScrollProgress />
      </header>

      <main className="page">
        <Sheet
          tone="dark"
          point
          eyebrow="AIKIT · PROMPT LOG"
          headline={
            <>
              사진을 올리면
              <br />
              <span style={{ color: "#ead58c" }}>프롬프트를 만들어 드려요.</span>
            </>
          }
          lead="어떤 느낌이면 좋겠는지만 한 줄 적으면 됩니다. 만든 프롬프트와 그걸로 나온 이미지가 한 묶음으로 남아, 두 달 뒤에도 그대로 다시 씁니다."
        >
          <div style={{ marginTop: 24 }}>
            <LandingCta variant="hero" />
          </div>
        </Sheet>

        <Sheet tone="tint" eyebrow="HOW IT WORKS" headline="세 걸음이면 됩니다">
          {/* 번호 원과 연결선은 app/elements.css 의 .flow 가 그린다 */}
          <ol className="flow">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flow-step">
                <span className="flow-num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </Sheet>

        <Sheet
          point
          eyebrow="WHAT YOU GET"
          headline={
            <>
              두 달 뒤에도 <span className="mark">그대로 다시</span> 씁니다
            </>
          }
        >
          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            {FEATURES.map((f) => (
              <div key={f.name} style={featureStyle}>
                <strong style={{ fontSize: "0.92rem" }}>{f.name}</strong>
                <p style={featureDescStyle}>{f.desc}</p>
              </div>
            ))}
          </div>
        </Sheet>

        <Sheet
          tone="tint"
          eyebrow="PRIVACY"
          headline="올린 이미지는 기본이 비공개예요"
          lead="앱 안에서, 본인에게만 보입니다. 이미지 주소를 밖으로 내보내지 않고 앱이 직접 보여 줘요."
        >
          <p className="note-block">
            <strong>NOTE</strong>
            프롬프트를 만들 때는 올린 사진이 OpenAI 로 한 번 전송돼요. 분석에만 쓰이고,
            사진은 이 앱의 저장소에만 남습니다.
          </p>
        </Sheet>

        <Sheet
          tone="gold"
          eyebrow="ONE ACCOUNT"
          headline="계정만 공유해요"
          lead="myjane 계정 하나로 필요한 기록 서비스를 골라 씁니다. 기록과 데이터는 서비스마다 따로 쌓여요."
        >
          <p className="note-block">
            <strong>NOTE</strong>
            쓰지 않는 서비스는 열지 않아도 돼요. 이 앱만 써도 충분합니다.
          </p>
        </Sheet>

        <Sheet center point eyebrow="START" headline="사진 한 장으로 시작해 볼까요?">
          <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
            <LandingCta variant="closing" />
          </div>
        </Sheet>
      </main>

      <footer style={footerStyle}>
        <div className="page" style={{ textAlign: "center", paddingBottom: 28 }}>
          <p style={{ margin: "0 0 14px", fontWeight: 800, letterSpacing: "-0.02em" }}>
            AIKit
          </p>
          <p style={{ margin: 0 }}>
            <a
              href="https://www.myjane.co.kr"
              className="myjane-mark"
              style={{ color: "var(--on-dark)" }}
            >
              my<span>jane</span>
            </a>
          </p>
          {/*
            법적 고지 — 세 페이지는 포털(myjane)에 한 벌만 둔다.
            앱들이 회원과 세션을 공유하므로 방침도 한 곳이어야 한다.
            → my-obsidian-vault / 50-Plans/C 법적 페이지.md
          */}
          <p style={footerLegalStyle}>
            <a href="https://www.myjane.co.kr/legal/privacy" style={footerLegalLinkStyle}>
              개인정보처리방침
            </a>
            <span style={footerLegalSepStyle}>·</span>
            <a href="https://www.myjane.co.kr/legal/terms" style={footerLegalLinkStyle}>
              이용약관
            </a>
            <span style={footerLegalSepStyle}>·</span>
            <a href="https://www.myjane.co.kr/legal/cookies" style={footerLegalLinkStyle}>
              쿠키 안내
            </a>
          </p>
          <p style={footerLineStyle}>@2026 myjane All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}

const STEPS = [
  {
    title: "사진과 분위기를 넣는다",
    desc: "쓰려는 사진을 올리고 “어떤 느낌이면 좋겠는지”만 한 줄 적어요. 긴 문장은 필요 없어요.",
  },
  {
    title: "프롬프트를 받는다",
    desc: "사진에 어울리는 프롬프트를 만들어 드려요. 어떤 이미지가 나올지 요약도 함께 보여 줘요.",
  },
  {
    title: "복사해서 만들고, 결과를 올린다",
    desc: "쓰던 AI에 붙여 넣어 만든 뒤 그 이미지를 이 묶음에 올려 둬요. 이미지는 이 앱이 만들지 않아요.",
  },
];

const FEATURES = [
  {
    name: "사진을 보고 만든 프롬프트",
    desc: "올린 사진의 인물·배경·빛을 읽어 그 사진에 맞는 문장을 만들어요. 빈 칸에서 시작하지 않아요.",
  },
  {
    name: "어떤 이미지가 나올지 먼저 요약",
    desc: "프롬프트와 함께 결과가 어떤 분위기일지 한 문단으로 보여 줘요. 만들기 전에 판단할 수 있어요.",
  },
  {
    name: "마음에 안 들면 고쳐 달라고",
    desc: "“더 밝게”, “포스터 말고 인물사진으로”처럼 적으면 다시 만들어 드려요. 요청과 결과가 순서대로 쌓여요.",
  },
  {
    name: "프롬프트 한 번에 복사",
    desc: "긴 프롬프트도 버튼 하나로 복사해요. 쓰던 AI가 어디든 그대로 붙여 넣으면 됩니다.",
  },
  {
    name: "결과 이미지를 그 프롬프트 아래에",
    desc: "만든 이미지를 어느 프롬프트로 만들었는지와 함께 올려 둬요. 두 달 뒤에도 짝이 맞아요.",
  },
  {
    name: "묶음 단위 삭제",
    desc: "지우면 이미지까지 함께 지웁니다. 남겨 두는 사본이 없어요.",
  },
];

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 40,
  background: "var(--bg-primary)",
  borderBottom: "1px solid var(--border-subtle)",
};

const headerInner: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const featureDescStyle: CSSProperties = {
  margin: "5px 0 0",
  fontSize: "0.82rem",
  lineHeight: 1.75,
  color: "var(--text-secondary)",
  wordBreak: "keep-all",
};

const featureStyle: CSSProperties = {
  padding: "15px 17px",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-subtle)",
};

const footerStyle: CSSProperties = {
  marginTop: 40,
  paddingTop: 30,
  background: "var(--footer-bg)",
  color: "var(--on-dark)",
};

const footerLineStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "0.78rem",
  lineHeight: 1.8,
  color: "var(--on-dark-faint)",
  wordBreak: "keep-all",
};

/*
 * 어두운 푸터의 법적 고지 링크. 짙은 면 위이므로 --on-dark 계열을 쓴다
 * (밝은 면용 토큰을 쓰면 2~3:1 로 떨어진다).
 */
const footerLegalStyle: CSSProperties = {
  margin: "12px 0 0",
  fontSize: "0.78rem",
  lineHeight: 1.9,
};

const footerLegalLinkStyle: CSSProperties = {
  color: "var(--on-dark-dim)",
  textDecoration: "none",
  fontWeight: 600,
};

const footerLegalSepStyle: CSSProperties = {
  margin: "0 8px",
  color: "var(--on-dark-faint)",
};
