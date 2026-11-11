// Small shared helpers for the hook scripts: repo paths, a safe command runner, and messages.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const frontendDir = path.join(repoRoot, "frontend");

export const hasFrontend = () => existsSync(frontendDir);

/** Script names from frontend/package.json, or an empty object when it is missing or invalid. */
export function frontendScripts() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(frontendDir, "package.json"), "utf8"));
    return pkg && typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts : {};
  } catch {
    return {};
  }
}

/** True when frontend/ has a package.json and installed dependencies. */
export const frontendReady = () =>
  existsSync(path.join(frontendDir, "package.json")) && existsSync(path.join(frontendDir, "node_modules"));

/** Print a skip message and leave the exit code at 0. */
export function skip(name, message) {
  console.log(`[${name}] ${message}`);
  process.exitCode = 0;
}

// Arguments go through cmd.exe for pnpm on Windows, so refuse anything cmd or a POSIX shell could expand.
const UNSAFE_ARG = /["%`$^!\r\n]/;
const quoteArg = (a) => (/^[\w@+=:,./\\-]+$/.test(a) ? a : `"${a}"`);

/**
 * Run a command and capture its output. Never throws.
 * `pnpm` is a .cmd shim on Windows, so it runs through the shell with quoted, validated arguments;
 * every other command runs directly without a shell.
 * @returns {{ status: number, stdout: string, stderr: string, output: string }}
 */
export function run(command, args = [], { cwd = repoRoot, timeout = 280_000 } = {}) {
  const bad = args.find((a) => UNSAFE_ARG.test(String(a)));
  if (bad !== undefined) {
    const msg = `Refusing to run ${command}: unsafe argument ${JSON.stringify(bad)}`;
    return { status: 1, stdout: "", stderr: msg, output: msg };
  }
  const viaShell = process.platform === "win32" && command === "pnpm";
  const options = { cwd, encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], windowsHide: true };
  const result = viaShell
    ? spawnSync(["pnpm", ...args.map((a) => quoteArg(String(a)))].join(" "), { ...options, shell: true })
    : spawnSync(command, args.map(String), options);
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? (result.error ? String(result.error.message) : "");
  const status = typeof result.status === "number" ? result.status : 1;
  const note = result.error && !result.stderr ? `\n${result.error.message}` : "";
  return { status, stdout, stderr: stderr + note, output: (stdout + (stderr ? `\n${stderr}` : "") + note).trim() };
}

/**
 * Run `node <script> ...args` with the current Node binary.
 * The symlink flags avoid an EPERM from realpath() on drive roots (seen on F:\ on this machine).
 */
export const runNode = (script, args = [], opts) =>
  run(process.execPath, ["--preserve-symlinks", "--preserve-symlinks-main", script, ...args], opts);

/** Resolve an event path (absolute or repo-relative) to an absolute path. */
export const resolveFromRoot = (p) => path.resolve(repoRoot, p);

/** Forward slashes, for matching against patterns on any OS. */
export const posix = (p) => p.split(path.sep).join("/").replace(/\\/g, "/");
