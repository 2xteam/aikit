import {
  ANALYZE_SYSTEM,
  analyzeUserText,
  COMPOSE_SYSTEM,
  fillMaxChars,
  MAX_PROMPT_CHARS,
  REVISE_SYSTEM,
} from "@/lib/prompts/system";

/**
 * OpenAI 호출 — 사진 분석(A-1)과 프롬프트 합성(A-2/A-3).
 *
 * 호출 규약은 [[OpenAI Vision 추출 패턴]] 을 따른다 —
 * 모델을 **두 개로 나누고**(`OPENAI_VISION_MODEL` · `OPENAI_MODEL`),
 * `response_format: json_object` 를 걸고, 분석은 `temperature: 0`.
 *
 * ⚠️ **AIKit 전용 프로젝트 키를 쓴다.** 다른 앱과 키를 공유하면 여기서
 * 어뷰징당할 때 그 앱들의 예산까지 태운다. 한도는 OpenAI 쪽에서 건다.
 * → my-obsidian-vault / 50-Plans/H AIKit 구축.md Phase 3
 *
 * SDK 를 넣지 않고 fetch 로 부른다. 부르는 자리가 둘뿐이라 의존성을 하나 더
 * 들이는 값이 크지 않다.
 */

const API = "https://api.openai.com/v1/chat/completions";

const VISION_MODEL = () => process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o";
const TEXT_MODEL = () => process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

/** 호출이 매달려 있으면 Vercel 함수가 그대로 타임아웃된다. 먼저 끊는다 */
const TIMEOUT_MS = 55_000;

export class PromptGenerationError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function requireKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    /*
      설정 누락은 **503 + 이유**로 떨어뜨린다. 본문이 빈 500 이 나가면 화면이
      이유를 보여 주지 못한다 → lib/auth.ts 의 SESSION_SECRET 처리와 같다
    */
    throw new PromptGenerationError(
      "서버 설정이 빠졌습니다 (OPENAI_API_KEY). 운영자에게 알려 주세요.",
      503,
    );
  }
  return key;
}

type Msg = { role: "system" | "user"; content: unknown };

async function callJson(model: string, messages: Msg[], temperature: number): Promise<unknown> {
  const key = requireKey();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature,
        response_format: { type: "json_object" },
        messages,
      }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new PromptGenerationError("생성이 너무 오래 걸려 멈췄어요. 다시 시도해 주세요.", 504);
    }
    throw new PromptGenerationError("생성 서버에 닿지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    /*
      ⚠️ 응답 본문을 그대로 사용자에게 보여 주지 않는다. 시스템 프롬프트 조각이나
      조직 정보가 섞여 나올 수 있다. 상태만 보고 사람 말로 바꾼다.
    */
    const body = await res.text().catch(() => "");
    console.error("[openai]", res.status, body.slice(0, 500));
    if (res.status === 429) {
      throw new PromptGenerationError("지금 요청이 많아요. 잠시 뒤 다시 시도해 주세요.", 429);
    }
    if (res.status === 401 || res.status === 403) {
      throw new PromptGenerationError("생성 설정에 문제가 있어요. 운영자에게 알려 주세요.", 503);
    }
    throw new PromptGenerationError("프롬프트를 만들지 못했어요. 다시 시도해 주세요.");
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new PromptGenerationError("프롬프트를 만들지 못했어요. 다시 시도해 주세요.");

  try {
    return JSON.parse(text);
  } catch {
    /* json_object 를 걸었는데도 깨지면 재시도가 답이다. 파싱을 억지로 고치지 않는다 */
    throw new PromptGenerationError("응답을 읽지 못했어요. 다시 시도해 주세요.");
  }
}

/** 입력 이미지 — 본문을 그대로 data URL 로 싣는다 */
export type ImageInput = { contentType: string; bytes: Buffer };

function toDataUrl(img: ImageInput): string {
  return `data:${img.contentType};base64,${img.bytes.toString("base64")}`;
}

