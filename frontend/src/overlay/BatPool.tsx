import { useEffect, useRef } from "react";
import { BAT_FLAP, BAT_SIZE, MAX_BATS } from "../animation/constants";
import { useDirectorHost } from "../animation/react/directorHost";
import { domBatSprite } from "../animation/react/domServices";
import { useCompact } from "../animation/react/useCompact";
import type { BatSprite } from "../animation/services";
import { flapDelayMs, spriteTiming } from "../sprites/timing";
import { Mascot } from "../mascots/Mascot";

const FLAP = spriteTiming(BAT_FLAP.frames, BAT_FLAP.fps);
/** One wing beat: down, up, settle (matches `bat-wing-*` in motion.css). */
export const BAT_BEAT_MS = 300;

/**
 * The bat pool (task 12.4): 14 Mini Bats (6 below 768 px) mounted once in the Overlay_Layer and handed to the
 * director's pool. Effects move each bat with x/y transforms in viewport coordinates; `data-active` shows it.
 * No flap strip exists, so each bat is three clipped copies of the `mini-bat/pose-rest` art (two wing halves and a
 * torso) with CSS wing beats, phase-shifted per bat by `flapDelayMs`. Reduce Motion: no flap.
 */
export function BatPool() {
  const host = useDirectorHost();
  const compact = useCompact();
  const count = compact ? MAX_BATS.compact : MAX_BATS.regular;
  const size = compact ? BAT_SIZE.burst.compact : BAT_SIZE.burst.regular;
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!host) return;
    const sprites: BatSprite[] = [];
    for (let i = 0; i < count; i++) {
      const el = refs.current[i];
      if (el) sprites.push(domBatSprite(el));
    }
    return host.bats.attach(sprites);
  }, [host, count]);

  return (
    <div className="bat-pool" data-bat-pool="" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="bat"
          data-bat={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <div className="bat__body" style={{ width: size, height: Math.round((size * 87) / 104) }}>
            {/* The one real pose, cut into two wing halves and a torso (static clip-paths), so the wings can beat
                while the body squashes and bobs. Seams overlap by 2% so no gap shows. */}
            <div className="bat__rig" style={{ animationDelay: `${flapDelayMs(i, FLAP)}ms` }}>
              <span className="bat__layer bat__wing bat__wing--l" style={{ animationDelay: `${flapDelayMs(i, FLAP)}ms` }}>
                <Mascot id="mini-bat" actor={false} decorative eager width={size} />
              </span>
              <span className="bat__layer bat__torso">
                <Mascot id="mini-bat" actor={false} decorative eager width={size} />
              </span>
              <span className="bat__layer bat__wing bat__wing--r" style={{ animationDelay: `${flapDelayMs(i, FLAP)}ms` }}>
                <Mascot id="mini-bat" actor={false} decorative eager width={size} />
              </span>
            </div>
          </div>        </div>
      ))}
    </div>
  );
}
