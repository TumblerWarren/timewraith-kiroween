import { EASE, PIVOT, POSE_MS } from "../animation/constants";
import type { Channel, Ease, Keyframes, Values } from "../animation/effects/animator";

/**
 * Phase-based poses (anticipation, action, overshoot, settle). A pose is a transform origin, an optional start state
 * and a list of phases; `phasesToKeyframes` turns it into one Motion keyframe set with per-segment easing. Pure, so
 * the amplitude and rest rules are unit tested. Every pose ends at rest (identity), so a settled pose and the rest
 * pose look the same.
 */
export interface Phase {
  readonly to: Values;
  readonly ms: number;
  readonly ease?: Ease;
  /** Return every channel the pose uses to rest. */
  readonly toRest?: boolean;
}

export interface PoseSpec {
  /** CSS transform-origin; feet by default. */
  readonly origin: string;
  /** Start state (channels not listed start at rest). */
  readonly from?: Values;
  readonly phases: readonly Phase[];
}

export const REST: Required<Values> = { x: 0, y: 0, rotate: 0, skewX: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1 };

export interface BuiltPose {
  readonly keyframes: Keyframes;
  readonly times: readonly number[];
  readonly segmentEases: readonly Ease[];
  readonly durationMs: number;
  readonly channels: readonly Channel[];
}

/** Turns phases into keyframes. Channels a phase leaves out keep their previous value. */
export function phasesToKeyframes(spec: PoseSpec): BuiltPose {
  const channels = new Set<Channel>(Object.keys(spec.from ?? {}) as Channel[]);
  for (const p of spec.phases) for (const k of Object.keys(p.to) as Channel[]) channels.add(k);
  const total = spec.phases.reduce((s, p) => s + p.ms, 0);
  const kf: Partial<Record<Channel, number[]>> = {};
  for (const ch of channels) {
    let cur = spec.from?.[ch] ?? REST[ch];
    const arr = [cur];
    for (const p of spec.phases) {
      cur = p.toRest ? REST[ch] : (p.to[ch] ?? cur);
      arr.push(cur);
    }
    kf[ch] = arr;
  }
  const times = [0];
  let acc = 0;
  for (const p of spec.phases) {
    acc += p.ms;
    times.push(total > 0 ? acc / total : 1);
  }
  return {
    keyframes: kf as Keyframes,
    times,
    segmentEases: spec.phases.map((p) => p.ease ?? "easeInOut"),
    durationMs: total,
    channels: [...channels],
  };
}

/** True when the last phase of every channel is the rest value. */
export function endsAtRest(spec: PoseSpec): boolean {
  const built = phasesToKeyframes(spec);
  return built.channels.every((ch) => {
    const arr = (built.keyframes as Record<string, number[]>)[ch];
    return arr !== undefined && arr[arr.length - 1] === REST[ch];
  });
}

const A = POSE_MS.anticipate;
const feet = PIVOT.feet;
const rest = (ms: number, ease: Ease = EASE.overshoot): Phase => ({ to: {}, ms, ease });
const back = (ms: number, ease: Ease = EASE.overshoot): Phase => ({ to: {}, ms, ease, toRest: true });
/** Rotation swings that lose amplitude, ending at rest. */
const swings = (amps: readonly number[], ms: number): Phase[] => [...amps.map((r) => ({ to: { rotate: r }, ms, ease: EASE.inOut as Ease })), back(ms + 60, EASE.out)];

