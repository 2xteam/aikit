import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "@/lib/model";

/**
 * 프롬프트 묶음 하나 = **한 번의 만들기 프로젝트**.
 *
 * 입력 사진 여러 장 · 프롬프트 버전 여러 개 · 결과 이미지 여러 장을 거느린다.
 * 셋을 한 문서에 담지 않는 이유는 **각각 따로 늘어나기 때문**이다 — 프롬프트를
 * 다섯 번 고치고 결과 이미지를 열 장 올리는 흐름이 정상이라, 배열로 넣으면
 * 한 문서가 계속 커지고 이미지 한 장을 지우는 데 문서 전체를 다시 쓴다.
 *
 * ⚠️ `userId` 는 **문자열**이다 (`String(user._id)` — lib/auth.ts 의 `viewer.userId`).
 * ObjectId 로 찾으면 조용히 0건이 나온다.
 *
 * → my-obsidian-vault / 10-Projects/AIKit.md
 */

export type LogDocument = {
  _id: Types.ObjectId;
  userId: string;
  title: string;
  memo: string;
  /**
   * 목록 화면이 쓰는 미리보기 값들.
   *
   * 정규화하면 목록 한 페이지에 프롬프트·이미지 컬렉션을 매번 조인해야 한다.
   * 어차피 **마지막 버전 하나만** 보여 주므로 여기 복사해 둔다.
   * 프롬프트를 새로 만들 때 함께 갱신한다 — 갱신하는 자리가 한 곳이라 어긋나기 어렵다.
   */
  latestVersion: number;
  latestSummary: string;
  /** 대표 썸네일로 쓸 이미지. 결과가 있으면 결과, 없으면 입력 */
  coverImageId: Types.ObjectId | null;
  inputCount: number;
  outputCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const LogSchema = new Schema<LogDocument>(
  {
    userId: { type: String, required: true, index: true },
    /** 첫 요청문에서 자동으로 짓고, 사용자가 고칠 수 있다 */
    title: { type: String, default: "" },
    memo: { type: String, default: "" },

    latestVersion: { type: Number, default: 0 },
    latestSummary: { type: String, default: "" },
    coverImageId: { type: Schema.Types.ObjectId, default: null },
    inputCount: { type: Number, default: 0 },
    outputCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "logs" },
);

/** 목록은 언제나 "내 것을 최근 순" 이다. 두 필드를 함께 건다 */
LogSchema.index({ userId: 1, updatedAt: -1 });

export function getLogModel(): Model<LogDocument> {
  return defineModel<LogDocument>("Log", LogSchema, "logs");
}
