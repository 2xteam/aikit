"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { MOODS, RATIOS } from "@/lib/prompts/vocab";

/**
 * ⑦ 검수 화면 — **로컬 전용 도구다.**
 *
 * 720건을 분위기당 20~30건으로 줄이는 자리. 볼트가 "이 파이프라인의 본체"라고
 * 부르는 단계이고, 앞의 여섯 단계는 기계가 하지만 **이건 사람이 한다.**
 *
 * 왜 사람이 해야 하는가 — 기계가 놓친 것이 실제로 있었다 (2026-09-18 확인):
 *   · 실명이 남아 있다 (Billie Eilish · Emma Stone …). 금칙어 목록은 완전해질 수 없다
 *   · 분위기 배정이 틀린 것이 111건. "Golden Hour Portrait" 가 film 에 들어가 있다
 *
 * ⚠️ 앱 껍데기(`(app)`) 밖에 둔다. AuthGate 가 포털로 보내 버리면 검수하려고
 * 포털까지 띄워야 한다. 대신 API 가 **프로덕션에서 404** 로 막는다.
 *
 * ⚠️ 판단은 `content/prompts/*.json` **파일이 원본**이다. 재적재해도 살아남는다.
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ②⑦
 */

type Item = {
  id: string;
  sourceId: string;
  title: string;
  titleEn: string;
  titleKo: string;
  body: string;
  charCount: number;
  mood: string;
  tags: string[];
  examples: string[];
  suggestedRatio: string | null;
  featured: boolean;
  reviewStatus: "pending" | "kept" | "rejected";
  credit: { author: string; link: string; license: string };
};

type Tally = { pending: number; kept: number; rejected: number };

/** 분위기당 목표. 볼트의 "분위기 12개 × 20~30개" */
const GOAL = 25;

