/**
 * ③④ 맞추고 넣는다 — 후보를 `aikit.prompts` 로.
 *
 *     npm run prompts:ingest            무엇이 달라지는지만 본다
 *     npm run prompts:ingest -- --write 실제로 넣는다
 *
 * ⚠️ **멱등해야 한다.** 다시 돌려도 같은 결과여야 하고, **사람이 한 판단이
 * 날아가면 안 된다.** 그래서 —
 *
 *   · `sourceId` 를 키로 upsert 한다
 *   · 검수 결과는 DB 가 아니라 `content/prompts/curation.json` 이 원본이다.
 *     DB 에만 있으면 재적재 때 사라진다
 *   · 버린 것은 `rejected.json` 에 남긴다. 안 그러면 다음 적재 때 다시 올라온다
 *
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ③④
 */
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const write = process.argv.includes("--write");

const ROOT = process.cwd();
const CANDIDATES = path.join(ROOT, ".cache", "prompts", "candidates.json");
const CURATION = path.join(ROOT, "content", "prompts", "curation.json");
const REJECTED = path.join(ROOT, "content", "prompts", "rejected.json");

/** ⚠️ `lib/db.ts` 와 같은 값. 환경 변수로 받지 않는다 */
const DB_NAME = "aikit";

const LICENSE = "CC-BY-4.0";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
const DATASET = "Goku-OpenLab/nano-banana-pro-prompts-datasets";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      for (const line of text.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m || process.env[m[1]] !== undefined) continue;
        process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
      }
    } catch {
      /* 없으면 넘어간다 */
    }
  }
}

const json = (file, fallback) =>
  readFile(file, "utf8")
    .then((t) => JSON.parse(t))
    .catch(() => fallback);

/**
 * `sourceLink` 에서 작성자를 뽑는다 — CC BY 4.0 의 **출처 표기**에 필요하다.
 * 표본은 전부 x.com 이지만 promptlibrary 등도 있으므로 못 뽑으면 빈 문자열로 둔다.
 */
function authorFrom(link) {
  const m = /^https?:\/\/(?:www\.)?x\.com\/([^/]+)\//.exec(link || "");
  return m ? `@${m[1]}` : "";
}

/** 원본의 숫자 비율을 가장 가까운 칩으로. lib/prompts/vocab.ts 의 RATIOS 와 같은 값 */
const RATIOS = [
  ["4:5", 0.8],
  ["9:16", 0.5625],
  ["1:1", 1],
  ["3:2", 1.5],
  ["16:9", 1.7778],
];
function nearestRatio(v) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  let best = null;
  let gap = Infinity;
  for (const [id, val] of RATIOS) {
    const g = Math.abs(Math.log(v) - Math.log(val));
    if (g < gap) {
      gap = g;
      best = id;
    }
  }
  return best;
}

