import { randomBytes } from "node:crypto";
import { DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client } from "@/lib/r2";
import type { LogImageRole } from "@/models/LogImage";

/**
 * 이미지 저장 — **서버를 거친다.**
 *
 * 볼트의 선택 기준표는 "스토리지에 원본 보관 → 사전 서명 직접 PUT" 인데,
 * 여기서는 서버 경유를 고른다. 이유 둘 —
 *
 *   ① **버킷 CORS 가 비어 있다** (2026-09-18 확인). 브라우저에서 R2 로 직접
 *      PUT 하려면 Cloudflare 대시보드에서 CORS 를 넣어야 하는데, Object 권한
 *      토큰으로는 설정도 조회도 못 한다. 형제 앱 여섯도 전부 서버 경유다
 *   ② **원본을 그대로 보관하지 않는다.** 긴 변 2400px · JPEG 0.85 로 줄여 넣으므로
 *      한 장이 대개 0.5~2MB 다. Vercel 의 요청 본문 4.5MB 벽에 닿지 않는다
 *
 * 원본 보관으로 방침이 바뀌면 그때 사전 서명으로 올린다. 그 경우
 * `lib/r2.ts` 의 체크섬 설정이 이미 준비돼 있다.
 * → my-obsidian-vault / 30-Patterns/이미지 업로드 패턴.md
 */

/** 서버가 받아 줄 상한. 화면 쪽 리사이즈가 실패해도 여기서 막는다 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isAllowedType(t: string): boolean {
  return (ALLOWED_TYPES as readonly string[]).includes(t);
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * 객체 키.
 *
 * ⚠️ **추측할 수 없어야 한다.** 키가 밖으로 나가지는 않지만(앱 라우트가 대신
 * 내보낸다), 언젠가 새는 경로가 생기더라도 옆 사람 것을 세어 볼 수 없게 둔다.
 * 그래서 순번이 아니라 난수다.
 *
 * `logs/<logId>/` 로 묶는 이유는 **묶음을 지울 때 통째로 지우기** 위해서다.
 */
export function makeKey(logId: string, role: LogImageRole, contentType: string): string {
  const ext = EXT[contentType] ?? "bin";
  return `logs/${logId}/${role}/${randomBytes(12).toString("hex")}.${ext}`;
}

export async function putImage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      /*
        키에 난수가 들어 있어 같은 키가 다시 쓰일 일이 없다. 그래도 public 은
        쓰지 않는다 — 이 값이 CDN 까지 가는 경로는 없지만, 나중에 누가 프록시
        라우트에서 이 헤더를 그대로 흘려보낼 수 있다.
      */
      CacheControl: "private, max-age=31536000, immutable",
    }),
  );
}

/**
 * 여러 개를 지운다 — **묶음·회원을 지울 때 R2 객체도 함께 지운다.**
 * 고아 객체는 눈에 보이지 않으면서 용량만 먹는다.
 *
 * ⚠️ 실패해도 던지지 않는다. DB 는 이미 지워졌는데 여기서 터지면 사용자는
 * "삭제가 실패했다"고 보고 다시 누르는데, 그때는 이미 없어서 404 가 난다.
 * 남은 객체는 고아로 기록하고 넘어가는 편이 낫다.
 */
export async function deleteKeys(keys: string[]): Promise<{ deleted: number; failed: string[] }> {
  if (keys.length === 0) return { deleted: 0, failed: [] };

  const failed: string[] = [];
  let deleted = 0;

  /* DeleteObjects 는 한 번에 1,000개까지다 */
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    try {
      const res = await getR2Client().send(
        new DeleteObjectsCommand({
          Bucket: getR2Bucket(),
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      deleted += chunk.length - (res.Errors?.length ?? 0);
      for (const e of res.Errors ?? []) if (e.Key) failed.push(e.Key);
    } catch {
      failed.push(...chunk);
    }
  }

  if (failed.length) {
    /* 고아를 남겼다는 사실은 남긴다. 조용히 넘어가면 용량이 어디서 새는지 모른다 */
    console.error(`[r2] 지우지 못한 객체 ${failed.length}개`, failed.slice(0, 5));
  }
  return { deleted, failed };
}
