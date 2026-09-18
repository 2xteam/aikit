import { Schema, type Model, type Types } from "mongoose";
import { defineModel } from "@/lib/model";
import { MOOD_IDS, type MoodId } from "@/lib/prompts/vocab";

/**
 * 프롬프트 라이브러리 — **사용자가 분위기를 고를 때 보는 것**.
 *
 * 사용자 데이터(`logs` · `log_prompts`)와 성격이 정반대다. 이건 **서비스가 가진
 * 자산**이고 회원과 무관하다. 그래서 `userId` 가 없다.
 *
 * 흐름에서의 자리 —
 *
 * ```
 * ① 분위기를 고른다(이 컬렉션의 예시 이미지를 눈으로 보고)
 * ② 사진 여러 장을 올린다
 * ③ 어떻게 합성되길 원하는지 적는다
 * → 셋을 함께 OpenAI 에 보내 완성된 프롬프트를 받는다
 * ```
 *
 * 즉 이 문서의 `body` 는 **최종 프롬프트가 아니라 기초(base)** 다.
 * 최종본은 `log_prompts.text` 에 남는다.
 *
 * → my-obsidian-vault / 30-Patterns/프롬프트 지식베이스.md
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ③
 */

/**
 * 예시 이미지 — **자체 호스팅하지 않는다.**
 *
 * CC BY 4.0 은 이 *수집물*에 붙은 것이고 개별 이미지의 저작권은 각자 따로 있다.
 * 데이터셋 자신도 "copyright belongs to original creators" 라고 밝힌다.
 * 그래서 원본 URL 을 건다. **깨졌다고 R2 로 복사하지 않는다** — 그 순간
 * 하지 않기로 한 일이 된다.
 *
 * ⚠️ 2026-09-18 실측 — 원본의 `media` 는 배열이 아니라 `{ images: [...] }` 객체이고
 * 값이 **상대 경로**다(`nano-banana-pro/images/0/NB_00001_0.jpg`).
 * 적재 스크립트가 HF resolve 주소로 조립해 넣는다.
 */
const ExampleSchema = new Schema(
  {
    url: { type: String, required: true },
    /** 깨진 URL 을 기록해 두고 주기적으로 쳐낸다. 빈 액자를 보여 주지 않는다 */
    broken: { type: Boolean, default: false },
  },
  { _id: false },
);

/** "바꿔 끼우는 자리" — 지식베이스의 vars 표 */
const VarSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: "" },
    defaultValue: { type: String, default: "" },
  },
  { _id: false },
);

export type PromptDocument = {
  _id: Types.ObjectId;
  slug: string;
  /** 화면에 보이는 제목. 한국어가 있으면 그것을 쓴다 */
  title: string;
  titleKo: string;
  /** 한 줄 설명(한국어). 카드에서 제목 아래 */
  blurb: string;
  /**
   * 기초 프롬프트 본문. **영문 그대로 둔다** — 이미지 모델이 영문을 더 잘 따르고
   * 번역하면 뜻이 흔들린다.
   *
   * ⚠️ 2026-09-18 실측 — 원본 `raw_p` 는 **영문이 아닐 수 있다**(표본 565건 중
   * 128건이 일본어·중국어). 영문본은 `i18n.en.p` 에 따로 있으므로 **그쪽에서** 받는다.
   * 볼트의 매핑 표(`raw_p` → `body`)는 이 점에서 틀렸다.
   */
  body: string;
  charCount: number;
  /** 고르는 축. **하나만** */
  mood: MoodId | null;
  /** A-1 과 같은 어휘. 매핑되지 않은 원본 태그는 버리지 않고 raw 에 남긴다 */
  tags: {
    suitable_for: string[];
    framing: string[];
    time_of_day: string[];
    raw: string[];
  };
  examples: { url: string; broken: boolean }[];
  vars: { key: string; label: string; defaultValue: string }[];
  /** 원본의 가로세로비. 실측 결과 **숫자**다(1.49 · 0.56 …) */
  ratio: number | null;
  origin: "dataset" | "authored";
  /** 원본 추적용. **비우지 않는다** — 재적재 멱등성이 여기 달려 있다 */
  sourceId: string;
  sourceLink: string;
  sourceAuthor: string;
  license: string;
  /** 우리가 손봤으면 true. CC BY 4.0 의 "변경 여부 표시" 의무 */
  modified: boolean;
  locale: "en" | "ko";
  /**
   * **실제로 이미지를 만들어 확인한 것만 `true`.** 처음엔 전부 false 다.
   * 화면에서 검증분을 위로 올린다.
   */
  verified: boolean;
  verifiedAt: Date | null;
  /** 검수에서 승급한 것. 원본의 `is_featured` 는 참고만 하고 우리 판단이 덮는다 */
  featured: boolean;
  /**
   * 목록에서 뺀다. **원저작자가 내려 달라고 할 수 있다** — 끄면 즉시 빠져야 한다.
   * 지우지 않고 끄는 이유는 같은 것이 다음 적재 때 다시 올라오지 않게 하려는 것.
   */
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const PromptSchema = new Schema<PromptDocument>(
  {
    slug: { type: String, required: true },
    title: { type: String, default: "" },
    titleKo: { type: String, default: "" },
    blurb: { type: String, default: "" },
    body: { type: String, required: true },
    charCount: { type: Number, default: 0 },

    /*
      null 을 허용한다. 자동 분류가 확신하지 못하면 **억지로 채우지 않고**
      검수 대기로 보낸다. 분위기가 틀리면 사용자가 고른 것과 다른 결과가 나오고,
      그게 이 앱에서 제일 나쁜 실패다.
    */
    mood: { type: String, enum: [...MOOD_IDS, null], default: null },

    tags: {
      suitable_for: { type: [String], default: [] },
      framing: { type: [String], default: [] },
      time_of_day: { type: [String], default: [] },
      raw: { type: [String], default: [] },
    },

    examples: { type: [ExampleSchema], default: [] },
    vars: { type: [VarSchema], default: [] },
    ratio: { type: Number, default: null },

    origin: { type: String, enum: ["dataset", "authored"], default: "dataset" },
    sourceId: { type: String, default: "" },
    sourceLink: { type: String, default: "" },
    sourceAuthor: { type: String, default: "" },
    /* CC BY 4.0 은 표기가 조건이다. 비워 두지 않는다 */
    license: { type: String, default: "" },
    modified: { type: Boolean, default: false },
    locale: { type: String, enum: ["en", "ko"], default: "en" },

    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    featured: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "prompts" },
);

/** 재적재는 sourceId 로 upsert 한다. 자체 저작분은 sourceId 가 비므로 slug 로 */
PromptSchema.index({ sourceId: 1 }, { unique: true, sparse: true });
PromptSchema.index({ slug: 1 }, { unique: true });

/**
 * 고르는 화면의 정렬 — **검증된 것을 위로.**
 * `disabled` 를 맨 앞에 두어 꺼진 것을 인덱스 단계에서 걸러 낸다.
 */
PromptSchema.index({ disabled: 1, mood: 1, verified: -1, featured: -1, createdAt: -1 });

export function getPromptModel(): Model<PromptDocument> {
  return defineModel<PromptDocument>("Prompt", PromptSchema, "prompts");
}
