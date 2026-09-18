/**
 * R2 설정 점검 — `npm run r2:check`
 *
 * 업로드 실패는 조용하다. 이 스크립트가 실제로
 * HeadBucket → PutObject → GetObject → DeleteObject 를 해보고 어디서 막히는지 알려준다.
 *
 * 자주 나오는 원인:
 *   - 토큰이 **다른 버킷 범위**로 만들어졌다 (HeadBucket 부터 403)
 *   - 토큰이 읽기 전용이다 (Head 는 되는데 Put 만 403)
 *
 * ⚠️ fitlog 의 같은 스크립트와 **다른 점 하나** — 공개 URL 을 확인하지 않는다.
 *    AIKit 의 버킷은 비공개이고 이미지는 앱 라우트가 스트리밍한다. 공개 URL 이
 *    설정돼 있으면 그 자체가 잘못이라 경고를 띄운다.
 *    → my-obsidian-vault / 50-Plans/H AIKit 구축.md "이미지 공개 원칙"
 */
import fs from "node:fs";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const ENV_FILE = process.argv[2] ?? ".env.local";

function readEnvFile(file) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}

const fileEnv = readEnvFile(ENV_FILE);
const env = { ...fileEnv, ...process.env };

const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];

const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length > 0) {
  console.error(`✗ 없는 환경 변수: ${missing.join(", ")}`);
  console.error(`  ${ENV_FILE} 를 채운 뒤 다시 실행하세요.`);
  process.exit(1);
}

const bucket = env.R2_BUCKET_NAME;

console.log(`계정   ${env.R2_ACCOUNT_ID.slice(0, 6)}…${env.R2_ACCOUNT_ID.slice(-4)}`);
console.log(`키     ${env.R2_ACCESS_KEY_ID.slice(0, 6)}…${env.R2_ACCESS_KEY_ID.slice(-4)}`);
console.log(`버킷   ${bucket}`);
console.log("");

if (env.R2_PUBLIC_URL) {
  console.warn(
    `! R2_PUBLIC_URL 이 설정돼 있습니다 (${env.R2_PUBLIC_URL}).\n` +
      `  AIKit 은 공개 읽기를 쓰지 않습니다. 버킷에 Public Development URL 이\n` +
      `  켜져 있다면 끄고, 이 변수도 지워 주세요.\n`,
  );
}

/* 키 형식부터 본다. 형식이 틀렸으면 403 의 원인이 권한이 아니라 잘린 값이다 */
const hex = (s, n) => new RegExp(`^[0-9a-f]{${n}}$`).test(s);
if (!hex(env.R2_ACCOUNT_ID, 32)) console.warn("! R2_ACCOUNT_ID 가 32자 hex 가 아닙니다");
if (!hex(env.R2_ACCESS_KEY_ID, 32)) console.warn("! R2_ACCESS_KEY_ID 가 32자 hex 가 아닙니다");
if (!hex(env.R2_SECRET_ACCESS_KEY, 64)) console.warn("! R2_SECRET_ACCESS_KEY 가 64자 hex 가 아닙니다");

const client = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const key = `_healthcheck/${Date.now()}.txt`;
const body = "aikit r2 healthcheck";
let putOk = false;

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log("✓ 버킷 접근 (HeadBucket)");
} catch (e) {
  const code = e?.$metadata?.httpStatusCode;
  console.error(`✗ 버킷 접근 실패 (${code ?? e.name})`);
  if (code === 403) {
    console.error(
      `  토큰이 '${bucket}' 버킷 범위가 아니거나 다른 계정의 토큰입니다.\n` +
        `  ⚠️ 다른 앱의 .env 를 복사해 쓰면 계정·키가 맞아 보여서 원인을 찾기 어렵습니다.\n` +
        `  Cloudflare → R2 → Manage API tokens 에서 이 버킷을 포함한\n` +
        `  Object Read & Write 토큰을 새로 만들어 주세요.`,
    );
  }
  if (code === 404) console.error(`  '${bucket}' 버킷이 이 계정에 없습니다.`);
  process.exit(1);
}

try {
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" }),
  );
  putOk = true;
  console.log("✓ 업로드 (PutObject)");
} catch (e) {
  const code = e?.$metadata?.httpStatusCode;
  console.error(`✗ 업로드 실패 (${code ?? e.name})`);
  if (code === 403) console.error("  읽기 전용 토큰입니다. Object Read & Write 로 다시 만드세요.");
  process.exit(1);
}

try {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const text = await res.Body.transformToString();
  if (text === body) console.log("✓ 조회 (GetObject) — 앱 라우트가 이 경로로 스트리밍한다");
  else console.error("✗ 조회한 내용이 올린 것과 다릅니다");
} catch (e) {
  const code = e?.$metadata?.httpStatusCode;
  console.error(`✗ 조회 실패 (${code ?? e.name})`);
  if (code === 403) console.error("  쓰기 전용 토큰입니다. Object Read & Write 로 다시 만드세요.");
} finally {
  if (putOk) {
    await client
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      .then(() => console.log(`✓ 정리 완료 (${key})`))
      .catch(() => console.error(`! 점검 파일이 남았습니다: ${key}`));
  }
}
