import mongoose, {
  Schema,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from "mongoose";
import { defineModelOn } from "@/lib/model";

/**
 * myjane 통합 회원(`user` DB의 `users` 컬렉션) 스키마.
 *
 * SnapWord · SnapNote · FitLog · TypeLog 는 `전화번호 + PIN`으로 로그인하고,
 * 2hbk는 `이메일 + 비밀번호`로 로그인한다. 한 컬렉션이 두 방식을
 * 모두 담기 때문에 `phone`/`pin`/`name`과 `email`/`password`가 **모두 선택 필드**다.
 * 어느 쪽이 채워졌는지가 곧 그 계정이 쓸 수 있는 로그인 방식이다.
 *
 * → my-obsidian-vault / 30-Patterns/인증과 세션 공유.md
 */
const UserSchema = new Schema(
  {
    // ── 전화번호 + PIN 계열 (SnapWord · SnapNote · FitLog · TypeLog) ──
    name: { type: String, trim: true, default: null },
    phone: { type: String, index: true, default: null },
    pin: { type: String, default: null },
    pinResetToken: { type: String },
    pinResetExpires: { type: Date },

    /*
      ── 이메일 + 비밀번호 ──

      ⚠️ **`email` 을 `required` 로 바꾸지 말 것.**
      여섯 앱이 이 컬렉션 하나를 공유하고, 전화번호만 있는 계정이 아직 남아 있다.
      여기서 필수로 걸면 그 계정들의 `user.save()` 가
      `User validation failed: email` 로 터진다 — 다른 앱이 `lastLoginAt` 만
      갱신하려 해도 마찬가지다. FitLog 에서 실제로 그랬다.

      이메일을 필수로 받는 것은 **포털의 가입 화면과 `/api/auth/register` 에서만**
      강제한다. 스키마는 선택으로 둔다.
      → my-obsidian-vault / 30-Patterns/인증과 세션 공유.md
    */
    email: { type: String, trim: true, lowercase: true, default: null },
    password: { type: String, default: null },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },

    /**
     * ── 이메일 인증 (여섯 앱 공용) ──
     *
     * `emailVerified` 는 원래 2hbk 만 쓰던 필드다. 포털이 인증을 하게 되면서
     * 공용으로 올려 썼다 — 값의 의미는 그대로라 2hbk 쪽 동작은 바뀌지 않는다.
     *
     * 토큰은 `pinResetToken` 과 같은 모양이다(30분 만료, **한 번 쓰면 폐기**).
     *
     * ⚠️ **인증은 로그인 조건이 아니다.** 메일이 늦거나 스팸함에 들어간 사람이
     * 갇히기 때문에, 미인증 상태로도 로그인은 되고 안내만 띄운다.
     *
     * 발급·검증은 **포털에만** 있다. 이 앱은 값을 읽어 배너를 띄울 뿐이다 —
     * 여섯 앱이 각자 물으면 같은 사람에게 여섯 번 묻게 된다.
     * **선언을 지우면 안 된다** — 위 신체 프로필과 같은 이유다.
     */
    emailVerified: { type: Boolean, default: false },
    emailToken: { type: String },
    emailTokenExpires: { type: Date },
    /** 인증 메일 재발송 쿨다운(60초)의 기준 시각. 없으면 메일 폭탄이 된다 */
    emailTokenSentAt: { type: Date },
    /** 이 시각 전에는 안내를 다시 띄우지 않는다. 하루에 한 번만 묻는다 */
    emailPromptSnoozedUntil: { type: Date },
    /**
     * 아직 인증되지 않은 **새 주소**. 인증을 마치면 `email` 로 옮기고 비운다.
     * 포털이 이미 쓰던 계정에 이메일을 나중에 받을 때 쓴다. 이 앱은 읽지 않는다.
     * **선언은 남겨 둔다** — 한 컬렉션을 공유하므로 여기서 저장할 때 유실될 수 있다.
     */
    pendingEmail: { type: String, trim: true, lowercase: true, default: null },

    /**
     * 계정 찾기·비밀번호 재설정 메일의 **재발송 쿨다운** 기준 시각.
     *
     * ⚠️ 없으면 메일 폭탄이 된다. 그 메일은 **아무나 남의 주소로 쏠 수 있다** —
     * 이메일만 넣으면 그 주소로 발송되기 때문이다. 인증 메일의
     * `emailTokenSentAt` 과 같은 역할이고, 흐름이 달라 필드를 나눠 둔다.
     * → myjane/lib/authMailCooldown.ts
     */
    authMailSentAt: { type: Date, default: null },

    /**
     * ── 약관·개인정보 동의 (여섯 앱 공용) ──
     *
     * 가입 화면의 체크박스만으로는 반쪽이다 — API 를 직접 부르면 그대로
     * 통과한다. 그래서 가입 라우트(`myjane/app/api/auth/register`)가 동의 값을
     * 받아 검증하고, 통과한 시각을 여기에 남긴다.
     *
     * `agreedPolicyVersion` 은 동의한 문서의 개정일이다. 방침을 고치면 값이
     * 달라지므로 재동의를 받아야 할 사람을 나중에 골라낼 수 있다.
     * → myjane/app/legal/*
     *
     * ⚠️ **비어 있다고 로그인을 막지 말 것.** 이 필드가 생기기 전에 가입한
     * 회원은 값이 없다. 여섯 앱이 공유하는 컬렉션이라 막으면 쓰던 사람이
     * 전부 갇힌다. `email` 을 required 로 걸면 안 되는 것과 같은 이유다.
     */
    termsAgreedAt: { type: Date, default: null },
    privacyAgreedAt: { type: Date, default: null },
    agreedPolicyVersion: { type: String, default: null },

    /**
     * ── 비밀번호 갱신 안내 (여섯 앱 공용) ──
     *
     * 3개월이 지나면 포털에서 "바꾸시겠어요?" 를 띄운다.
     *
     * ⚠️ **강제하지 않는다.** 주기적 강제 변경은 NIST SP 800-63B 가 권장하지
     * 않는다 — 사람이 pw1! → pw2! 로 바꿔서 오히려 약해진다. 그래서 안내만 하고,
     * "3개월 연장" 을 누르면 `passwordPromptSnoozedUntil` 을 3개월 뒤로 민다.
     *
     * `passwordChangedAt` 이 비어 있으면 `createdAt` 을 기준으로 본다 —
     * 이 필드가 생기기 전에 가입한 사람에게 가입일부터 세는 것이 맞다.
     */
    /**
     * ── 분리해서 받는 동의 (여섯 앱 공용) ──
     *
     * 가입 동의(`termsAgreedAt` · `privacyAgreedAt`)와 **따로** 받는다.
     * 법이 분리를 요구하는 것들이고, 필요한 기능을 쓰는 순간에만 묻는다.
     * 가입 화면에 다 몰아넣으면 SnapWord 만 쓸 사람에게 건강정보 동의를
     * 받게 되고, 필수로 묶으면 동의를 거부할 자유가 없어진다.
     *
     *   healthDataAgreedAt        민감정보(건강정보) 처리 — FitLog 을 쓸 때
     *   overseasTransferAgreedAt  국외 이전 — 사진·대화가 OpenAI(미국)로 나갈 때
     *                             ⚠️ FitLog 만이 아니다. SnapWord 단어장 사진과
     *                             SnapNote 문제 사진도 같은 경로로 나간다
     *   guardianAgreedAt          법정대리인 동의 — 보호자가 자녀를 추가할 때
     *
     * ⚠️ **비어 있다고 로그인을 막지 말 것.** 해당 기능만 막는다.
     * 건강정보에 동의하지 않아도 SnapWord·2hbk 는 그대로 쓸 수 있어야 한다.
     * → myjane/lib/consents.ts · my-obsidian-vault / 50-Plans/C 법적 페이지.md
     */
    healthDataAgreedAt: { type: Date, default: null },
    overseasTransferAgreedAt: { type: Date, default: null },
    guardianAgreedAt: { type: Date, default: null },

    passwordChangedAt: { type: Date, default: null },
    passwordPromptSnoozedUntil: { type: Date, default: null },

    /**
     * ── 탈퇴 (여섯 앱 공용) ──
     *
     * **지우지 않고 표시만 남긴다.** 방침에 "6개월 보관한 뒤 폐기하고 그 안에는
     * 되살릴 수 있다" 고 적었기 때문이다. 값이 있으면 탈퇴한 계정이다.
     *
     * 실제 삭제는 포털의 정리 작업이 한다 → myjane/app/api/cron/purge
     * 되살리면 이 값을 다시 null 로 되돌린다.
     *
     * ⚠️ 탈퇴는 **여섯 서비스 공통**이다. 한 앱에서 탈퇴하면 여섯 곳이 함께 닫힌다.
     * 로그인 라우트가 이 값을 보고 막는다 — 앱마다 따로 검사하지 않는다.
     */
    withdrawnAt: { type: Date, default: null },
    /**
     * 세션 버전. 서명 토큰의 `sv` 와 같아야 통과한다.
     * 비밀번호·PIN 변경 · 탈퇴 확정 · "모든 기기에서 로그아웃" 에서 +1 → 지금까지 발급한
     * 토큰이 전부 무효가 된다. 토큰은 30일짜리라 이것 없이는 폐기할 방법이 없었다.
     * ⚠️ 여섯 `models/User.ts` 에 함께 있어야 한다 — 한 앱이 모르면 저장 때 유실된다.
     * → my-obsidian-vault / 50-Plans/E 개인정보 보호 보강.md 5번
     */
    sessionVersion: { type: Number, default: 0 },
    /**
     * 전화번호+PIN 계정을 이메일 계정으로 전환하는 중 — 대기 주소가 인증되면 PIN 을 지운다.
     * 포털 /api/auth/migrate-pin 이 켜고 verify-email 이 끈다. 다른 앱은 읽지 않는다.
     */
    pinRetireOnVerify: { type: Boolean, default: false },
    /**
     * 소셜 로그인 연결 (2026-09-10). 공급자 고유 id 로 회원을 찾는다 — 이메일은 바뀔 수 있다.
     * 포털만 쓰고 만든다. 다른 앱은 저장 때 유실하지 않기 위해 스키마에만 둔다.
     * → my-obsidian-vault / 50-Plans/G 소셜 로그인.md
     */
    providers: {
      type: [
        {
          provider: { type: String, enum: ["google", "kakao", "naver"], required: true },
          providerId: { type: String, required: true },
          email: { type: String, default: null },
          linkedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    /**
     * 보호자·자녀 계정 (2026-09-09). 자녀는 별도 문서고 `parentId` 가 보호자 `_id` 다.
     * 자녀에는 이메일·전화번호·비밀번호가 없다. 만 14세부터 독립(이메일·비밀번호 등록 → 인증)하면
     * `parentId` 가 풀리고 `independentAt` 이 찍힌다. 다른 앱은 읽지 않는다 → myjane/lib/family.ts
     */
    parentId: { type: Schema.Types.ObjectId, default: null, index: true },
    independenceOnVerify: { type: Boolean, default: false },
    independentAt: { type: Date, default: null },

    /**
     * 탈퇴 확인 메일의 토큰. 발급 후 30분에 만료되고 **한 번 쓰면 폐기**한다.
     *
     * 비밀번호와 확인 문구만으로 닫지 않는다 — 남의 브라우저를 잠깐 만진
     * 사람이 계정을 닫을 수 있고, 되돌리려면 6개월 안에 알아차려야 한다.
     * 메일함까지 가져야 닫히게 한다.
     *
     * ⚠️ 이메일이 없는 계정(전화번호+PIN)은 이 단계를 쓸 수 없다.
     * 그때는 비밀번호·PIN 확인까지만 받는다 → myjane/app/api/account/withdraw
     */
    withdrawToken: { type: String },
    withdrawTokenExpires: { type: Date },

    tokens: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date },

    /**
     * ── 포털 전용 ──
     * 통합 admin(`www.myjane.co.kr/admin`) 접근 권한.
     *
     * - `master`   : 운영자를 세우고 내릴 수 있다. 시드는 2xteam@naver.com 하나뿐이다
     * - `operator` : admin 화면을 보고 공지·문의를 다룬다. 권한 관리는 못 한다
     * - `null`     : admin 접근 불가 (대부분의 회원)
     *
     * 각 앱은 이 필드를 읽지도 쓰지도 않는다.
     */
    adminRole: { type: String, enum: ["master", "operator", null], default: null },

    /** 어느 앱에서 가입했는지 (통합 로그인에서 기록) */
    signupFrom: { type: String, default: null },

    /**
     * FitLog 전용 신체 프로필 — 다른 앱은 사용하지 않는다.
     * **선언을 지우면 안 된다.** 한 컬렉션을 공유하므로, 이 앱에서 회원 문서를
     * 저장할 때 스키마에 없는 필드가 유실될 수 있다.
     */
    heightCm: { type: Number, default: null },
    gender: { type: String, enum: ["male", "female", null], default: null },
    birthYear: { type: Number, default: null },

    /**
     * ── 2hbk 전용 ──
     * `userId`는 목표·팔로우·초대 문서가 참조하는 **도메인 식별자**다.
     * Mongo `_id`가 아니라 이 문자열(`user_xxxxxxxxx`)이 모든 참조의 기준이므로
     * 이관할 때 반드시 원본 값을 그대로 보존해야 한다.
     */
    userId: { type: String, default: null },
    nickname: { type: String, trim: true, default: null },
    profileImage: { type: String, default: null },
    followApprovalRequired: { type: Boolean, default: false },
  },
  { versionKey: false },
);

UserSchema.index({ phone: 1, name: 1 });
UserSchema.index({ email: 1 });

/**
 * `userId`는 값이 있을 때만 유일해야 한다. 다른 앱에서 만든 회원은 이 필드가 없고,
 * 스키마 기본값이 `null`이라 sparse 인덱스로는 null끼리 충돌한다. 그래서 부분 인덱스를 쓴다.
 *
 * `email`은 여기서 유일 인덱스를 걸지 않는다. 네 앱이 공유하는 컬렉션이라
 * 기존 `email_1`(비유일) 인덱스를 갈아엎어야 하기 때문이다. 중복은 가입 API에서 막는다.
 */
UserSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "string" } } },
);

