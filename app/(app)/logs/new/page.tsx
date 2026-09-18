import Link from "next/link";
import { Sheet } from "@/components/Sheet";

/**
 * 새 묶음 만들기 — M2 에서 업로드·프롬프트 입력이 들어온다.
 *
 * 껍데기 단계에서는 자리만 알린다. **화면을 감추지 않고 "아직 없다"를
 * 보여 주는 쪽**을 고른다 — 링크가 404 면 배포가 깨진 것처럼 보인다.
 */
export default function NewLogPage() {
  return (
    <Sheet point eyebrow="NEW" headline="곧 열려요">
      <p className="lead">
        사진을 올리고 프롬프트를 적는 화면을 만들고 있어요.
      </p>
      <p className="note-block">
        <strong>NOTE</strong>
        이미지 저장소를 붙이는 중이에요. 올린 사진은 기본이 비공개이고, 앱 밖으로
        주소가 나가지 않습니다.
      </p>
      <div className="row row--wrap" style={{ gap: 10, marginTop: 18 }}>
        <Link className="btn btn--ghost btn--sm" href="/logs">
          ← 내 묶음
        </Link>
      </div>
    </Sheet>
  );
}
