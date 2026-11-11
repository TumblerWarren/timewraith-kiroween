import type { CSSProperties } from "react";
import { spriteTiming } from "./timing";

export interface SpriteStripProps {
  /** URL of the horizontal strip image (`frames` frames of `frameW` x `frameH`). */
  readonly src: string;
  readonly frameW: number;
  readonly frameH: number;
  readonly frames: number;
  readonly fps: number;
  /** Negative values start mid-loop (see `flapDelayMs`). */
  readonly delayMs?: number;
  readonly className?: string;
}

/**
 * A frame-stepped sprite (design "SpriteStrip"): an `<img>` strip inside an `overflow: hidden` frame,
 * moved with `transform: translateX` and `steps(var(--frames))` in `styles/sprites.css`. Decorative
 * (`alt=""`); Reduce Motion shows frame 0, `data-ambient="paused"` pauses it.
 */
export function SpriteStrip({ src, frameW, frameH, frames, fps, delayMs = 0, className }: SpriteStripProps) {
  const { durationMs } = spriteTiming(frames, fps);
  const style = {
    "--fw": `${frameW}px`,
    "--fh": `${frameH}px`,
    "--frames": frames,
    "--sprite-ms": `${durationMs}ms`,
    "--sprite-delay": `${delayMs}ms`,
  } as CSSProperties;
  return (
    <span className={className ? `sprite ${className}` : "sprite"} style={style} aria-hidden="true">
      <img className="sprite__strip" src={src} width={frameW * frames} height={frameH} alt="" decoding="async" draggable={false} />
    </span>
  );
}
