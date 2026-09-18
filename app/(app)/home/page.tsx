import Link from "next/link";
import { Sheet } from "@/components/Sheet";

/** 포털에서 들어오는 링크는 소개 페이지를 거치지 않고 여기로 온다 */
export default function HomePage() {
  return (
    <>
      <Sheet
        tone="dark"
        eyebrow="PROMPT LOG"
        headline={
          <>
            오늘은
            <br />
            무엇을 만들어 볼까요?
          </>
        }
        lead="넣은 사진 · 쓴 프롬프트 · 받은 이미지를 한 묶음으로 남겨요."
      >
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <Link className="btn btn--primary" href="/logs/new">
            새 묶음 만들기 →
          </Link>
          <Link className="btn btn--ghost" href="/logs">
            내 묶음
          </Link>
        </div>
      </Sheet>

      <Sheet eyebrow="RECENT" headline="최근 묶음">
        <p className="lead">
          만든 묶음이 여기 모여요.
          <br />
          아직 아무것도 없어요 — 첫 묶음을 만들면 채워져요.
        </p>
      </Sheet>
    </>
  );
}
