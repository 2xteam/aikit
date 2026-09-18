"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { PhotoPicker, type Picked } from "@/components/PhotoPicker";
import { RatioPicker } from "@/components/RatioPicker";
import { uploadImage } from "@/lib/clientImage";
import { DEFAULT_RATIO, isRatioId, moodLabel, type RatioId } from "@/lib/prompts/vocab";

/**
 * 묶음 상세 — **이 앱의 핵심 화면이다.**
 *
 * ```
 * 넣은 사진      →   프롬프트 버전 목록   →   받은 결과 이미지
 * ```
 *
 * 셋을 한 화면에 두는 것이 이 앱이 파는 것이다. 두 달 뒤에 열어도 "무엇을
 * 넣어서 어떤 문장으로 무엇을 얻었는지"가 그대로 있다.
 *
 * 화면은 **채팅이 아니라 버전 목록**이다 — 결정적 동작이 복사인데 채팅이면
 * 복사 대상이 말풍선 사이에 섞이고, 결과 이미지를 어느 버전에 묶을 앵커도 없다.
 * (모델에 보내는 내용은 여전히 대화다 → app/api/logs/[id]/prompts/route.ts)
 */

type Img = { id: string; role: "input" | "output"; promptVersion: number | null; order: number };
type Prompt = {
  id: string;
  version: number;
  request: string;
  text: string;
  summary: string;
  mood: string;
  ratio: string;
  parentVersion: number | null;
};
type Data = {
  log: { id: string; title: string; memo: string };
  images: Img[];
  prompts: Prompt[];
};

