import { LiveAnnouncer } from "./a11y/LiveAnnouncer";
import { BoardMotion } from "./animation/react/BoardMotion";
import { CaseMotionHooks } from "./animation/react/CaseMotionHooks";
import { AppHeader } from "./components/AppHeader";
import { SiteFooter } from "./components/SiteFooter";
import { OverlayLayer } from "./overlay/OverlayLayer";
import { Sections } from "./sections";
import { LedgeLayer } from "./thread/LedgeLayer";
import { SectionNodes } from "./thread/SectionNode";
import { ThreadLayer } from "./thread/ThreadLayer";
import { ThreadProvider } from "./thread/ThreadProvider";

/**
 * Case Board shell. Landmarks: header (AppHeader), main (seven regions), footer (page-level sibling after main,
 * decision D5). The providers wrap App in main.tsx. Inside `<main>` (position: relative, no stacking context) sit
 * the thread ink (z 10), the ledges (z 45) and the Section_Nodes (z 46); the fixed Overlay_Layer (z 40, Mini Ghost,
 * bats, marks) follows the footer. BoardMotion sends the load, click, enter and ambient effect requests.
 */
export function App() {
  return (
    <LiveAnnouncer>
      <ThreadProvider>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <AppHeader />
        <main id="main" tabIndex={-1}>
          <Sections />
          <ThreadLayer />
          <LedgeLayer />
          <SectionNodes />
        </main>
        <SiteFooter />
        <OverlayLayer />
        <BoardMotion />
        <CaseMotionHooks />
      </ThreadProvider>
    </LiveAnnouncer>
  );
}
