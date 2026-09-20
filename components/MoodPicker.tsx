"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { prepareImage } from "@/lib/clientImage";

/**
 * 분위기를 **눈으로** 고른다 — 가로 슬라이드 2단 (2026-09-18 사용자 지정).
 *
 * ```
 * 1단계  분위기 12칸을 가로로 넘기며 고른다
 * 2단계  그 분위기의 프롬프트를 가로로 넘기며 고른다
 * 3단계  고르면 **접힌다** — 아래 설정(사진·문구·비율)이 바로 올라온다
 * ```
 *
 * ⚠️ 처음에는 세로 격자였는데, 12칸 + 60칸이 아래로 쌓여 **뒤의 설정을 고르기가
 * 어려웠다.** 가로 줄은 높이가 한 줄로 고정되고, 고른 뒤 접으면 두 줄이 된다.
 *
 * 스크롤 스냅을 쓴다 — 손가락으로 넘기면 칸 경계에 맞춰 선다. 데스크톱에는
 * 화살표를 띄우되 **넘길 것이 있을 때만** 보여 준다(양 끝에서는 그쪽 화살표를 숨긴다).
 *
 * ⚠️ 예시 이미지는 **원본 URL 을 건다.** 우리 R2 로 복사하지 않는다 —
 * CC BY 4.0 은 수집물에 붙은 것이고 개별 이미지 저작권은 각자 따로 있다.
 * 깨지면 빈 액자 대신 **글자 카드**로 떨어뜨린다.
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
  /**
   * 레퍼런스 이미지에서 뽑은 것 (2026-09-20).
   *
   * 라이브러리 것과 달리 **DB 에 없다.** 그래서 본문을 여기 들고 있다가
   * 생성 요청에 함께 보낸다. `id` 는 비어 있다.
   */
  extracted?: {
    body: string;
    moodKo: string;
    /**
     * 분위기를 뽑는 데 쓴 이미지. 묶음이 생기면 `role: "reference"` 로 올린다
     * (2026-09-20 사용자 지정) — 지금은 묶음이 없어 붙일 곳이 없다.
     */
    file: Blob;
    previewUrl: string;
    width: number;
    height: number;
  };
};

