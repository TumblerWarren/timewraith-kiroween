import type { DiffLine } from "../model";

export interface FileDiff {
  readonly file: string;
  readonly lines: readonly DiffLine[];
}

/** Split a unified diff into one entry per file, dropping the `---`/`+++`/`@@` headers. */
export function parseUnifiedDiff(diff: string): FileDiff[] {
  const files: { file: string; lines: DiffLine[] }[] = [];
  let current: { file: string; lines: DiffLine[] } | null = null;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      current = { file: raw.slice(4).replace(/^b\//, ""), lines: [] };
      files.push(current);
      continue;
    }
    if (raw.startsWith("--- ") || raw.startsWith("@@") || !current) continue;
    if (raw.startsWith("+")) current.lines.push({ type: "add", text: raw.slice(1) });
    else if (raw.startsWith("-")) current.lines.push({ type: "remove", text: raw.slice(1) });
    else if (raw.startsWith(" ")) current.lines.push({ type: "context", text: raw.slice(1) });
  }
  return files;
}