UserSchema.index(
  { "providers.provider": 1, "providers.providerId": 1 },
  { unique: true, partialFilterExpression: { "providers.provider": { $type: "string" } }, name: "providers_unique" },
);

export type User = InferSchemaType<typeof UserSchema>;
export type UserDocument = HydratedDocument<User>;

/**
 * `users` 컬렉션은 URI 기본 DB가 아닌 **`user` DB**에 있다. 다섯 앱이 같이 쓴다.
 *
 * 이름을 환경 변수로 받지 않는다. 공유 DB 이름은 서비스 전체의 고정된 사실이고,
 * 환경 변수로 받으면 다른 앱의 `.env.local` 을 복사할 때 조용히 다른 DB를
 * 가리킨다 → lib/db.ts 의 같은 사고 기록
 *
 * 반드시 `connectDB()` 완료 후 호출하세요.
 */
export function getUserModel(): Model<User> {
  const userDb = mongoose.connection.useDb("user", { useCache: true });
  // 개발 중 스키마가 바뀌면 다시 컴파일한다 → lib/model.ts
  return defineModelOn<User>(userDb, "User", UserSchema, "users");
}

/** 화면·API 응답에 실어 보내는 공개 회원 정보 */
export type PublicUser = {
  userId: string;
  nickname: string;
  email: string | null;
  profileImage: string | null;
};

export function toPublicUser(u: UserDocument): PublicUser {
  return {
    userId: u.userId ?? "",
    nickname: u.nickname ?? u.name ?? "이름없음",
    email: u.email ?? null,
    profileImage: u.profileImage ?? null,
  };
}
