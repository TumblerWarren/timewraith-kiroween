// PreToolUse hook for shell commands. Exit 2 blocks the command and sends STDERR to the agent.
//   node scripts/hooks/guard-shell.mjs shims    block codex/opencode without .cmd (and the .ps1 shims)
//   node scripts/hooks/guard-shell.mjs commit   run the style guard and lint before `git commit`
import { existsSync } from "node:fs";
import path from "node:path";
import { readEvent, eventCommand } from "./read-event.mjs";
import { frontendReady, frontendScripts, repoRoot, run, runNode } from "./util.mjs";

const NAME = "guard-shell";
const SHIM = /(?:^|[\s;&|(`'"])(?:codex|opencode)(?:\.ps1)?(?=[\s;&|)`'"]|$)/i;
const GIT_COMMIT = /\bgit\s+commit\b/;

function block(message) {
  console.error(message);
  process.exitCode = 2;
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "shims" && mode !== "commit") {
    console.error(`[${NAME}] unknown mode ${JSON.stringify(mode)}; expected "shims" or "commit". Not blocking.`);
    process.exitCode = 1;
    return;
  }
  const { json } = await readEvent();
  const command = eventCommand(json);
  if (!command) return; // nothing to judge: allow

  if (mode === "shims") {
    if (SHIM.test(command)) {
      block(
        "Blocked: call codex.cmd and opencode.cmd, never `codex`, `opencode` or the .ps1 shims. " +
          "Windows PowerShell execution policy blocks the .ps1 shims.",
      );
    }
    return;
  }

  if (!GIT_COMMIT.test(command)) return;
  const failures = [];

  if (existsSync(path.join(repoRoot, "scripts", "check-style-guard.mjs"))) {
    const guard = runNode("scripts/check-style-guard.mjs", ["--all"]);
    if (guard.status !== 0) failures.push(`Style guard failed:\n${guard.output}`);
  }
  if (frontendReady() && frontendScripts().lint) {
    const lint = run("pnpm", ["--dir", "frontend", "lint"]);
    if (lint.status !== 0) failures.push(`Lint failed:\n${lint.output}`);
  }
  if (failures.length > 0) {
    block(`Blocked git commit.\n\n${failures.join("\n\n")}`);
  }
}

main().catch((e) => {
  console.error(`[${NAME}] unexpected error: ${e?.stack ?? e}`);
  process.exitCode = 1; // an internal error must not block the command
});
