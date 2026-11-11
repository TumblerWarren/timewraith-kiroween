// PostTaskExec hook: front-end unit tests, then pytest on tests/art when that folder exists.
import { existsSync } from "node:fs";
import path from "node:path";
import { frontendReady, frontendScripts, hasFrontend, repoRoot, run } from "./util.mjs";

const NAME = "run-tests";

async function main() {
  const failures = [];
  let ran = 0;

  if (!hasFrontend()) {
    console.log(`[${NAME}] frontend/ does not exist yet; skipping front-end tests.`);
  } else if (!frontendReady() || !frontendScripts()["test:run"]) {
    console.log(`[${NAME}] frontend/ has no installed dependencies or test:run script yet; skipping front-end tests.`);
  } else {
    ran++;
    const r = run("pnpm", ["--dir", "frontend", "test:run"]);
    console.log(r.output);
    if (r.status !== 0) failures.push("Front-end tests failed (pnpm --dir frontend test:run).");
  }

  if (existsSync(path.join(repoRoot, "tests", "art"))) {
    ran++;
    const r = run("python", ["-m", "pytest", "tests/art", "-q"]);
    console.log(r.output);
    if (r.status !== 0) failures.push("Art tool tests failed (python -m pytest tests/art -q).");
  } else {
    console.log(`[${NAME}] tests/art does not exist yet; skipping pytest.`);
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(ran > 0 ? `[${NAME}] all test suites passed.` : `[${NAME}] nothing to run yet.`);
}

main().catch((e) => {
  console.error(`[${NAME}] unexpected error: ${e?.stack ?? e}`);
  process.exitCode = 1;
});
