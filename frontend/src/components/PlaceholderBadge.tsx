import { useId, type AnchorHTMLAttributes, type ReactNode } from "react";
import type { SiteLink } from "../config/links";

/**
 * Placeholder_Link marking (Requirement 5.7, visual revision R1). A placeholder link is marked by a footnote
 * dagger after its text, in the same color, and one shared footnote near the links explains it. The link also
 * points at a visually hidden hint with `aria-describedby`. A link with `placeholder: false` renders none of
 * this, so swapping in the real URLs in `config/links.ts` (task 17.3) removes every trace.
 */
export const PLACEHOLDER_MARK = "\u2020";
/** The shared footnote text, shown after the mark. */
export const PLACEHOLDER_FOOTNOTE = "Address published with the submission.";
/** Spoken hint for the link: the address is not final. */
export const PLACEHOLDER_HINT = "Placeholder link: the final address is not published yet.";

/** The visible dagger. Hidden from assistive technology: the link's description says the same in words. */
export function PlaceholderMark() {
  return (
    <span className="footnote-mark" aria-hidden="true">
      {PLACEHOLDER_MARK}
    </span>
  );
}

export interface PlaceholderLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  readonly link: SiteLink;
  /** Link text. Defaults to `link.label`. */
  readonly children?: ReactNode;
}

/**
 * An anchor for an entry of `config/links.ts`. When `link.placeholder` is true the text gets the dagger and the
 * anchor gets `aria-describedby` pointing at the hidden hint; otherwise it is a plain anchor.
 */
export function PlaceholderLink({ link, children, ...rest }: PlaceholderLinkProps) {
  const hintId = useId();
  const describedBy = [rest["aria-describedby"], link.placeholder ? hintId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <>
      <a {...rest} href={link.href} aria-describedby={describedBy}>
        {children ?? link.label}
        {link.placeholder ? <PlaceholderMark /> : null}
      </a>
      {link.placeholder ? (
        <span id={hintId} className="visually-hidden">
          {PLACEHOLDER_HINT}
        </span>
      ) : null}
    </>
  );
}

/** The one footnote for a group of links. Renders nothing when none of them is a placeholder. */
export function PlaceholderFootnote({ links, className }: { readonly links: readonly SiteLink[]; readonly className?: string }) {
  if (!links.some((l) => l.placeholder)) return null;
  return (
    <p className={className ? `placeholder-footnote ${className}` : "placeholder-footnote"}>
      <PlaceholderMark /> {PLACEHOLDER_FOOTNOTE}
    </p>
  );
}
