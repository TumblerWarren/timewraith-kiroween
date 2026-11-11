import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useDirectorHost } from "../../animation/react/directorHost";
import { viewportRect } from "../../animation/react/useBatFlights";
import { DST_STATIC_FRAME, dstFrame, type DstFrame } from "../../animation/scroll/dstFrame";
import { loadScenes, type SceneScrubDriverComponent } from "../../animation/scroll/loadScenes";
import { Clock } from "../../components/Clock";
import { slapTilt } from "../../components/tilt";
import { PROBLEM_ILLUSTRATION_LABEL } from "../../content/copy";
import { PROBLEM_HEADING, PROBLEM_INTRO, PROBLEM_STAMP_AFTER, PROBLEM_STAMP_BEFORE } from "../../content/sections";
import { Mascot } from "../../mascots/Mascot";
import { useThread } from "../../thread/ThreadProvider";

/**
 * The thread, drawn twice (a row for wide screens, a column for narrow ones). It is cut at the crack, which runs
 * through the Clock's center: the piece after the jump is shifted, so the line visibly does not meet. Non-scaling
 * strokes keep the ink weight constant while the viewBox stretches to the scene. Decorative; the page-long thread
 * arrives later. The cut sits at the Clock's center in problem.css: x 47, y 52.5 (row), x 50, y 50 (column).
 */
const THREAD_H = {
  before: "M0 50 C9 47 19 53 28 50 S40 51 46 52",
  after: "M48 62 C58 60 68 65 78 62 S92 61 100 63",
};
const THREAD_V = {
  before: "M50 0 C47 8 53 16 50 24 S48 38 50 47",
  after: "M57 53 C55 62 60 70 57 78 S56 92 57 100",
};

/** A jagged crack from the top of the Clock to its bottom, in a 100 x 100 box. */
const CRACK = "M52 0 L46 14 L57 26 L43 40 L56 54 L44 68 L55 82 L49 100";

/** Size of the box the scatter bats leave from, centered on the crack (viewport px). */
const GAP_BOX_PX = 56;

/**
 * Scroll-scrubbed reading (task 14.1). With motion on and the scene driver loaded, progress through the 160vh
 * sticky track turns the Clock 01:58, 01:59, then straight to 03:00 (`dstFrame`, never 02:xx). The first time it
 * reaches 03:00 the crack opens (`clock.crack`) and Mini Bats scatter out of the gap (`problem.scatter`), once.
 * Reduce Motion, no director, or a failed load: the static layout (01:59, crack drawn, both stamps).
 */
