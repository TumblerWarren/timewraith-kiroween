// Parsing of the JSON event that Kiro hooks send on STDIN.
// Schema pinned in task 2.5 (captured 2026-11-10, full samples in docs/kiro-usage.md):
//   PostFileSave: { session_id, hook_event_name, cwd, file_path }            (file_path is absolute)
//   PreToolUse:   { session_id, hook_event_name, cwd, tool_name, tool_input: { command, description, cwd, run_in_background, timeout } }
//   PostToolUse:  the PreToolUse fields plus tool_response (a string: "Output:\n...\n\nExit Code: N")
// The shell tool is named "execute_pwsh". The pinned names are already first in the lists below;
// the other names stay as a fallback in case a Kiro update renames fields. Every helper tolerates
// empty or invalid input and never throws.
import { fileURLToPath } from "node:url";

const CONTAINERS = ["tool_input", "toolInput", "input", "event", "data", "payload", "params", "args", "arguments"];
const PATH_KEYS = ["file_path", "filePath", "filepath", "path", "file", "filename", "fileName", "uri"];
const PATH_LIST_KEYS = ["files", "paths", "file_paths", "filePaths"];
const COMMAND_KEYS = ["command", "cmd", "commandLine", "command_line", "script"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";

/**
 * Read STDIN and parse it as JSON. Always resolves to `{ raw, json }`;
 * `json` is a plain object (`{}` when STDIN is empty, a TTY, not JSON, or not an object).
 * A timeout keeps the helper from hanging if the host never closes STDIN.
 */
export async function readEvent({ stream = process.stdin, timeoutMs = 1500 } = {}) {
  let raw = "";
  try {
    if (!stream || stream.isTTY) return { raw, json: {} };
    raw = await new Promise((resolve) => {
      const chunks = [];
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString("utf8"));
      };
      const timer = setTimeout(done, timeoutMs);
      timer.unref?.();
      stream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
      stream.on("end", done);
      stream.on("close", done);
      stream.on("error", done);
    });
  } catch {
    /* keep whatever we have */
  }
  let json = {};
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")); // PowerShell pipes can add a BOM
    if (isObject(parsed)) json = parsed;
  } catch {
    /* keep {} */
  }
  return { raw, json };
}

function toPath(value) {
  if (/^file:\/\//i.test(value)) {
    try {
      return fileURLToPath(value);
    } catch {
      return value;
    }
  }
  return value;
}

/** First file path found in the event, or `undefined`. */
export function eventPath(j) {
  try {
    if (!isObject(j)) return undefined;
    const roots = [j, ...CONTAINERS.map((k) => j[k]).filter(isObject)];
    for (const root of roots) {
      for (const key of PATH_KEYS) {
        if (isText(root[key])) return toPath(root[key]);
      }
      for (const key of PATH_LIST_KEYS) {
        const first = Array.isArray(root[key]) ? root[key].find(isText) : undefined;
        if (first) return toPath(first);
      }
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

/** Shell command of a tool-use event, or an empty string. */
export function eventCommand(j) {
  try {
    if (!isObject(j)) return "";
    const roots = [...CONTAINERS.map((k) => j[k]).filter(isObject), j];
    for (const root of roots) {
      for (const key of COMMAND_KEYS) {
        const v = root[key];
        if (isText(v)) return v;
        if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")) return v.join(" ");
      }
    }
  } catch {
    /* fall through */
  }
  return "";
}
