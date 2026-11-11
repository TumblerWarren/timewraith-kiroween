import { animate } from "motion";

/**
 * The only animation surface effects use. Channels are limited to transforms and opacity by type
 * (Requirement 9.14), so an effect cannot animate layout, filters or background-position.
 * `motionAnimator` wraps Motion's imperative `animate`; tests and jsdom use `instantAnimator`.
 */
export type Channel = "x" | "y" | "rotate" | "skewX" | "scale" | "scaleX" | "scaleY" | "opacity";
export type Keyframes = Partial<Record<Channel, number | readonly number[]>>;
export type Values = Partial<Record<Channel, number>>;
export type Ease = "linear" | "easeIn" | "easeOut" | "easeInOut" | "backOut" | readonly [number, number, number, number];

export interface AnimOptions {
  readonly durationMs: number;
  readonly delayMs?: number;
  readonly ease?: Ease;
  /** One ease per keyframe segment (length = keyframes - 1). Wins over `ease`. */
  readonly segmentEases?: readonly Ease[];
  /** Keyframe offsets 0..1, one per keyframe. */
  readonly times?: readonly number[];
}

export interface Animation {
  /** Resolves when the animation completes or is stopped. Never rejects. */
  readonly finished: Promise<void>;
  stop(): void;
  pause(): void;
  play(): void;
}

export interface Animator {
  animate(el: Element, keyframes: Keyframes, opts: AnimOptions): Animation;
  /** Writes values at once (settle and fallbacks). */
  set(el: Element, values: Values): void;
}

/** Last value of each channel, the state a finished animation leaves. */
export function finalValues(kf: Keyframes): Values {
  const out: Values = {};
  for (const [k, v] of Object.entries(kf) as [Channel, number | readonly number[]][]) {
    const last = typeof v === "number" ? v : v[v.length - 1];
    if (last !== undefined) out[k] = last;
  }
  return out;
}

/** Values written by `writeStyle`, so a later partial write keeps the other channels. */
const written = new WeakMap<Element, Values>();

/** Inline style writer in Motion's transform order (translate, scale, rotate). */
export function writeStyle(el: Element, values: Values): void {
  const style = (el as HTMLElement | SVGElement).style as CSSStyleDeclaration | undefined;
  if (!style) return;
  const merged: Values = { ...written.get(el), ...values };
  written.set(el, merged);
  const { opacity, ...t } = merged;
  const parts: string[] = [];
  if (t.x !== undefined || t.y !== undefined) parts.push(`translate(${t.x ?? 0}px, ${t.y ?? 0}px)`);
  if (t.scale !== undefined) parts.push(`scale(${t.scale})`);
  if (t.scaleX !== undefined) parts.push(`scaleX(${t.scaleX})`);
  if (t.scaleY !== undefined) parts.push(`scaleY(${t.scaleY})`);
  if (t.rotate !== undefined) parts.push(`rotate(${t.rotate}deg)`);
  if (t.skewX !== undefined) parts.push(`skewX(${t.skewX}deg)`);
  style.transform = parts.length > 0 ? parts.join(" ") : "";
  if (opacity !== undefined) style.opacity = String(opacity);
}

function toMotionKeyframes(kf: Keyframes): Record<string, number | number[]> {
  const out: Record<string, number | number[]> = {};
  for (const [k, v] of Object.entries(kf) as [Channel, number | readonly number[]][]) {
    out[k] = typeof v === "number" ? v : [...v];
  }
  return out;
}

const settledAnimation = (): Animation => ({
  finished: Promise.resolve(),
  stop() {},
  pause() {},
  play() {},
});

export const motionAnimator: Animator = {
  animate(el, keyframes, opts) {
    try {
      const controls = animate(el, toMotionKeyframes(keyframes) as Parameters<typeof animate>[1], {
        duration: Math.max(0, opts.durationMs) / 1000,
        delay: Math.max(0, opts.delayMs ?? 0) / 1000,
        ...(opts.segmentEases
          ? { ease: opts.segmentEases.map((e) => (typeof e === "string" ? e : [...e])) as never }
          : opts.ease
            ? { ease: (typeof opts.ease === "string" ? opts.ease : [...opts.ease]) as never }
            : {}),
        ...(opts.times ? { times: [...opts.times] } : {}),
      } as Parameters<typeof animate>[2]);
      let done!: () => void;
      const finished = new Promise<void>((resolve) => (done = resolve));
      controls.then(done, done);
      return {
        finished,
        stop() {
          controls.stop();
          done();
        },
        pause: () => controls.pause(),
        play: () => controls.play(),
      };
    } catch {
      writeStyle(el, finalValues(keyframes));
      return settledAnimation();
    }
  },
  set(el, values) {
    writeStyle(el, values);
    try {
      animate(el, values as Parameters<typeof animate>[1], { duration: 0 } as Parameters<typeof animate>[2]);
    } catch {
      // The inline style above already holds the final state.
    }
  },
};

/** Jumps to the last keyframe and resolves at once. For tests and environments without animation. */
export const instantAnimator: Animator = {
  animate(el, keyframes) {
    writeStyle(el, finalValues(keyframes));
    return settledAnimation();
  },
  set: writeStyle,
};
