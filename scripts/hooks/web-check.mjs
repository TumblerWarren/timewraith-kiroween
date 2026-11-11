// PostFileSave hook: ESLint the saved file, then typecheck. Skips until frontend/ is scaffolded.
import path from "node:path";
import { readEvent, eventPath } from "./read-event.mjs";
import { frontendDir, frontendReady, frontendScripts, hasFrontend, posix, resolveFromRoot, run, skip } from "./util.mjs";

const NAME = "web-check";
const SOURCE = /(?:^|\/)frontend\/src\/.*\.(?:ts|tsx)$/;

async function main() {
  if (!hasFrontend()) return skip(NAME, "frontend/ does not exist yet; nothing to check.");
  const { json } = await readEvent();
  const file = eventPath(json);
  if (file && !SOURCE.test(posix(resolveFromRoot(file)))) {
    return skip(NAME, `${file} is not a frontend/src TypeScript file; skipped.`);
  }
  if (!frontendReady()) return skip(NAME, "frontend/ has no package.json or node_modules yet; skipped.");

  const scripts = frontendScripts();
  const failures = [];

  const eslint = file
    ? run("pnpm", ["--dir", "frontend", "exec", "eslint", path.relative(frontendDir, resolveFromRoot(file))])
    : scripts.lint
      ? run("pnpm", ["--dir", "frontend", "lint"])
      : { status: 0, output: "" };
  if (eslint.status !== 0) failures.push(`ESLint failed:\n${eslint.output}`);

  const tsc = scripts.typecheck
    ? run("pnpm", ["--dir", "frontend", "typecheck"])
    : run("pnpm", ["--dir", "frontend", "exec", "tsc", "--noEmit"]);
  if (tsc.status !== 0) failures.push(`Typecheck failed:\n${tsc.output}`);

  if (failures.length > 0) {
    console.error(failures.join("\n\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`[${NAME}] lint and typecheck passed${file ? ` for ${file}` : ""}.`);
}

main().catch((e) => {
  console.error(`[${NAME}] unexpected error: ${e?.stack ?? e}`);
  process.exitCode = 1;
});
