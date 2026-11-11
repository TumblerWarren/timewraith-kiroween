import { useMotionValue, useSpring, type MotionValue } from "motion/react";
import { useEffect, useRef } from "react";
import { SPRING } from "../animation/constants";
import { useDirectorHost } from "../animation/react/directorHost";
import { Art } from "../assets/Art";
import { useMascotArtLevel } from "../assets/AssetProvider";
import { createMascotActor } from "../mascots/actors";
import { heightForWidth } from "../mascots/roster";
import { ghostPlacement } from "./ghostPlacement";
import { companionPoint, ghostLook, ghostSquash, ghostTargetY, ghostTilt, GHOST_OFFSET_PX, hemSkew } from "./ghostMotion";
import { useThread, type ThreadState } from "./ThreadProvider";

/** Display width of the ghost (CSS px). */
const GHOST_W = { regular: 84, compact: 56 } as const;
/** One ink dot is left behind every this many px of page travel while scrolling. */
const TRAIL_EVERY_PX = 56;
const TRAIL_MIN_SPEED = 120;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The Mini Ghost scroll companion. It lives in the fixed Overlay_Layer, beside the thread so the gold line visibly
 * leads it: its viewport y is a bouncy spring (about 18% overshoot) chasing a band target at 60% of the viewport
 * that leans ahead of the scroll direction, clamped to 20% to 82%, so it is always on screen; its x is the thread's x
 * at the page y it is level with, plus an offset. Scroll speed squashes and stretches it and tilts it both ways, its
 * hem lags on a looser spring, its eyes look toward the scroll direction and the next node and blink, and it leaves a
 * faint ink-dot trail. `ghost.arrive` (director) hops and waves when a new region becomes active. Position, tilt,
 * squash, hem and look are written straight to the DOM, never to React state. Reduce Motion: fixed at the first
 * node, no spring, no tilt, no trail, no blink (CSS), eyes centred.
 */
export function GhostCompanion() {
  const thread = useThread();
  if (!thread || thread.model.samples.length === 0) return null;
  return <Ghost thread={thread} leadY={thread.leadY} />;
}

