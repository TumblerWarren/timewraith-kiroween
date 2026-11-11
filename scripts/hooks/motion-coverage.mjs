// PostFileSave hook for frontend/src/animation: remind about fallbacks and run the registry tests.
import { existsSync } from "node:fs";
import path from "node:path";
import { frontendDir, frontendReady, hasFrontend, run, skip } from "./util.mjs";

const NAME = "motion-coverage";
const REMINDER =
  "Every effect needs a fallback: settle() plus fallback {kind, apply}; fades are at most 150 ms; register new ids in effects/registry.ts";

async function main() {
  if (!hasFrontend()) return skip(NAME, "frontend/ does not exist yet; nothing to check.");
  console.log(REMINDER);
  if (!existsSync(path.join(frontendDir, "src", "animation"))) {
    return skip(NAME, "frontend/src/animation does not exist yet; skipped.");
  }
  if (!frontendReady()) return skip(NAME, "frontend/ has no package.json or node_modules yet; skipped.");

  const result = run("pnpm", ["--dir", "frontend", "exec", "vitest", "run", "src/animation", "--reporter=dot", "--passWithNoTests"]);
  if (result.status !== 0) {
    console.error(`Reduce Motion coverage tests failed.\n${REMINDER}\n\n${result.output}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[${NAME}] src/animation tests passed.`);
}

main().catch((e) => {
  console.error(`[${NAME}] unexpected error: ${e?.stack ?? e}`);
  process.exitCode = 1;
});
