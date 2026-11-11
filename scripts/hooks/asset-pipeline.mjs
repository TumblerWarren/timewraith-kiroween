// PostFileSave hook for a saved master PNG: run the cutout script, then asset QA.
// Safety net only; codex_gen.py also runs both steps itself.
import { existsSync } from "node:fs";
import path from "node:path";
import { readEvent, eventPath } from "./read-event.mjs";
import { hasFrontend, posix, repoRoot, resolveFromRoot, run, skip } from "./util.mjs";

const NAME = "asset-pipeline";
const MASTER = /(?:^|\/)frontend\/assets\/masters\/(.+)\.png$/i;

/** `mascot/part-v03.png` under masters/ becomes the asset id `mascot/part`. */
function assetIdFromPath(posixPath) {
  const m = MASTER.exec(posixPath);
  if (!m) return undefined;
  return m[1].replace(/-v\d+$/i, "");
}

async function main() {
  if (!hasFrontend()) return skip(NAME, "frontend/ does not exist yet; nothing to do.");
  const { json } = await readEvent();
  const file = eventPath(json);
  if (!file) return skip(NAME, "No file path in the hook event; skipped.");

  const abs = resolveFromRoot(file);
  const rel = posix(path.relative(repoRoot, abs));
  const id = assetIdFromPath(rel);
  if (!id) return skip(NAME, `${file} is not a master PNG; skipped.`);
  if (id.split("/").some((part) => part.startsWith("_"))) {
    return skip(NAME, `${rel} is in a service folder (leading underscore); skipped.`);
  }
  const cutout = path.join(repoRoot, "tools", "art", "cutout.py");
  const qa = path.join(repoRoot, "tools", "art", "qa_check.py");
  if (!existsSync(cutout) || !existsSync(qa)) {
    return skip(NAME, "tools/art/cutout.py or qa_check.py does not exist yet; skipped.");
  }

  const cut = run("python", ["tools/art/cutout.py", "--input", rel]);
  console.log(cut.output);
  if (cut.status !== 0) {
    console.error(`Cutout failed for ${rel}:\n${cut.output}`);
    process.exitCode = 1;
    return;
  }
  const check = run("python", ["tools/art/qa_check.py", "--id", id]);
  console.log(check.output);
  if (check.status !== 0 || /status\W+fail\b|\bFAIL\b/.test(check.output)) {
    console.error(`Asset QA failed for ${id}. Reasons:\n${check.output}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`[${NAME}] unexpected error: ${e?.stack ?? e}`);
  process.exitCode = 1;
});
