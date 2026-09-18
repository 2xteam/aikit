/**
 * ② 거른다 — 27,549건에서 후보 수백 건을 남긴다. **여기가 본체다.**
 *
 *     npm run prompts:filter              통계만 찍는다 (아무것도 쓰지 않는다)
 *     npm run prompts:filter -- --write   .cache/prompts/candidates.json 을 만든다
 *
 * 집안 규칙: 기본은 검사만, `--write` 를 줘야 쓴다
 * (`npm run palette` · `npm run elements` · jangmini `ingest` 와 같다).
 *
 * ⚠️ **DB 는 건드리지 않는다.** 적재는 prompts:ingest 가 한다.
 *
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ②
 *
 * ────────────────────────────────────────────────────────────────────────
 * 볼트의 7단계 설계 중 **셋이 실제 데이터에서 무력했다** (2026-09-18 전수 실측).
 * 설계를 탓할 일이 아니라, 받아 보기 전에는 알 수 없던 것들이다.
 *
 * | 볼트의 단계 | 실제 |
 * |---|---|
 * | 1 `spec.safety_rating` 으로 거른다 | **27,549건 전부 "Safe for Work"** — 0건 걸러짐 |
 * | 2 `media` 빈 것 제외 | **빈 건이 0개** — 0건 걸러짐 |
 * | 5 카테고리 화이트리스트 | category 가 **네 종류뿐**(Content Creation 19,908 · Commercial 3,913 ·
 * |   | Entertainment 3,727 · Technology 1) — 축이 맞지 않는다 |
 *
 * 그래서 실제로 거르는 힘은 **금칙어 · 길이 · 태그(분위기) · 중복** 에서 나온다.
 * `is_featured` 도 전체 **9건**뿐이라 대표 고르기 기준으로 쓸 수 없다 — 장수와 최신으로 간다.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, RAW_FILE } from "./prompts-fetch.mjs";
import { MOOD_IDS, pickMood } from "./prompts-mood-rules.mjs";

const write = process.argv.includes("--write");
const OUT = path.join(CACHE_DIR, "candidates.json");
const REJECTED = path.join(process.cwd(), "content", "prompts", "rejected.json");

/**
 * 길이 상한.
 *
 * 딥링크를 접었으므로(2026-09-18) URL 길이 제약은 사라졌다. 그래도 상한을 두는
 * 이유는 **생성 요청의 토큰 비용**이다 — 기초 프롬프트가 통째로 OpenAI 입력에
 * 들어간다. 99%가 3,938자 이내이고 최대가 16,029자라, 상한을 넘는 소수의
 * 극단값만 잘라 낸다.
 */
const MAX_CHARS = 3500;
const MIN_CHARS = 200;

/**
 * 분위기당 후보 상한 — **검수 대기 풀의 크기**다.
 *
 * 최종 목표는 분위기당 20~30건이지만, 사람이 고를 여지를 두려고 그보다 넉넉히
 * 남긴다. 거르고 나면 17,270건이 되는데 그걸 다 검수할 수는 없다.
 *
 * 순위는 ① 태그가 맞힌 것 ② 예시 이미지가 많은 것 ③ 최신 순이다.
 * `is_featured` 는 쓰지 않는다 — 전체 27,549건 중 **9건**뿐이라 신호가 안 된다.
 */
const PER_MOOD = Number(
  (process.argv.find((a) => a.startsWith("--per-mood=")) || "").split("=")[1] || 60,
);

/**
 * 실명·브랜드·IP·노출 — **여기가 실질적인 1차 방어선이다.**
 *
 * `safety_rating` 이 전부 SFW 라 아무것도 막아 주지 않는다. 걸리면 버린다.
 * ⚠️ 이 목록은 완전하지 않다. **⑦ 사람이 보는 단계를 대신하지 못한다.**
 */
const BLOCK_WORDS = [
  // 노출·선정
  "bikini", "lingerie", "nude", "topless", "nsfw", "seductive", "boudoir",
  "cleavage", "underwear", "swimsuit",
  // 실존 인물·유명인
  "celebrity", "red carpet", "taylor swift", "elon musk", "trump", "kardashian",
  "blackpink", "bts ", "idol",
  // IP·캐릭터
  "pixar", "disney", "marvel", "ghibli", "pokemon", "anime character", "cosplay",
  "star wars", "harry potter", "barbie",
  // 브랜드
  "nike", "adidas", "gucci", "chanel", "louis vuitton", "supreme", "apple ",
  "coca cola", "starbucks",
];

