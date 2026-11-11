import { useEffect, useLayoutEffect } from "react";
import { CLOCK_ENTRY_ANGLES } from "../constants";
import type { Pt } from "../paths/cubic";
import { afterFirstPaint } from "../scroll/loadScroll";
import { useDirectorHost, type DirectorHost } from "./directorHost";
import { CLOSING_STAMP, IDLE_BEATS, REGION_REACTIONS, ROLLCALL } from "./regionCast";
import { perchPoint, viewportRect } from "./useBatFlights";
import { observeOnce } from "./useOnceOnEnter";

/**
 * Board-level effect wiring (task 12.5). Renders nothing. Components never animate narrative content themselves;
 * this sends the requests:
 * - `hero.clock-entry` once on load for the Open-a-case Clock (`#hero-clock`);
 * - `bat.to-point` for a click on the page background (not on a control or on text);
 * - `section.reaction` once per region on enter (IntersectionObserver 0.35, latched), cast in `regionCast.ts`;
 * - `crew.rollcall` when the Crew enters and `raven.stamp` when the Closing enters (once each);
 * - `mascot.hover` on pointer hover and focus of `[data-react-actor]` figures, `focus.yield` on `focusin`, and the
 *   hero Wraith leaning toward the pointer;
 * - ambient P3 beats: `idle.beat` for figures in view, `ghost.look` when scrolling stops, a rare `bat.flyby`.
 *   The director applies the cooldown, the one-per-region cap, suppression, hidden-tab pausing and Reduce Motion.
 */
export function BoardMotion() {
  const host = useDirectorHost();

  // The sweep starts once the first frames of the board have been painted (the first raster of a large page
  // can stall frames for a few hundred ms, which would swallow a 580 ms sweep). Until then the hands wait at the
  // sweep's start angle, written before the first paint so 23:59 never flashes first.
  useLayoutEffect(() => {
    if (!host) return;
    const params = {
      hour: document.getElementById("hero-clock-hand-hour"),
      minute: document.getElementById("hero-clock-hand-minute"),
      face: document.querySelector("#hero-clock .clock__face"),
    };
    if (!host.getEnv().reducedMotion) {
      for (const hand of [params.hour, params.minute]) if (hand) host.animator.set(hand, { rotate: CLOCK_ENTRY_ANGLES.from });
    }
    let alive = true;
    void whenSettledPaint().then(() => {
      if (alive) host.request("hero.clock-entry", params);
    });
    return () => {
      alive = false;
      // Unmounted before the sweep (StrictMode, tests): leave the hands at their reading.
      if (params.minute) host.animator.set(params.minute, { rotate: CLOCK_ENTRY_ANGLES.minute });
      if (params.hour) host.animator.set(params.hour, { rotate: CLOCK_ENTRY_ANGLES.hour });
    };
  }, [host]);

  useEffect(() => {
    if (!host) return;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.defaultPrevented || !isBackgroundClick(e.target)) return;
      host.request("bat.to-point", { from: perchPoint(), to: { x: e.clientX, y: e.clientY } });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    const offs = Object.entries(REGION_REACTIONS).map(([region, cast]) =>
      observeOnce(
        host,
        region,
        "section.reaction",
        () => ({ region, actors: cast.actors, ...(cast.staggerMs !== undefined ? { staggerMs: cast.staggerMs } : {}) }),
        cast.delayMs ?? 0,
      ),
    );
    return () => offs.forEach((off) => off());
  }, [host]);

  // Crew roll-call and the Closing stamp, once each on enter (task 14.8, 14.9).
  useEffect(() => {
    if (!host) return;
    const offs = [
      observeOnce(host, "crew", "crew.rollcall", () => ({
        actors: ROLLCALL,
        targets: ROLLCALL.map((a) => document.querySelector(`#crew [data-sitter="${a.actor.slice("crew:".length)}"] > .crew__no`)).filter(
          (e): e is Element => e !== null,
        ),
      })),
      observeOnce(host, "close", "raven.stamp", () => ({
        actors: CLOSING_STAMP,
        targets: ["[data-raven-stamp]", "[data-scribe-underline]", "[data-closing-sheet]"]
          .map((s) => document.querySelector(`#close ${s}`))
          .filter((e): e is Element => e !== null),
      })),
    ];
    return () => offs.forEach((off) => off());
  }, [host]);

  useEffect(() => {
    if (!host) return;
    return startReactions(host);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    return startFocusYield(host);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    return startEyesFollow(host);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    return startAmbient(host);
  }, [host]);

  return null;
}

/**
 * Mascot hover and focus reactions (`mascot.hover`, task 14.8): any element marked `data-react-actor` and
 * `data-react-pose` (the Crew roster; Tier 2 entries are buttons, Tier 1 figures are hover only) plays its pose when
 * the pointer enters it or when it receives keyboard focus. The director drops a repeat while the pose still runs.
 */
function startReactions(host: DirectorHost): () => void {
  const react = (target: EventTarget | null, from: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const el = target.closest("[data-react-actor][data-react-pose]");
    if (!el || (from instanceof Node && el.contains(from))) return;
    const actor = el.getAttribute("data-react-actor");
    const pose = el.getAttribute("data-react-pose");
    if (actor && pose) host.request("mascot.hover", { actor, pose });
  };
  const onOver = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    react(e.target, e.relatedTarget);
  };
  const onFocus = (e: FocusEvent) => react(e.target, e.relatedTarget);
  document.addEventListener("pointerover", onOver);
  document.addEventListener("focusin", onFocus);
  return () => {
    document.removeEventListener("pointerover", onOver);
    document.removeEventListener("focusin", onFocus);
  };
}

/** Overlay figures that may cover a focused control: the Mini Ghost and any bat in flight. */
const OVERLAY_FIGURES = "[data-ghost] .ghost__bob, .bat[data-active]";