function useLostHourScene(track: HTMLElement | null, crack: RefObject<SVGSVGElement | null>, clock: RefObject<HTMLDivElement | null>) {
  const thread = useThread();
  const host = useDirectorHost();
  const reduce = thread?.reduceMotion ?? true;
  const [Driver, setDriver] = useState<SceneScrubDriverComponent | null>(null);
  const [frame, setFrame] = useState<DstFrame | null>(null);

  useEffect(() => {
    if (!host || reduce) return;
    let alive = true;
    loadScenes().then(
      (C) => alive && setDriver(() => C),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [host, reduce]);

  const onProgress = useCallback((p: number) => {
    const next = dstFrame(p);
    setFrame((prev) => (prev && prev.label === next.label ? prev : next));
  }, []);

  const live = !reduce && Driver !== null ? frame : null;

  useEffect(() => {
    if (!host || live?.phase !== "after" || !host.claimOnce("lost-hour:jump")) return;
    const crackEl = crack.current;
    const clockEl = clock.current;
    const targets = [crackEl, clockEl].filter((e): e is NonNullable<typeof e> => e !== null);
    host.request("clock.crack", { targets, actors: [{ actor: "lost-hour:mini-ghost", pose: "look" }] });
    const r = crackEl?.getBoundingClientRect();
    host.request("problem.scatter", {
      targets: crackEl ? [crackEl] : [],
      actors: [{ actor: "lost-hour:mini-bat", pose: "act" }],
      ...(r ? { origin: { x: r.left + r.width / 2 - GAP_BOX_PX / 2, y: r.top + r.height / 2 - GAP_BOX_PX / 2, w: GAP_BOX_PX, h: GAP_BOX_PX } } : {}),
      bounds: viewportRect(),
      seed: (Date.now() & 0x7fffffff) >>> 0,
    });
  }, [host, live?.phase, crack, clock]);

  const driver = Driver && !reduce && track ? <Driver track={track} onProgress={onProgress} /> : null;
  return { reading: live ?? DST_STATIC_FRAME, phase: live?.phase ?? "static", driver };
}

/**
 * Lost Hour (region 2, night; was Problem): a scene inside the sticky track (160vh desktop, 120vh compact, decision
 * D18; Reduce Motion returns it to the static layout). The Clock reads 01:59 and an ink crack runs through it and
 * across the thread. The two readings are rubber stamps slapped onto the scene at an angle, overlapping the Clock's
 * rim: 01:59 before the jump, 03:00 after it. A Mini Bat clings to the crack and the Mini Ghost peeks round the Clock
 * at the gap. A generic illustration of the failure class, not a recorded case, and labelled as such (Requirements
 * 3.3, 16.4). With motion on, scrolling through the track turns the Clock to the jump (see `useLostHourScene`).
 */
export function LostHour() {
  const [track, setTrack] = useState<HTMLElement | null>(null);
  const crackRef = useRef<SVGSVGElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const { reading, phase, driver } = useLostHourScene(track, crackRef, clockRef);
  return (
    <section id="lost-hour" className="section section--lost-hour" aria-labelledby="problem-title">
      <div className="section__inner">
        <div className="rail" aria-hidden="true" data-thread-anchor="" />
        <div className="content">
          <div className="problem__intro">
            <h2 id="problem-title" tabIndex={-1}>
              {PROBLEM_HEADING}
            </h2>
            <p>{PROBLEM_INTRO}</p>
          </div>

          <figure ref={setTrack} className="problem__track" data-scene="sticky">
            <div className="problem__stage">
              <div className="problem__scene" data-frame={phase}>
                <svg className="problem__thread problem__thread--row" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false" aria-hidden="true">
                  <path d={THREAD_H.before} />
                  <path d={THREAD_H.after} />
                </svg>
                <svg className="problem__thread problem__thread--column" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false" aria-hidden="true">
                  <path d={THREAD_V.before} />
                  <path d={THREAD_V.after} />
                </svg>

                {/* Behind the Clock: only the part of the ghost that leans out past the rim shows. */}
                <div className="problem__ghost" aria-hidden="true" data-problem-mascot="mini-ghost">
                  <Mascot id="mini-ghost" decorative width={80} />
                </div>

                <div ref={clockRef} className="problem__clock">
                  <Clock id="problem-clock" hours={reading.hours} minutes={reading.minutes} />
                  <svg ref={crackRef} className="problem__crack" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false" aria-hidden="true" data-crack="static">
                    <path className="problem__crack-ink" d={CRACK} />
                    <path className="problem__crack-line" d={CRACK} />
                  </svg>
                  <div className="problem__bat" aria-hidden="true" data-problem-mascot="mini-bat">
                    <Mascot id="mini-bat" decorative width={96} />
                  </div>
                </div>

                <div className="problem__stamp problem__stamp--before stamp" style={slapTilt("problem-stamp-0159")}>
                  <time className="problem__stamp-time" dateTime={PROBLEM_STAMP_BEFORE.time}>
                    {PROBLEM_STAMP_BEFORE.time}
                  </time>
                  <span className="problem__stamp-label">{PROBLEM_STAMP_BEFORE.label}</span>
                </div>

                <div className="problem__stamp problem__stamp--after stamp" style={slapTilt("problem-stamp-0300", 4, 8)}>
                  <time className="problem__stamp-time" dateTime={PROBLEM_STAMP_AFTER.time}>
                    {PROBLEM_STAMP_AFTER.time}
                  </time>
                  <span className="problem__stamp-label">{PROBLEM_STAMP_AFTER.label}</span>
                </div>
              </div>
            </div>
            <figcaption className="problem__caption">{PROBLEM_ILLUSTRATION_LABEL}</figcaption>
          </figure>
          {driver}
        </div>
      </div>
    </section>
  );
}
