// Debug helper: append the raw hook STDIN event to .kiro/hook-events/events.jsonl so task 2.5
// can pin the real field names. Enable the debug hook once, then disable it again.
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { readEvent, eventPath, eventCommand } from "./read-event.mjs";
import { repoRoot } from "./util.mjs";

async function main() {
  const { raw, json } = await readEvent();
  const dir = path.join(repoRoot, ".kiro", "hook-events");
  mkdirSync(dir, { recursive: true });
  const record = {
    time: new Date().toISOString(),
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    envNames: Object.keys(process.env).filter((k) => /kiro|hook/i.test(k)), // names only, never values
    topLevelKeys: Object.keys(json),
    parsedPath: eventPath(json) ?? null,
    parsedCommand: eventCommand(json) || null,
    raw,
  };
  appendFileSync(path.join(dir, "events.jsonl"), `${JSON.stringify(record)}\n`);
  console.log(`[dump-event] recorded ${raw.length} bytes; keys: ${record.topLevelKeys.join(", ") || "(none)"}`);
}

main().catch((e) => {
  console.error(`[dump-event] unexpected error: ${e?.stack ?? e}`);
  process.exitCode = 0;
});
