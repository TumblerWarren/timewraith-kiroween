import { useMotionValue, type MotionValue } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useReduceMotion } from "../a11y/ReduceMotionProvider";
import { LEAD_LINE_RATIO } from "../animation/constants";
import { useCompact } from "../animation/react/useCompact";
import { loadScroll, type ThreadScrollDriverComponent } from "../animation/scroll/loadScroll";
import { buildThread, type ThreadModel } from "./geometry";
import { leadFor, measureThread, sameMeasure, type ThreadMeasure } from "./measure";

/**
 * Shared state of the Timeline_Thread layers (task 11.2): the measured anchors, the thread model, the scroll lead
 * value and the active region. The ThreadLayer (ink), the Section_Nodes, the LedgeLayer and the Mini Ghost read it.
 *
 * Anchors are re-measured after layout, after `document.fonts.ready`, on `ResizeObserver` changes of `<main>`
 * (the library growing, the selected case changing), on image loads and on window resize.
 * `mode`: "loading" until GSAP has loaded, "scroll" with the scrubbed lead, "static" when Reduce Motion is on or
 * the scroll chunk failed to load (the thread is then fully drawn).
 */
export type ThreadMode = "loading" | "scroll" | "static";

export interface ThreadState {
  readonly measure: ThreadMeasure;
  readonly model: ThreadModel;
  readonly leadY: MotionValue<number>;
  /** Index into `measure.nodes` of the active region (last node above the lead line). */
  readonly active: number;
  readonly mode: ThreadMode;
  readonly reduceMotion: boolean;
  readonly compact: boolean;
  readonly version: number;
}

/** Fixed seed: the wobble is the same on every load. FullCalendar #7998 is the first sample case. */
export const THREAD_SEED = 7998;

const EMPTY: ThreadMeasure = { nodes: [], mainLeft: 0, mainTop: 0, width: 0, height: 0 };

const ThreadContext = createContext<ThreadState | null>(null);

export function useThread(): ThreadState | null {
  return useContext(ThreadContext);
}

function activeIndex(m: ThreadMeasure): number {
  if (m.nodes.length === 0) return -1;
  const lead = leadFor(window.scrollY, window.innerHeight, m.mainTop, LEAD_LINE_RATIO);
  let idx = 0;
  m.nodes.forEach((n, i) => {
    if (lead >= n.y) idx = i;
  });
  return idx;
}

export function ThreadProvider({ children }: { children: ReactNode }) {
  const { reduceMotion } = useReduceMotion();
  const compact = useCompact();
  const [{ measure, version }, setMeasured] = useState<{ measure: ThreadMeasure; version: number }>({ measure: EMPTY, version: 0 });
  const [active, setActive] = useState(0);
  const [Driver, setDriver] = useState<ThreadScrollDriverComponent | null>(null);
  const [failed, setFailed] = useState(false);
  const leadY = useMotionValue(0);
  const model = useMemo(() => buildThread(measure.nodes, THREAD_SEED), [measure]);

  // Measurement, batched to one read per frame.
  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next = measureThread(main);
        setMeasured((prev) => (sameMeasure(prev.measure, next) ? prev : { measure: next, version: prev.version + 1 }));
      });
    };
    schedule();
    void document.fonts?.ready.then(schedule);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    ro?.observe(main);
    main.addEventListener("load", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      main.removeEventListener("load", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  // Load the scroll driver after first paint; a failure leaves the thread fully drawn.
  useEffect(() => {
    let alive = true;
    loadScroll().then(
      (C) => alive && setDriver(() => C),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  // Active node from the real scroll position (works in every mode; Reduce Motion relies on it).
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setActive(activeIndex(measure));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [measure]);

  const mode: ThreadMode = reduceMotion || failed ? "static" : Driver ? "scroll" : "loading";
  const fullLead = model.samples[model.samples.length - 1]?.y ?? 0;

  // Without the driver: fully drawn when static, else the lead for the current scroll position.
  useEffect(() => {
    if (mode === "static") leadY.set(fullLead);
    else if (mode === "loading") leadY.set(leadFor(window.scrollY, window.innerHeight, measure.mainTop, LEAD_LINE_RATIO));
  }, [mode, fullLead, measure.mainTop, leadY]);

  const value = useMemo<ThreadState>(
    () => ({ measure, model, leadY, active, mode, reduceMotion, compact, version }),
    [measure, model, leadY, active, mode, reduceMotion, compact, version],
  );

  return (
    <ThreadContext.Provider value={value}>
      {children}
      {Driver && !failed ? (
        <Driver leadY={leadY} reduceMotion={reduceMotion} compact={compact} mainTop={measure.mainTop} fullLead={fullLead} version={version} />
      ) : null}
    </ThreadContext.Provider>
  );
}
