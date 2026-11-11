import type { CSSProperties } from "react";
import { seededRandom } from "../mascots/placeholder/inkPath";

/**
 * Seeded imperfection (visual revision R1). Static paper objects and stamps lean a little, each by its own
 * amount, so nothing on the page sits on a perfect grid. The values are deterministic: the same key always
 * gives the same angle, so screenshots and server output never change between renders.
 *
 * The helpers return CSS custom properties that paper.css reads: `--tilt` (rotate), `--nudge-x/-y`
 * (translate) and `--strike-x/-y` (the double-strike offset of a stamp). Use the individual `rotate` and
 * `translate` properties in CSS, never `transform`, so Motion's transforms on the same element keep working.
 * Never apply them to interactive controls or to long text.
 */

/** FNV-1a hash of a string, as an unsigned 32-bit seed. */
export function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A seeded angle in degrees, in [-max, max], at least `minAbs` away from zero, rounded to 0.1.
 * `minAbs` keeps a stamp from landing straight by accident.
 */
export function tiltDeg(key: string, max: number, minAbs = 0): number {
  const rand = seededRandom(hashKey(key));
  const sign = rand() < 0.5 ? -1 : 1;
  const span = Math.max(0, max - minAbs);
  return round1(sign * (minAbs + rand() * span)) || round1(sign * Math.max(minAbs, 0.1));
}

/** A static paper object: a small lean (under 1.5deg by default) and a nudge of up to `nudge` px. */
export function paperTilt(key: string, max = 1.2, nudge = 3): CSSProperties {
  const rand = seededRandom(hashKey(`${key}#nudge`));
  return {
    "--tilt": `${tiltDeg(key, Math.min(max, 1.4))}deg`,
    "--nudge-x": `${round1((rand() * 2 - 1) * nudge)}px`,
    "--nudge-y": `${round1((rand() * 2 - 1) * nudge)}px`,
  } as CSSProperties;
}

/**
 * A stamp slapped onto a scene by hand (Problem stamps, pass B): a bolder lean of `min` to `max` degrees either way
 * (default 5 to 10) and the same 1 to 2px double strike as `stampTilt`. Same custom properties, so `.stamp` reads it.
 */
export function slapTilt(key: string, min = 5, max = 10): CSSProperties {
  return { ...stampTilt(key), "--tilt": `${tiltDeg(key, Math.max(max, min), Math.min(min, max))}deg` } as CSSProperties;
}

/** A rubber stamp: a lean between 1 and 4 degrees either way and a 1 to 2px double strike in a seeded direction. */
export function stampTilt(key: string, max = 4): CSSProperties {
  const rand = seededRandom(hashKey(`${key}#strike`));
  const angle = rand() * Math.PI * 2;
  const dist = 1 + rand();
  return {
    "--tilt": `${tiltDeg(key, Math.min(max, 4), 1)}deg`,
    "--strike-x": `${round1(Math.cos(angle) * dist)}px`,
    "--strike-y": `${round1(Math.sin(angle) * dist)}px`,
  } as CSSProperties;
}
