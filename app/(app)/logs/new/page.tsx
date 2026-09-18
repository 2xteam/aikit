"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { MoodPicker, type PromptCard } from "@/components/MoodPicker";
import { RATIOS, DEFAULT_RATIO, type RatioId } from "@/lib/prompts/vocab";

/**
 * 새 묶음 만들기 — 프롬프트 생성 요청에 들어가는 **리소스 셋**을 모으는 화면.
 *
 * ```
 * ① 분위기의 기초 프롬프트   분위기 12칸 → 그 안의 프롬프트
 * ② 리소스가 될 사진 여러 장  (업로드는 R2 붙이는 단계에서)
 * ③ 사용자 커스텀 문구        사진들이 어떻게 합성되길 원하는지
 * ④ 비율                      쓸 곳을 아는 것은 사용자뿐이다
 * ```
 *
 * → my-obsidian-vault / 50-Plans/H AIKit 구축.md
 */
export default function NewLogPage() {
  const [prompt, setPrompt] = useState<PromptCard | null>(null);
  const [ratio, setRatio] = useState<RatioId>(DEFAULT_RATIO);
  const [wish, setWish] = useState("");

  return (
    <>
      <Sheet
        point
        eyebrow="STEP 1"
        headline="어떤 분위기로 만들까요?"
        lead="글보다 그림으로 골라요. 분위기를 고르면 그 안의 프롬프트가 나와요."
      >
        <div style={{ marginTop: 16 }}>
          <MoodPicker selectedId={prompt?.id ?? null} onPick={setPrompt} />
        </div>
      </Sheet>

      {prompt ? (
        <Sheet eyebrow="STEP 2" headline="사진을 올려요">
          <p className="lead">
            합성에 쓸 사진을 올려요. 여러 장이면 아래에서 <strong>1번 · 2번</strong>으로
            가리킬 수 있어요.
          </p>
          <p className="note-block">
            <strong>NOTE</strong>
            프롬프트를 만들 때 올린 사진이 OpenAI 로 한 번 전송돼요. 분석에만 쓰이고,
            사진은 이 앱의 저장소에만 남습니다.
          </p>
          <p style={pendingStyle}>업로드는 이미지 저장소를 붙이는 단계에서 열려요.</p>
        </Sheet>
      ) : null}

      {prompt ? (
        <Sheet eyebrow="STEP 3" headline="어떻게 합성되길 원하나요?">
          <p className="lead">
            사진들을 어떻게 쓸지 적어 주세요. 짧아도 됩니다.
          </p>
          <textarea
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            rows={4}
            style={textareaStyle}
            placeholder="예) 1번 사진의 인물을 2번 사진의 밤거리 배경에 세워 주세요. 표정은 그대로 두고 조명만 바꿔 주세요."
          />
        </Sheet>
      ) : null}

      {prompt ? (
        <Sheet eyebrow="STEP 4" headline="어떤 비율로 뽑을까요?">
          <p className="lead">
            쓸 곳에 따라 구도가 달라져요. 고른 비율이 프롬프트에 들어갑니다.
          </p>
          <div className="row row--wrap" style={{ gap: 8, marginTop: 14 }}>
            {RATIOS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRatio(r.id)}
                aria-pressed={ratio === r.id}
                style={{
                  ...chipStyle,
                  borderColor: ratio === r.id ? "var(--accent)" : "var(--border-subtle)",
                  background: ratio === r.id ? "var(--accent-subtle)" : "var(--bg-card)",
                }}
              >
                <strong style={chipTitleStyle}>{r.ko}</strong>
                <span style={chipHintStyle}>{r.hint}</span>
              </button>
            ))}
          </div>
          {/*
            기초 프롬프트가 전제한 비율과 다르면 알려는 준다. 막지는 않는다 —
            어디에 쓸지는 사용자만 안다 → lib/prompts/vocab.ts RATIOS
          */}
          {prompt.suggestedRatio && prompt.suggestedRatio !== ratio ? (
            <p className="note-block">
              <strong>NOTE</strong>
              고른 프롬프트는 원래 {prompt.suggestedRatio} 구도로 쓰인 것이에요.
              {ratio} 로 뽑아도 되지만 구도가 조금 달라질 수 있어요.
            </p>
          ) : null}
        </Sheet>
      ) : null}

      {prompt ? (
        <Sheet center point eyebrow="READY" headline="프롬프트를 만들까요?">
          <p className="lead" style={{ textAlign: "left" }}>
            <strong>{prompt.title}</strong> · {RATIOS.find((r) => r.id === ratio)?.ko}
            {wish ? ` · 요청 ${wish.length}자` : ""}
          </p>
          <p style={pendingStyle}>
            생성은 OpenAI 를 붙이는 단계에서 열려요.
          </p>
          <div className="row row--wrap" style={{ gap: 8, justifyContent: "center", marginTop: 14 }}>
            <Link className="btn btn--ghost btn--sm" href="/logs">
              ← 내 묶음
            </Link>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

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

const chipStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  textAlign: "left",
  padding: "9px 13px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};

const chipTitleStyle: CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 800,
  color: "var(--text-primary)",
};

const chipHintStyle: CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--text-secondary)",
};

const pendingStyle: CSSProperties = {
  margin: "14px 0 0",
  fontSize: "0.82rem",
  fontWeight: 700,
  color: "var(--text-muted)",
};
