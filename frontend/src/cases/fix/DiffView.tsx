import { ADDED_LINE, REMOVED_LINE, UNCHANGED_LINE } from "../../content/caseView";
import type { DiffLine } from "../model";

/** Text markers of the diff lines: "+", the minus sign "−", and a space for context. */
export const DIFF_MARKER: Readonly<Record<DiffLine["type"], string>> = { add: "+", remove: "\u2212", context: " " };
const LINE_WORDS: Readonly<Record<DiffLine["type"], string>> = { add: ADDED_LINE, remove: REMOVED_LINE, context: UNCHANGED_LINE };

export interface DiffViewProps {
  readonly caption: string;
  readonly file: string;
  readonly lines: readonly DiffLine[];
}

/**
 * A hand-authored diff as DOM text (Requirement 24.7): `<pre><code>` in JetBrains Mono, one line per row, each
 * added or removed line marked by its "+" or "−", by visually hidden "added line" or "removed line" text, and by a
 * sage-700 or brick-700 left rule, so the change is never told by color alone. Removed lines carry a strike bar
 * Doctor Stitch pulls through (`stitch.sew`); added lines are the ones he stitches in.
 */
export function DiffView({ caption, file, lines }: DiffViewProps) {
  return (
    <figure className="diff">
      <figcaption className="diff__caption">
        <span className="diff__caption-text">{caption}</span> <span className="diff__file mono">{file}</span>
      </figcaption>
      <pre className="diff__pre">
        <code className="diff__code">
          {lines.map((line, i) => (
            <span key={i} className="diff__line" data-type={line.type} data-sew-line={line.type === "add" ? "" : undefined}>
              <span className="diff__marker" aria-hidden="true">
                {DIFF_MARKER[line.type]}
              </span>
              <span className="diff__text">
                {line.type === "context" ? null : <span className="visually-hidden">{LINE_WORDS[line.type]}: </span>}
                {line.text}
                {line.type === "remove" ? <span className="diff__strike" aria-hidden="true" /> : null}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
