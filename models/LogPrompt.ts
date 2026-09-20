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
  /**
   * 사용자가 쓴 말.
   *
   * v1 은 **사진들이 어떻게 합성되길 원하는지**에 대한 설명이다
   * ("1번 사진 인물을 2번 사진 배경에 넣어 주세요" 처럼).
   * v2+ 는 고쳐 달라는 요청이다 ("더 밝게" · "포스터 말고 인물사진으로").
   */
  request: string;
  /**
   * 어느 **기초 프롬프트**에서 출발했는가 — `prompts` 컬렉션의 `_id`.
   *
   * 생성 요청에 들어가는 리소스가 셋이고(2026-09-18 사용자 지정),
   * 그중 첫째가 이것이다 —
   *
   * ```
   * ① 고른 분위기의 기초 프롬프트   ← basePromptId
   * ② 리소스가 될 사진 여러 장      ← log_images(role: input)
   * ③ 사용자 커스텀 문구            ← request
   * ```
   *
   * 라이선스 표기가 여기 걸려 있다. CC BY 4.0 은 출처 표기가 **조건**이라,
   * 어느 프롬프트에서 왔는지를 잃으면 화면에 출처를 못 붙인다.
   * 수정 요청(v2+)도 같은 기초를 물려받는다.
   */
  basePromptId: Types.ObjectId | null;
  /**
   * 기초 프롬프트가 **어디서 왔는가** (2026-09-20).
   *
   * `library` 라이브러리 720건에서 골랐다 → `basePromptId` 로 다시 찾는다
   * `image`   레퍼런스 이미지에서 뽑았다 → 그 이미지는 **저장하지 않았고**
   *           본문도 DB 에 없다. 그래서 `baseText` 에 통째로 남긴다
   */
  baseSource: "library" | "image";
  /** 화면에 보일 이름. 둘 다 채운다 — 라이브러리 것이 내려가도 제목은 남는다 */
  baseTitle: string;
  /**
   * 뽑아낸 기초 프롬프트 본문. `baseSource: "image"` 일 때만 채운다.
   *
   * 라이브러리 것은 비워 둔다 — `prompts` 컬렉션에 원본이 있고, 여기 복사해
   * 두면 라이브러리를 고쳐도 옛 사본이 남아 어느 쪽이 맞는지 알 수 없게 된다.
   */
  baseText: string;
  /** 고른 분위기. basePromptId 를 지워도 무엇을 골랐는지는 남는다 */
  mood: string;
  /**
   * 사용자가 UI 에서 고른 가로세로비 (`4:5` · `9:16` · `1:1` · `3:2` · `16:9`).
   *
   * 프롬프트의 OUTPUT 절로 들어간다. **기초 프롬프트에 박힌 비율보다 이게 이긴다** —
   * 어디에 쓸지는 사용자만 안다. 버전마다 남기므로 "세로로 뽑았다가 가로로 다시
   * 뽑은" 기록이 그대로 보인다 → lib/prompts/vocab.ts RATIOS
   */
  ratio: string;
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
    /*
      끊어져도 묶음은 살아야 하므로 ref 로 걸지 않고 id 만 남긴다.
      라이브러리에서 프롬프트가 내려가도(원저작자 요청) 사용자의 기록은 그대로다.
    */
    basePromptId: { type: Schema.Types.ObjectId, default: null },
    baseSource: { type: String, enum: ["library", "image"], default: "library" },
    baseTitle: { type: String, default: "" },
    baseText: { type: String, default: "" },
    mood: { type: String, default: "" },
    ratio: { type: String, default: "4:5" },
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
