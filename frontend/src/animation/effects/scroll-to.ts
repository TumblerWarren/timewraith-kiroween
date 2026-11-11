import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { defineEffect, staticFallback } from "./shared";

/** Smooth scrolling takes about this long; the browser keeps scrolling natively after the run ends. */
const SMOOTH_MS = 700;

function jump(p: ParamsOf<"scroll.to">): void {
  try {
    p.target.scrollIntoView({ behavior: "auto", block: p.block ?? "start" });
  } catch {
    // jsdom and old engines: nothing to scroll
  }
}

/**
 * P2 micro: programmatic smooth scroll (to the new draft card, the Case view, the Open-a-case panel).
 * A drop or cancel jumps there instead. Reduce Motion: `behavior: "auto"` (Requirement 10.8).
 */
export const scrollTo = defineEffect({
  id: "scroll.to",
  priority: 2,
  kind: "micro",
  maxDurationMs: 1200,
  allowCompact: true,
  run(ctx, p) {
    try {
      p.target.scrollIntoView({ behavior: "smooth", block: p.block ?? "start" });
    } catch {
      jump(p);
    }
    const run = createRun(ctx.clock);
    run.after(SMOOTH_MS, () => {});
    return run.seal();
  },
  settle: (_ctx, p) => jump(p),
  fallback: staticFallback<ParamsOf<"scroll.to">>((_ctx, p) => jump(p)),
});
