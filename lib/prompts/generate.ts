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
    /*
      ⚠️ **`high` 여야 한다.** 예전 스키마(장면·조명 같은 거친 분류)에서는 `low` 로도
      결과가 같아서 토큰을 아꼈는데, 지금은 **옷의 로고가 어디에 붙었는지, 신발
      밑창과 끈이 무슨 색인지**까지 읽어야 한다. `low` 는 512px 로 줄여 보내므로
      그 정밀도가 나오지 않는다 (2026-09-18 기획 정정).
      한 장에 토큰이 755 → 1,435 로 는다. 이 앱이 파는 것이 그 정밀도다.
    */
    content.push({ type: "image_url", image_url: { url: toDataUrl(img), detail: "high" } });
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
 * 결과를 **검사한다.** 없으면 안 되는 것이 빠졌는지 본다.
 *
 * 왜 검사하는가 — 프롬프트가 길어지면서 모델이 출력 계약을 흘리는 일이 실제로
 * 있었다 (2026-09-18: 절 구조를 통째로 무시하고 기초 프롬프트를 베꼈다).
 * **신원 고정이 빠진 프롬프트는 이 앱에서 쓸모가 없다** — 닮은 남이 나온다.
 * 조용히 건네지 말고 한 번 다시 시켠다.
 *
 * @returns 빠진 것들. 비어 있으면 통과
 */
function auditPrompt(prompt: string, ratio: string): string[] {
  const missing: string[] = [];
  if (!/^\s*DO NOT\b/im.test(prompt)) missing.push("the DO NOT block");
  if (!/do not generate a new face/i.test(prompt)) {
    missing.push('the identity lock line "do not generate a new face"');
  }
  if (!/do not (restyle|beautify)/i.test(prompt)) {
    missing.push("the no-restyle / no-beautify instruction");
  }
  /* 사용자가 고른 비율. 이게 없으면 쓸 곳에 맞지 않는 구도가 나온다 */
  if (!prompt.includes(ratio)) missing.push(`the aspect ratio "${ratio}"`);
  return missing;
}

/**
 * A-2. **기초 프롬프트에 사진의 피사체를 얹는다** (2026-09-18 기획 정정).
 *
 * BASE 는 장면·조명·색·카메라·자세를, PHOTO 는 피사체의 생김새를 준다.
 * 사진 속 인물이 BASE 의 자세를 취한 모습이 결과다.
 */
export async function composePrompt(input: {
  base: string;
  /** A-1 이 뽑은 **피사체 서술**. 장면·조명·색은 들어 있지 않다 (2026-09-18 기획 정정) */
  photo: unknown;
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
    "PHOTO:",
    JSON.stringify(input.photo),
    "",
    "REQUEST:",
    input.request || "(사용자가 따로 적지 않았어요. 사진에 맞게 알아서 맞춰 주세요.)",
  ].join("\n");

  const messages: Msg[] = [
    { role: "system", content: fillMaxChars(COMPOSE_SYSTEM) },
    { role: "user", content: user },
  ];

  /* 문장을 쓰는 일이라 0 은 너무 뻣뻣하다. 볼트의 A-2 와 같은 값 */
  let out = readResult(await callJson(TEXT_MODEL(), messages, 0.4));

  const missing = auditPrompt(out.prompt, input.ratio);
  if (missing.length > 0) {
    console.warn("[openai] 합성 결과에 빠진 것:", missing.join(" · "));
    /*
      한 번만 다시 시킨다. 두 번 해서 안 되면 모델이나 프롬프트를 봐야 하는
      일이고, 사용자를 세 번 기다리게 할 값은 없다.
    */
    out = readResult(
      await callJson(
        TEXT_MODEL(),
        [
          ...messages,
          {
            role: "user",
            content:
              `Your previous answer was missing ${missing.join(", ")}. ` +
              `Write it again, complete this time. Keep every required header.`,
          },
        ],
        0.4,
      ),
    );
    const still = auditPrompt(out.prompt, input.ratio);
    if (still.length > 0) console.warn("[openai] 재시도 후에도 빠짐:", still.join(" · "));
  }

  return out;
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