/**
 * A-1. 사진 분석.
 *
 * 여러 장을 **한 번에** 보낸다. 장마다 부르면 호출 수가 장수만큼 늘고,
 * 무엇보다 "이 둘을 어떻게 합칠까"를 판단하려면 함께 봐야 한다.
 */
export async function analyzePhotos(images: ImageInput[]): Promise<unknown> {
  if (images.length === 0) return { images: [] };


  const content: unknown[] = [{ type: "text", text: analyzeUserText(images.length) }];
  for (const img of images) {
    content.push({ type: "image_url", image_url: { url: toDataUrl(img), detail: "low" } });
  }

  const raw = await callJson(
    VISION_MODEL(),
    [
      { role: "system", content: ANALYZE_SYSTEM },
      { role: "user", content },
    ],
    /* 분류에 창의성은 해롭다 */
    0,
  );

  /*
    ⚠️ 모양을 확인하고 넘긴다. 프롬프트가 조금만 어긋나도 모델이 통째로 `null` 을
    돌려줄 때가 있는데(2026-09-18 실측), 그걸 그대로 합성에 넘기면 **기초 프롬프트의
    주제가 사진 대신 살아남는다** — 축구 프롬프트를 고르면 사진과 무관하게 축구
    선수가 나온다. 비어 있으면 비어 있다고 알리고 합성 쪽이 일반적으로 쓰게 한다.
  */
  const obj = raw as { images?: unknown } | null;
  if (!obj || !Array.isArray(obj.images) || obj.images.length === 0) {
    console.warn("[openai] 사진 분석이 비었습니다 — 일반적인 서술로 넘어갑니다");
    return { images: [] };
  }
  return obj;
}

export type ComposeResult = { prompt: string; summary: string; changed: string };

function readResult(raw: unknown): ComposeResult {
  const o = (raw ?? {}) as Record<string, unknown>;
  const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
  if (!prompt) throw new PromptGenerationError("프롬프트가 비어 있어요. 다시 시도해 주세요.");
  return {
    prompt: prompt.slice(0, MAX_PROMPT_CHARS + 500),
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    changed: typeof o.changed === "string" ? o.changed.trim() : "",
  };
}

/**
 * A-2. **리소스 셋을 합친다** — 기초 프롬프트 + 사진 태그 + 사용자 문구 + 비율.
 */
export async function composePrompt(input: {
  base: string;
  tags: unknown;
  request: string;
  ratio: string;
  moodKo: string;
}): Promise<ComposeResult> {
  const user = [
    `MOOD: ${input.moodKo}`,
    `RATIO: ${input.ratio}`,
    "",
    "BASE:",
    input.base,
    "",
    "TAGS:",
    JSON.stringify(input.tags),
    "",
    "REQUEST:",
    input.request || "(사용자가 따로 적지 않았어요. 사진에 맞게 알아서 맞춰 주세요.)",
  ].join("\n");

  return readResult(
    await callJson(
      TEXT_MODEL(),
      [
        { role: "system", content: fillMaxChars(COMPOSE_SYSTEM) },
        { role: "user", content: user },
      ],
      /* 문장을 쓰는 일이라 0 은 너무 뻣뻣하다. 볼트의 A-2 와 같은 값 */
      0.4,
    ),
  );
}

/** A-3. 다듬기 — 직전 버전과 요청문을 함께 보낸다. 화면은 목록이지만 내용은 대화다 */
export async function revisePrompt(input: {
  previous: string;
  request: string;
  ratio: string;
}): Promise<ComposeResult> {
  const user = [
    `RATIO: ${input.ratio}`,
    "",
    "CURRENT PROMPT:",
    input.previous,
    "",
    "USER REQUEST:",
    input.request,
  ].join("\n");

  return readResult(
    await callJson(
      TEXT_MODEL(),
      [
        { role: "system", content: fillMaxChars(REVISE_SYSTEM) },
        { role: "user", content: user },
      ],
      0.4,
    ),
  );
}
