import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { badRequest, notFound, requireViewer, serverError } from "@/lib/auth";
import { getR2Bucket, getR2Client } from "@/lib/r2";
import { refreshLogPreview } from "@/lib/logs";
import {
  analyzePhotos,
  composePrompt,
  PromptGenerationError,
  revisePrompt,
  type ImageInput,
} from "@/lib/prompts/generate";
import { getPromptForGeneration } from "@/lib/prompts/library";
import { isMoodId, isRatioId, moodLabel, DEFAULT_RATIO } from "@/lib/prompts/vocab";
import { getLogModel } from "@/models/Log";
import { getLogImageModel } from "@/models/LogImage";
import { getLogPromptModel } from "@/models/LogPrompt";

/**
 * 프롬프트 한 버전 만들기.
 *
 * ```
 * v1    기초 프롬프트 + 사진들 + 커스텀 문구 + 비율   → 합성(A-2)
 * v2+   직전 버전 + 요청문 (+ 바뀐 비율)             → 다듬기(A-3)
 * ```
 *
 * 화면은 버전 목록이지만 **내용은 대화다** — v2+ 는 직전 프롬프트를 함께 보낸다.
 *
 * ⚠️ 사진은 R2 에서 꺼내 **서버가 OpenAI 로 보낸다.** presigned URL 을 넘기지
 * 않는다 — 그러려면 그 URL 이 공개여야 하고, 이 앱의 공개 원칙과 충돌한다
 * → my-obsidian-vault / 50-Plans/H AIKit 구축.md "이미지 공개 원칙"
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** 한 묶음의 버전 상한. 무한히 고쳐 쓰면 과금이 선형으로 는다 */
const MAX_VERSIONS = 20;
/** 분석에 넣을 사진 수. 넘는 장수는 보내지 않는다 — 토큰이 장수만큼 는다 */
const MAX_ANALYZE = 4;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) return notFound("그 묶음이 없어요.");

  const found = await requireViewer(req);
  if ("error" in found) return found.error;
  const userId = found.viewer.userId;

  let body: {
    basePromptId?: string;
    /** 레퍼런스 이미지에서 뽑은 기초 프롬프트 — 라이브러리 대신 쓴다 */
    baseText?: string;
    baseTitle?: string;
    baseMood?: string;
    request?: string;
    ratio?: string;
  };
  try {
    body = await req.json();
  } catch {
    return badRequest("JSON 본문이 필요합니다.");
  }

  const request = (body.request ?? "").trim().slice(0, 1000);
  const ratio = isRatioId(body.ratio) ? body.ratio : DEFAULT_RATIO;

  try {
    await connectDB();
    const log = await getLogModel().findOne({ _id: id, userId }, { _id: 1 }).lean().exec();
    if (!log) return notFound("그 묶음이 없어요.");

    const LogPrompt = getLogPromptModel();
    const last = await LogPrompt.findOne({ logId: id, userId }).sort({ version: -1 }).lean().exec();

    if ((last?.version ?? 0) >= MAX_VERSIONS) {
      return badRequest(`한 묶음에서 ${MAX_VERSIONS}번까지 고칠 수 있어요. 새 묶음으로 시작해 주세요.`);
    }

    let result;
    let basePromptId: Types.ObjectId | null = null;
    let baseSource: "library" | "image" = "library";
    let baseTitle = "";
    let baseText = "";
    let mood = "";

    if (!last) {
      /* ── v1 — 리소스 셋을 합친다 ── */

      /*
        기초 프롬프트는 두 갈래로 온다 (2026-09-20) —
          라이브러리에서 고른 것  → basePromptId
          레퍼런스 이미지에서 뽑은 것 → baseText (그 이미지는 저장하지 않았다)
      */
      let baseBody: string;

      if (body.baseText?.trim()) {
        baseSource = "image";
        baseText = body.baseText.trim().slice(0, 4000);
        baseBody = baseText;
        baseTitle = (body.baseTitle ?? "").trim().slice(0, 60) || "사진에서 뽑은 분위기";
        mood = isMoodId(body.baseMood) ? body.baseMood : "";
      } else {
        if (!body.basePromptId || !Types.ObjectId.isValid(body.basePromptId)) {
          return badRequest("분위기를 먼저 골라 주세요.", { field: "basePromptId" });
        }
        const base = await getPromptForGeneration(body.basePromptId);
        if (!base) return badRequest("고른 프롬프트를 찾지 못했어요. 다시 골라 주세요.");

        basePromptId = base._id;
        mood = base.mood ?? "";
        baseTitle = base.titleKo || base.title || base.slug;
        baseBody = base.body;
      }

      const images = await getLogImageModel()
        .find({ logId: id, userId, role: "input" })
        .sort({ order: 1 })
        .limit(MAX_ANALYZE)
        .lean()
        .exec();

      if (images.length === 0) {
        return badRequest("사진을 한 장 이상 올려 주세요.", { field: "images" });
      }

      /* R2 에서 꺼내 온다. 원본은 브라우저를 거치지 않는다 */
      const inputs: ImageInput[] = [];
      for (const img of images) {
        const obj = await getR2Client().send(
          new GetObjectCommand({ Bucket: getR2Bucket(), Key: img.r2Key }),
        );
        if (!obj.Body) continue;
        inputs.push({
          contentType: img.contentType,
          bytes: Buffer.from(await obj.Body.transformToByteArray()),
        });
      }

      /*
        ⚠️ 여기서 뽑는 것은 **피사체뿐**이다. 장면·조명·색·구도는 기초 프롬프트가
        갖는다 — 둘이 경쟁하면 논점이 흐려진다 (2026-09-18 기획 정정)
        → lib/prompts/system.ts
      */
      const photo = await analyzePhotos(inputs);
      result = await composePrompt({
        base: baseBody,
        photo,
        request,
        ratio,
        /* 뽑아낸 기초는 분위기가 없을 수도 있다 — 그러면 제목을 대신 준다 */
        moodKo: mood ? moodLabel(mood) : baseTitle,
      });
    } else {
      /* ── v2+ — 직전 버전을 고친다 ── */
      if (!request) return badRequest("무엇을 고칠지 적어 주세요.", { field: "request" });
      basePromptId = last.basePromptId ?? null;
      baseSource = last.baseSource ?? "library";
      baseTitle = last.baseTitle ?? "";
      baseText = last.baseText ?? "";
      mood = last.mood ?? "";
      result = await revisePrompt({ previous: last.text, request, ratio });
    }

    const version = (last?.version ?? 0) + 1;
    const doc = await LogPrompt.create({
      logId: id,
      userId,
      version,
      request,
      text: result.prompt,
      summary: result.summary,
      basePromptId,
      baseSource,
      baseTitle,
      baseText,
      mood,
      ratio,
      parentVersion: last?.version ?? null,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    });

    /* 첫 버전이면 요청문에서 제목을 짓는다. 빈 제목은 목록에서 구분이 안 된다 */
    if (version === 1) {
      const title = (request || result.summary).replace(/\s+/g, " ").trim().slice(0, 40);
      await getLogModel().updateOne({ _id: id, title: "" }, { $set: { title } }).exec();
    }
    await refreshLogPreview(id);

    return NextResponse.json(
      {
        ok: true,
        prompt: {
          id: String(doc._id),
          version,
          request,
          text: result.prompt,
          summary: result.summary,
          changed: result.changed,
          ratio,
          mood,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof PromptGenerationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return serverError(e);
  }
}