async function main() {
  loadEnv();

  const cands = await json(CANDIDATES, null);
  if (!cands) {
    console.error(`✗ 후보 파일이 없습니다: ${CANDIDATES}`);
    console.error(`  먼저:  npm run prompts:filter -- --write`);
    process.exit(1);
  }

  /* 사람의 판단이 기계의 판단을 덮는다 */
  const curation = await json(CURATION, { items: {} });
  const rejected = await json(REJECTED, { ids: {} });
  const cur = curation.items ?? {};
  const rej = rejected.ids ?? {};

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("✗ MONGO_URI 가 없습니다.");
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName: DB_NAME, serverSelectionTimeoutMS: 25000 });
  const col = mongoose.connection.collection("prompts");

  const stat = { 후보: 0, "버림(검수)": 0, 신규: 0, 갱신: 0, 그대로: 0 };
  const ops = [];
  const slugs = new Set();
  const now = new Date();

  for (const c of cands.items) {
    stat.후보 += 1;
    if (rej[c.sourceId]) {
      stat["버림(검수)"] += 1;
      continue;
    }

    const pick = cur[c.sourceId] ?? {};

    /* slug 가 겹치면 뒤에 숫자를 붙인다 — 유니크 인덱스가 걸려 있다 */
    let slug = c.slug || c.sourceId.toLowerCase();
    let n = 2;
    while (slugs.has(slug)) slug = `${c.slug}-${n++}`;
    slugs.add(slug);

    const doc = {
      slug,
      title: c.title,
      /* 한국어 제목은 큐레이션이 채운다. 번역은 사람이 한 번 본다 */
      titleKo: pick.titleKo ?? "",
      blurb: pick.blurb ?? "",
      body: c.body,
      charCount: c.charCount,
      /* 자동 배정을 사람이 고쳤으면 그 값이 이긴다 */
      mood: pick.mood ?? c.mood,
      tags: {
        suitable_for: [],
        framing: [],
        time_of_day: [],
        /* 매핑되지 않은 원본 태그는 버리지 않고 남긴다. 반복해 쌓이면 승격한다 */
        raw: c.tags ?? [],
      },
      examples: (c.examples ?? []).map((url) => ({ url, broken: false })),
      /* 원본 비율은 **기본값 제안**일 뿐이다. 사용자가 UI 에서 고른 값이 이긴다 */
      vars: [{ key: "RATIO", label: "가로세로비", defaultValue: nearestRatio(c.ratio) ?? "4:5" }],
      ratio: typeof c.ratio === "number" ? c.ratio : null,
      origin: "dataset",
      sourceId: c.sourceId,
      sourceLink: c.sourceLink ?? "",
      sourceAuthor: authorFrom(c.sourceLink),
      /* CC BY 4.0 은 표기가 조건이다. 비워 두지 않는다 */
      license: LICENSE,
      /* 본문을 손대지 않았으므로 false. 손보면 큐레이션이 true 로 올린다 */
      modified: pick.modified ?? false,
      locale: "en",
      /* 실제로 이미지를 만들어 본 것만 true. 사람이 올린다 */
      verified: pick.verified ?? false,
      verifiedAt: pick.verified ? (pick.verifiedAt ? new Date(pick.verifiedAt) : now) : null,
      featured: pick.featured ?? false,
      disabled: pick.disabled ?? false,
      updatedAt: now,
    };

    ops.push({
      updateOne: {
        filter: { sourceId: c.sourceId },
        update: { $set: doc, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    });
  }

  const before = await col.countDocuments();

  if (!write) {
    const existing = await col
      .find({ sourceId: { $in: cands.items.map((c) => c.sourceId) } }, { projection: { sourceId: 1 } })
      .toArray();
    const have = new Set(existing.map((d) => d.sourceId));
    stat.신규 = ops.filter((o) => !have.has(o.updateOne.filter.sourceId)).length;
    stat.갱신 = ops.length - stat.신규;
    report(stat, before, null);
    console.log(`\n아무것도 쓰지 않았습니다. 넣으려면:`);
    console.log(`  npm run prompts:ingest -- --write`);
    await mongoose.disconnect();
    return;
  }

  const res = ops.length ? await col.bulkWrite(ops, { ordered: false }) : { upsertedCount: 0, modifiedCount: 0 };
  stat.신규 = res.upsertedCount ?? 0;
  stat.갱신 = res.modifiedCount ?? 0;
  stat.그대로 = ops.length - stat.신규 - stat.갱신;

  /* 스키마의 인덱스를 실제로 만든다 — 첫 쓰기에 자동 생성되지만 여기서 확실히 */
  await col.createIndex({ sourceId: 1 }, { unique: true, sparse: true });
  await col.createIndex({ slug: 1 }, { unique: true });
  await col.createIndex({ disabled: 1, mood: 1, verified: -1, featured: -1, createdAt: -1 });

  const after = await col.countDocuments();
  report(stat, before, after);

  const byMood = await col
    .aggregate([{ $match: { disabled: false } }, { $group: { _id: "$mood", n: { $sum: 1 } } }, { $sort: { n: -1 } }])
    .toArray();
  console.log("\nDB 안의 분위기별 건수");
  for (const m of byMood) console.log(`  ${String(m._id).padEnd(16)} ${String(m.n).padStart(5)}`);

  console.log(
    `\n라이선스 표기 — 화면에 반드시 남긴다 (선택이 아니라 조건)\n` +
      `  카드 하단 : 출처 <작성자> · <원문 링크> · ${LICENSE} · 수정함\n` +
      `  푸터      : 프롬프트 일부는 ${DATASET} (${LICENSE}) 를 바탕으로 합니다\n` +
      `  링크      : ${LICENSE_URL}`,
  );

  await mongoose.disconnect();
}

function report(stat, before, after) {
  console.log("단계별 건수");
  for (const [k, v] of Object.entries(stat)) console.log(`  ${k.padEnd(12)} ${String(v).padStart(6)}`);
  console.log(`\nprompts 컬렉션  ${before} → ${after ?? "(변화 없음 — 검사만)"}`);
}

await main().catch(async (e) => {
  console.error("\n✗ 실패:", e instanceof Error ? e.message : e);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
