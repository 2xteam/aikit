import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "@/lib/model";

/**
 * 한 묶음 안의 **프롬프트 한 버전**.
 *
 * 화면은 목록이지만 **내용은 대화**다 — 수정 요청을 보낼 때 직전 버전의 프롬프트와
 * 원본 사진을 함께 실어 보낸다. 그래서 `parentVersion` 으로 어디서 갈라졌는지 남긴다.
 *
 * 채팅 UI 를 쓰지 않은 이유 → my-obsidian-vault / 10-Projects/AIKit.md
 *   ① 이 앱의 결정적 동작은 **복사**인데, 채팅이면 복사 대상이 말풍선 사이에 섞인다
 *   ② "프롬프트 리스트 + 그때그때 요청사항" 이 곧 버전 목록이다
 *   ③ 결과 이미지를 **어느 버전으로 만들었는지** 묶어야 한다 — 버전이 앵커다
 *
 * ⚠️ `version` 은 묶음 안에서만 1부터 센다. 전역 순번이 아니다.
 */

export type LogPromptDocument = {
  _id: Types.ObjectId;
  logId: Types.ObjectId;
  userId: string;
  version: number;
  /** 사용자가 쓴 말. v1 은 "어떤 느낌이면 좋겠는지", v2+ 는 고쳐 달라는 요청 */
  request: string;
  /** 생성된 프롬프트 본문. 복사 버튼이 집어 가는 값 */
  text: string;
  /** 어떤 이미지가 나올지 한 문단. 만들기 전에 판단하라고 준다 */
  summary: string;
  /** 어느 버전을 고친 것인가. v1 은 null */
  parentVersion: number | null;
  /** 어떤 모델이 만들었는지. 나중에 품질을 견주려면 있어야 한다 */
  model: string;
  createdAt: Date;
  updatedAt: Date;
};

const LogPromptSchema = new Schema<LogPromptDocument>(
  {
    logId: { type: Schema.Types.ObjectId, required: true, index: true },
    /*
      묶음에도 userId 가 있지만 여기에도 둔다. 소유자 확인을 위해 매번 부모를
      한 번 더 읽는 것을 피하려는 것이다 — 그 한 번을 아끼려다 빠뜨리면
      남의 프롬프트가 열린다 → my-obsidian-vault / 30-Patterns/인증과 세션 공유.md
    */
    userId: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    request: { type: String, default: "" },
    text: { type: String, required: true },
    summary: { type: String, default: "" },
    parentVersion: { type: Number, default: null },
    model: { type: String, default: "" },
  },
  { timestamps: true, collection: "log_prompts" },
);

/** 상세 화면은 한 묶음의 버전을 순서대로 읽는다 */
LogPromptSchema.index({ logId: 1, version: 1 }, { unique: true });

export function getLogPromptModel(): Model<LogPromptDocument> {
  return defineModel<LogPromptDocument>("LogPrompt", LogPromptSchema, "log_prompts");
}
