import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { getR2Bucket, getR2Client } from "@/lib/r2";
import { getLogImageModel } from "@/models/LogImage";

/**
 * 이미지 한 장을 내보낸다 — **이 앱이 R2 를 대신한다.**
 *
 * ```
 * <img src="/api/img/<_id>">   브라우저가 보는 주소는 우리 도메인이다
 *      ↓
 * 세션 확인 → 내 것인가 → R2 에서 꺼내 그대로 흘려보낸다
 * ```
 *
 * 왜 공개 URL(`pub-….r2.dev`)을 쓰지 않는가 —
 * 직링크가 한 번 나가면 크롤러와 CDN 캐시에 남아서 **"공유 끄기" 가 실제로 먹지
 * 않는다.** 프록시면 끄는 즉시 404 다. 이 앱은 사용자가 올린 사진을 다루므로
 * 그 차이가 제품의 약속이다.
 * → my-obsidian-vault / 50-Plans/H AIKit 구축.md "이미지 공개 원칙"
 *
 * ⚠️ **`r2Key` 를 응답에 절대 싣지 않는다.** 헤더에도 넣지 않는다.
 *
 * 대가는 모든 이미지 요청이 함수를 거친다는 것이다. 그래서 아래 두 가지로 줄인다 —
 *   ① `ETag` + 304 — 같은 이미지를 다시 받지 않는다
 *   ② `Cache-Control: private` — 브라우저만 캐시하고 CDN 은 캐시하지 않는다.
 *      `public` 으로 두면 Vercel 엣지에 남아 세션 확인을 건너뛴 응답이 돌아다닌다
 */

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await ctx.params;

  /*
    잘못된 id 로 ObjectId 를 만들면 mongoose 가 던진다. 500 대신 404 로 떨어뜨린다 —
    남의 id 를 찔러 보는 쪽에 "형식이 틀렸다" 와 "없다" 를 구분해 주지 않는다.
  */
  if (!Types.ObjectId.isValid(imageId)) return notFound();

  const viewer = await getViewer(req).catch(() => null);
  if (!viewer) return notFound();

  await connectDB();

  /*
    ⚠️ `_id` 와 `userId` 를 **함께** 조회한다. id 만 보고 꺼내면 남의 이미지 id 를
    넣어 볼 수 있다 → my-obsidian-vault / 30-Patterns/인증과 세션 공유.md
    "기록 API의 소유자 확인"

    없는 것과 남의 것을 **같은 404** 로 돌려준다. 403 을 주면 "그 id 는 존재한다" 를
    알려 주는 셈이다.
  */
  const image = await getLogImageModel()
    .findOne({ _id: imageId, userId: viewer.userId })
    .lean()
    .exec();

  if (!image) return notFound();

  /* 내용이 바뀌지 않는 객체다. 키가 같으면 같은 그림이다 */
  const etag = `"${image._id}-${image.bytes}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, ...cacheHeaders() } });
  }

  let body: ReadableStream<Uint8Array>;
  let length: number | undefined;
  try {
    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: image.r2Key }),
    );
    if (!res.Body) return notFound();
    body = res.Body.transformToWebStream();
    length = res.ContentLength;
  } catch {
    /*
      R2 에서 사라졌다(고아 레코드). 이유를 밖으로 알리지 않는다 —
      버킷 이름이나 키가 메시지에 섞여 나가는 일을 원천 차단한다.
    */
    return notFound();
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": image.contentType || "application/octet-stream",
      ...(length ? { "Content-Length": String(length) } : {}),
      ETag: etag,
      ...cacheHeaders(),
    },
  });
}

/**
 * `private` 가 핵심이다. `public` 이면 Vercel 엣지가 응답을 캐시해
 * **세션 확인을 거치지 않은 사본**이 다른 사람에게 갈 수 있다.
 */
function cacheHeaders() {
  return {
    "Cache-Control": "private, max-age=86400, must-revalidate",
    /* 검색엔진이 이미지 자체를 색인하지 않게 한다 */
    "X-Robots-Tag": "noindex",
  };
}

function notFound() {
  return new Response("Not found", { status: 404 });
}
