/**
 * 검증용 개발 서버 — 평소 쓰는 `npm run dev`와 **따로 돌린다.**
 *
 * 개발 서버 두 개가 같은 `.next`를 공유하면 서로의 청크를 지워 둘 다 망가진다.
 * 화면은 뜨는데 스크립트가 404로 떨어지고, 결국 응답이 멈춘다.
 *
 *   npm run dev         3005 · .next
 *   npm run dev:verify  3015 · .next-verify
 *
 * `distDir`은 `next.config.ts`가 `NEXT_DIST_DIR`을 읽어 정한다.
 * (윈도우 cmd에서는 `VAR=x cmd` 형식이 안 먹어서 노드로 감싼다.)
 *
 * ⚠️ `.next`를 분리하는 것만으로는 부족하다. Next는 `tsconfig.json`의 `include`에
 * 자기 distDir의 타입 경로가 없으면 **그 파일을 고쳐 쓴다.** 그 쓰기 한 번이 돌고
 * 있는 개발 서버를 재시작시키고, 반복되면 응답이 멈춘다. 그래서 `.next-verify`와
 * `.next-build` 타입 경로를 tsconfig에 미리 넣어 커밋해 뒀다 — 지우면 함정이 돌아온다.
 *
 * 개발 서버가 떠 있을 때 타입만 보려면 `npx tsc --noEmit`을 쓴다.
 */
import { spawn } from "node:child_process";

const port = process.argv[2] ?? "3015";

spawn("npx", ["next", "dev", "-p", port], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_DIST_DIR: ".next-verify" },
}).on("exit", (code) => process.exit(code ?? 0));
