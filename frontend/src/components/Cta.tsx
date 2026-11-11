import { LINKS, type SiteLink } from "../config/links";
import { OPEN_A_CASE } from "../content/copy";
import { PlaceholderFootnote, PlaceholderLink } from "./PlaceholderBadge";

export interface CtaLinks {
  readonly demo: SiteLink;
  readonly github: SiteLink;
}

export interface CtaProps {
  readonly className?: string;
  /** The two secondary links. Defaults to `LINKS.demo` and `LINKS.github` from config/links.ts. */
  readonly links?: CtaLinks;
}

/** The region the "Open a case" button returns to (decision D19). */
export const OPEN_CASE_TARGET = "open";

/**
 * Scrolls to the Open-a-case panel and focuses its first field (the form arrives in task 7.4; until then its
 * heading). Reduce Motion uses `behavior: "auto"` (Requirement 10.8); the URL never changes.
 */
export function openCasePanel(doc: Document = document): void {
  const panel = doc.getElementById(OPEN_CASE_TARGET);
  if (!panel) return;
  const reduce = doc.documentElement.getAttribute("data-reduce-motion") === "true";
  panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  const field = panel.querySelector<HTMLElement>("form input, form select, form textarea");
  const target = field ?? doc.getElementById("open-case-title") ?? doc.getElementById("open-title");
  target?.focus({ preventScroll: true });
}

/**
 * The Closing's actions (Requirements 3.10, 5.6, 5.7, 5.8, decision D19): one "Open a case" button and the two
 * secondary Placeholder_Links. The button label is large bold text (>= 18.66px, `--text-cta`) on pumpkin-600 with a
 * 2px ink-900 border (decision D7). Placeholder links carry a dagger and share one footnote under the group; with
 * real URLs both disappear.
 */
export function Cta({ className, links = { demo: LINKS.demo, github: LINKS.github } }: CtaProps) {
  return (
    <div className={["cta", "cta--sheet", className].filter(Boolean).join(" ")}>
      <div className="cta__primary">
        <button type="button" className="btn btn--primary" onClick={() => openCasePanel()} data-action="open-case">
          {OPEN_A_CASE}
        </button>
      </div>
      <ul className="cta__secondary" role="list">
        <li className="cta__secondary-item">
          <PlaceholderLink className="btn" link={links.demo} />
        </li>
        <li className="cta__secondary-item">
          <PlaceholderLink className="btn" link={links.github} />
        </li>
      </ul>
      <PlaceholderFootnote className="cta__footnote" links={[links.demo, links.github]} />
    </div>
  );
}
