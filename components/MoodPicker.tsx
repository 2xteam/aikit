"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

/**
 * 분위기를 **눈으로** 고른다 — 2단 구조 (2026-09-18 사용자 지정).
 *
 * ```
 * 1단계  분위기 12칸. 각 칸에 대표 이미지 한 장
 * 2단계  그 분위기 안의 60건. 예시 이미지 격자에서 고른다
 * ```
 *
 * 글보다 그림으로 고른다. "시네마틱"이라는 말보다 그 사진 한 장이 빠르다.
 *
 * ⚠️ 예시 이미지는 **원본 URL 을 건다.** 우리 R2 로 복사하지 않는다 —
 * CC BY 4.0 은 수집물에 붙은 것이고 개별 이미지 저작권은 각자 따로 있다.
 * 그래서 깨질 수 있고, 깨지면 빈 액자 대신 **프롬프트 전용 카드**로 떨어뜨린다.
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ⑤
 */

export type MoodCard = {
  id: string;
  ko: string;
  hint: string;
  count: number;
  coverUrl: string | null;
};

export type PromptCard = {
  id: string;
  title: string;
  blurb: string;
  mood: string;
  charCount: number;
  examples: string[];
  suggestedRatio: string | null;
  verified: boolean;
  featured: boolean;
  credit: { author: string; link: string; license: string; modified: boolean };
};

export function MoodPicker({
  onPick,
  selectedId,
}: {
  onPick: (prompt: PromptCard) => void;
  selectedId?: string | null;
}) {
  const [moods, setMoods] = useState<MoodCard[] | null>(null);
  const [mood, setMood] = useState<MoodCard | null>(null);
  const [items, setItems] = useState<PromptCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/prompts/moods")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.ok) setMoods(j.moods);
        else setError(j.error ?? "분위기를 불러오지 못했어요.");
      })
      .catch(() => alive && setError("분위기를 불러오지 못했어요."));
    return () => {
      alive = false;
    };
  }, []);

  /* 분위기를 바꾸면 목록을 비우고 다시 받는다 — 옛 목록이 잠깐 보이면 잘못 고른다 */
  useEffect(() => {
    if (!mood) return;
    let alive = true;
    setItems(null);
    fetch(`/api/prompts?mood=${encodeURIComponent(mood.id)}&limit=60`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.ok) {
          setItems(j.items);
          setTotal(j.total);
        } else setError(j.error ?? "프롬프트를 불러오지 못했어요.");
      })
      .catch(() => alive && setError("프롬프트를 불러오지 못했어요."));
    return () => {
      alive = false;
    };
  }, [mood]);

  if (error) {
    return (
      <p className="note-block">
        <strong>NOTE</strong>
        {error}
      </p>
    );
  }

  /* ── 2단계 ── */
  if (mood) {
    return (
      <div>
        <div className="row row--wrap" style={{ gap: 8, marginBottom: 14 }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMood(null)}>
            ← 분위기 다시 고르기
          </button>
          <span style={crumbStyle}>
            {mood.ko} · {total}개
          </span>
        </div>

        {items === null ? (
          <p className="lead">불러오는 중이에요…</p>
        ) : items.length === 0 ? (
          <p className="lead">이 분위기에는 아직 프롬프트가 없어요.</p>
        ) : (
          <div style={gridStyle}>
            {items.map((p) => (
              <PromptTile
                key={p.id}
                prompt={p}
                selected={selectedId === p.id}
                onPick={() => onPick(p)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── 1단계 ── */
  if (moods === null) return <p className="lead">불러오는 중이에요…</p>;

  return (
    <div style={gridStyle}>
      {moods.map((m) => (
        <button
          key={m.id}
          type="button"
          style={tileStyle}
          onClick={() => m.count > 0 && setMood(m)}
          disabled={m.count === 0}
          aria-label={`${m.ko} — ${m.count}개`}
        >
          <Thumb url={m.coverUrl} alt="" />
          <span style={tileBodyStyle}>
            <strong style={tileTitleStyle}>{m.ko}</strong>
            <span style={tileHintStyle}>{m.hint}</span>
            <span style={tileCountStyle}>{m.count > 0 ? `${m.count}개` : "준비 중"}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function PromptTile({
  prompt,
  selected,
  onPick,
}: {
  prompt: PromptCard;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        ...tileStyle,
        borderColor: selected ? "var(--accent)" : "var(--border-subtle)",
        borderWidth: selected ? 2 : 1,
      }}
      aria-pressed={selected}
    >
      <Thumb url={prompt.examples[0] ?? null} alt="" />
      <span style={tileBodyStyle}>
        <strong style={tileTitleStyle}>{prompt.title}</strong>
        {prompt.blurb ? <span style={tileHintStyle}>{prompt.blurb}</span> : null}
        {/*
          CC BY 4.0 은 출처 표기가 **조건**이다. 선택이 아니라서 카드마다 붙인다.
          → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ①
        */}
        <span style={creditStyle}>
          출처 {prompt.credit.author || "원작자"}
          {prompt.credit.license ? ` · ${prompt.credit.license}` : ""}
          {prompt.credit.modified ? " · 수정함" : ""}
        </span>
      </span>
    </button>
  );
}

/**
 * 원본 URL 핫링크. **깨지면 빈 액자를 보여 주지 않는다** — 글자 카드로 떨어뜨린다.
 * `referrerPolicy` 는 어디서 거는지 상대에게 알리지 않으려는 것이다.
 */
function Thumb({ url, alt }: { url: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <span style={{ ...thumbStyle, ...thumbEmptyStyle }} aria-hidden="true">
        프롬프트
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      style={thumbStyle}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 12,
};

const tileStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  textAlign: "left",
  padding: 0,
  overflow: "hidden",
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};

const thumbStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "4 / 5",
  objectFit: "cover",
  display: "block",
  background: "var(--bg-secondary)",
};

const thumbEmptyStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "var(--text-muted)",
};

const tileBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  padding: "10px 12px 12px",
};

const tileTitleStyle: CSSProperties = {
  fontSize: "0.85rem",
  fontWeight: 800,
  color: "var(--text-primary)",
  lineHeight: 1.35,
  wordBreak: "keep-all",
};

const tileHintStyle: CSSProperties = {
  fontSize: "0.72rem",
  lineHeight: 1.6,
  color: "var(--text-secondary)",
  wordBreak: "keep-all",
};

const tileCountStyle: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "var(--accent-ink)",
};

const creditStyle: CSSProperties = {
  fontSize: "0.65rem",
  lineHeight: 1.5,
  color: "var(--text-muted)",
  wordBreak: "break-all",
};

const crumbStyle: CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  color: "var(--text-secondary)",
  alignSelf: "center",
};
