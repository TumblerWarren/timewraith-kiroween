/// <reference types="node" />
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// The guard is a plain Node script at the repo root; run it against a throwaway project with --root.
const GUARD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/check-style-guard.mjs");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runGuard(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "tw-guard-"));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, "frontend", "src", name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const result = spawnSync(process.execPath, [GUARD, "--all", "--root", root], { encoding: "utf8" });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("style guard rule uppercase-label (visual revision R1, Requirement 12.11)", () => {
  it("flags text-transform: uppercase in CSS with file, line and rule, and exits 2", () => {
    const { status, out } = runGuard({ "a.css": ".label {\n  color: var(--ink-900);\n  text-transform: uppercase;\n}\n" });
    expect(status).toBe(2);
    expect(out).toMatch(/frontend\/src\/a\.css:3 uppercase-label /);
  });

  it("flags an inline textTransform in TSX", () => {
    const { status, out } = runGuard({ "B.tsx": 'export const B = () => <p style={{ textTransform: "uppercase" }}>x</p>;\n' });
    expect(status).toBe(2);
    expect(out).toMatch(/B\.tsx:1 uppercase-label/);
  });

  it("allows a line marked /* allow-uppercase */, and other text-transform values", () => {
    const { status, out } = runGuard({
      "c.css": ".acronym {\n  text-transform: uppercase; /* allow-uppercase */\n}\n.t {\n  text-transform: none;\n}\n",
    });
    expect(status).toBe(0);
    expect(out).toMatch(/clean/);
  });
});
