import { LINKS } from "../config/links";
import { PlaceholderFootnote, PlaceholderLink } from "./PlaceholderBadge";
import { paperTilt } from "./tilt";

/**
 * Page-level footer (decision D5): rendered by App as a sibling AFTER <main>, so it is the contentinfo
 * landmark. It is visually attached to the Closing: the note, the demo and GitHub links (they stay in the footer,
 * decision D19) and the credits are on a parchment slip tucked under the Closing sheet's bottom edge. Credits Kiro
 * Crew, the Playwright Clock documentation and Kiroween 2026 (Requirement 17.1).
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__slip paper-sheet" style={paperTilt("site-footer-slip", 0.8, 0)}>
          <p className="site-footer__note">All results on this board are bundled sample data. Drafts stay in this browser.</p>
          <ul className="site-footer__credits" role="list" aria-label="Project links">
            <li>
              <PlaceholderLink link={LINKS.demo} />
            </li>
            <li>
              <PlaceholderLink link={LINKS.github} />
            </li>
          </ul>
          <ul className="site-footer__credits" role="list" aria-label="Credits">
            <li>
              <a href={LINKS.kiroCrew.href}>Kiro Crew</a>
            </li>
            <li>
              <a href={LINKS.playwrightClock.href}>Playwright Clock documentation</a>
            </li>
            <li>
              <a href={LINKS.kiroween.href}>Kiroween 2026</a>
            </li>
          </ul>
          <PlaceholderFootnote className="site-footer__note" links={[LINKS.demo, LINKS.github]} />
        </div>
      </div>
    </footer>
  );
}
