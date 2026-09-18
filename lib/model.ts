import mongoose, { type Model, type Schema } from "mongoose";

/**
 * 모델을 가져온다. 없으면 컴파일하고, **개발 중 스키마가 바뀌면 다시 컴파일한다.**
 *
 * ⚠️ mongoose 는 컴파일한 모델을 `mongoose.models` 에 담아 두는데, 이 객체는
 * `globalThis` 에 있어서 Next 의 HMR 을 넘어 살아남는다. 그래서 스키마에 필드를
 * 하나 더해도 **옛 모델이 계속 쓰이고**, `strict` 가 모르는 경로를 `$set` 에서
 * **오류 없이 버린다** — 새 필드가 저장되지 않는데 아무도 알려주지 않는다.
 * 개발 서버를 재시작하기 전까지 계속 그렇다.
 * (2026-09-04 `quiz.disclaimer` 가 조용히 사라져 화면에 아무것도 안 떴다)
 *
 * 매번 지우고 다시 만들지는 않는다. HMR 로 모듈이 다시 실행되면 `schema` 는
 * **새 객체**가 되므로, 담아 둔 모델의 스키마와 **동일성**을 비교하면 바뀐
 * 순간에만 다시 컴파일할 수 있다.
 *
 * 운영에서는 모듈이 한 번만 실행되므로 이 분기를 타지 않는다.
 * → my-obsidian-vault / 40-Infra/MongoDB Atlas.md
 */
export function defineModel<T>(name: string, schema: Schema, collection: string): Model<T> {
  const existing = mongoose.models[name];
  if (existing && process.env.NODE_ENV !== "production" && existing.schema !== schema) {
    mongoose.deleteModel(name);
  }
  return (mongoose.models[name] ??
    mongoose.model(name, schema, collection)) as unknown as Model<T>;
}

/**
 * 같은 일을 **다른 DB의 연결** 위에서 한다 (`users` 는 공유 `user` DB 에 있다).
 * 모델 목록이 `mongoose.models` 가 아니라 그 연결에 달려 있어 따로 둔다.
 */
export function defineModelOn<T>(
  conn: mongoose.Connection,
  name: string,
  schema: Schema,
  collection: string,
): Model<T> {
  const existing = conn.models[name];
  if (existing && process.env.NODE_ENV !== "production" && existing.schema !== schema) {
    conn.deleteModel(name);
  }
  return (conn.models[name] ?? conn.model(name, schema, collection)) as unknown as Model<T>;
}