/**
 * 우리 용도와 먼 것 — 사진을 가진 사람이 오는 앱이다.
 * category 로는 못 거르므로 **태그로** 거른다.
 */
const OFF_TOPIC_TAGS = [
  "logo", "logo design", "infographic", "ui design", "ux", "mockup", "app design",
  "website", "icon design", "game asset", "3d model", "chart", "diagram",
  "presentation", "resume", "business card", "poster design template",
];

const norm = (s) => (s || "").toLowerCase();

function loadJson(file, fallback) {
  return readFile(file, "utf8")
    .then((t) => JSON.parse(t))
    .catch(() => fallback);
}

/** 예시 이미지 경로는 **상대 경로**다. HF resolve 주소로 조립한다 */
const HF_BASE =
  "https://huggingface.co/datasets/Goku-OpenLab/nano-banana-pro-prompts-datasets/resolve/main/";
const toUrl = (p) => (/^https?:\/\//.test(p) ? p : HF_BASE + String(p).replace(/^\/+/, ""));

function images(r) {
  const m = r.media;
  const list = (m && !Array.isArray(m) ? m.images : m) || [];
  return list.map(toUrl);
}

/** 완전 중복을 잡는 정규화 — 소문자 · 공백 정리 · 문장부호 제거 */
function fingerprint(text) {
  return norm(text).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  const raw = await readFile(RAW_FILE, "utf8").catch(() => null);
  if (raw === null) {
    console.error(`✗ 원본이 없습니다: ${RAW_FILE}`);
    console.error(`  먼저:  npm run prompts:fetch`);
    process.exit(1);
  }

  const rejectedBefore = await loadJson(REJECTED, { ids: {} });
  const manuallyRejected = new Set(Object.keys(rejectedBefore.ids ?? {}));

  const stat = {
    읽음: 0,
    "손으로 버림": 0,
    "영문 본문 없음": 0,
    "너무 짧음": 0,
    "너무 긺": 0,
    "금칙어": 0,
    "우리 용도 아님": 0,
    "분위기 못 정함": 0,
    "완전 중복": 0,
    남음: 0,
  };

  const seen = new Map();
  const kept = [];

  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    let r;
    try {
      r = JSON.parse(s);
    } catch {
      continue;
    }
    stat.읽음 += 1;

    if (manuallyRejected.has(r.id)) {
      stat["손으로 버림"] += 1;
      continue;
    }

    const en = (r.i18n && r.i18n.en) || {};
    /*
      ⚠️ 본문은 `raw_p` 가 아니라 `i18n.en.p` 에서 받는다.
      raw_p 는 원문 언어 그대로라 일본어·중국어가 섞여 있다(전수 4.2%).
      볼트의 매핑 표(raw_p → body)는 이 점에서 틀렸다.
    */
    const body = (en.p || "").trim();
    if (!body) {
      stat["영문 본문 없음"] += 1;
      continue;
    }
    if (body.length < MIN_CHARS) {
      stat["너무 짧음"] += 1;
      continue;
    }
    if (body.length > MAX_CHARS) {
      stat["너무 긺"] += 1;
      continue;
    }

    const tags = (en.tags || []).map(norm);
    const haystack = `${norm(en.t)} ${norm(body)} ${tags.join(" ")}`;

    if (BLOCK_WORDS.some((w) => haystack.includes(w))) {
      stat["금칙어"] += 1;
      continue;
    }
    if (tags.some((t) => OFF_TOPIC_TAGS.includes(t))) {
      stat["우리 용도 아님"] += 1;
      continue;
    }

    /*
      분위기를 규칙으로 1차 배정한다. 못 정하면 **버린다** — 억지로 채우지 않는다.
      분위기가 틀리면 사용자가 고른 것과 다른 결과가 나오고, 그게 이 앱에서
      제일 나쁜 실패다. 규칙이 못 잡은 것 중 쓸 만한 것은 ⑦ 검수에서 줍는다.
    */
    const hit = pickMood(tags, haystack);
    if (!hit) {
      stat["분위기 못 정함"] += 1;
      continue;
    }
    const { mood, via } = hit;

    const fp = fingerprint(body);
    const prev = seen.get(fp);
    if (prev) {
      stat["완전 중복"] += 1;
      /* 대표는 예시 이미지가 많은 쪽, 같으면 최신 */
      const a = images(r).length;
      if (a > prev.exampleCount) Object.assign(prev, toCandidate(r, mood, via, en));
      continue;
    }

    const cand = toCandidate(r, mood, via, en);
    seen.set(fp, cand);
    kept.push(cand);
    stat.남음 += 1;
  }

  /* ─────────────── 분위기별 상한 ─────────────── */
  const pools = new Map(MOOD_IDS.map((m) => [m, []]));
  for (const c of kept) pools.get(c.mood)?.push(c);

  const rank = (a, b) =>
    (a.via === b.via ? 0 : a.via === "tag" ? -1 : 1) ||
    b.exampleCount - a.exampleCount ||
    String(b.date).localeCompare(String(a.date));

  const finalItems = [];
  const perMood = [];
  for (const m of MOOD_IDS) {
    const pool = (pools.get(m) ?? []).sort(rank);
    const tagHits = pool.filter((c) => c.via === "tag").length;
    const take = pool.slice(0, PER_MOOD);
    finalItems.push(...take);
    perMood.push({ mood: m, pool: pool.length, tagHits, taken: take.length });
  }
  stat["상한 넘어 보류"] = kept.length - finalItems.length;

  /* ─────────────── 결과 ─────────────── */
  console.log("단계별 건수");
  for (const [k, v] of Object.entries(stat)) {
    console.log(`  ${k.padEnd(16)} ${String(v).padStart(7)}`);
  }

  console.log(`
분위기별 (상한 ${PER_MOOD} · 최종 목표 20~30건)`);
  console.log(`  ${"분위기".padEnd(16)} ${"후보".padStart(7)} ${"태그확신".padStart(8)} ${"채택".padStart(6)}`);
  let holes = 0;
  for (const r of perMood) {
    const mark = r.taken === 0 ? "  ✗ 구멍" : r.tagHits < 20 ? "  ! 태그확신 부족" : "";
    if (r.taken === 0 || r.tagHits < 20) holes += 1;
    console.log(
      `  ${r.mood.padEnd(16)} ${String(r.pool).padStart(7)} ${String(r.tagHits).padStart(8)} ${String(r.taken).padStart(6)}${mark}`,
    );
  }
  console.log(`
  합계 ${finalItems.length}건이 검수 대기로 갑니다`);
  if (holes) {
    console.log(
      `
! ${holes}개 분위기의 **태그 확신분**이 20건에 못 미칩니다.
` +
        `  본문 매칭분은 분위기가 틀릴 확률이 높으니 ⑦ 검수에서 특히 봐야 합니다.
` +
        `  끝내 모자라는 분위기는 직접 저작합니다
` +
        `  → my-obsidian-vault / 30-Patterns/프롬프트 지식베이스.md`,
    );
  }

  if (!write) {
    console.log(`
아무것도 쓰지 않았습니다. 후보 파일을 만들려면:`);
    console.log(`  npm run prompts:filter -- --write`);
    return;
  }

  await writeFile(
    OUT,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), perMoodCap: PER_MOOD, items: finalItems },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`
✓ ${OUT} — ${finalItems.length}건`);
  console.log(`다음:  npm run prompts:ingest`);
}

function toCandidate(r, mood, via, en) {
  const urls = images(r);
  return {
    sourceId: r.id,
    slug: r.slug,
    title: (en.t || "").trim(),
    body: (en.p || "").trim(),
    charCount: (en.p || "").trim().length,
    mood,
    via,
    tags: (en.tags || []).map(norm),
    examples: urls,
    exampleCount: urls.length,
    ratio: (r.spec && r.spec.ratio) ?? null,
    category: r.category ?? "",
    platform: r.platform ?? "",
    sourceLink: r.sourceLink ?? "",
    date: r.date ?? "",
  };
}

await main();
