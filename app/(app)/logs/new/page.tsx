"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { MoodPicker, type PromptCard } from "@/components/MoodPicker";
import { PhotoPicker, type Picked } from "@/components/PhotoPicker";
import { BusyOverlay } from "@/components/BusyOverlay";
import { RatioPicker } from "@/components/RatioPicker";
import { uploadImage } from "@/lib/clientImage";
import { DEFAULT_RATIO, type RatioId } from "@/lib/prompts/vocab";

/**
 * 새 묶음 — 생성 요청에 들어가는 **리소스 셋**을 모아 한 번에 보낸다.
 *
 * ```
 * ① 분위기의 기초 프롬프트   ② 사진 여러 장   ③ 커스텀 문구   ④ 비율
 * ```
 *
 * ⚠️ **묶음은 [만들기] 를 누를 때 만든다.** 화면에 들어오자마자 만들면 중간에
 * 그만둔 빈 묶음이 쌓인다. 대신 만든 뒤에 실패하면 껍데기가 남는데, 그건
 * 목록에서 지울 수 있으니 덜 나쁘다.
 */
export default function NewLogPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState<PromptCard | null>(null);
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [wish, setWish] = useState("");
  const [ratio, setRatio] = useState<RatioId>(DEFAULT_RATIO);

  const [step, setStep] = useState<string | null>(null);
  /** 오래 걸리는 단계에만 붙는 한 줄 설명 */
  const [stepDetail, setStepDetail] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(prompt) && photos.length > 0 && !step;

  async function run() {
    if (!prompt || photos.length === 0) return;
    setError(null);

    let logId: string | null = null;
    try {
      setStepDetail(undefined);
      setStep("묶음을 만들고 있어요");
      const made = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => r.json());
      if (!made.ok) throw new Error(made.error ?? "묶음을 만들지 못했어요.");
      logId = made.id as string;

      for (let i = 0; i < photos.length; i += 1) {
        setStep(`사진을 올리고 있어요 ${i + 1}/${photos.length}`);
        await uploadImage(logId, photos[i], { role: "input" });
      }

      /* 분석과 합성이 함께 일어난다. 10초쯤 걸리므로 무엇을 하는지 알려 준다 */
      setStep("사진 속 피사체를 읽고 프롬프트를 쓰고 있어요");
      setStepDetail("10초쯤 걸려요. 창을 닫지 마세요.");
      const made2 = await fetch(`/api/logs/${logId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          /* 뽑아낸 기초는 DB 에 없다 — 본문을 함께 보낸다 → components/MoodPicker.tsx */
          prompt.extracted
            ? {
                baseText: prompt.extracted.body,
                baseTitle: prompt.title,
                baseMood: prompt.mood,
                request: wish,
                ratio,
              }
            : { basePromptId: prompt.id, request: wish, ratio },
        ),
      }).then((r) => r.json());
      if (!made2.ok) throw new Error(made2.error ?? "프롬프트를 만들지 못했어요.");

      router.push(`/logs/${logId}`);
    } catch (e) {
      /*
        묶음까지는 만들어졌을 수 있다. 지우지 않고 **어디로 가면 되는지** 알려 준다 —
        올린 사진이 남아 있어 다시 만들 때 처음부터 하지 않아도 된다.
      */
      setError(
        (e as Error).message +
          (logId ? " 올린 사진은 묶음에 남아 있어요. 묶음에서 다시 만들 수 있어요." : ""),
      );
      setStep(null);
      setStepDetail(undefined);
      if (logId) router.push(`/logs/${logId}`);
    }
  }

  return (
    <>
      {/* 누른 것이 먹었는지 몰라 두 번 누르는 일을 막는다 — 두 번 누르면
          묶음도 둘, 생성 요청도 둘이다 */}
      <BusyOverlay message={step} detail={stepDetail} />

      <Sheet
        point
        eyebrow="STEP 1"
        headline={prompt ? "고른 분위기" : "어떤 분위기로 만들까요?"}
        lead={
          prompt
            ? undefined
            : "글보다 그림으로 골라요. 옆으로 넘겨서 보고, 고르면 접혀요."
        }
      >
        <div style={{ marginTop: prompt ? 14 : 16 }}>
          <MoodPicker selected={prompt} onPick={setPrompt} />
        </div>
      </Sheet>

      {prompt ? (
        <>
          <Sheet eyebrow="STEP 2" headline="사진을 올려요">
            <p className="lead">합성에 쓸 사진을 골라요. 최대 4장이에요.</p>
            <PhotoPicker value={photos} onChange={setPhotos} max={4} />
            <p className="note-block">
              <strong>NOTE</strong>
              프롬프트를 만들 때 올린 사진이 OpenAI 로 한 번 전송돼요. 분석에만 쓰이고,
              사진은 이 앱의 저장소에만 남습니다. 앱 밖으로 주소가 나가지 않아요.
            </p>
          </Sheet>

          <Sheet eyebrow="STEP 3" headline="어떻게 합성되길 원하나요?">
            <p className="lead">사진들을 어떻게 쓸지 적어 주세요. 짧아도 되고, 비워 둬도 돼요.</p>
            <textarea
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              rows={4}
              maxLength={1000}
              style={textareaStyle}
              placeholder="예) 1번 사진의 인물을 2번 사진의 밤거리 배경에 세워 주세요. 표정은 그대로 두고 조명만 바꿔 주세요."
            />
            <p style={countStyle}>{wish.length} / 1000</p>
          </Sheet>

          <Sheet eyebrow="STEP 4" headline="어떤 비율로 뽑을까요?">
            <p className="lead">쓸 곳에 따라 구도가 달라져요. 고른 비율이 프롬프트에 들어갑니다.</p>
            <RatioPicker value={ratio} onChange={setRatio} suggested={prompt.suggestedRatio} />
          </Sheet>

          <Sheet center point eyebrow="READY" headline="프롬프트를 만들까요?">
            <p style={recapStyle}>
              <strong>{prompt.title}</strong> · 사진 {photos.length}장 · {ratio}
              {wish ? ` · 요청 ${wish.length}자` : ""}
            </p>

            {error ? <p style={errStyle}>{error}</p> : null}

            <div className="row row--wrap" style={{ gap: 10, justifyContent: "center", marginTop: 16 }}>
              <button type="button" className="btn btn--primary" onClick={() => void run()} disabled={!ready}>
                프롬프트 만들기 →
              </button>
              <Link className="btn btn--ghost" href="/logs">
                내 묶음
              </Link>
            </div>

            {!prompt || photos.length === 0 ? (
              <p style={hintStyle}>사진을 한 장 이상 올려야 만들 수 있어요.</p>
            ) : null}
          </Sheet>
        </>
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
const countStyle: CSSProperties = {
  margin: "5px 0 0",
  fontSize: "0.7rem",
  textAlign: "right",
  color: "var(--text-muted)",
};
const recapStyle: CSSProperties = {
  margin: "10px 0 0",
  fontSize: "0.85rem",
  lineHeight: 1.7,
  color: "var(--text-secondary)",
};
const errStyle: CSSProperties = {
  margin: "12px 0 0",
  padding: "10px 12px",
  fontSize: "0.8rem",
  lineHeight: 1.7,
  textAlign: "left",
  color: "var(--danger-ink)",
  background: "var(--danger-subtle)",
  borderRadius: "var(--radius-sm)",
};
const hintStyle: CSSProperties = {
  margin: "10px 0 0",
  fontSize: "0.75rem",
  color: "var(--text-muted)",
};
