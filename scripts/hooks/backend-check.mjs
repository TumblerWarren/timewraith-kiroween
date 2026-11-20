// PostFileSave hook: ruff check and ruff format --check on a saved backend Python file.
import path from "node:path";
import { readEvent, eventPath } from "./read-event.mjs";
import { posix, repoRoot, resolveFromRoot, run, skip } from "./util.mjs";

const NAME = "backend-check";
const SOURCE = /(?:^|\/)backend\/(?:src|tests)\/.*\.py$/;

async function main() {
  const { json } = await readEvent();
  const file = eventPath(json);
  if (!file) return skip(NAME, "no file in the event; nothing to check.");
  const absolute = resolveFromRoot(file);
  if (!SOURCE.test(posix(absolute))) return skip(NAME, `${file} is not a backend Python file; skipped.`);
  const backend = path.join(repoRoot, "backend");
  const target = path.relative(backend, absolute);
  const failures = [];
  const lint = run("python", ["-m", "ruff", "check", target], { cwd: backend, timeout: 60_000 });
  if (lint.status !== 0) failures.push(`ruff check failed:\n${lint.output}`);
  const format = run("python", ["-m", "ruff", "format", "--check", target], { cwd: backend, timeout: 60_000 });
  if (format.status !== 0) failures.push(`ruff format would change the file (run: python -m ruff format ${target}):\n${format.output}`);
  if (failures.length > 0) {
    console.error(failures.join("\n\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`[${NAME}] ruff passed for ${file}.`);
}

main().catch((e) => {
  console.error(`[${NAME}] unexpected error: ${e?.stack ?? e}`);
  process.exitCode = 1;
});