function Ghost({ thread }: { thread: ThreadState; leadY: MotionValue<number> }) {
  const { model, measure, reduceMotion, compact, active } = thread;
  const host = useDirectorHost();
  const w = compact ? GHOST_W.compact : GHOST_W.regular;
  const h = heightForWidth("mini-ghost", w);
  const level = useMascotArtLevel("mini-ghost");
  const realArt = level === "pose" || level === "rig";

  const target = useMotionValue(0);
  const smooth = useSpring(target, SPRING.ghost);
  const hemTarget = useMotionValue(0);
  const hem = useSpring(hemTarget, SPRING.hem);
  const outerRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const hemRef = useRef<HTMLSpanElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const prevActive = useRef<number | null>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // The actor for `ghost.look` and `ghost.arrive`: poses play on the whole rig (head and hem together).
  useEffect(() => {
    if (!host) return;
    return host.actors.register("mini-ghost", createMascotActor(() => rigRef.current, host.animator, "mini-ghost"));
  }, [host]);

  useEffect(() => {
    const outer = outerRef.current;
    const tilt = tiltRef.current;
    const hemEl = hemRef.current;
    if (!outer || !tilt) return;
    let sv = 0;
    let lastScroll = window.scrollY;
    let lastT = performance.now();
    let lastDot = window.scrollY;
    let raf = 0;

    const nodeVector = (p: { x: number; y: number }) => {
      const n = measure.nodes[activeRef.current + 1];
      if (!n) return null;
      return { dx: measure.mainLeft + n.x - p.x, dy: measure.mainTop + n.y - window.scrollY - p.y };
    };

    const write = () => {
      let p: { x: number; y: number } | null;
      if (reduceMotion) {
        const q = ghostPlacement({ model, smoothY: 0, scrollY: window.scrollY, mainLeft: measure.mainLeft, mainTop: measure.mainTop, reduceMotion: true });
        p = q ? { x: q.x + (compact ? GHOST_OFFSET_PX.compact : GHOST_OFFSET_PX.regular), y: q.y } : null;
      } else {
        p = companionPoint({ model, viewportY: smooth.get(), scrollY: window.scrollY, mainLeft: measure.mainLeft, mainTop: measure.mainTop, compact });
      }
      if (!p) return;
      const x = clamp(p.x, w / 2 + 4, Math.max(w / 2 + 4, window.innerWidth - w / 2 - 4));
      pos.current = { x, y: p.y };
      outer.style.transform = `translate(${Math.round(x * 10) / 10}px, ${Math.round(p.y * 10) / 10}px)`;
      if (reduceMotion) {
        tilt.style.transform = "";
        hemEl?.style.removeProperty("transform");
        outer.style.setProperty("--look-x", "0");
        outer.style.setProperty("--look-y", "0");
        return;
      }
      const springV = smooth.getVelocity();
      const sq = ghostSquash(Math.abs(sv) * 0.5 + Math.abs(springV));
      const deg = ghostTilt(sv * 0.5 + springV * 0.6, compact);
      tilt.style.transform = `rotate(${Math.round(deg * 10) / 10}deg) scale(${Math.round(sq.sx * 1000) / 1000}, ${Math.round(sq.sy * 1000) / 1000})`;
      if (hemEl) hemEl.style.transform = `skewX(${Math.round(hem.get() * 10) / 10}deg)`;
      const look = ghostLook(sv, nodeVector(p));
      outer.style.setProperty("--look-x", String(look.x));
      outer.style.setProperty("--look-y", String(look.y));
    };

    if (reduceMotion) {
      write();
      window.addEventListener("scroll", write, { passive: true });
      window.addEventListener("resize", write);
      return () => {
        window.removeEventListener("scroll", write);
        window.removeEventListener("resize", write);
      };
    }

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.max(0.001, (now - lastT) / 1000);
      const inst = (window.scrollY - lastScroll) / dt;
      sv += (inst - sv) * Math.min(1, dt * 12);
      lastScroll = window.scrollY;
      lastT = now;
      target.set(ghostTargetY(window.innerHeight, sv));
      hemTarget.set(hemSkew(sv));
      write();
      if (Math.abs(sv) > TRAIL_MIN_SPEED && Math.abs(window.scrollY - lastDot) >= TRAIL_EVERY_PX) {
        lastDot = window.scrollY;
        host?.overlay.mark("trail", { x: pos.current.x, y: pos.current.y + h * 0.42 }, 0, { size: 6, opacity: 0.5, lifeMs: 900 });
      }
      if (Math.abs(sv) > 8 || Math.abs(smooth.getVelocity()) > 4 || Math.abs(hem.getVelocity()) > 2) raf = requestAnimationFrame(tick);
      else {
        sv = 0;
        target.set(ghostTargetY(window.innerHeight, 0));
        hemTarget.set(0);
      }
    };
    const kick = () => {
      if (!raf) {
        lastT = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const home = ghostTargetY(window.innerHeight, 0);
    target.set(home);
    smooth.jump(home);
    hemTarget.set(0);
    hem.jump(0);
    write();
    const offs = [smooth.on("change", write), hem.on("change", write)];
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [smooth, hem, target, hemTarget, model, measure, reduceMotion, compact, host, w, h]);

  // A new region becomes active: the ghost hops and waves, once per region per page (never on load).
  useEffect(() => {
    const prev = prevActive.current;
    prevActive.current = active;
    if (prev === null || prev === active || reduceMotion || !host) return;
    const node = measure.nodes[active];
    if (!node || !host.claimOnce(`ghost.arrive:${node.id}`)) return;
    host.request("ghost.arrive", { region: node.id, actor: "mini-ghost", at: { ...pos.current } });
  }, [active, measure, reduceMotion, host]);

  return (
    <div ref={outerRef} className="ghost" data-ghost="" aria-hidden="true">
      <div ref={tiltRef} className="ghost__tilt">
        <div className="ghost__bob">
          <div ref={rigRef} className="ghost__rig" style={{ width: w, height: h }}>
            {/* Head and body, and the hem: two clipped copies of the same art, so the hem can lag and sway. */}
            <span className="ghost__layer ghost__top">
              <Art mascot="mini-ghost" width={w} height={h} decorative eager />
            </span>
            <span ref={hemRef} className="ghost__layer ghost__hem">
              <Art mascot="mini-ghost" width={w} height={h} decorative eager />
            </span>
            {realArt ? (
              <>
                <span className="ghost__eye ghost__eye--l" data-ghost-eye="l">
                  <span className="ghost__pupil" />
                  <span className="ghost__lid" />
                </span>
                <span className="ghost__eye ghost__eye--r" data-ghost-eye="r">
                  <span className="ghost__pupil" />
                  <span className="ghost__lid" />
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
