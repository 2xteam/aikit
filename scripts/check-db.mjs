/**
 * MongoDB 연결·DB 이름·컬렉션·인덱스를 점검한다.
 *
 *   npm run db:check            현재 상태만 본다
 *   npm run db:check -- --ensure  빠진 인덱스를 만든다
 *
 * FitLog 의 `npm run r2:check` 와 같은 자리 — 셋팅이 맞는지 사람이 눈으로
 * 확인할 수 있게 한다. 특히 **DB 이름**을 본다: 2026-09-02 에 FitLog 운영
 * URI 가 `math`(SnapNote 의 DB)를 가리켜 측정 기록이 남의 DB 에 쌓인 사고가
 * 있었다. 에러도 경고도 없었다.
 * → my-obsidian-vault / 40-Infra/MongoDB Atlas.md
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import dns from "node:dns";
import { MongoClient } from "mongodb";

dns.setDefaultResultOrder("ipv4first");

/** 이 앱의 DB 이름. lib/db.ts 와 같아야 한다 */
const DB_NAME = (process.env.MONGO_DB ?? "type").trim() || "type";

/**
 * 기대하는 인덱스. models/*.ts 의 선언과 짝이다.
 * mongoose 가 첫 사용 때 자동으로 만들지만, 드리프트는 조용하므로 여기서 대조한다.
 */
const EXPECTED = {
  quizzes: [
    { name: "slug_1", key: { slug: 1 }, unique: true },
    { name: "status_1_order_1", key: { status: 1, order: 1 } },
  ],
  resulttypes: [
    { name: "quizId_1", key: { quizId: 1 } },
    { name: "quizId_1_code_1", key: { quizId: 1, code: 1 }, unique: true },
  ],
  attempts: [
    { name: "owner.userId_1", key: { "owner.userId": 1 } },
    { name: "owner.guestKey_1", key: { "owner.guestKey": 1 } },
    { name: "quizId_1", key: { quizId: 1 } },
    { name: "share.token_1", key: { "share.token": 1 } },
    {
      name: "owner.userId_1_quizId_1_attemptNo_-1",
      key: { "owner.userId": 1, quizId: 1, attemptNo: -1 },
    },
    {
      name: "expiresAt_1",
      key: { expiresAt: 1 },
      /** 게스트만 만료시킨다. sparse 로 두면 회원 기록까지 지워질 위험이 있다 */
      expireAfterSeconds: 0,
      partialFilterExpression: { "owner.kind": "guest" },
    },
  ],
};

/** .env.local 을 직접 읽는다 — 표준 node 실행에는 Next 의 로더가 없다 */
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(path.join(process.cwd(), file), "utf8");
      for (const line of text.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        if (process.env[m[1]] !== undefined) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    } catch {
      /* 없으면 넘어간다 */
    }
  }
}

function uriDbName(uri) {
  try {
    const afterHost = uri.split("://")[1]?.split("/").slice(1).join("/") ?? "";
    const name = afterHost.split("?")[0];
    return name || null;
  } catch {
    return null;
  }
}

loadEnv();

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("✗ MONGO_URI 가 없습니다. .env.example 을 .env.local 로 복사해 채워 주세요.");
  process.exit(1);
}
if (!uri.startsWith("mongodb+srv://")) {
  console.warn(
    "! mongodb+srv:// 가 아닙니다. 표준 URI 는 Atlas 가 클러스터를 이전하면 조용히 끊깁니다.",
  );
}

const ensure = process.argv.includes("--ensure");
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 });