/** The default poses every mascot knows. */
export const POSES: Readonly<Record<string, PoseSpec>> = {
  /** Lean, then a decaying wave rocking on the feet. */
  wave: { origin: feet, phases: [{ to: { rotate: -5, x: -2 }, ms: A, ease: EASE.out }, ...swings([9, -8, 6, -3], 110)] },
  /** Hop: anticipate, stretch up, squash on landing, settle. */
  act: {
    origin: feet,
    phases: [
      { to: { scaleY: 0.9, scaleX: 1.07, y: 3 }, ms: A, ease: EASE.out },
      { to: { scaleY: 1.1, scaleX: 0.94, y: -18 }, ms: 160, ease: EASE.out },
      { to: { scaleY: 0.94, scaleX: 1.05, y: 0 }, ms: 120, ease: EASE.inOut },
      back(POSE_MS.settle),
    ],
  },
  /** Anticipate up, dip and nod from the hip, hold, rise with overshoot. */
  bow: {
    origin: PIVOT.hip,
    phases: [
      { to: { y: -2, rotate: -2 }, ms: A, ease: EASE.out },
      { to: { y: 4, rotate: 9 }, ms: 200, ease: EASE.inOut },
      rest(110),
      back(260),
    ],
  },
  /** Glide in from the left and settle (Wraith Director). */
  enter: { origin: feet, from: { x: -64, opacity: 0 }, phases: [{ to: { x: 8, opacity: 1 }, ms: 380, ease: EASE.out }, { to: { x: 0 }, ms: 180, ease: EASE.inOut }] },
  /** Lean toward the form with the lantern. */
  glance: {
    origin: feet,
    phases: [
      { to: { rotate: -2, x: -2 }, ms: 120, ease: EASE.out },
      { to: { x: 14, rotate: 4 }, ms: 320, ease: EASE.out },
      rest(360),
      back(300, EASE.inOut),
    ],
  },
  /** Drop in from above, squash, rebound. */
  drop: {
    origin: feet,
    from: { y: -60, opacity: 0, scaleY: 1.12, scaleX: 0.94 },
    phases: [
      { to: { y: 0, opacity: 1, scaleY: 0.88, scaleX: 1.08 }, ms: 260, ease: [0.5, 0, 0.9, 0.6] },
      { to: { y: -9, scaleY: 1.06, scaleX: 0.97 }, ms: 120, ease: EASE.out },
      back(240),
    ],
  },
  /** Settle with a small drop. */
  settle: { origin: feet, from: { y: -12 }, phases: [{ to: { y: 3, scaleY: 0.96, scaleX: 1.03 }, ms: 160, ease: EASE.out }, back(220)] },
  /** Peek up over an edge (Cauldron Cat). */
  peek: { origin: feet, from: { y: 26 }, phases: [{ to: { y: -7 }, ms: 300, ease: EASE.out }, back(220)] },
  /** Slide up into view (Skeleton Scribe's hand). */
  rise: { origin: feet, from: { y: 32, opacity: 0 }, phases: [{ to: { y: -5, opacity: 1 }, ms: 300, ease: EASE.out }, back(200)] },
  /** Wrap in from the bottom (Mummy Wrapper). */
  wrap: { origin: feet, from: { scaleY: 0.2, opacity: 0 }, phases: [{ to: { scaleY: 1.08, opacity: 1 }, ms: 340, ease: EASE.out }, back(220)] },
  /** One slow turn (Two-Faced Jack), hinged on the pole. */
  turn: { origin: feet, phases: [{ to: { scaleX: 0.08 }, ms: 190, ease: "easeIn" }, { to: { scaleX: 1.05 }, ms: 230, ease: EASE.out }, back(140, EASE.inOut)] },
  /** Wobble on the feet with a decaying swing. */
  wobble: { origin: feet, phases: [{ to: { rotate: -4 }, ms: 70, ease: EASE.out }, ...swings([8, -7, 5, -3], 90)] },
  /** Head tilt toward something (Mini Ghost, Raven). */
  look: {
    origin: PIVOT.belly,
    phases: [{ to: { rotate: -12, x: 6 }, ms: 240, ease: EASE.overshoot }, rest(520), back(300, EASE.inOut)],
  },
  /** Lantern swing (Wraith Director idle beat). */
  sway: { origin: feet, phases: [{ to: { rotate: 3.5 }, ms: 380, ease: EASE.inOut }, { to: { rotate: -3 }, ms: 420, ease: EASE.inOut }, { to: { rotate: 1.5 }, ms: 340, ease: EASE.inOut }, back(360, EASE.inOut)] },
  /** Blink-like squash (Warden lid, Raven preen). */
  blink: { origin: feet, phases: [{ to: { scaleY: 0.88, scaleX: 1.03 }, ms: 120, ease: EASE.out }, back(240)] },
  preen: { origin: feet, phases: [{ to: { rotate: -6, y: 2 }, ms: 200, ease: EASE.out }, { to: { rotate: 5, y: 0 }, ms: 260, ease: EASE.inOut }, back(320, EASE.out)] },
  // ---- Tier 2 hover / focus reactions
  /** Gargoyle: arms tighten and a stern head shake. */
  deny: { origin: feet, phases: [{ to: { scaleX: 0.95, rotate: -5 }, ms: 90, ease: EASE.out }, { to: { rotate: 5 }, ms: 110, ease: EASE.inOut }, { to: { rotate: -4 }, ms: 100, ease: EASE.inOut }, back(160, EASE.out)] },
  /** Cauldron Cat: arches (10% taller) and hisses, then drops back. */
  hiss: {
    origin: feet,
    phases: [
      { to: { scaleY: 0.92, scaleX: 1.05 }, ms: 70, ease: EASE.out },
      { to: { scaleY: 1.12, scaleX: 0.95, rotate: -6, y: -6 }, ms: 140, ease: EASE.out },
      rest(200),
      back(240),
    ],
  },
  /** Spider Weaver: a damped bounce on the thread, five beats. */
  bounce: {
    origin: PIVOT.hang,
    phases: [
      { to: { y: 16, scaleY: 1.08 }, ms: 120, ease: EASE.out },
      { to: { y: -8, scaleY: 0.96 }, ms: 120, ease: EASE.inOut },
      { to: { y: 6, scaleY: 1.03 }, ms: 100, ease: EASE.inOut },
      { to: { y: -3, scaleY: 1 }, ms: 90, ease: EASE.inOut },
      back(120, EASE.out),
    ],
  },
  /** Two-Faced Jack: hinge flip to the other face and back. */
  flip: {
    origin: feet,
    phases: [
      { to: { scaleX: 0.06 }, ms: 170, ease: "easeIn" },
      { to: { scaleX: -1.06 }, ms: 210, ease: EASE.out },
      { to: { scaleX: -1 }, ms: 120, ease: EASE.inOut },
      { to: { scaleX: -1 }, ms: 160 },
      { to: { scaleX: 0.06 }, ms: 150, ease: "easeIn" },
      { to: { scaleX: 1.05 }, ms: 190, ease: EASE.out },
      back(100, EASE.inOut),
    ],
  },
  /** Skeleton Scribe's hand: six quick scribble strokes. */
  write: { origin: feet, phases: [...[7, -6, 8, -5, 6, -3].map((x, i): Phase => ({ to: { x, rotate: x * 0.9, y: i % 2 ? 1 : -1 }, ms: 62, ease: EASE.inOut })), back(120, EASE.out)] },
  /** Doctor Stitch (hover): a spool-spin shimmy. */
  spin: { origin: feet, phases: [{ to: { rotate: -5, y: 2 }, ms: 70, ease: EASE.out }, { to: { rotate: 8, y: -5 }, ms: 120, ease: EASE.inOut }, { to: { rotate: -6, y: -2 }, ms: 110, ease: EASE.inOut }, { to: { rotate: 3, y: -1 }, ms: 90 }, back(160, EASE.out)] },
  // ---- new in the animation pass
  /** Mini Ghost arrives in a region: hop with squash and a two-beat wave of the head. */
  arrive: {
    origin: PIVOT.belly,
    phases: [
      { to: { scaleY: 0.9, scaleX: 1.08, y: 3 }, ms: 90, ease: EASE.out },
      { to: { scaleY: 1.12, scaleX: 0.92, y: -16, rotate: -12 }, ms: 170, ease: EASE.out },
      { to: { scaleY: 0.94, scaleX: 1.05, y: 0, rotate: 10 }, ms: 150, ease: EASE.inOut },
      { to: { y: -4, rotate: -6, scaleY: 1, scaleX: 1 }, ms: 110, ease: EASE.out },
      back(260),
    ],
  },
  /** Mummy winds the bandage across the tag: crouch, raise the arm, then a small bow once the tag is sealed. */
  bandage: {
    origin: feet,
    phases: [
      { to: { scaleY: 0.94, y: 2 }, ms: 120, ease: EASE.out },
      { to: { rotate: -6, y: -2, scaleY: 1.02 }, ms: 260, ease: EASE.out },
      { to: { rotate: 3, y: 0 }, ms: 260, ease: EASE.inOut },
      rest(260),
      { to: { y: 3, rotate: 2 }, ms: 120, ease: EASE.inOut },
      back(180),
    ],
  },
  /** Raven unrolls the ladder: a wing sweep, then a settling nod. */
  unroll: { origin: feet, phases: [{ to: { rotate: -24, y: 2 }, ms: 160, ease: EASE.out }, { to: { rotate: 8, y: -3 }, ms: 240, ease: EASE.overshoot }, { to: { rotate: -6 }, ms: 260, ease: EASE.inOut }, back(260, EASE.out)] },
  /** Raven's stamp thump: wing down with a squash. */
  thump: { origin: feet, phases: [{ to: { y: -6, scaleY: 1.06 }, ms: 90, ease: EASE.out }, { to: { y: 8, scaleY: 0.88, scaleX: 1.08 }, ms: 90, ease: EASE.inOut }, back(260)] },
  /** Pumpkin Mechanic cranks: a full gear-eye spin with a hop. */
  gear: { origin: PIVOT.belly, phases: [{ to: { scaleY: 0.92, scaleX: 1.05 }, ms: 90, ease: EASE.out }, { to: { rotate: 360, scaleY: 1.06, scaleX: 0.97, y: -8 }, ms: 420, ease: EASE.out }, { to: { rotate: 360, scaleY: 1, scaleX: 1, y: 0 }, ms: 200, ease: EASE.overshoot }] },
  /** Bat Scout scouting loop: a barrel roll. */
  scout: { origin: PIVOT.belly, phases: [{ to: { y: 4, scaleY: 0.92 }, ms: A, ease: EASE.out }, { to: { rotate: 360, y: -14, scaleY: 1 }, ms: 420, ease: EASE.inOut }, { to: { rotate: 360, y: 0 }, ms: 220, ease: EASE.overshoot }] },
  /** Gargoyle stare: sets, narrows, shakes once. */
  stare: { origin: feet, phases: [{ to: { scaleY: 0.97, scaleX: 1.02 }, ms: 160, ease: EASE.out }, { to: { rotate: 2.5 }, ms: 90 }, { to: { rotate: -2.5 }, ms: 90 }, back(240, EASE.out)] },
  /** Warden slams the gate sign down. */
  slam: { origin: feet, phases: [{ to: { y: -4 }, ms: A, ease: EASE.out }, { to: { y: 7, scaleY: 0.94, scaleX: 1.04 }, ms: 90, ease: "easeIn" }, { to: { rotate: 1.5 }, ms: 80 }, back(260)] },
};

/** Poses a given mascot plays differently from the default (the per-mascot table). Same names, richer moves. */
export const MASCOT_POSES: Readonly<Record<string, Readonly<Record<string, PoseSpec | undefined>>>> = {
  "raven-archivist": { bow: POSES.thump as PoseSpec, act: POSES.thump as PoseSpec },
  "pumpkin-mechanic": { act: POSES.gear as PoseSpec },
  "bat-scout": { act: POSES.scout as PoseSpec },
  "gargoyle-gatekeeper": { settle: POSES.drop as PoseSpec, bow: POSES.stare as PoseSpec },
  "watchtower-warden": { bow: POSES.slam as PoseSpec, act: POSES.slam as PoseSpec },
  "mini-ghost": { wave: POSES.arrive as PoseSpec, act: POSES.arrive as PoseSpec },
};

/** The spec a mascot plays for a pose name; unknown names fall back to the hop. */
export function resolvePose(mascot: string | undefined, pose: string): PoseSpec {
  return (mascot ? MASCOT_POSES[mascot]?.[pose] : undefined) ?? POSES[pose] ?? (POSES.act as PoseSpec);
}
