import { stampTilt } from "../../components/tilt";
import { ILLUSTRATIVE_PIN } from "../../content/copy";
import type { VersionEntry } from "../model";
import { RESULT_WORDS, ResultShape } from "./ResultShape";

export const VERSION_STRIP_LABEL = "Versions checked";
export const MAX_STRIP_VERSIONS = 4;

/**
 * Version_History_Strip (Requirements 25.1 to 25.5): a flat row of up to four small stamps, one per version in
 * check order, each a mono version label plus a result word and shape. It reads `case.versions` (the same list as
 * the Version and clock track), so the two cannot disagree. Illustrative pins carry "illustrative pin"; a draft's
 * single entry is what the visitor entered, "not run".
 */
export function VersionHistoryStrip({ versions, caseId }: { versions: readonly VersionEntry[]; caseId: string }) {
  const shown = versions.slice(0, MAX_STRIP_VERSIONS);
  return (
    <ol className="version-strip" aria-label={VERSION_STRIP_LABEL} data-version-strip="">
      {shown.map((v) => (
        <li
          key={v.id}
          className="version-strip__stamp stamp"
          data-version-id={v.id}
          data-result={v.result}
          style={stampTilt(`version-${caseId}-${v.id}`, 2)}
        >
          <span className="version-strip__label mono">{v.label}</span>
          {v.source === "illustrative-pin" ? <span className="version-strip__pin">{ILLUSTRATIVE_PIN}</span> : null}
          <span className="version-strip__result" data-result={v.result}>
            <ResultShape result={v.result} size={18} />
            {RESULT_WORDS[v.result]}
          </span>
        </li>
      ))}
    </ol>
  );
}