try {
  await client.connect();
  console.log("✓ 연결됐습니다.");

  const inUri = uriDbName(uri);
  console.log(`\nDB 이름`);
  console.log(`  코드가 쓰는 이름   ${DB_NAME}   ← lib/db.ts 에서 못 박은 값. 이게 이깁니다`);
  console.log(`  URI 경로의 이름    ${inUri ?? "(없음)"}`);
  if (inUri && inUri !== DB_NAME) {
    console.log(
      `  ! 둘이 다릅니다. 코드가 이기므로 데이터는 "${DB_NAME}" 에 쌓입니다.\n` +
        `    다른 앱의 연결 문자열을 복사한 것이 아닌지 확인해 주세요.`,
    );
  }

  const db = client.db(DB_NAME);
  const existing = (await db.listCollections().toArray()).map((c) => c.name);
  console.log(`\n컬렉션 (${DB_NAME})`);
  if (!existing.length) {
    console.log(
      `  (없음) — Atlas 에 "${DB_NAME}" DB 가 아직 없거나 비어 있습니다.\n` +
        `    Atlas 는 빈 DB 를 만들 수 없으니, Create Database 로\n` +
        `    DB "${DB_NAME}" + 컬렉션 "quizzes" 를 함께 만들어 주세요.\n` +
        `    나머지 컬렉션과 인덱스는 --ensure 나 첫 쓰기에 생깁니다.`,
    );
  }

  for (const [name, expected] of Object.entries(EXPECTED)) {
    if (!existing.includes(name)) {
      console.log(`  ${name.padEnd(13)} 없음`);
      if (ensure) {
        await db.createCollection(name);
        console.log(`    → 만들었습니다`);
      } else {
        continue;
      }
    }
    const col = db.collection(name);
    const count = await col.countDocuments();
    const have = await col.indexes();
    const haveNames = new Set(have.map((i) => i.name));
    const missing = expected.filter((e) => !haveNames.has(e.name));
    console.log(
      `  ${name.padEnd(13)} 문서 ${String(count).padStart(5)} · 인덱스 ${have.length}` +
        (missing.length ? `  ! 빠짐: ${missing.map((m) => m.name).join(", ")}` : "  ✓"),
    );
    if (missing.length && ensure) {
      for (const m of missing) {
        const { name: idxName, key, ...opts } = m;
        await col.createIndex(key, { name: idxName, ...opts });
        console.log(`    → ${idxName} 만들었습니다`);
      }
    }
  }

  const userDb = client.db((process.env.MONGO_USER_DB ?? "user").trim() || "user");
  const users = await userDb.collection("users").countDocuments();
  console.log(`\n공용 회원 DB`);
  console.log(`  users 문서 ${users} — 다섯 앱이 공유합니다. 이 앱은 읽기만 합니다`);

  console.log(`\n환경 변수`);
  for (const key of ["SESSION_SECRET", "ADMIN_API_SECRET", "NEXT_PUBLIC_COOKIE_DOMAIN"]) {
    const v = process.env[key];
    const mark = key.endsWith("SECRET") ? (v && v.length >= 16 ? "✓" : "✗") : v ? "✓" : "✗";
    const note =
      key === "SESSION_SECRET"
        ? "포털과 같은 값이어야 합니다. 다르면 전부 401"
        : key === "ADMIN_API_SECRET"
          ? "다섯 배포가 같은 값. 없으면 관리 API 가 503"
          : "Vercel 에서는 Secret 이 아니라 Config 타입으로";
    console.log(`  ${mark} ${key.padEnd(28)} ${v ? `길이 ${v.length}` : "없음"}  — ${note}`);
  }

  if (!ensure) {
    console.log(`\n빠진 인덱스를 만들려면:  npm run db:check -- --ensure`);
  }
} catch (err) {
  console.error("\n✗ 실패했습니다:", err instanceof Error ? err.message : err);
  console.error(
    "\n확인할 것\n" +
      "  · Atlas 클러스터가 Paused 상태가 아닌지 (무료 M0 는 미사용 시 자동 정지)\n" +
      "  · Network Access 에 0.0.0.0/0 이 있는지 (Vercel 은 고정 IP 가 없습니다)\n" +
      "  · DB 사용자가 이 DB 에 readWrite 권한이 있는지",
  );
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
