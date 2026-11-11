import type { SampleCase, VersionRole } from "../cases/model";
import type { EvidenceStatus, ReplayActor, ReplayEventKind } from "../data/types";
import { clockReadout, type ClockScope } from "./view";

/**
 * Two tracks, one timeline (design: "Two tracks, one timeline"; Requirements 22.2 to 22.4, 25.4). Both tracks are
 * built from the same index space, so peg i of the event track and chip i of the version and clock track sit at
 * the same x position. Version runs are contiguous, do not overlap, and cover 0..n-1 exactly (Property 30).
 */
export interface TrackEvent {
  readonly index: number;
  readonly actor: ReplayActor;
  readonly kind: ReplayEventKind;
  readonly status: EvidenceStatus;
}

export interface VersionRun {
  readonly versionId: string;
  /** First and last event index of the run, inclusive. */
  readonly from: number;
  readonly to: number;
  readonly label: string;
  readonly role: VersionRole;
}

export interface ClockChip {
  readonly index: number;
  readonly scope: ClockScope;
  readonly value: string;
  readonly label: string;
  readonly controlled: boolean;
}

export interface TrackModel {
  readonly events: readonly TrackEvent[];
  readonly versions: readonly VersionRun[];
  readonly clocks: readonly ClockChip[];
}

export function buildTracks(c: SampleCase): TrackModel {
  const events: TrackEvent[] = [];
  const clocks: ClockChip[] = [];
  const versions: VersionRun[] = [];
  c.stream.forEach((e, index) => {
    events.push({ index, actor: e.actor, kind: e.kind, status: e.status });
    const clock = clockReadout(e);
    clocks.push({ index, scope: clock.scope, value: clock.value, label: clock.label, controlled: clock.controlled });
    const last = versions[versions.length - 1];
    if (last && last.versionId === e.versionId) {
      versions[versions.length - 1] = { ...last, to: index };
    } else {
      const v = c.versions.find((x) => x.id === e.versionId);
      versions.push({ versionId: e.versionId, from: index, to: index, label: v?.label ?? e.versionId, role: v?.role ?? "under-test" });
    }
  });
  return { events, versions, clocks };
}

/** The run that contains index `i` (undefined outside 0..n-1). */
export function runAt(model: TrackModel, i: number): VersionRun | undefined {
  return model.versions.find((r) => r.from <= i && i <= r.to);
}
