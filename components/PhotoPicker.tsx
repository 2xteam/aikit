"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { prepareImage, type PreparedImage } from "@/lib/clientImage";

/**
 * 사진 고르기 — **올리지는 않는다.** 고르고 줄여서 들고만 있는다.
 *
 * 올리는 시점을 부모가 정하게 한 이유는, 묶음이 아직 없을 수 있기 때문이다.
 * `/logs/new` 는 [만들기] 를 누를 때 묶음을 만들고 그 다음에 올린다 — 먼저
 * 만들어 두면 중간에 그만둔 빈 묶음이 쌓인다.
 *
 * 번호(1번 · 2번)를 눈에 보이게 매긴다. 사용자가 **"1번 사진의 인물을 2번
 * 배경에"** 처럼 가리켜 쓰기 때문이다 → 커스텀 문구가 이걸 참조한다.
 */

export type Picked = PreparedImage & { key: string; name: string };

export function PhotoPicker({
  value,
  onChange,
  max = 4,
  label = "사진 고르기",
}: {
  value: Picked[];
  onChange: (next: Picked[]) => void;
  max?: number;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* 미리보기 URL 은 떠날 때 반드시 놓아 준다. 안 그러면 메모리에 남는다 */
  useEffect(() => {
    return () => {
      for (const p of value) URL.revokeObjectURL(p.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const room = max - value.length;
      if (room <= 0) {
        setError(`사진은 ${max}장까지 넣을 수 있어요.`);
        return;
      }
      const picked: Picked[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        if (!file.type.startsWith("image/")) continue;
        const prepared = await prepareImage(file);
        picked.push({ ...prepared, key: `${file.name}-${file.size}-${Date.now()}`, name: file.name });
      }
      if (picked.length === 0) setError("이미지 파일만 넣을 수 있어요.");
      onChange([...value, ...picked]);
    } finally {
      setBusy(false);
      /* 같은 파일을 다시 고를 수 있게 비운다 */
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(key: string) {
    const gone = value.find((v) => v.key === key);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    onChange(value.filter((v) => v.key !== key));
  }

  return (
    <div>
      <div style={gridStyle}>
        {value.map((p, i) => (
          <figure key={p.key} style={itemStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.previewUrl} alt="" style={thumbStyle} />
            <figcaption style={capStyle}>
              <span style={numStyle}>{i + 1}번</span>
              <button type="button" onClick={() => remove(p.key)} style={removeStyle}>
                빼기
              </button>
            </figcaption>
          </figure>
        ))}

        {value.length < max ? (
          <button type="button" onClick={() => inputRef.current?.click()} style={addStyle} disabled={busy}>
            {busy ? "줄이는 중…" : `＋ ${label}`}
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => void add(e.target.files)}
        style={{ display: "none" }}
      />

      {error ? <p style={errStyle}>{error}</p> : null}
      {value.length > 0 ? (
        <p style={noteStyle}>
          올리기 전에 긴 변 2400px 로 줄여요. 아래 문구에서 <strong>1번 · 2번</strong>으로
          가리킬 수 있어요.
        </p>
      ) : null}
    </div>
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 10,
  marginTop: 14,
};
const itemStyle: CSSProperties = {
  margin: 0,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  overflow: "hidden",
  background: "var(--bg-card)",
};
const thumbStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  display: "block",
  background: "var(--bg-secondary)",
};
const capStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 9px",
};
const numStyle: CSSProperties = { fontSize: "0.74rem", fontWeight: 800, color: "var(--accent-ink)" };
const removeStyle: CSSProperties = {
  padding: 0,
  fontSize: "0.72rem",
  color: "var(--text-muted)",
  background: "none",
  border: "none",
  cursor: "pointer",
};
const addStyle: CSSProperties = {
  aspectRatio: "1 / 1",
  fontSize: "0.8rem",
  fontWeight: 700,
  color: "var(--accent-ink)",
  background: "var(--bg-secondary)",
  border: "1px dashed var(--border-strong)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};
const errStyle: CSSProperties = {
  margin: "10px 0 0",
  fontSize: "0.78rem",
  color: "var(--danger-ink)",
};
const noteStyle: CSSProperties = {
  margin: "10px 0 0",
  fontSize: "0.74rem",
  lineHeight: 1.7,
  color: "var(--text-secondary)",
};
