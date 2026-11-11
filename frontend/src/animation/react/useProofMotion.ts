import { useEffect, type RefObject } from "react";
import type { EffectId } from "../effects/ids";
import { unarm } from "../effects/proof-effects";
import { useDirectorHost, type DirectorHost } from "./directorHost";

/** A part of the proof enters when this share of it is on screen. */
const ENTER_THRESHOLD = 0.45;
/** Fail-safe: a part still armed this long after it appeared (the director dropped the request) shows as drawn. */
const ARMED_FAILSAFE_MS = 2500;
/** A hover or focus replay waits this long after the last start. */
const REPLAY_GAP_MS = 3000;

const RAVEN = "case:ladder-raven";
const MUMMY = "case:mummy-wrapper";
const JACK = "case:two-faced-jack";

type Part = "ladder" | "hash" | "jack";
const EFFECT: Readonly<Record<Part, EffectId>> = { ladder: "proof.ladder", hash: "proof.hash", jack: "proof.jack" };
const BLOCK: Readonly<Record<Part, string>> = { ladder: ".proof__scroll", hash: ".proof__hash", jack: ".jack-panel" };

function all(root: ParentNode, sel: string): Element[] {
  return Array.from(root.querySelectorAll(sel));
}

/** Requests one proof effect for the parts found under `root`. Returns false when nothing was requested. */
export function requestProof(host: Pick<DirectorHost, "request">, root: Element, part: Part, caseId: string): boolean {
  const q = (sel: string) => root.querySelector(sel);
  if (part === "ladder") {
    const scroll = q(".proof__scroll");
    host.request("proof.ladder", {
      caseId,
      armed: q(".proof__scroll"),
      rod: q(".proof__rail-bottom"),
      travel: Math.max(0, (scroll?.clientHeight ?? 0) - 6),
      rungs: all(root, ".ladder__rung"),
      shapes: all(root, ".ladder__rung > .ladder__shape"),
      ranks: all(root, ".ladder__rung .ladder__rank"),
      actors: [{ actor: RAVEN, pose: "unroll" }],
    });
    return true;
  }
  if (part === "hash") {
    host.request("proof.hash", {
      caseId,
      armed: q(".proof__hash"),
      strip: q(".proof__bandage-wrap"),
      turns: all(root, ".proof__bandage-turn"),
      end: q(".proof__bandage-end"),
      tag: q(".proof__tag"),
      value: q(".proof__tag-value"),
      actors: [{ actor: MUMMY, pose: "bandage" }],
    });
    return true;
  }
  host.request("proof.jack", {
    caseId,
    armed: q(".jack-panel"),
    browserFace: q('[data-face="browser"]'),
    serverFace: q('[data-face="server"]'),
    browserUnderline: q('[data-face="browser"] .jack-panel__underline'),
    serverUnderline: q('[data-face="server"] .jack-panel__underline'),
    browserCaption: q('.jack-panel__now [data-now="browser"]'),
    serverCaption: q('.jack-panel__now [data-now="server"]'),
    actors: [{ actor: JACK, pose: "flip" }],
  });
  return true;
}

/** A block has entered when 45% of it, or 45% of the viewport, is covered. */
function entered(e: IntersectionObserverEntry): boolean {
  if (!e.isIntersecting) return false;
  if (e.intersectionRatio >= ENTER_THRESHOLD) return true;
  const vh = e.rootBounds?.height ?? window.innerHeight;
  return vh > 0 && e.intersectionRect.height >= ENTER_THRESHOLD * vh;
}

/**
 * Wires the proof animations (task 14.6) for one Case view proof. `rootRef` is the proof root; the ladder scroll and
 * the hash row carry `data-armed` (hidden) until their effect starts. Each part (ladder, hash tag, Jack's panel) is
 * requested once per case when it is on screen, and replays on hover or focus (at most once every 3 s). Nothing
 * autoplays on load: the parts wait for the visitor to scroll them in. A part still armed 2.5 s after it appeared (the
 * director dropped the request) is shown as drawn. Without IntersectionObserver every part is shown as drawn.
 */
export function useProofMotion(rootRef: RefObject<HTMLElement | null>, caseId: string): void {
  const host = useDirectorHost();
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const blocks = (Object.keys(BLOCK) as Part[]).map((part) => [part, root.querySelector(BLOCK[part])] as const);
    if (!host || typeof IntersectionObserver === "undefined") {
      for (const [, el] of blocks) unarm(el);
      return;
    }
    const last: Partial<Record<Part, number>> = {};
    const timers = new Set<number>();
    const safety = (el: Element) => {
      const t = window.setTimeout(() => unarm(el), ARMED_FAILSAFE_MS);
      timers.add(t);
    };
    const fire = (part: Part, el: Element) => {
      const now = Date.now();
      const prev = last[part];
      if (prev !== undefined && now - prev < REPLAY_GAP_MS) return;
      last[part] = now;
      requestProof(host, root, part, caseId);
      safety(el);
    };
    const disposers: (() => void)[] = [];
    for (const [part, el] of blocks) {
      if (!el) continue;
      let seen = false;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting) && !seen) {
            seen = true;
            safety(el);
          }
          if (!entries.some(entered)) return;
          io.disconnect();
          if (host.claimOnce(`${EFFECT[part]}:${caseId}`)) fire(part, el);
        },
        { threshold: [0, 0.2, ENTER_THRESHOLD, 0.7, 1] },
      );
      io.observe(el);
      const replay = () => fire(part, el);
      el.addEventListener("pointerenter", replay);
      el.addEventListener("focusin", replay);
      disposers.push(() => {
        io.disconnect();
        el.removeEventListener("pointerenter", replay);
        el.removeEventListener("focusin", replay);
      });
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      disposers.forEach((d) => d());
    };
  }, [host, rootRef, caseId]);
}