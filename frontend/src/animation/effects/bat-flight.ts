import { BAT_SIZE, BAT_TRAIL_DOTS } from "../constants";
import type { EffectContext } from "../director/types";
import type { Cubic, Pt } from "../paths/cubic";
import { flightPointAt, planFlight, type FlightKeyframes } from "../paths/flightPlan";
import type { BatSprite } from "../services";
import type { RunBuilder } from "./handles";

export interface FlyOptions {
  /** Time on the path, ms. */
  readonly durationMs: number;
  readonly delayMs?: number;
  readonly tilt?: number;
  /** Sprite scale relative to the pool size (travel and click flights are bigger bats). */
  readonly scale?: number;
  /** Landing settle at the end (single bats) instead of a fade (bursts). */
  readonly landing?: boolean;
}

/** Scale that turns a pool bat (burst size) into a travel / click bat. */
export function travelScale(compact: boolean): number {
  return compact ? BAT_SIZE.travel.compact / BAT_SIZE.burst.compact : BAT_SIZE.travel.regular / BAT_SIZE.burst.regular;
}

/** Trail dot sizes along a flight, px (6, 5, 4: the plan's tapering dots; the cap is BAT_TRAIL_DOTS alive at once). */
const TRAIL = [
  { at: 0.3, size: 6, opacity: 0.55 },
  { at: 0.5, size: 5, opacity: 0.4 },
  { at: 0.7, size: 4, opacity: 0.3 },
] as const;

/** Total time a flight with these options takes (crouch + path + landing), for watchdog budgeting. */
export function flightTotalMs(o: Pick<FlyOptions, "durationMs" | "landing">): number {
  return planFlight({ p0: { x: 0, y: 0 }, p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, p3: { x: 0, y: 0 } }, { flightMs: o.durationMs, landing: o.landing }).durationMs;
}

/**
 * Flies one pooled bat along a cubic with `planFlight` keyframes: crouch, launch, tangent-following bank, weave,
 * depth scale, then a landing settle or a fade. Leaves a short ink-dot trail. Transforms and opacity only; the wing
 * beat is CSS on the pooled bat's layers.
 */
export function flyBat(ctx: EffectContext, run: RunBuilder, bat: BatSprite, path: Cubic, opts: FlyOptions): FlightKeyframes {
  const k = planFlight(path, {
    flightMs: opts.durationMs,
    baseScale: opts.scale ?? 1,
    tilt: opts.tilt ?? 0,
    landing: opts.landing ?? false,
    weave: ctx.env.compact ? 8 : 12,
  });
  const delay = opts.delayMs ?? 0;
  ctx.services.animator.set(bat.element, { x: path.p0.x, y: path.p0.y, opacity: 0, scaleX: k.scaleX[0] ?? 1, scaleY: k.scaleY[0] ?? 1 });
  bat.show();
  run.track(
    ctx.services.animator.animate(
      bat.element,
      { x: k.x, y: k.y, rotate: k.rotate, scaleX: k.scaleX, scaleY: k.scaleY, opacity: k.opacity },
      { durationMs: k.durationMs, delayMs: delay, times: k.times, ease: "linear" },
    ),
  );
  if (!ctx.env.reducedMotion) {
    TRAIL.slice(0, Math.max(0, Math.min(TRAIL.length, BAT_TRAIL_DOTS))).forEach((d) => {
      const t = k.launchMs + (k.arriveMs - k.launchMs) * d.at;
      run.after(delay + t, () => ctx.services.overlay.mark("trail", flightPointAt(k, t), 0, { size: d.size, opacity: d.opacity, lifeMs: 520 }));
    });
  }
  return k;
}

/** An arc from `from` to `to` that lifts above both ends. */
export function arcPath(from: Pt, to: Pt, lift = 80): Cubic {
  const top = Math.min(from.y, to.y) - lift;
  return {
    p0: from,
    p1: { x: from.x + (to.x - from.x) * 0.25, y: top },
    p2: { x: from.x + (to.x - from.x) * 0.75, y: top },
    p3: to,
  };
}

/** Releases bats back to the pool and hides them. Safe to call twice. */
export function releaseBats(ctx: EffectContext, bats: BatSprite[]): void {
  if (bats.length === 0) return;
  const out = bats.splice(0, bats.length);
  for (const b of out) {
    try {
      ctx.services.animator.set(b.element, { opacity: 0, scaleX: 1, scaleY: 1, rotate: 0 });
      b.hide();
    } catch {
      // keep releasing the rest
    }
  }
  ctx.services.bats.release(out);
}
