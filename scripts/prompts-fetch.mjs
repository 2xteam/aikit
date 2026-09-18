/**
 * ① 받는다 — HF 원본을 캐시에 내려받는다. **DB 는 건드리지 않는다.**
 *
 *     npm run prompts:fetch
 *     npm run prompts:fetch -- --force     캐시가 있어도 다시 받는다
 *
 * 원본은 저장소에 커밋하지 않는다(`.cache/` 는 .gitignore). 133MB 다.
 * 이미지 6GB 는 받지 않는다 — 예시 이미지는 원본 URL 을 건다.
 *
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ①
 */
import { createWriteStream } from "node:fs";
import { mkdir, stat, rename } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const SRC =
  "https://huggingface.co/datasets/Goku-OpenLab/nano-banana-pro-prompts-datasets/resolve/main/metadata.jsonl";

export const CACHE_DIR = path.join(process.cwd(), ".cache", "prompts");
export const RAW_FILE = path.join(CACHE_DIR, "metadata.jsonl");

const force = process.argv.includes("--force");

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  if (!force) {
    try {
      const s = await stat(RAW_FILE);
      if (s.size > 0) {
        console.log(`✓ 캐시가 이미 있습니다 — ${RAW_FILE} (${mb(s.size)})`);
        console.log(`  다시 받으려면:  npm run prompts:fetch -- --force`);
        return;
      }
    } catch {
      /* 없으면 받는다 */
    }
  }

  console.log(`받는 중… ${SRC}`);
  const res = await fetch(SRC, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`내려받기 실패 (${res.status} ${res.statusText})`);
  }

  const total = Number(res.headers.get("content-length") ?? 0);
  let seen = 0;
  let lastLog = 0;

  /*
    부분 파일을 그대로 두면 다음 실행이 그걸 캐시로 착각한다.
    임시 이름으로 받고 끝난 뒤에 옮긴다.
  */
  const tmp = `${RAW_FILE}.partial`;
  const body = Readable.fromWeb(res.body);
  body.on("data", (chunk) => {
    seen += chunk.length;
    if (seen - lastLog > 10 * 1024 * 1024) {
      lastLog = seen;
      const pct = total ? ` (${((seen / total) * 100).toFixed(0)}%)` : "";
      console.log(`  ${mb(seen)}${pct}`);
    }
  });

  await pipeline(body, createWriteStream(tmp));
  await rename(tmp, RAW_FILE);

  console.log(`✓ ${RAW_FILE} — ${mb(seen)}`);
  console.log(`다음:  npm run prompts:filter`);
}

/* 스크립트로 직접 돌릴 때만 실행한다. filter 가 경로 상수를 import 한다 */
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  await main();
}