export default function LogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/logs/${id}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setData(j) : setError(j.error ?? "불러오지 못했어요.")))
      .catch(() => setError("불러오지 못했어요."));
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <Sheet eyebrow="PROMPT LOG" headline="묶음">
        <p className="note-block">
          <strong>NOTE</strong>
          {error}
        </p>
        <Link className="btn btn--ghost btn--sm" href="/logs" style={{ marginTop: 14 }}>
          ← 내 묶음
        </Link>
      </Sheet>
    );
  }
  if (!data) return <p className="lead">불러오는 중이에요…</p>;

  const inputs = data.images.filter((i) => i.role === "input");
  const outputs = data.images.filter((i) => i.role === "output");
  const latest = data.prompts[data.prompts.length - 1] ?? null;

  async function removeLog() {
    if (!confirm("이 묶음을 지울까요? 올린 이미지도 함께 지워지고 되돌릴 수 없어요.")) return;
    setBusy("지우는 중…");
    const j = await fetch(`/api/logs/${id}`, { method: "DELETE" }).then((r) => r.json());
    if (j.ok) router.push("/logs");
    else {
      setError(j.error ?? "지우지 못했어요.");
      setBusy(null);
    }
  }

  return (
    <>
      <Sheet
        tone="dark"
        point
        eyebrow="PROMPT LOG"
        headline={data.log.title || "이름 없는 묶음"}
        lead={latest?.summary || "아직 프롬프트가 없어요."}
      >
        <p style={darkMetaStyle}>
          {latest ? `${moodLabel(latest.mood)} · ${latest.ratio} · 프롬프트 ${latest.version}개` : "—"}
          {` · 사진 ${inputs.length}장 · 결과 ${outputs.length}장`}
        </p>
      </Sheet>

      {/* ── 넣은 사진 ── */}
      <Sheet eyebrow="INPUT" headline="넣은 사진">
        {inputs.length === 0 ? (
          <p className="lead">넣은 사진이 없어요.</p>
        ) : (
          <div style={stripStyle}>
            {inputs.map((im, i) => (
              <figure key={im.id} style={figStyle}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/img/${im.id}`} alt="" style={imgStyle} loading="lazy" />
                <figcaption style={capStyle}>{i + 1}번</figcaption>
              </figure>
            ))}
          </div>
        )}
      </Sheet>

      {/* ── 프롬프트 버전들 ── */}
      {data.prompts.length === 0 ? (
        <NoPrompt logId={id} onDone={load} />
      ) : (
        <Sheet eyebrow="PROMPTS" headline="만든 프롬프트">
          <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
            {data.prompts
              .slice()
              .reverse()
              .map((p) => (
                <PromptCard key={p.id} prompt={p} isLatest={p.version === latest?.version} />
              ))}
          </div>
        </Sheet>
      )}

      {/* ── 고쳐 달라기 ── */}
      {latest ? <Revise logId={id} latest={latest} onDone={load} /> : null}

      {/* ── 결과 되가져오기 ── */}
      <Outputs logId={id} outputs={outputs} latestVersion={latest?.version ?? null} onDone={load} />

      <Sheet center>
        <div className="row row--wrap" style={{ gap: 10, justifyContent: "center" }}>
          <Link className="btn btn--ghost btn--sm" href="/logs">
            ← 내 묶음
          </Link>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void removeLog()}>
            {busy ?? "묶음 지우기"}
          </button>
        </div>
      </Sheet>
    </>
  );
}

/** 프롬프트 한 버전 — **복사 버튼이 이 카드의 주인공이다** */
function PromptCard({ prompt, isLatest }: { prompt: Prompt; isLatest: boolean }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(isLatest);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 권한이 없으면 사용자가 직접 고를 수 있게 본문을 펼쳐 준다 */
      setOpen(true);
    }
  }

  return (
    <article style={{ ...cardStyle, borderColor: isLatest ? "var(--accent)" : "var(--border-subtle)" }}>
      <header style={cardHeadStyle}>
        <span style={verStyle}>
          v{prompt.version}
          {isLatest ? " · 최신" : ""}
        </span>
        <span style={verMetaStyle}>
          {prompt.ratio} · {prompt.text.length}자
        </span>
      </header>

      {/* 사용자가 뭐라고 했는지 — 두 달 뒤에 이게 없으면 왜 이렇게 됐는지 모른다 */}
      {prompt.request ? (
        <p style={requestStyle}>
          <span style={requestTagStyle}>{prompt.version === 1 ? "요청" : "고쳐 달라고 한 말"}</span>
          {prompt.request}
        </p>
      ) : null}

      {prompt.summary ? <p style={summaryStyle}>{prompt.summary}</p> : null}

      <div className="row row--wrap" style={{ gap: 8 }}>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => void copy()}>
          {copied ? "복사했어요 ✓" : "프롬프트 복사"}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(!open)}>
          {open ? "접기" : "프롬프트 보기"}
        </button>
      </div>

      {open ? <pre style={preStyle}>{prompt.text}</pre> : null}
    </article>
  );
}

/** 프롬프트가 아직 없는 묶음 — 만들다 만 것이다. 여기서 이어서 만든다 */
function NoPrompt({ logId, onDone }: { logId: string; onDone: () => void }) {
  return (
    <Sheet point eyebrow="PROMPTS" headline="아직 프롬프트가 없어요">
      <p className="lead">
        사진은 올라와 있는데 프롬프트를 못 만들었어요. 새 묶음에서 분위기부터 다시 고르면
        됩니다.
      </p>
      <div className="row row--wrap" style={{ gap: 10, marginTop: 16 }}>
        <Link className="btn btn--primary btn--sm" href="/logs/new">
          새로 만들기 →
        </Link>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>
          새로고침
        </button>
      </div>
    </Sheet>
  );
}

/** 고쳐 달라기 — 직전 버전 위에 새 버전을 얹는다 */
function Revise({
  logId,
  latest,
  onDone,
}: {
  logId: string;
  latest: Prompt;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [ratio, setRatio] = useState<RatioId>(isRatioId(latest.ratio) ? latest.ratio : DEFAULT_RATIO);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const j = await fetch(`/api/logs/${logId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: text, ratio }),
      }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "고치지 못했어요.");
      setChanged(j.prompt?.changed || "고쳤어요.");
      setText("");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet eyebrow="REVISE" headline="고칠 데가 있나요?">
      <p className="lead">
        바꾸고 싶은 것만 적으면 돼요. 나머지는 그대로 둡니다. v{latest.version} 위에 새
        버전이 쌓여요.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={1000}
        style={textareaStyle}
        placeholder="예) 더 밝게 해 주세요. / 포스터 말고 인물사진으로요."
      />
      <RatioPicker value={ratio} onChange={setRatio} />

      {changed ? (
        <p className="note-block">
          <strong>바뀐 것</strong>
          {changed}
        </p>
      ) : null}
      {error ? <p style={errStyle}>{error}</p> : null}

      <div className="row row--wrap" style={{ gap: 10, marginTop: 14 }}>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => void run()}
          disabled={busy || !text.trim()}
        >
          {busy ? "고치는 중… (10초쯤)" : "다시 만들기 →"}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * 결과 되가져오기 — **이게 빠지면 흐름이 끊긴다.**
 *
 * 자리를 **비워 둔 채로 보여 준다.** 돌아왔을 때 어디에 올리는지 찾지 않게.
 */
function Outputs({
  logId,
  outputs,
  latestVersion,
  onDone,
}: {
  logId: string;
  outputs: Img[];
  latestVersion: number | null;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    setError(null);
    try {
      for (let i = 0; i < picked.length; i += 1) {
        setBusy(`올리는 중… ${i + 1}/${picked.length}`);
        await uploadImage(logId, picked[i], { role: "output", promptVersion: latestVersion });
      }
      setPicked([]);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(imageId: string) {
    await fetch(`/api/images/${imageId}`, { method: "DELETE" });
    onDone();
  }

  return (
    <Sheet point eyebrow="OUTPUT" headline="만든 이미지를 올려 두세요">
      <p className="lead">
        복사한 프롬프트로 만든 이미지를 여기 올려 두면, 어떤 프롬프트로 나왔는지와 함께
        남아요.
        {latestVersion ? ` 지금 올리면 v${latestVersion} 에 묶입니다.` : ""}
      </p>

      {outputs.length > 0 ? (
        <div style={stripStyle}>
          {outputs.map((im) => (
            <figure key={im.id} style={figStyle}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/img/${im.id}`} alt="" style={imgStyle} loading="lazy" />
              <figcaption style={capStyle}>
                {im.promptVersion ? `v${im.promptVersion}` : "—"}
                <button type="button" onClick={() => void remove(im.id)} style={removeStyle}>
                  빼기
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      <PhotoPicker value={picked} onChange={setPicked} max={6} label="결과 이미지 고르기" />

      {error ? <p style={errStyle}>{error}</p> : null}

      {picked.length > 0 ? (
        <div className="row row--wrap" style={{ gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void upload()}
            disabled={Boolean(busy)}
          >
            {busy ?? `${picked.length}장 올리기 →`}
          </button>
        </div>
      ) : null}
    </Sheet>
  );
}

const darkMetaStyle: CSSProperties = {
  margin: "16px 0 0",
  fontSize: "0.8rem",
  color: "var(--on-dark-dim)",
};
const stripStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 10,
  marginTop: 16,
};
const figStyle: CSSProperties = {
  margin: 0,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  overflow: "hidden",
  background: "var(--bg-card)",
};
const imgStyle: CSSProperties = {
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
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "var(--accent-ink)",
};
const removeStyle: CSSProperties = {
  padding: 0,
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "var(--text-muted)",
  background: "none",
  border: "none",
  cursor: "pointer",
};
const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "14px 16px 16px",
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
};
const cardHeadStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 8,
};
const verStyle: CSSProperties = { fontSize: "0.82rem", fontWeight: 900, color: "var(--accent-ink)" };
const verMetaStyle: CSSProperties = { fontSize: "0.7rem", color: "var(--text-muted)" };
const requestStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.82rem",
  lineHeight: 1.7,
  color: "var(--text-primary)",
  wordBreak: "keep-all",
};
const requestTagStyle: CSSProperties = {
  display: "inline-block",
  marginRight: 7,
  padding: "1px 7px",
  fontSize: "0.66rem",
  fontWeight: 700,
  color: "var(--point-ink)",
  background: "var(--point-subtle)",
  borderRadius: 999,
};
const summaryStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8rem",
  lineHeight: 1.75,
  color: "var(--text-secondary)",
  wordBreak: "keep-all",
};
const preStyle: CSSProperties = {
  margin: 0,
  maxHeight: 340,
  overflow: "auto",
  padding: 12,
  fontSize: "0.74rem",
  lineHeight: 1.7,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  background: "var(--bg-secondary)",
  borderRadius: 7,
};
const textareaStyle: CSSProperties = {
  width: "100%",
  marginTop: 14,
  padding: "12px 14px",
  fontSize: "0.9rem",
  lineHeight: 1.7,
  color: "var(--text-primary)",
  background: "var(--input-bg)",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-sm)",
  resize: "vertical",
};
const errStyle: CSSProperties = {
  margin: "12px 0 0",
  padding: "10px 12px",
  fontSize: "0.8rem",
  lineHeight: 1.7,
  color: "var(--danger-ink)",
  background: "var(--danger-subtle)",
  borderRadius: "var(--radius-sm)",
};
