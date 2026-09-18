import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 사람의 검수 판단을 담는 **파일**.
 *
 * ⚠️ **DB 가 아니라 이 파일이 원본이다.** `npm run prompts:ingest` 가 다시
 * 돌면 DB 의 검수 값은 이 파일에서 덮어써진다. DB 에만 두면 재적재 한 번에
 * 사람이 들인 시간이 통째로 날아간다.
 * → my-obsidian-vault / 30-Patterns/프롬프트 데이터 적재 지침.md ④ 멱등
 *
 * ⚠️ **이 두 파일은 저장소에 커밋한다.** 여기 들어 있는 것이 사람의 시간이다.
 *
 * ⚠️ 파일에 쓰므로 **로컬에서만 동작한다.** Vercel 의 파일 시스템은 읽기 전용이다.
 * 검수는 로컬 도구다 → app/review/page.tsx
 */

const DIR = path.join(process.cwd(), "content", "prompts");
export const CURATION_FILE = path.join(DIR, "curation.json");
export const REJECTED_FILE = path.join(DIR, "rejected.json");

export type CurationEntry = {
  /** `kept` 만 적는다. 버린 것은 rejected.json 으로 간다 */
  status?: "kept";
  /** 자동 배정을 사람이 고쳤으면 그 값. 적재 때 기계 판단을 덮는다 */
  mood?: string;
  featured?: boolean;
  titleKo?: string;
  blurb?: string;
  /** 본문을 손봤으면 true — CC BY 4.0 의 "변경 여부 표시" 의무 */
  modified?: boolean;
  /** 실제로 이미지를 만들어 확인했으면 true */
  verified?: boolean;
  verifiedAt?: string;
  reviewedAt?: string;
};

type CurationFile = { items: Record<string, CurationEntry> };
type RejectedFile = { ids: Record<string, { reason: string; at: string }> };

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/**
 * **임시 파일에 쓰고 옮긴다.**
 *
 * 검수 중에 한 건씩 저장하므로 쓰기가 잦다. 그대로 덮어쓰다가 중간에 죽으면
 * 반쯤 쓰인 JSON 이 남고, 다음 실행이 통째로 읽기에 실패해 **그때까지의 판단이
 * 전부 사라진다.** rename 은 같은 볼륨에서 원자적이다.
 */
async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, file);
}

export async function loadCuration(): Promise<CurationFile> {
  return readJson<CurationFile>(CURATION_FILE, { items: {} });
}

export async function loadRejected(): Promise<RejectedFile> {
  return readJson<RejectedFile>(REJECTED_FILE, { ids: {} });
}

/** 남기기 — curation 에 적고 rejected 에서는 뺀다 */
export async function markKept(sourceId: string, patch: CurationEntry = {}): Promise<void> {
  const cur = await loadCuration();
  const rej = await loadRejected();
  cur.items[sourceId] = {
    ...(cur.items[sourceId] ?? {}),
    ...patch,
    status: "kept",
    reviewedAt: new Date().toISOString(),
  };
  /* 되살릴 때 rejected 에 남아 있으면 다음 적재에서 다시 빠진다 */
  delete rej.ids[sourceId];
  await writeJson(CURATION_FILE, cur);
  await writeJson(REJECTED_FILE, rej);
}

/** 버리기 — rejected 에 **이유와 함께** 적는다. 이유가 없으면 나중에 판단을 못 되짚는다 */
export async function markRejected(sourceId: string, reason: string): Promise<void> {
  const cur = await loadCuration();
  const rej = await loadRejected();
  rej.ids[sourceId] = { reason: reason || "검수에서 제외", at: new Date().toISOString() };
  delete cur.items[sourceId];
  await writeJson(CURATION_FILE, cur);
  await writeJson(REJECTED_FILE, rej);
}

/** 되돌리기 — 아직 안 본 상태로 */
export async function markPending(sourceId: string): Promise<void> {
  const cur = await loadCuration();
  const rej = await loadRejected();
  delete cur.items[sourceId];
  delete rej.ids[sourceId];
  await writeJson(CURATION_FILE, cur);
  await writeJson(REJECTED_FILE, rej);
}

/** 이미 남기기로 한 건의 값만 고친다(분위기 · 제목 · 승급). 상태는 건드리지 않는다 */
export async function patchCuration(sourceId: string, patch: CurationEntry): Promise<void> {
  const cur = await loadCuration();
  cur.items[sourceId] = { ...(cur.items[sourceId] ?? {}), ...patch };
  await writeJson(CURATION_FILE, cur);
}
