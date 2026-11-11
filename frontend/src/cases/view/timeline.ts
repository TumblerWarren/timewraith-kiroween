import { HISTORY_KINDS, type MilestoneState, type SampleCase, type VersionMilestone } from "../model";
import { fixedPassIndex } from "../fix/fixLabel";
import { isRevealed } from "../../replay/view";

/**
 * Version_Timeline view (design D21; Requirement 28; Property 34). Pure: one state per milestone from the case
 * data and the scrubber index, so the timeline, the ladder and the reveal cannot disagree.
 *
 * - History milestones (released, reported) are facts about the project and read "reached" from the start, except
 *   the issue-reported milestone of a Blind hunt, which is "hidden" until the reveal.
 * - A replay milestone is "reached" when the index is at or after its event, else "ahead".
 * - The fixed-version milestone is "reached" only from a passing check on a fixed or patched version that follows a
 *   failing check on an affected one; with no such check it is "not-run" at every index.
 */
export interface MilestoneView {
  readonly milestone: VersionMilestone;
  readonly state: MilestoneState;
  /** Stream index of the milestone's event, or -1 for history milestones and an unrun milestone. */
  readonly eventIndex: number;
}

export const isHistoryKind = (m: VersionMilestone): boolean => HISTORY_KINDS.includes(m.kind);

export function eventIndexOf(c: SampleCase, m: VersionMilestone): number {
  return m.eventId === null ? -1 : c.stream.findIndex((e) => e.id === m.eventId);
}

export function timelineView(c: SampleCase, index: number): readonly MilestoneView[] {
  const passAt = fixedPassIndex(c);
  return c.timeline.map((milestone) => {
    const eventIndex = eventIndexOf(c, milestone);
    let state: MilestoneState;
    if (isHistoryKind(milestone)) {
      state = milestone.kind === "reported" && c.mode === "blind-hunt" && !isRevealed(c, index) ? "hidden" : "reached";
    } else if (milestone.kind === "fixed-verified") {
      state = passAt < 0 || eventIndex < 0 ? "not-run" : index >= Math.max(passAt, eventIndex) ? "reached" : "ahead";
    } else {
      state = eventIndex >= 0 && index >= eventIndex ? "reached" : "ahead";
    }
    return { milestone, state, eventIndex };
  });
}