export function MoodPicker({
  onPick,
  selected,
}: {
  onPick: (prompt: PromptCard | null) => void;
  /** 고른 프롬프트. 있으면 접힌 모습으로 그린다 */
  selected?: PromptCard | null;
}) {
  const [moods, setMoods] = useState<MoodCard[] | null>(null);
  const [mood, setMood] = useState<MoodCard | null>(null);
  const [items, setItems] = useState<PromptCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** 레퍼런스 이미지를 읽는 중 */
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = () => fileRef.current?.click();

  /**
   * 레퍼런스 이미지 → 기초 프롬프트.
   *
   * 줄인 파일을 **들고 있다가** 묶음이 생기면 함께 올린다 — 지금은 묶음이 없어
   * 붙일 곳이 없다 → app/(app)/logs/new/page.tsx
   */
  async function extract(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      /* 올리기 전에 줄인다 — 4.5MB 벽과 토큰 둘 다를 위해 */
      const prepared = await prepareImage(file);

      const form = new FormData();
      form.append("file", prepared.blob, file.name);
      const j = await fetch("/api/prompts/extract", { method: "POST", body: form }).then((r) =>
        r.json(),
      );
      if (!j.ok) throw new Error(j.error ?? "분위기를 뽑지 못했어요.");

      onPick({
        id: "",
        title: j.prompt.title,
        blurb: j.prompt.summary,
        mood: j.prompt.mood,
        charCount: j.prompt.body.length,
        examples: [],
        suggestedRatio: null,
        verified: false,
        featured: false,
        credit: { author: "", link: "", license: "", modified: false },
        extracted: {
          body: j.prompt.body,
          moodKo: j.prompt.moodKo,
          file: prepared.blob,
          previewUrl: prepared.previewUrl,
          width: prepared.width,
          height: prepared.height,
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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

  /* ── 3단계 — 골랐다. 접어서 아래 설정에 자리를 내준다 ── */
  if (selected) {
    return (
      <>
        <Scoped />
        <div style={pickedStyle}>
          {selected.extracted ? (
            /* 내가 올린 레퍼런스를 그대로 보여 준다 — 무엇을 보고 골랐는지 */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.extracted.previewUrl} alt="" style={pickedThumbStyle} />
          ) : (
            <Thumb url={selected.examples[0] ?? null} style={pickedThumbStyle} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={pickedTitleStyle}>{selected.title}</strong>
            <p style={pickedMetaStyle}>
              {selected.extracted
                ? `내 이미지에서 뽑음${selected.extracted.moodKo ? ` · ${selected.extracted.moodKo}` : ""}`
                : moodKo(moods, selected.mood)}
              {selected.suggestedRatio ? ` · 원래 ${selected.suggestedRatio}` : ""}
            </p>
            {selected.extracted ? (
              /* 올린 이미지는 저장하지 않았다. 그 사실을 알려 준다 */
              <p style={creditStyle}>올린 이미지는 묶음에 함께 남아요.</p>
            ) : (
              <p style={creditStyle}>
                출처 {selected.credit.author || "원작자"}
                {selected.credit.license ? ` · ${selected.credit.license}` : ""}
                {selected.credit.modified ? " · 수정함" : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              onPick(null);
              setMood(null);
            }}
          >
            다시 고르기
          </button>
        </div>
      </>
    );
  }

  /* ── 2단계 — 그 분위기의 프롬프트 ── */
  if (mood) {
    return (
      <>
        <Scoped />
        <div className="row row--wrap" style={{ gap: 8, alignItems: "center", marginBottom: 10 }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMood(null)}>
            ← 분위기
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
          <Rail label={`${mood.ko} 프롬프트`}>
            {items.map((p) => (
              <button key={p.id} type="button" style={tileStyle} onClick={() => onPick(p)}>
                <Thumb url={p.examples[0] ?? null} />
                <span style={tileBodyStyle}>
                  <strong style={tileTitleStyle}>{p.title}</strong>
                  {p.blurb ? <span style={tileHintStyle}>{p.blurb}</span> : null}
                </span>
              </button>
            ))}
          </Rail>
        )}
      </>
    );
  }

  /* ── 1단계 — 분위기 12칸 ── */
  if (moods === null) return <p className="lead">불러오는 중이에요…</p>;

  return (
    <>
      <Scoped />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => void extract(e.target.files?.[0])}
        style={{ display: "none" }}
      />
      <Rail label="분위기">
        {/*
          라이브러리에 원하는 느낌이 없을 때의 길 (2026-09-20 사용자 지정).
          **맨 앞에 둔다** — 12칸을 다 넘겨 보고 나서야 발견하면 이미 늦다.
        */}
        <button type="button" style={extractTileStyle} onClick={() => pickFile()} disabled={busy}>
          <span style={{ ...thumbStyle, ...extractThumbStyle }} aria-hidden="true">
            {busy ? "읽는 중…" : "＋"}
          </span>
          <span style={tileBodyStyle}>
            <strong style={tileTitleStyle}>이미지에서 뽑기</strong>
            <span style={tileHintStyle}>원하는 느낌의 사진을 올리면 그 분위기로 만들어요</span>
          </span>
        </button>

        {moods.map((m) => (
          <button
            key={m.id}
            type="button"
            style={{ ...tileStyle, opacity: m.count === 0 ? 0.45 : 1 }}
            onClick={() => m.count > 0 && setMood(m)}
            disabled={m.count === 0}
          >
            <Thumb url={m.coverUrl} />
            <span style={tileBodyStyle}>
              <strong style={tileTitleStyle}>{m.ko}</strong>
              <span style={tileHintStyle}>{m.hint}</span>
              <span style={tileCountStyle}>{m.count > 0 ? `${m.count}개` : "준비 중"}</span>
            </span>
          </button>
        ))}
      </Rail>
    </>
  );
}

/**
 * 가로 줄 — 스냅 스크롤 + 화살표.
 *
 * 화살표는 **넘길 것이 있을 때만** 그린다. 끝에 닿았는데 화살표가 남아 있으면
 * 눌러도 아무 일이 없어서 고장으로 읽힌다.
 */
function Rail({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<{ start: boolean; end: boolean }>({ start: true, end: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    /*
      ⚠️ **여유가 필요하다.** 줄에 좌우 패딩(2px)이 있고 스냅이 첫 칸을 그 안쪽에
      세우므로, 맨 앞에서도 `scrollLeft` 가 0 이 아니라 2 다. 1px 로 재면
      **처음부터 왼쪽 화살표가 보이고**, 눌러도 갈 곳이 없어 고장으로 읽힌다.
      (2026-09-18 실측: 초기 scrollLeft = 2)
      소수점 스크롤까지 감싸려면 이 정도가 필요하다.
    */
    const SLACK = 6;
    setEdge({
      start: el.scrollLeft <= SLACK,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - SLACK,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  /**
   * 한 화면씩 넘긴다 — **칸 경계로 정확히** 보낸다.
   *
   * ⚠️ `scrollBy({behavior:"smooth"})` 로는 안 된다. `scroll-snap-type: x mandatory`
   * 가 이동 중간에 되잡아서 **끝까지 가지 못하고 멈춘다.**
   * (2026-09-18 실측: 여섯 번 눌러도 scrollLeft 가 440 에서 더 안 갔다. 최대는 1256)
   *
   * 스냅 위치를 직접 계산해 `scrollTo` 하면 도착점이 곧 스냅점이라 되잡히지 않는다.
   * 위치는 `getBoundingClientRect` 차이로 잰다 — `offsetLeft` 는 offsetParent 가
   * 줄이 아니라 바깥 wrapper 라서 값이 어긋난다.
   */
  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const railLeft = el.getBoundingClientRect().left;
    const kids = Array.from(el.children) as HTMLElement[];

    /* 각 칸을 왼쪽 끝에 붙이려면 필요한 scrollLeft */
    const stops = kids.map((k) => {
      const r = k.getBoundingClientRect();
      return { left: el.scrollLeft + (r.left - railLeft), right: r.right - railLeft };
    });

    if (dir === 1) {
      /* 오른쪽에서 잘려 있는 첫 칸이 다음 화면의 첫 칸이 된다 */
      const next = stops.find((s) => s.right > el.clientWidth + 2);
      el.scrollTo({ left: next ? next.left : el.scrollWidth, behavior: "smooth" });
    } else {
      /* 한 화면 뒤로 — 그 지점 이후의 첫 스냅점 */
      const want = el.scrollLeft - el.clientWidth;
      const prev = stops.find((s) => s.left >= want);
      el.scrollTo({ left: prev && prev.left < el.scrollLeft ? prev.left : 0, behavior: "smooth" });
    }
  };

  return (
    <div style={railWrapStyle}>
      {!edge.start ? (
        <button type="button" onClick={() => nudge(-1)} style={{ ...arrowStyle, left: -6 }} aria-label="이전">
          ‹
        </button>
      ) : null}

      <div ref={ref} className="aik-rail" onScroll={measure} role="group" aria-label={label}>
        {children}
      </div>

      {!edge.end ? (
        <button type="button" onClick={() => nudge(1)} style={{ ...arrowStyle, right: -6 }} aria-label="다음">
          ›
        </button>
      ) : null}
    </div>
  );
}

/** 원본 URL 핫링크. 깨지면 빈 액자 대신 글자 카드 */
function Thumb({ url, style }: { url: string | null; style?: CSSProperties }) {
  const [broken, setBroken] = useState(false);
  const base = { ...thumbStyle, ...style };
  if (!url || broken) {
    return (
      <span style={{ ...base, ...thumbEmptyStyle }} aria-hidden="true">
        프롬프트
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={base}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

function moodKo(moods: MoodCard[] | null, id: string): string {
  return moods?.find((m) => m.id === id)?.ko ?? id;
}

/**
 * 스크롤바와 스냅은 인라인 스타일로 못 쓴다(의사요소·스냅 정렬).
 * 컴포넌트 안에 두어 **이 파일만 보면 전부 보이게** 한다.
 */
function Scoped() {
  return (
    <style>{`
      .aik-rail {
        display: flex;
        gap: 10px;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        /* 화살표가 칸에 겹치지 않게 양쪽에 여백을 준다 */
        padding: 2px 2px 10px;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: var(--border-strong) transparent;
      }
      .aik-rail > * { scroll-snap-align: start; }
      .aik-rail::-webkit-scrollbar { height: 7px; }
      .aik-rail::-webkit-scrollbar-track { background: transparent; }
      .aik-rail::-webkit-scrollbar-thumb {
        background: var(--border-strong);
        border-radius: 999px;
      }
    `}</style>
  );
}

const railWrapStyle: CSSProperties = { position: "relative" };

const arrowStyle: CSSProperties = {
  position: "absolute",
  top: "38%",
  zIndex: 2,
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  fontSize: "1.2rem",
  lineHeight: 1,
  fontWeight: 700,
  color: "var(--text-primary)",
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "50%",
  boxShadow: "0 2px 10px rgba(15, 32, 39, 0.16)",
  cursor: "pointer",
};

const tileStyle: CSSProperties = {
  /*
    한 줄에 고정 너비로 늘어서게 — 줄바꿈이 없으니 flex-shrink 를 꺼 둔다.
    136px 은 높이와 맞바꾼 값이다. 이 줄이 높으면 뒤의 설정(사진·문구·비율)이
    화면 밖으로 밀려서, 애초에 세로 격자를 버린 이유가 되살아난다.
  */
  flex: "0 0 136px",
  width: 136,
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
  padding: "9px 11px 11px",
};

const tileTitleStyle: CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 800,
  color: "var(--text-primary)",
  lineHeight: 1.35,
  wordBreak: "keep-all",
  /* 제목이 길어도 칸 높이가 들쭉날쭉하지 않게 두 줄로 자른다 */
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const tileHintStyle: CSSProperties = {
  fontSize: "0.7rem",
  lineHeight: 1.6,
  color: "var(--text-secondary)",
  wordBreak: "keep-all",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const tileCountStyle: CSSProperties = {
  fontSize: "0.68rem",
  fontWeight: 700,
  color: "var(--accent-ink)",
};

const extractTileStyle: CSSProperties = {
  flex: "0 0 136px",
  width: 136,
  display: "flex",
  flexDirection: "column",
  textAlign: "left",
  padding: 0,
  overflow: "hidden",
  background: "var(--bg-card)",
  /* 점선으로 "여기에 올린다" 를 알린다 — 다른 칸과 성격이 다르다 */
  border: "1px dashed var(--border-strong)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};

const extractThumbStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "var(--accent-ink)",
  background: "var(--accent-subtle)",
};

const crumbStyle: CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  color: "var(--text-secondary)",
};

/* ── 고른 뒤의 접힌 모습 ── */
const pickedStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: 10,
  background: "var(--bg-card)",
  border: "2px solid var(--accent)",
  borderRadius: "var(--radius-sm)",
};

const pickedThumbStyle: CSSProperties = {
  width: 62,
  flex: "0 0 62px",
  aspectRatio: "1 / 1",
  borderRadius: 7,
};

const pickedTitleStyle: CSSProperties = {
  display: "block",
  fontSize: "0.86rem",
  fontWeight: 800,
  color: "var(--text-primary)",
  lineHeight: 1.35,
  wordBreak: "keep-all",
};

const pickedMetaStyle: CSSProperties = {
  margin: "3px 0 0",
  fontSize: "0.74rem",
  color: "var(--accent-ink)",
  fontWeight: 700,
};

const creditStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: "0.65rem",
  lineHeight: 1.5,
  color: "var(--text-muted)",
  wordBreak: "break-all",
};
