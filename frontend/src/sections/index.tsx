import type { ComponentType } from "react";
import { SECTION_IDS, type SectionId } from "../content/nodes";
import { CaseView } from "./CaseView/CaseView";
import { Closing } from "./Closing/Closing";
import { Crew } from "./Crew/Crew";
import { Flow } from "./Flow/Flow";
import { Library } from "./Library/Library";
import { LostHour } from "./LostHour/LostHour";
import { OpenCase } from "./OpenCase/OpenCase";

/**
 * Ordered registry of the seven Case Board regions (decision D14). The `Record<SectionId, ...>` type makes the
 * compiler reject a missing region; render order always follows SECTION_IDS (Requirement 1.4).
 */
export const SECTION_COMPONENTS: Readonly<Record<SectionId, ComponentType>> = {
  open: OpenCase,
  "lost-hour": LostHour,
  library: Library,
  case: CaseView,
  crew: Crew,
  flow: Flow,
  close: Closing,
};

/** The seven regions, in board order. */
export function Sections() {
  return (
    <>
      {SECTION_IDS.map((id) => {
        const Section = SECTION_COMPONENTS[id];
        return <Section key={id} />;
      })}
    </>
  );
}
