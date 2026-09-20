import { NextResponse } from "next/server";
import { badRequest, requireViewer, serverError } from "@/lib/auth";
import { extractMoodPrompt, PromptGenerationError } from "@/lib/prompts/generate";
import { isAllowedType, MAX_UPLOAD_BYTES } from "@/lib/images";
import { MOOD_IDS, moodLabel } from "@/lib/prompts/vocab";

/**
 * 레퍼런스 이미지에서 **기초 프롬프트를 뽑는다** (2026-09-20 사용자 지정).
 *
 * 라이브러리 720건에 원하는 느낌이 없을 때 쓰는 길이다. 어디선가 본 이미지를
 * 올리면 그 **분위기만** 프롬프트로 만들어 돌려준다. 피사체는 버린다 —
 * 곧 사용자의 사진 속 피사체가 그 자리에 들어오기 때문이다.
 *
 * ⚠️ **이미지를 저장하지 않는다.** R2 에도 DB 에도 남기지 않고 분석만 하고 버린다.
 *
 *   ① 남의 작품일 수 있다. 우리가 보관하면 우리가 배포자가 된다
 *   ② 보관해야 할 이유가 없다 — 남길 값은 **뽑아낸 프롬프트**이지 원본이 아니다
 *   ③ 저장 용량이 선형으로 는다. 미결 ① 이 아직 안 정해졌다
 *
 * 그래서 이 라우트는 `logs` 에 아무것도 쓰지 않는다. 결과는 화면이 들고 있다가
 * 생성 요청(`POST /api/logs/[id]/prompts`)에 `baseText` 로 실어 보낸다.
 *
 * → my-obsidian-vault / 50-Plans/H AIKit 구축.md
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const found = await requireViewer(req);
  if ("error" in found) return found.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    /* 4.5MB 를 넘으면 함수에 닿기 전에 잘린다 */
    return badRequest("이미지를 읽지 못했어요. 파일이 너무 크거나 형식이 달라요.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("이미지를 넣어 주세요.");
  if (!isAllowedType(file.type)) return badRequest("JPEG · PNG · WebP 만 올릴 수 있어요.");
  if (file.size > MAX_UPLOAD_BYTES) {
    return badRequest("이미지가 너무 커요. 4MB 아래로 줄여 주세요.");
  }

  try {
    const result = await extractMoodPrompt(
      { contentType: file.type, bytes: Buffer.from(await file.arrayBuffer()) },
      MOOD_IDS,
    );

    return NextResponse.json({
      ok: true,
      /*
        `body` 를 **브라우저로 내려보낸다.** 라이브러리 프롬프트는 본문을 숨기는데
        (사용자가 받을 것은 완성본이지 기초가 아니므로) 이건 다르다 — 이 값은
        DB 에 없으므로 화면이 들고 있다가 생성 요청에 함께 보내야 한다.
      */
      prompt: {
        title: result.title,
        mood: result.mood,
        moodKo: result.mood ? moodLabel(result.mood) : "",
        body: result.body,
        summary: result.summary,
      },
    });
  } catch (e) {
    if (e instanceof PromptGenerationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return serverError(e);
  }
}