const overlaps = (a: DOMRect, b: DOMRect, pad = 6) =>
  a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;

/**
 * `focus.yield` (P0): when focus lands on a control, overlay figures overlapping it fade out within 150 ms, so the
 * focus ring is never covered (Requirement 9.11). They come back (opacity 1) when focus moves on.
 */
function startFocusYield(host: DirectorHost): () => void {
  let yielded: Element[] = [];
  const restore = () => {
    for (const el of yielded) host.animator.set(el, { opacity: 1 });
    yielded = [];
  };
  const onFocusIn = (e: FocusEvent) => {
    restore();
    const t = e.target;
    if (!(t instanceof Element) || t === document.body) return;
    const r = t.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const hits = Array.from(document.querySelectorAll(OVERLAY_FIGURES)).filter((el) => overlaps(el.getBoundingClientRect(), r));
    if (hits.length === 0) return;
    yielded = hits.filter((el) => !el.classList.contains("bat"));
    host.request("focus.yield", { elements: hits });
  };
  const onFocusOut = (e: FocusEvent) => {
    if (!e.relatedTarget) restore();
  };
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  return () => {
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    restore();
  };
}

/** Largest offset of the hero Wraith toward the pointer, in px. */
const EYES_MAX_PX = 4;
/** Over these the Wraith looks back to center (never over form controls). */
const FORM_CONTROLS = "input, select, textarea, button, label, form";

/**
 * The hero Wraith Director follows the pointer (design: "eyes follow the pointer, ±4 px, rAF throttled, never over
 * form controls"). The pose art is a single image with no separate eyes, so the whole figure leans at most 4 px
 * toward the pointer (CSS `transform` on `.hero__wraith`, whose float loop uses the separate `translate` property).
 * Off under Reduce Motion, when compact, and when the hero is out of view.
 */
function startEyesFollow(host: DirectorHost): () => void {
  const fig = document.querySelector<HTMLElement>(".hero__wraith");
  if (!fig) return () => {};
  let frame = 0;
  let last: PointerEvent | null = null;
  let current = { x: 0, y: 0 };
  const write = (x: number, y: number) => {
    if (x === current.x && y === current.y) return;
    current = { x, y };
    host.animator.set(fig, { x, y });
  };
  const update = () => {
    frame = 0;
    const e = last;
    const env = host.getEnv();
    if (!e || env.reducedMotion || env.compact || env.hidden) return write(0, 0);
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(FORM_CONTROLS)) return write(0, 0);
    const r = fig.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return write(0, 0);
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height * 0.3);
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / 400);
    write(Math.round((dx / len) * EYES_MAX_PX * k * 10) / 10, Math.round((dy / len) * EYES_MAX_PX * k * 10) / 10);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    last = e;
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  return () => {
    window.removeEventListener("pointermove", onMove);
    if (frame) cancelAnimationFrame(frame);
    host.animator.set(fig, { x: 0, y: 0 });
  };
}

/** Resolves after the load event, two painted frames and a short pause. */
function whenSettledPaint(): Promise<void> {
  const loaded =
    document.readyState === "complete" ? Promise.resolve() : new Promise<void>((r) => window.addEventListener("load", () => r(), { once: true }));
  return loaded.then(afterFirstPaint).then(() => new Promise<void>((r) => window.setTimeout(r, 150)));
}

/** Elements a click on which is an interaction, not the background. */
const INTERACTIVE =
  "a, button, input, select, textarea, label, summary, details, option, [role='button'], [role='link'], [role='tab'], [role='slider'], [contenteditable], [tabindex]:not([tabindex='-1']), [data-scrubber], form";

/** True for a click on empty page background: not on a control, not on text, not while text is selected. */
export function isBackgroundClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(INTERACTIVE)) return false;
  if (target.closest("p, h1, h2, h3, h4, h5, h6, li, dt, dd, figcaption, blockquote, pre, code, table, .mono")) return false;
  for (const node of Array.from(target.childNodes)) {
    if (node.nodeType === 3 && (node.textContent ?? "").trim() !== "") return false;
  }
  const sel = typeof window.getSelection === "function" ? window.getSelection() : null;
  return !(sel && !sel.isCollapsed);
}

function inView(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
}

function centerOf(el: Element | null): Pt | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const IDLE_EVERY_MS = 5200;
const SCROLL_STOP_MS = 700;
const FLYBY_EVERY_MS = 26000;

/** Ambient scheduler. Every request may be dropped by the director (cooldown, suppression, hidden, Reduce Motion). */
function startAmbient(host: DirectorHost): () => void {
  let n = 0;
  const idle = window.setInterval(() => {
    const beats = IDLE_BEATS.filter((b) => inView(b.region));
    const beat = beats[n++ % Math.max(1, beats.length)];
    if (beat) host.request("idle.beat", beat);
  }, IDLE_EVERY_MS);

  let stopTimer = 0;
  const onScroll = () => {
    window.clearTimeout(stopTimer);
    stopTimer = window.setTimeout(() => {
      const at =
        centerOf(document.querySelector("#lost-hour .problem__clock")) ??
        centerOf(document.querySelector(".thread-node[aria-current] .thread-node__ring"));
      if (at) host.request("ghost.look", { actor: "mini-ghost", at });
    }, SCROLL_STOP_MS);
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  const flyby = window.setInterval(() => {
    host.request("bat.flyby", { bounds: viewportRect(), seed: (Date.now() & 0x7fffffff) >>> 0 });
  }, FLYBY_EVERY_MS);

  return () => {
    window.clearInterval(idle);
    window.clearInterval(flyby);
    window.clearTimeout(stopTimer);
    window.removeEventListener("scroll", onScroll);
  };
}
