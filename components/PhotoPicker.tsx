"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { prepareImage, type PreparedImage } from "@/lib/clientImage";

/**
 * 사진 고르기 — **두 가지 모드**로 쓴다.
 *
 * | 모드 | 언제 | 어떻게 |
 * |---|---|---|
 * | 들고 있기 (`value`/`onChange`) | 새 묶음 | 고르고 줄여서 들고만 있는다. 묶음이 아직 없으므로 |
 * | **바로 보내기** (`onReady`) | 결과 이미지 | 고르는 즉시 부모가 올린다. 버튼이 없다 |
 *
 * ⚠️ 새 묶음에서 바로 올릴 수 없는 이유 — 그 시점에는 묶음이 없다. 미리 만들면
 * 중간에 그만둔 빈 묶음이 쌓인다 → app/(app)/logs/new/page.tsx
 *
 * 결과 이미지는 묶음이 이미 있으므로 **고르자마자 올린다**. 고르고 나서 버튼을
 * 한 번 더 누르게 하면, 고른 것만으로 끝난 줄 알고 떠나는 사람이 생긴다
 * (2026-09-19 사용자 지정).
 *
 * 번호(1번 · 2번)를 눈에 보이게 매긴다. 사용자가 **"1번 사진의 인물을 2번
 * 배경에"** 처럼 가리켜 쓰기 때문이다 → 커스텀 문구가 이걸 참조한다.
 */

export type Picked = PreparedImage & { key: string; name: string };

type Common = {
  max?: number;
  label?: string;
  /** 바깥에서 올리는 중이면 고르기를 막는다 */
  busy?: boolean;
};

type HoldProps = Common & {
  value: Picked[];
  onChange: (next: Picked[]) => void;
  onReady?: never;
};

type SendProps = Common & {
  /** 고르는 즉시 넘긴다. 부모가 올리고 나면 이 컴포넌트는 비운다 */
  onReady: (picked: Picked[]) => Promise<void> | void;
  value?: never;
  onChange?: never;
};

export function PhotoPicker(props: HoldProps | SendProps) {
  const { max = 4, label = "사진 고르기", busy = false } = props;
  const immediate = typeof props.onReady === "function";
  const value = immediate ? [] : (props.value ?? []);

  const inputRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
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
    setWorking(true);
    try {
      const room = immediate ? max : max - value.length;
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
      if (picked.length === 0) {
        setError("이미지 파일만 넣을 수 있어요.");
        return;
      }

      if (immediate) {
        await (props as SendProps).onReady(picked);
        /* 부모가 올리고 목록을 다시 받는다. 미리보기는 여기서 놓아 준다 */
        for (const p of picked) URL.revokeObjectURL(p.previewUrl);
      } else {
        (props as HoldProps).onChange([...value, ...picked]);
      }
    } finally {
      setWorking(false);
      /* 같은 파일을 다시 고를 수 있게 비운다 */
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(key: string) {
    if (immediate) return;
    const gone = value.find((v) => v.key === key);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    (props as HoldProps).onChange(value.filter((v) => v.key !== key));
  }

  const disabled = working || busy;

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

        {immediate || value.length < max ? (
          <button type="button" onClick={() => inputRef.current?.click()} style={addStyle} disabled={disabled}>
            {working ? "줄이는 중…" : busy ? "올리는 중…" : `＋ ${label}`}
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
