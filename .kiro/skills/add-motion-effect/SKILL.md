---
name: add-motion-effect
description: Add a new narrative animation effect to the TimeWraith MotionDirector registry with a priority, a settle state and a Reduce Motion fallback, wire it to a component, and test it. Use when adding any mascot reaction, burst, scene or ambient beat.
metadata:
  project: timewraith
---
# Add a motion effect

1. Choose `priority` (P0 user-critical, P1 state-critical, P2 direct interaction or scroll, P3 ambient) and `kind` (scene, burst, micro, ambient). Ambient effects need a region and `allowCompact: false`.
2. Create `frontend/src/animation/effects/<id>.ts` exporting an `EffectDef` with `run`, `settle`, `maxDurationMs` and a **required** `fallback` (`static`, or `fade` with `fadeMs` of at most 150).
3. Add the id to the `EffectId` union and the entry to `effects/registry.ts`.
4. Trigger it with `useEffectTrigger()` or `useOnceOnEnter()` from the component. Do not import `gsap` or `animate` outside `src/animation/`.
5. Animate only x, y, rotate, scale and opacity.
6. If the effect shows a state change, add a text or ARIA announcement.
7. Run `pnpm --dir frontend exec vitest run src/animation` and then `pnpm --dir frontend verify`.
8. Add a line to `docs/kiro-usage.md` if the effect shows a new hook or steering benefit.
