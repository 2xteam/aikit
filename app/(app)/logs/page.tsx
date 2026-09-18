"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";

/**
 * 내 묶음 목록 — 썸네일 격자.
 *
 * 썸네일은 **결과 이미지 우선, 없으면 입력 사진**이다 (2026-09-18 사용자 지정).
 * 목록에서 보고 싶은 것은 "무엇을 만들었나"이지 "무엇을 넣었나"가 아니다.
 * 고르는 규칙은 서버에 있다 → models/LogImage.ts `pickCoverImage`
 *
 * ⚠️ 썸네일 주소는 `/api/img/<id>` 다. R2 주소는 브라우저에 오지 않는다.
 */

type Item = {
  id: string;
  title: string;
  latestSummary: string;
  latestVersion: number;
  inputCount: number;
  outputCount: number;
  coverImageId: string | null;
  updatedAt: string;
};

export default function LogsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/logs")
      .then((r) => r.json())
      .then((j) => (j.ok ? setItems(j.items) : setError(j.error ?? "불러오지 못했어요.")))
      .catch(() => setError("불러오지 못했어요."));
  }, []);

  if (error) {
    return (
      <Sheet eyebrow="PROMPT LOG" headline="내 묶음">
        <p className="note-block">
          <strong>NOTE</strong>
          {error}
        </p>
      </Sheet>
    );
  }

  if (items === null) {
    return (
      <Sheet eyebrow="PROMPT LOG" headline="내 묶음">
        <p className="lead">불러오는 중이에요…</p>
      </Sheet>
    );
  }

  if (items.length === 0) {
    return (
      <Sheet point eyebrow="PROMPT LOG" headline="내 묶음">
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

  return (
    <Sheet eyebrow="PROMPT LOG" headline={`내 묶음 ${items.length}개`}>
      <div className="row row--wrap" style={{ gap: 10, marginTop: 4, marginBottom: 18 }}>
        <Link className="btn btn--primary btn--sm" href="/logs/new">
          새 묶음 만들기 →
        </Link>
      </div>

      <div style={gridStyle}>
        {items.map((it) => (
          <Link key={it.id} href={`/logs/${it.id}`} style={cardStyle}>
            <Cover id={it.coverImageId} />
            <span style={bodyStyle}>
              <strong style={titleStyle}>{it.title}</strong>
              {it.latestSummary ? <span style={summaryStyle}>{it.latestSummary}</span> : null}
              <span style={metaStyle}>
                프롬프트 {it.latestVersion}개 · 사진 {it.inputCount}장 · 결과 {it.outputCount}장
              </span>
            </span>
          </Link>
        ))}
      </div>
    </Sheet>
  );
}

/** 아직 이미지가 없으면 빈 액자 대신 글자를 보여 준다 */
function Cover({ id }: { id: string | null }) {
  if (!id) {
    return (
      <span style={{ ...thumbStyle, ...emptyStyle }} aria-hidden="true">
        사진 없음
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/img/${id}`} alt="" style={thumbStyle} loading="lazy" />
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 12,
};

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  textDecoration: "none",
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
};

const thumbStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "4 / 5",
  objectFit: "cover",
  display: "block",
  background: "var(--bg-secondary)",
};

const emptyStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "var(--text-muted)",
};

const bodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 12px 12px",
};

const titleStyle: CSSProperties = {
  fontSize: "0.85rem",
  fontWeight: 800,
  lineHeight: 1.35,
  color: "var(--text-primary)",
  wordBreak: "keep-all",
};

const summaryStyle: CSSProperties = {
  fontSize: "0.72rem",
  lineHeight: 1.6,
  color: "var(--text-secondary)",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  wordBreak: "keep-all",
};

const metaStyle: CSSProperties = {
  fontSize: "0.68rem",
  color: "var(--text-muted)",
};
