/**
 * Motion timings and caps (design "MotionDirector", "Thresholds Confirmed or Adjusted", steering motion-rules).
 * Pure constants, no imports, so every animation module and test can read them without cycles.
 */

/** P2 requests wait at most this long in the queue (Requirement 9.7). */
export const P2_QUEUE_TIMEOUT_MS = 500;
/** Minimum gap between two P3 (ambient) starts (Requirement 9.10, value chosen in the design). */
export const P3_COOLDOWN_MS = 4000;

/** Reduce Motion fade. Mirrors the CSS token `--reduced-fade: 120ms`. */
export const REDUCED_FADE_MS = 120;
/** Hard ceiling for any Reduce Motion fade (Requirement 10.9). */
export const MAX_REDUCED_FADE_MS = 150;

/** Bat sprites alive at once: 14 on regular screens, 6 below 768 px (Requirement 11.7). */
export const MAX_BATS = { regular: 14, compact: 6 } as const;
/** Flights per Bat Burst: 5 to 7 regular, 3 compact. */
export const BURST_SIZE = { regular: [5, 7], compact: [3, 3] } as const;
/** Burst stagger ceiling and flight duration range. */
export const BURST_MAX_STAGGER_MS = 130;
export const BURST_DURATION_MS = { min: 600, max: 950 } as const;
/** Tablet widths (768 to 1099 px) keep flights within this distance of their start point. */
export const TABLET_MAX_FLIGHT_PX = 600;
export const COMPACT_MAX_WIDTH_PX = 767.98;
export const TABLET_MAX_WIDTH_PX = 1099.98;
/** Keyframes sampled per cubic flight. */
export const FLIGHT_SAMPLES = 16;

/** Micro effects allowed at once. */
export const MAX_MICRO = 6;

/** Clock hand entry (Requirement 5.1: 500 to 650 ms). */
export const CLOCK_ENTRY_MS = 580;
/** Final hand angles for 23:59 (hour 359.5 deg, minute 354 deg), start angle and minute overshoot. */
export const CLOCK_ENTRY_ANGLES = { from: 180, hour: 359.5, minute: 354, overshoot: 8 } as const;

/** Mini Bat flap strip: 6 frames at 12 fps loop in 500 ms. */
export const BAT_FLAP = { frames: 6, fps: 12 } as const;

/** Section reactions latch on this IntersectionObserver threshold. */
export const REACTION_THRESHOLD = 0.35;

/** Thread geometry. */
export const THREAD_SAMPLES = 400;
export const THREAD_MAX_WOBBLE_PX = 6;
/** The echo stroke sits this far to the right of the main stroke. */
export const THREAD_ECHO_OFFSET_PX = 1.5;
/** The scroll lead line sits at 60% of the viewport height. */
export const LEAD_LINE_RATIO = 0.6;

/** Shared spring tokens (stiffness, damping). Springs are easing for one-shot gestures and the ghost, not a physics loop. */
export const SPRING = {
  /** Ghost lean, cloth. */
  soft: { stiffness: 120, damping: 14 },
  /** Hops and landings (about 25% overshoot). */
  bouncy: { stiffness: 260, damping: 11 },
  /** Hover reactions. */
  snappy: { stiffness: 420, damping: 30 },
  /** Gentle returns. */
  settle: { stiffness: 180, damping: 22 },
  /** The Mini Ghost's vertical companion spring (zeta about 0.47, one visible overshoot). */
  ghost: { stiffness: 190, damping: 13 },
  /** The ghost's hem lags the body with a looser spring. */
  hem: { stiffness: 120, damping: 9 },
} as const;

/** Cubic-bezier easing tokens for the phase-based poses. */
export const EASE = {
  anticipate: [0.36, 0, 0.66, -0.56],
  overshoot: [0.34, 1.56, 0.64, 1],
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** Transform origins: standing figures rock on their feet, hanging ones swing from the top. */
export const PIVOT = { feet: "50% 100%", belly: "50% 70%", head: "50% 25%", hang: "50% 0%", hip: "50% 75%" } as const;

/** Phase durations of a pose, in ms. */
export const POSE_MS = { anticipate: 90, act: 240, settle: 260 } as const;

/** Bat sizes in CSS px (the pool is built at the burst size; travel and click flights scale up). */
export const BAT_SIZE = {
  burst: { regular: 104, compact: 72 },
  travel: { regular: 120, compact: 80 },
  perch: { regular: 64, compact: 52 },
  hero: { regular: 110, compact: 56 },
} as const;

/** Ink-dot trail: dots alive at once and their sizes along a flight. */
export const BAT_TRAIL_DOTS = 24;
