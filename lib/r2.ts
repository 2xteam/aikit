import { S3Client } from "@aws-sdk/client-s3";

/**
 * AIKit 의 이미지 저장소 — Cloudflare R2.
 *
 * ⚠️ **jangmini 와 다른 버킷이다.** jangmini 의 R2 는 운영자가 올린 포트폴리오
 * 이미지지만 여기는 사용자가 올린 사진이다. 권한·보관 기간·삭제 정책이 갈린다.
 *
 * ⚠️ **버킷은 비공개다.** Public Development URL 을 켜지 않는다. 그래서 다른 앱의
 * `lib/r2.ts` 에 있는 `getR2PublicUrl()` 이 여기에는 **없다** — 이미지는 언제나
 * 앱 라우트가 세션을 확인하고 스트리밍한다. 직링크가 한 번 나가면 크롤러와 CDN
 * 캐시에 남아서 "공유 끄기" 가 실제로 먹지 않는다.
 * → my-obsidian-vault / 50-Plans/H AIKit 구축.md "이미지 공개 원칙"
 *
 * → my-obsidian-vault / 40-Infra/Cloudflare R2.md
 */

let _client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (_client) return _client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 환경변수가 설정되지 않았습니다. R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY를 확인하세요.",
    );
  }

  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    /*
     * ⚠️ 사전 서명 URL 을 쓰려면 이 둘이 필요하다.
     *
     * AWS SDK v3 는 기본으로 CRC32 체크섬을 계산하는데, 서명하는 시점에는 본문이
     * 없어서 **빈 본문의 체크섬**이 URL 에 박힌다. 실제 업로드를 R2 가 400 으로
     * 거부한다. 원인이 URL 안에 있어서 로그만 봐서는 보이지 않는다.
     * → my-obsidian-vault / 30-Patterns/이미지 업로드 패턴.md
     */
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return _client;
}

/**
 * 버킷 이름은 **환경 변수로 받되 기본값을 두지 않는다.**
 *
 * 형제 앱들은 `?? "snapnote-uploads"` 같은 기본값을 두는데, 값이 빠졌을 때
 * 조용히 **다른 앱의 버킷**을 가리키게 된다. 여기는 사용자 사진이라 그 사고가
 * 더 비싸다 — 없으면 바로 멈춘다.
 */
export function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error("R2_BUCKET_NAME 환경변수가 설정되지 않았습니다.");
  }
  return bucket;
}

/**
 * R2 오류를 사람이 읽을 한 줄로 바꾼다.
 *
 * 403 이 가장 흔한데 원인이 둘로 갈린다 — 토큰이 그 버킷 범위가 아니거나,
 * 읽기 전용이거나. 어느 쪽이든 "설정을 확인하세요" 로는 고칠 수 없어서
 * 무엇을 봐야 하는지까지 적는다. `npm run r2:check` 로 바로 확인할 수 있다.
 */
export function describeR2Error(e: unknown): string {
  const status =
    typeof e === "object" && e !== null && "$metadata" in e
      ? (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
  const bucket = process.env.R2_BUCKET_NAME ?? "(버킷 미설정)";

  if (status === 403) {
    return `이미지 저장에 실패했어요. R2 토큰이 '${bucket}' 버킷에 쓸 수 없어요 (403). Cloudflare에서 이 버킷을 포함한 Object Read & Write 토큰인지 확인해 주세요.`;
  }
  if (status === 404) {
    return `이미지 저장에 실패했어요. '${bucket}' 버킷을 찾을 수 없어요 (404).`;
  }
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID) {
    return "이미지 저장에 실패했어요. R2 환경 변수가 설정되지 않았어요.";
  }
  return `이미지 저장에 실패했어요. R2 요청이 실패했습니다${status ? ` (${status})` : ""}.`;
}
