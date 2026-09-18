import Link from "next/link";
import { Sheet } from "@/components/Sheet";

/**
 * Prompt Log 목록 — M2 에서 썸네일 격자로 채운다.
 *
 * 지금은 자리만 잡아 둔다. 빈 화면이라도 **어디에 무엇이 들어오는지**가
 * 보여야 M2 에서 화면을 다시 설계하지 않는다.
 * → my-obsidian-vault / 50-Plans/H AIKit 구축.md
 */
export default function LogsPage() {
  return (
    <Sheet eyebrow="PROMPT LOG" headline="내 묶음">
      <p className="lead">
        한 묶음에 넣은 사진 · 프롬프트 · 결과 이미지가 함께 들어가요.
        <br />
        아직 만든 묶음이 없어요.
      </p>
      <div className="row row--wrap" style={{ gap: 10, marginTop: 18 }}>
        <Link className="btn btn--primary" href="/logs/new">
          새 묶음 만들기 →
        </Link>
      </div>
    </Sheet>
  );
}
