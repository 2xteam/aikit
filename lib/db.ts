import dns from "node:dns";
import mongoose from "mongoose";

/** 일부 Windows/공유기 환경에서 SRV 조회 이슈 완화 */
dns.setDefaultResultOrder("ipv4first");

const MONGODB_URI = process.env.MONGO_URI;

/**
 * 이 앱의 데이터가 들어갈 DB 이름 — **상수다. 환경 변수로 바꿀 수 없다.**
 *
 * URI 뒤에 붙은 경로(`.../aikit`)에 의존하지 않는다. 다른 앱의 연결 문자열을
 * 그대로 붙여 넣으면 URI 경로가 다른 DB를 가리켜 조용히 엉뚱한 DB에 쓴다.
 * (2026-09-02 FitLog가 `math` DB에 measurements 를 쓰던 사고)
 *
 * ⚠️ 한때 `process.env.MONGO_DB ?? "type"` 이었다. 그러면 **막은 것이 아니다** —
 * 2hbk 의 `.env.local` 을 복사하면 `MONGO_DB=hamhibokka` 도 같이 따라와서,
 * URI 경로를 안 믿는 대신 환경 변수를 믿는 같은 사고가 난다.
 * (2026-09-04 TypeLog 의 quizzes·resulttypes·attempts 33건이 `hamhibokka` DB
 * 안에 들어가 있던 사고) DB 이름은 이 앱의 고정된 사실이므로 코드에만 둔다.
 *
 * → my-obsidian-vault / 40-Infra/MongoDB Atlas.md
 */
const MONGODB_DB = "aikit";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};

function getCache(): MongooseCache {
  if (!globalForMongoose._mongooseCache) {
    globalForMongoose._mongooseCache = { conn: null, promise: null };
  }
  return globalForMongoose._mongooseCache;
}

/**
 * 서버리스/핫리로드 환경에서도 연결을 재사용합니다.
 */
export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error("MONGO_URI 환경 변수가 설정되지 않았습니다.");
  }

  const cached = getCache();
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB,
      bufferCommands: false,
      serverSelectionTimeoutMS: 25_000,
      connectTimeoutMS: 20_000,
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    cached.conn = null;
    throw err;
  }
}