export default function ReviewPage() {
  const [mood, setMood] = useState<string>(MOODS[0].id);
  const [status, setStatus] = useState<"all" | "pending" | "kept" | "rejected">("pending");
  const [items, setItems] = useState<Item[] | null>(null);
  const [tally, setTally] = useState<Tally>({ pending: 0, kept: 0, rejected: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    fetch(`/api/review?mood=${mood}&status=${status}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setItems(j.items);
          setTally(j.tally);
          setError(null);
        } else setError(j.error ?? "불러오지 못했어요.");
      })
      .catch(() => setError("불러오지 못했어요."));
  }, [mood, status]);

  useEffect(load, [load]);

  async function act(item: Item, action: string, extra: Record<string, unknown> = {}) {
    setBusy(item.id);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action, ...extra }),
      });
      const j = await res.json();
      if (!j.ok) {
        setError(j.error ?? "저장하지 못했어요.");
        return;
      }
      /*
        목록을 통째로 다시 받지 않는다 — 검수는 연속 동작이라 매번 다시 그리면
        방금 보던 자리를 잃는다. 건수만 손으로 맞춘다.
      */
      setItems((prev) =>
        prev
          ? prev.map((it) => (it.id === item.id ? { ...it, ...(j.set ?? {}) } : it))
          : prev,
      );
      if (action === "keep" || action === "reject" || action === "pending") {
        setTally((t) => {
          const next = { ...t };
          next[item.reviewStatus] = Math.max(0, next[item.reviewStatus] - 1);
          const to = action === "keep" ? "kept" : action === "reject" ? "rejected" : "pending";
          next[to as keyof Tally] += 1;
          return next;
        });
      }
    } catch {
      setError("저장하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  const current = MOODS.find((m) => m.id === mood);
  const done = tally.kept;
  const pct = Math.min(100, Math.round((done / GOAL) * 100));

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={h1Style}>프롬프트 검수</h1>
          <p style={subStyle}>
            판단은 <code>content/prompts/curation.json</code> 에 바로 저장돼요. 다시
            적재해도 남습니다. <strong>로컬에서만 열리는 화면이에요.</strong>
          </p>
        </div>
      </header>

      {/* 분위기 고르기 — 진행률을 함께 보여 준다 */}
      <div style={moodBarStyle}>
        {MOODS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMood(m.id)}
            style={{
              ...moodChipStyle,
              borderColor: mood === m.id ? "var(--accent)" : "var(--border-subtle)",
              background: mood === m.id ? "var(--accent-subtle)" : "var(--bg-card)",
              fontWeight: mood === m.id ? 800 : 600,
            }}
          >
            {m.ko}
          </button>
        ))}
      </div>

      <div style={statusBarStyle}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["pending", "kept", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              style={{
                ...tabStyle,
                borderBottomColor: status === s ? "var(--accent)" : "transparent",
                color: status === s ? "var(--accent-ink)" : "var(--text-secondary)",
              }}
            >
              {s === "pending" ? "안 본 것" : s === "kept" ? "남김" : s === "rejected" ? "버림" : "전체"}
              {s !== "all" ? ` ${tally[s]}` : ""}
            </button>
          ))}
        </div>
        <div style={progressWrapStyle}>
          <div style={{ ...progressBarStyle, width: `${pct}%` }} />
          <span style={progressTextStyle}>
            {current?.ko} · 남김 {done} / 목표 {GOAL}
          </span>
        </div>
      </div>

      {error ? <p style={errorStyle}>{error}</p> : null}

      {items === null ? (
        <p style={{ color: "var(--text-secondary)" }}>불러오는 중…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>여기에는 남은 게 없어요.</p>
      ) : (
        <div style={gridStyle}>
          {items.map((it) => (
            <Card
              key={it.id}
              item={it}
              busy={busy === it.id}
              expanded={open === it.id}
              onToggle={() => setOpen(open === it.id ? null : it.id)}
              onAct={(a, extra) => act(it, a, extra)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({
  item,
  busy,
  expanded,
  onToggle,
  onAct,
}: {
  item: Item;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAct: (action: string, extra?: Record<string, unknown>) => void;
}) {
  const [ko, setKo] = useState(item.titleKo ?? "");

  const tone =
    item.reviewStatus === "kept"
      ? "var(--success)"
      : item.reviewStatus === "rejected"
        ? "var(--danger)"
        : "var(--border-subtle)";

  return (
    <article style={{ ...cardStyle, borderColor: tone, opacity: busy ? 0.6 : 1 }}>
      {/* 예시 이미지 — 판단의 8할이 여기서 난다. 여러 장을 가로로 늘어놓는다 */}
      <div style={stripStyle}>
        {item.examples.length === 0 ? (
          <span style={noImgStyle}>예시 이미지 없음</span>
        ) : (
          item.examples.slice(0, 4).map((u) => <Thumb key={u} url={u} />)
        )}
      </div>

      <div style={cardBodyStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <strong style={titleStyle}>{item.titleEn}</strong>
          <span style={badgeStyle}>
            {item.charCount}자{item.suggestedRatio ? ` · ${item.suggestedRatio}` : ""}
          </span>
        </div>

        {item.tags.length ? (
          <p style={tagsStyle}>{item.tags.slice(0, 8).join(" · ")}</p>
        ) : null}

        <button type="button" onClick={onToggle} style={linkBtnStyle}>
          {expanded ? "본문 접기" : "본문 보기"}
        </button>
        {expanded ? <pre style={bodyStyle}>{item.body}</pre> : null}

        {/* 분위기 고치기 — 111건이 틀려 있었다. 여기가 그걸 잡는 자리다 */}
        <label style={rowStyle}>
          <span style={labelStyle}>분위기</span>
          <select
            value={item.mood}
            onChange={(e) => onAct("mood", { mood: e.target.value })}
            style={selectStyle}
          >
            {MOODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.ko}
              </option>
            ))}
          </select>
        </label>

        <label style={rowStyle}>
          <span style={labelStyle}>한국어 제목</span>
          <input
            value={ko}
            onChange={(e) => setKo(e.target.value)}
            onBlur={() => ko !== item.titleKo && onAct("title", { titleKo: ko })}
            placeholder="비워 두면 영문 제목을 씁니다"
            style={inputStyle}
          />
        </label>

        <div style={actionsStyle}>
          <button
            type="button"
            onClick={() => onAct("keep")}
            style={{
              ...actBtnStyle,
              background: item.reviewStatus === "kept" ? "var(--success)" : "var(--bg-secondary)",
              color: item.reviewStatus === "kept" ? "var(--on-accent)" : "var(--text-primary)",
            }}
          >
            남김
          </button>
          <button
            type="button"
            onClick={() => onAct("reject", { reason: "검수에서 제외" })}
            style={{
              ...actBtnStyle,
              background: item.reviewStatus === "rejected" ? "var(--danger)" : "var(--bg-secondary)",
              color: item.reviewStatus === "rejected" ? "var(--on-accent)" : "var(--text-primary)",
            }}
          >
            버림
          </button>
          <button
            type="button"
            onClick={() => onAct("feature", { featured: !item.featured })}
            style={{
              ...actBtnStyle,
              background: item.featured ? "var(--point)" : "var(--bg-secondary)",
              color: item.featured ? "var(--point-ink)" : "var(--text-primary)",
            }}
            title="대표 이미지로 올라옵니다"
          >
            {item.featured ? "★ 대표" : "☆ 대표"}
          </button>
          {item.reviewStatus !== "pending" ? (
            <button type="button" onClick={() => onAct("pending")} style={undoStyle}>
              되돌리기
            </button>
          ) : null}
        </div>

        <p style={creditStyle}>
          {item.credit.author || "원작자"} ·{" "}
          <a href={item.credit.link} target="_blank" rel="noreferrer noopener" style={{ color: "var(--accent-ink)" }}>
            원문
          </a>{" "}
          · {item.credit.license}
        </p>
      </div>
    </article>
  );
}

/** 원본 URL 핫링크. 깨지면 빈 액자 대신 글자로 */
function Thumb({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span style={noImgStyle}>깨짐</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={imgStyle}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  padding: "22px 18px 60px",
  maxWidth: 1320,
  margin: "0 auto",
};
const headerStyle: CSSProperties = { marginBottom: 16 };
const h1Style: CSSProperties = { margin: 0, fontSize: "1.3rem", fontWeight: 900, letterSpacing: "-0.02em" };
const subStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: "0.8rem",
  lineHeight: 1.7,
  color: "var(--text-secondary)",
};
const moodBarStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 };
const moodChipStyle: CSSProperties = {
  padding: "6px 11px",
  fontSize: "0.78rem",
  border: "1px solid var(--border-subtle)",
  borderRadius: 999,
  cursor: "pointer",
  color: "var(--text-primary)",
};
const statusBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 16,
  paddingBottom: 8,
  borderBottom: "1px solid var(--border-subtle)",
};
const tabStyle: CSSProperties = {
  padding: "6px 4px",
  fontSize: "0.82rem",
  fontWeight: 700,
  background: "none",
  border: "none",
  borderBottom: "2px solid transparent",
  cursor: "pointer",
};
const progressWrapStyle: CSSProperties = {
  position: "relative",
  minWidth: 220,
  height: 22,
  borderRadius: 999,
  background: "var(--bg-secondary)",
  overflow: "hidden",
};
const progressBarStyle: CSSProperties = {
  position: "absolute",
  inset: "0 auto 0 0",
  background: "var(--accent-subtle)",
};
const progressTextStyle: CSSProperties = {
  position: "relative",
  display: "block",
  lineHeight: "22px",
  textAlign: "center",
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "var(--text-primary)",
};
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))",
  gap: 14,
};
const cardStyle: CSSProperties = {
  border: "2px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-card)",
  overflow: "hidden",
};
const stripStyle: CSSProperties = {
  display: "flex",
  gap: 2,
  background: "var(--bg-secondary)",
  minHeight: 132,
};
const imgStyle: CSSProperties = { flex: 1, minWidth: 0, height: 132, objectFit: "cover", display: "block" };
const noImgStyle: CSSProperties = {
  flex: 1,
  display: "grid",
  placeItems: "center",
  height: 132,
  fontSize: "0.72rem",
  color: "var(--text-muted)",
};
const cardBodyStyle: CSSProperties = { padding: "11px 13px 13px", display: "flex", flexDirection: "column", gap: 7 };
const titleStyle: CSSProperties = { fontSize: "0.86rem", fontWeight: 800, lineHeight: 1.4 };
const badgeStyle: CSSProperties = { fontSize: "0.68rem", color: "var(--text-muted)", whiteSpace: "nowrap" };
const tagsStyle: CSSProperties = { margin: 0, fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.6 };
const linkBtnStyle: CSSProperties = {
  alignSelf: "flex-start",
  padding: 0,
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "var(--accent-ink)",
  background: "none",
  border: "none",
  cursor: "pointer",
};
const bodyStyle: CSSProperties = {
  margin: 0,
  maxHeight: 260,
  overflow: "auto",
  padding: 10,
  fontSize: "0.7rem",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  background: "var(--bg-secondary)",
  borderRadius: 6,
};
const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const labelStyle: CSSProperties = { fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", width: 62 };
const selectStyle: CSSProperties = {
  flex: 1,
  padding: "5px 8px",
  fontSize: "0.76rem",
  background: "var(--input-bg)",
  color: "var(--text-primary)",
  border: "1px solid var(--input-border)",
  borderRadius: 6,
};
const inputStyle: CSSProperties = { ...selectStyle };
const actionsStyle: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 };
const actBtnStyle: CSSProperties = {
  padding: "7px 13px",
  fontSize: "0.78rem",
  fontWeight: 800,
  border: "1px solid var(--border-subtle)",
  borderRadius: 7,
  cursor: "pointer",
};
const undoStyle: CSSProperties = {
  padding: "7px 10px",
  fontSize: "0.74rem",
  fontWeight: 600,
  color: "var(--text-secondary)",
  background: "none",
  border: "none",
  cursor: "pointer",
};
const creditStyle: CSSProperties = { margin: 0, fontSize: "0.65rem", color: "var(--text-muted)", lineHeight: 1.5 };
const errorStyle: CSSProperties = {
  margin: "0 0 12px",
  padding: "9px 12px",
  fontSize: "0.8rem",
  color: "var(--danger-ink)",
  background: "var(--danger-subtle)",
  borderRadius: 7,
};
