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
              이미지는 남는데,
              <br />
              <span style={{ color: "#ead58c" }}>어떻게 만들었는지가 사라져요.</span>
            </>
          }
          lead="어떤 사진을 넣었는지, 무슨 프롬프트를 썼는지가 대화 기록 속에 흩어집니다. AIKit 은 그 셋을 한 묶음으로 붙들어 둡니다."
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
          lead="앱 안에서, 본인에게만 보입니다. 나누고 싶은 이미지는 하나씩 골라 동의한 뒤에만 링크가 만들어져요."
        >
          <p className="note-block">
            <strong>NOTE</strong>
            공유를 끄면 그 즉시 링크가 닫힙니다. 이미지 주소를 밖으로 흘리지 않기 때문이에요.
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

        <Sheet center point eyebrow="START" headline="묶음 하나만 만들어 볼까요?">
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
    title: "사진과 프롬프트를 넣는다",
    desc: "쓰려는 원본 사진을 올리고, 어떤 문장을 쓸지 적습니다. 묶음 하나가 채팅창 하나예요.",
  },
  {
    title: "쓰던 AI에서 만든다",
    desc: "프롬프트를 복사해 ChatGPT·Gemini 어디서든 만듭니다. 이미지는 이 앱이 만들지 않아요.",
  },
  {
    title: "결과를 되가져온다",
    desc: "만든 이미지를 그 묶음에 올려 둡니다. 입력·프롬프트·결과가 한 화면에 남습니다.",
  },
];

const FEATURES = [
  {
    name: "한 화면에 셋이 함께",
    desc: "넣은 사진, 쓴 프롬프트, 받은 이미지를 한 묶음으로 봅니다. 어느 하나만 남기지 않아요.",
  },
  {
    name: "프롬프트 복사",
    desc: "긴 프롬프트도 한 번에 복사합니다. 쓰던 AI가 어디든 그대로 붙여 넣으면 돼요.",
  },
  {
    name: "원본 다운로드",
    desc: "넣었던 사진을 다시 받아 그쪽 앱에 올립니다. 이미지 주소를 밖으로 내보내지 않는 대신이에요.",
  },
  {
    name: "고쳐 쓴 프롬프트도 함께",
    desc: "같은 사진으로 문장을 두세 번 고쳤다면 그 과정도 한 묶음에 남습니다.",
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
