import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "@/lib/model";

/**
 * 한 묶음에 속한 이미지 한 장.
 *
 * | role | 무엇 |
 * |---|---|
 * | `input` | 사용자가 프롬프트를 만들려고 올린 원본 사진 |
 * | `output` | 다른 AI 에서 만들어 되가져온 결과 이미지 |
 *
 * ⚠️ **`r2Key` 를 API 응답에 절대 싣지 않는다.** 이미지는 언제나 앱 라우트
 * (`GET /api/img/<_id>`)가 세션을 확인한 뒤 스트리밍한다. 객체 URL 이 한 번
 * 밖으로 나가면 크롤러와 CDN 캐시에 남아서 "공유 끄기" 가 실제로 먹지 않는다.
 * → my-obsidian-vault / 50-Plans/H AIKit 구축.md "이미지 공개 원칙"
 *
 * ⚠️ 묶음이나 회원을 지울 때 **R2 객체도 함께 지운다.** 고아 객체는 눈에 보이지
 * 않으면서 용량만 먹는다.
 */

export type LogImageRole = "input" | "output";

export type LogImageDocument = {
  _id: Types.ObjectId;
  logId: Types.ObjectId;
  userId: string;
  role: LogImageRole;
  /**
   * 이 결과 이미지를 **몇 번 버전으로** 만들었는가. `input` 은 언제나 null.
   *
   * 프롬프트를 고쳐 가며 여러 장을 만드는 것이 이 앱의 정상 흐름이라,
   * 이 값이 없으면 두 달 뒤에 "이 이미지가 어느 프롬프트에서 나왔는지" 를
   * 잃는다 — 그걸 잃지 않으려고 만든 앱이다.
   */
  promptVersion: number | null;
  /** R2 객체 키. **밖으로 나가지 않는다** */
  r2Key: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
  /** 같은 role 안에서의 표시 순서 */
  order: number;
  /**
   * 공유 링크에 이 이미지를 포함할지. **기본은 꺼짐이고 한 장씩 켠다.**
   * 묶음 전체를 켜는 스위치를 두지 않는 이유는, 입력 사진까지 같이 나가는
   * 사고가 한 번의 실수로 일어나기 때문이다 (M3).
   */
  shared: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const LogImageSchema = new Schema<LogImageDocument>(
  {
    logId: { type: Schema.Types.ObjectId, required: true, index: true },
    /* 부모를 한 번 더 읽지 않고 소유자를 확인하려고 여기에도 둔다 */
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ["input", "output"], required: true },
    promptVersion: { type: Number, default: null },
    r2Key: { type: String, required: true },
    contentType: { type: String, default: "image/jpeg" },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    bytes: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
    shared: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "log_images" },
);

/** 상세 화면은 한 묶음의 이미지를 role·order 로 읽는다 */
LogImageSchema.index({ logId: 1, role: 1, order: 1 });

export function getLogImageModel(): Model<LogImageDocument> {
  return defineModel<LogImageDocument>("LogImage", LogImageSchema, "log_images");
}

/**
 * 목록 카드의 썸네일로 쓸 이미지를 고른다 (2026-09-18 사용자 지정).
 *
 * **결과 이미지 우선, 없으면 입력 사진.** 목록에서 보고 싶은 것은 "무엇을 만들었나"
 * 이지 "무엇을 넣었나" 가 아니다. 아직 결과를 안 올린 묶음만 입력 사진을 보여 준다.
 *
 * 같은 role 안에서는 **먼저 올린 것**을 쓴다 — 목록을 열 때마다 대표 그림이
 * 바뀌면 같은 묶음을 못 알아본다.
 */
export function pickCoverImage<T extends { role: LogImageRole; order: number }>(
  images: T[],
): T | null {
  const byOrder = (a: T, b: T) => a.order - b.order;
  const outputs = images.filter((i) => i.role === "output").sort(byOrder);
  if (outputs.length) return outputs[0];
  const inputs = images.filter((i) => i.role === "input").sort(byOrder);
  return inputs[0] ?? null;
}
