// PostToolUse hook: after a shell command that ran codex.cmd, codex_gen.py or cutout.py,
// print the asset QA summary so it lands in the agent context. Never blocks.
import { existsSync } from "node:fs";
import path from "node:path";
import { readEvent, eventCommand } from "./read-event.mjs";
import { hasFrontend, repoRoot, run, skip } from "./util.mjs";

const NAME = "post-shell-qa";
const RELEVANT = /\bcodex(?:\.cmd)?\b|codex_gen\.py|cutout\.py/i;

async function main() {
  if (!hasFrontend()) return skip(NAME, "frontend/ does not exist yet; nothing to refresh.");
  const { json } = await readEvent();
  const command = eventCommand(json);
  if (!command || !RELEVANT.test(command)) return;
  if (!existsSync(path.join(repoRoot, "tools", "art", "qa_check.py"))) {
    return skip(NAME, "tools/art/qa_check.py does not exist yet; skipped.");
  }
  const qa = run("python", ["tools/art/qa_check.py"], { timeout: 50_000 });
  console.log(`Asset QA summary (after: ${command.slice(0, 80)}):\n${qa.output || "(no output)"}`);
  if (qa.status !== 0) console.log(`[${NAME}] qa_check.py exited with ${qa.status}; see the output above.`);
}

main().catch((e) => {
  console.error(`[${NAME}] unexpected error: ${e?.stack ?? e}`);
  process.exitCode = 0;
});
