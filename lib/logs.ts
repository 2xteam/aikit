import { connectDB } from "@/lib/db";
import { getLogModel } from "@/models/Log";
import { getLogImageModel, pickCoverImage } from "@/models/LogImage";
import { getLogPromptModel } from "@/models/LogPrompt";

/**
 * 목록 미리보기 값을 다시 계산해 `logs` 에 박아 둔다.
 *
 * 이미지나 프롬프트가 바뀔 때마다 부른다. 값을 복사해 두는 이유는 목록 한
 * 페이지가 세 컬렉션을 조인하지 않게 하려는 것이다. **갱신하는 자리가 한 곳**
 * 이라 어긋나기 어렵다 → models/Log.ts
 *
 * ⚠️ 라우트 파일에 두지 않는다. Next 의 route.ts 는 HTTP 메서드 말고 다른 것을
 * 내보내면 빌드가 막힌다.
 */
export async function refreshLogPreview(logId: string): Promise<void> {
  await connectDB();

  const [images, latest] = await Promise.all([
    /* ⚠️ `_id` 를 함께 가져와야 한다 — 대표 이미지로 쓸 값이다 */
    getLogImageModel().find({ logId }, { _id: 1, role: 1, order: 1 }).lean().exec(),
    getLogPromptModel()
      .findOne({ logId }, { version: 1, summary: 1 })
      .sort({ version: -1 })
      .lean()
      .exec(),
  ]);

  const cover = pickCoverImage(images);

  await getLogModel()
    .updateOne(
      { _id: logId },
      {
        $set: {
          coverImageId: cover?._id ?? null,
          inputCount: images.filter((i) => i.role === "input").length,
          outputCount: images.filter((i) => i.role === "output").length,
          latestVersion: latest?.version ?? 0,
          latestSummary: latest?.summary ?? "",
        },
      },
    )
    .exec();
}
