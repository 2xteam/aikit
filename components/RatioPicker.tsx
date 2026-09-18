"use client";

import type { CSSProperties } from "react";
import { RATIOS, type RatioId } from "@/lib/prompts/vocab";

/**
 * 비율 고르기 — **칸의 모양이 곧 비율**이다.
 *
 * 숫자만 보여 주면 4:5 와 3:2 가 어느 쪽이 세로인지 매번 헷갈린다.
 * 칩 안에 실제 비율의 작은 네모를 그려 눈으로 알게 한다.
 *
 * 고른 값은 프롬프트의 OUTPUT 절로 들어가고, **기초 프롬프트에 박힌 비율보다
 * 이게 이긴다** — 어디에 쓸지는 사용자만 안다 → lib/prompts/vocab.ts
 */
export function RatioPicker({
  value,
  onChange,
  suggested,
}: {
  value: RatioId;
  onChange: (next: RatioId) => void;
  /** 고른 기초 프롬프트가 전제한 비율. 알려만 주고 막지 않는다 */
  suggested?: string | null;
}) {
  return (
    <>
      <div className="row row--wrap" style={{ gap: 8, marginTop: 14 }}>
        {RATIOS.map((r) => {
          const on = value === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange(r.id)}
              aria-pressed={on}
              style={{
                ...chipStyle,
                borderColor: on ? "var(--accent)" : "var(--border-subtle)",
                background: on ? "var(--accent-subtle)" : "var(--bg-card)",
              }}
            >
              {/* 실제 비율로 그린다. 세로가 긴지 가로가 긴지가 한눈에 보인다 */}
              <span
                aria-hidden="true"
                style={{
                  ...boxStyle,
                  aspectRatio: r.id.replace(":", " / "),
                  borderColor: on ? "var(--accent)" : "var(--border-strong)",
                }}
              />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <strong style={titleStyle}>{r.ko}</strong>
                <span style={hintStyle}>{r.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {suggested && suggested !== value ? (
        <p className="note-block">
          <strong>NOTE</strong>
          고른 프롬프트는 원래 {suggested} 구도로 쓰인 것이에요. {value} 로 뽑아도 되지만
          구도가 조금 달라질 수 있어요.
        </p>
      ) : null}
    </>
  );
}

const chipStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  textAlign: "left",
  padding: "9px 13px 9px 10px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};

const boxStyle: CSSProperties = {
  display: "block",
  /* 높이를 고정하고 aspect-ratio 로 너비를 정한다 — 칩 높이가 들쭉날쭉하지 않게 */
  height: 26,
  border: "2px solid var(--border-strong)",
  borderRadius: 3,
  flexShrink: 0,
};

const titleStyle: CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 800,
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
};

const hintStyle: CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
};
