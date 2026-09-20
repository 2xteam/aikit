/**
 * 올리기 전에 브라우저에서 줄인다. **서버로 가는 것은 줄인 쪽이다.**
 *
 * 이 앱은 원본을 그대로 보관하지 않는다 → lib/images.ts
 *   · 결과 이미지를 다른 AI 에 다시 올리는 용도라 2400px 면 충분하다
 *   · Vercel 의 요청 본문 4.5MB 벽에 닿지 않는다
 *   · 저장 용량이 선형으로 늘지 않는다
 *
 * ⚠️ `createImageBitmap(file, { imageOrientation: "from-image" })` 를 쓴다.
 * EXIF 회전이 반영되고, 다시 인코딩하면서 EXIF 가 사라져 **이중 회전이 없다.**
 * 그냥 `<img>` 로 그리면 세로로 찍은 사진이 눕는다.
 * → my-obsidian-vault / 30-Patterns/이미지 업로드 패턴.md ②
 */

/** 긴 변 상한. Vision 입력만이면 2000 으로 충분하지만 여기는 **보관**도 한다 */
const MAX_EDGE = 2400;
const QUALITY = 0.85;

export type PreparedImage = {
  blob: Blob;
  width: number;
  height: number;
  /** 미리보기용. 다 쓰면 revokeObjectURL 한다 */
  previewUrl: string;
};

export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    /*
      HEIC 등 브라우저가 못 여는 형식이다. 줄이지 못하면 원본을 그대로 보내고
      서버가 형식으로 막게 둔다 — 여기서 막으면 "왜 안 되는지" 를 못 알려 준다.
    */
    return { blob: file, width: 0, height: 0, previewUrl: URL.createObjectURL(file) };
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { blob: file, width: 0, height: 0, previewUrl: URL.createObjectURL(file) };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );

  /*
    ⚠️ 줄인 결과가 원본보다 크면 원본을 쓴다. 작고 잘 압축된 PNG 를 JPEG 로
    다시 구우면 오히려 커진다.
  */
  if (!blob || blob.size >= file.size) {
    return { blob: file, width, height, previewUrl: URL.createObjectURL(file) };
  }
  return { blob, width, height, previewUrl: URL.createObjectURL(blob) };
}

/**
 * 올린다. **진행률을 보려면 XHR 이어야 한다** — `fetch` 는 업로드 진행을 알려 주지 않는다.
 */
export function uploadImage(
  logId: string,
  prepared: PreparedImage,
  opts: {
    role: "input" | "output" | "reference";
    promptVersion?: number | null;
    onProgress?: (p: number) => void;
  },
): Promise<{ id: string }> {
  const form = new FormData();
  const name = prepared.blob instanceof File ? prepared.blob.name : "photo.jpg";
  form.append("file", prepared.blob, name);
  form.append("role", opts.role);
  if (opts.promptVersion) form.append("promptVersion", String(opts.promptVersion));
  form.append("width", String(prepared.width));
  form.append("height", String(prepared.height));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/logs/${logId}/images`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { ok?: boolean; error?: string; image?: { id: string } } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* 4.5MB 를 넘으면 함수에 닿기 전에 잘려 본문이 JSON 이 아니다 */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.image) resolve(body.image);
      else reject(new Error(body.error ?? "이미지를 올리지 못했어요."));
    };
    xhr.onerror = () => reject(new Error("이미지를 올리지 못했어요."));
    xhr.send(form);
  });
}
