# TimeWraith Case Board: animation review, round 1

Historical review of the interface at the time of capture; asset counts, routes and findings are not a description of the current UI.

Reviewer: animation reviewer (no application code changed). Evidence captured in Chrome with motion ON (`tw.reduceMotion="off"`, `reducedMotion: "no-preference"`) at 1440x900 and 390x844 against a fresh `pnpm --dir frontend build`.

Capture script (kept for round 2): `frontend/scripts/anim-review.mjs` (+ `frontend/scripts/anim-sheet.py`, Pillow contact sheets). Run: `node scripts/anim-review.mjs` from `frontend/` (optional `--round round2`, `--only hero,scroll,bats,lost,crew,flow,case,proof,detail`). Outputs live next to this file:

- `sheets/*.jpg` contact sheets (label = ms since the moment started; Lost Hour scrub is labelled in % of scrub).
- `detail/*.png` 3x close-ups (ghost, perch bat, mummy at three places, hash tag, Jack panel, ladder, proof area) and `detail/mummy-zoom-head-and-tail.png` (my crop of the defects).
- `metrics.json` (every number below), `checks.txt` (round-2 acceptance checks run against round-1 code: 9 PASS, 9 FAIL, which is the baseline).

What I looked at and did not: I read the 1440 sheets for hero, scroll, ghost close-up, bursts, click flight, Lost Hour, crew roll-call, cat hover, flow, case scrub, sew, proof entry, Jack hover, plus all mummy/ghost/bat close-ups. I did **not** visually review the 390 sheets (they exist; metrics for 390 are in `metrics.json`) or the draft-card, cases-enter and replay-reveal frames in detail. Ratings for those are marked "n/r" (not reviewed).

---

## 1. Headline

The motion layer is **technically sound and fast** (p95 frame 16.9 ms, no long frames while scrolling, every effect has a Reduce Motion fallback), but it is **timid and flat**:

1. The user's four specific complaints are all real and have concrete causes (section 2).
2. Only 3 of 14 mascots have real Codex art (Mini Bat, Wraith Director, Doctor Stitch). The other 11 plus the Mini Ghost are placeholder SVGs, and **every pose is a whole-figure tween (rotate/translate/scale) around the element's centre**, with 50/50 ease-in-out, no anticipation, no overshoot and no secondary motion. That is why everything reads as "a flat image wobbling".
3. Headroom is large. Frame budget is untouched, so round 2 can spend it.

---

## 2. Findings per complaint

### 2.1 "Add proof animations" (task 14.6): confirmed static

Evidence: `sheets/h1-proof-enter-1440.jpg` (14 frames over 2 s while the proof enters): ladder, Jack panel, hash tag and Mummy are identical in every frame. `metrics.json -> proofTransforms`: **0 of 148** watched nodes (`.ladder__rung`, `.proof__scroll *`, `.jack-panel__*`, `.proof__mummy *`, `.proof__bandage *`, `.proof__tag`) changed transform, opacity, translate, rotate or scale after entering or while at rest, at both widths. Jack's hover (`sheets/h2-jack-hover-1440.jpg`) does nothing either (the proof Jack has no `data-react-actor`). The only effect that touches the proof is `ladder.rung` (a 300 ms stamp when the replay reaches a rung), which only fires from scrubbing.

### 2.2 "The mummy is enlarged and seems cracking"

Boxes (`metrics.json -> mummy`, viewBox 140x190, all three are the placeholder SVG, `data-art="placeholder"`, no real Mummy art exists):

| place | width x height (1440) | 390 | note |
|---|---|---|---|
| proof hash tag (`.proof__mummy svg`) | 72 x 98 (attr 80x109, `width:100%` in a 72px box) | 60 x 82 | design aspect 0.737 holds (0.734) |
| crew portrait | 92 x 125 | 52 x 71 | |
| flow "Evidence" step | 80 x 109 | 64 x 87 | |

**It is not CSS-scaled or clipped.** No ancestor has `overflow`, `clip-path` or `contain: paint` other than `<body>`/`<html>`. The aspect is correct. So "enlarged" is relative and visual:

- In the proof row the figure is 98 px tall next to a tag that is about 55 px tall, with `z-index: 1` and `margin-inline-end: -16px`, so it sits **on top of the tag's left end and its string hole** (`detail/hashtag-mummy-3x.png`). It is the biggest thing in the row and it eats the tag.
- `--figure-rim` (four 1.5 px mist-300 drop-shadows on the SVG, `proof.css` lines ~301-306) adds a ~3 px pale halo around every edge, so the visible figure is ~78 x 104.
- In Flow the "10" number sign overlaps the Mummy's head (`detail/mummy-flow-3x.png`).

**The "cracks" are real drawing defects in `PlaceholderMascot.tsx` `MummyWrapper()` (lines ~408-436), plus the bandage on the tag:**

1. **Band line overshoots the head.** The first wrapping band is `Line [[44,24],[96,12]]`, but the head outline at y=12 to 24 is far inside x=96 (head blob is a rounded shape between x 42 and 100 only at mid-height). The stroke leaves the head at the top-right and ends as a stray ink tick outside the outline. Same for the eye-gap `Blob` (ends at x=98/99, past the outline). See `detail/mummy-zoom-head-and-tail.png` (left crop): that is the "crack" at the top of the head.
2. **Trailing bandage is drawn behind the torso.** `Line [[110,118],[128,150],[112,170],[126,188]]` (ink 9 + paper 5) is painted first, so only the part right of the torso edge shows: a pale stick poking out of the lower right, which reads as a snapped bone or a crack in the body (visible in all three 3x crops).
3. **Two-plate misregistration** shifts the colour plate by (-1.83, -1.64) units with ink weight 0.9 to 1.15. At 0.51 scale this is about 1 px, but combined with the rim it reads as a double outline.
4. **The bandage on the hash tag looks fractured.** `.proof__bandage-turn` x2 are hard-edged rectangles with 2 px ink side borders, rotated 4deg and 13deg, sitting over a deckled (clip-path) tag edge, and `.proof__bandage-end` is a worm-like S curve. At 3x (`hashtag-mummy-3x.png`, right side) it reads as a cracked slab with a tail, not cloth wound round a tag.

Fix is in plan item A. Real Codex art for the Mummy is the proper long-term fix (decision 1).

### 2.3 "The bat size is too small"

Real Codex art `mini-bat/pose-rest`: cutout 190x160 px, manifest display box 95x80. Measured sizes of the art element (`metrics.json -> batPlaces, batBurst, batClick, batNode`):

| use | now, 1440 | now, 390 | note |
|---|---|---|---|
| burst bats (pool, `BatPool.tsx` `width={compact ? 40 : 52}`) | **52-64 w** x 25-57 h while flapping | 41-49 w | 42% below the art's own 95 px design box |
| click flight and node flight (same pool) | 52-57 w | 40-44 w | a speck on a 1440 canvas (`c2-bg-click-flight-1440.jpg`) |
| nav perch (`AppHeader.tsx` `width={44}`) | 50 x 41 (rotated) | 43 x 35 | |
| hero roost (`.hero__bat`, no width => roster 100, scaled by the stage) | 76 x 66 | **hidden** (`display:none` below 768 px) | |
| Lost Hour crack bat (`LostHour.tsx` width 64) | 97 x 87 | 52 x 47 | fine |
| Library bat (width 64) | 48 x 38 | 48 x 38 | |
| Crew portrait mini-bat | 64 x 51 | 35 x 28 | |

The flap (`@keyframes bat-flap`: `scale: 1 -> 1.06 0.58`, 250 ms) squashes the whole bat vertically to 58% height, so the visible bat is 25 px tall at the bottom of each flap. Colour is walnut-grey on tower-950/cream with a mist rim, so it is also low contrast. Together: "too small" is correct, and also "dull". Sizes are in plan item B.

### 2.4 "There is no ghost scroll animation"

The ghost exists, moves, and is on top (`z=40` overlay, opacity 1, visible). But the user cannot perceive it as a companion. Measured (`metrics.json -> ghostScroll, ghostWheel, ghostTrack, ghostDom`):

- **Tiny**: 52 x 62 px (1440), 40 x 48 (390). The Wraith in the Crew portrait is 300 x 375. The ghost is a placeholder SVG (`data-art="placeholder"`, mist-300 body).
- **In an empty gutter**: x = 129-138 px at 1440 (the thread's left rail, outside the content column). At 390 it is at x = 10-17, i.e. half-clipped by the gutter edge and the 32 px rail.
- **It hangs from the thread like a plumb bob.** The gold thread ends at the top of its head (`b2-ghost-closeup-1440.jpg`, frames 0 and 739-1768). It reads as an ornament on a string, not a creature.
- **It leaves the screen.** Its page-y is `leadY` (60% of viewport + scroll) behind a GSAP scrub and a critically damped spring (`stiffness 120, damping 22` -> zeta = 22 / (2 sqrt(120)) = 1.0, **no overshoot**). During a 14 s scripted scroll its viewport y goes 509 -> **-137** (off the top) and back, y range 646 px; with 8 wheel flicks (2560 px in 4 s) it reaches **-437** (`viewportYMin`). Only 646/839 frames (1440) and 432/841 frames (390) have it fully on screen. At rest it parks at ~56% of the viewport height, so on a normal scroll the user sees it creep up and vanish rather than travel with them.
- **Almost no animation language**: 6 px vertical bob (2.8 s, ambient-gated) and a rotate of 0 to +10 degrees (`v * 0.012`, always the same direction, **0 on compact**). No squash/stretch, no overshoot, no eyes, no tail, no reaction to nodes, no trail. `ghost.look` only fires in Lost Hour (`rotate -9deg, x 4`, 1 s).
- Reduce Motion works as designed (fixed at the first node).

Conclusion: not a bug that hides it; it is under-designed. Plan item C.

### 2.5 "The animation is not to my liking" (overall quality)

Measured from `mascots/actors.ts` and the effects:

- 21 poses, every one a single `animate()` of transform on the whole element, all with `ease: "easeInOut"`, durations 320-1500 ms. Amplitudes: wave +-7 deg, hop 14 px (`act`), bow 6 px / 5 deg, wobble +-4 deg, `hiss` scaleY 1.06 + 3 deg, `deny` scaleX 0.97 + 3 deg. At crew display sizes (92-170 px) that is **3-6 px of movement**; in the roll-call sheet (`e1-crew-rollcall-1440.jpg`) consecutive frames are practically identical.
- **No anticipation, overshoot or follow-through anywhere** except `bounce` and the stamp effects (`raven.stamp`, `ladder.rung` use 3-4 keyframe settles; these are the best motion on the page).
- **Pivot**: figures rotate about their element centre (no `transform-origin` for mascot art anywhere except `.flow__sign`, the ghost tilt and perch), although the manifest has a real pivot (`0.5, 1.0` for the Wraith and Doctor Stitch). A standing character rotating about its belly floats instead of rocking on its feet.
- **Idle**: only the Wraith float (7 px, 6.4 s) and lantern pool (opacity .16-.26), the ghost bob and the perch sway. Nothing breathes or blinks.
- **Bats**: path sampled into 16 linear keyframes, `rotate = tilt + sin(i*1.3)*6` (random-looking wobble unrelated to the path tangent), opacity 0 -> 1 -> 0, no scale. Straight tweens, no anticipation or landing.
- `Animator` channels are only `x y rotate scale scaleX scaleY opacity`: no `skewX`, so no cloth/hem sway, and no spring option.

The bright spots: hero clock sweep (31-36 distinct angles, minute-hand overshoot to 23:59), raven stamp with a squash landing, the Lost Hour scrub, the sew needle, the timeline milestones. The structure (director, priorities, fallbacks, caps) is good and should be kept; the vocabulary needs to be richer.

---

## 3. Scored table of animated moments (1 = absent or broken, 5 = delightful)

| # | Moment | What it does now | What is wrong | Score | Evidence |
|---|---|---|---|---|---|
| 1 | Hero clock sweep (`hero.clock-entry`) | Minute hand 180 -> 354 deg in 580 ms with 8 deg overshoot, 31-36 distinct angles | Good. Runs once, nothing else on the page responds to it | 4 | `a-hero-1440.jpg` |
| 2 | Wraith float + lantern pool | 7 px float / 0.9 deg, 6.4 s; lantern pool opacity .16-.26 | Barely visible; no lantern swing as an object; no blink | 2.5 | `a-hero-1440.jpg` |
| 3 | Wraith glance (open reaction) | x +10, rotate 3, 1.1 s | Rigid whole-image slide; pivot at centre | 3 | frames 1500-2400 ms |
| 4 | Nav bat perch | rotate -5/+6 deg, 3.6 s, origin bottom | Hangs upside down, 50 px; reads as a pendulum, no wing/ear life | 2 | `detail/bat-perch-3x.png` |
| 5 | Mini Ghost scroll companion | Spring on lead, +0..10 deg tilt, 6 px bob | 52 px, in the empty gutter, leaves screen, no personality (section 2.4) | **1.5** | `b-scroll-1440.jpg`, `b2-ghost-closeup-1440.jpg` |
| 6 | Thread ink draw | Dash-offset scrub, gold stroke, wobble 6 px max | Pleasant, but no nib at the tip, no node ring pulse; tip is hidden below the fold at normal speed | 3 | `b-scroll-1440.jpg` |
| 7 | Section node dot | 200 ms scale/opacity transition | Fine but invisible; no arrival feedback | 2 | code |
| 8 | Submit bat burst | 5-7 bats, 52-64 px, 0.5-0.9 s linear arcs | Tiny, dull, no anticipation/trail/landing, 3 cm of screen | 2 | `c1-burst-1440.jpg` (max 7 concurrent, width 53-64) |
| 9 | Background-click bat | One 52-57 px bat from the perch to the click point | Speck; arcs fine but linear; on arrival nothing | 1.5 | `c2-bg-click-flight-1440.jpg` |
| 10 | Node-click bat travel | Same bat, 700 ms arc | Same | 2 | `c3-node-click-flight-1440.jpg` |
| 11 | Lost Hour scrub + crack | Sticky scene, clock 01:59 -> 03:00, crack scales in, scatter bats | Strong staging; scatter bats tiny; crack gets only a jolt | 3.5 | `d-lost-hour-scrub-1440.jpg` |
| 12 | Crew roll-call | 14 poses 80 ms apart, tag pop 1.4x | 3-6 px movements; invisible in sheet | 2 | `e1-crew-rollcall-1440.jpg` |
| 13 | Tier 2 hover (cat `hiss`, others) | scaleY 1.06, rotate -3, 420 ms | Subtle to the point of being a no-op | 2 | `e2-hover-cauldron-cat-1440.jpg` |
| 14 | Flow landing (`flow.step`) | Active marker, figures `act` hop 14 px, sign rocks, bat burst | Works, burst bats tiny, rocking OK | 3 | `f-flow-approve-1440.jpg` |
| 15 | Case open + replay scrub | Sheet unfolds scaleY .94 -> 1, per-event cards | Good logic; motion is quiet | 3.5 | `g1-case-scrub-1440.jpg` |
| 16 | Reveal + fixed pass | Reveal card, timeline milestones stamp | Good, one of the best moments | 3.5 | `g1`, `g2` |
| 17 | Suggested fix sew | Needle runs down, lines slide 14 px, thread draws | Nice idea; needle small; Stitch himself barely moves | 3 | `g3-fix-sheet-sew-1440.jpg` |
| 18 | **Proof: ladder, Jack, Mummy** | **Nothing** | Static (section 2.1) | **1** | `h1-proof-enter-1440.jpg`, 0/148 changed |
| 19 | Raven stamp (Closing) | Stamp squash-lands, sheet knocks, underline draws | Best choreography on the page | 4 | `motion-check` |
| 20 | Library cards enter, draft create | `cases.enter`, drop-in | n/r | n/r | `motion-check` 13 PASS |
| 21 | Idle beats (P3) | Random 1 of 7 mascots every >=4 s | Sparse; same whole-figure poses | 2 | code |
| 22 | Reduce Motion | Settles to final state, <=150 ms fades | Designed properly | 4.5 | `motion-check` |
| 23 | Performance while animating | p50 16.7, p95 16.8-16.9, max 17-33 ms (one run 83 ms from lazy decode) | Healthy; ample headroom | 5 | `metrics.json -> jankScroll, jankRuns` |

---

## 4. Plan

Ordered by impact. **[M]** = must, **[S]** = stretch. Everything is transform and opacity only, uses the director (`useEffectTrigger`, `useSectionReaction`), registers `settle` and `fallback`, and respects the caps in `motion-rules.md`. Follow the `add-motion-effect` skill for new effect ids, and append the dated evidence to `docs/kiro-usage.md`.

### A. Mummy fix [M] (about 1 h, no new art)

Cause: placeholder drawing overshoots (2.2 items 1-2), rim and overlap make it look big (item 3), hard-edged bandage rectangles (item 4).

1. `PlaceholderMascot.tsx` `MummyWrapper()`:
   - Clip all wrapping bands and the eye gap to the head/torso shapes with an SVG `<clipPath>` (use the same `pts` as the `Blob`s through `inkPath`; id from `useId`). The head/torso shapes are drawn first, bands second inside `<g clipPath>`. Delete the stray `Line [[44,24],[96,12]]` overshoot by clamping x2 to 90, y2 to 17.
   - Move the trailing bandage so it is **drawn after the torso, curling inside the viewBox**: path `[[108,150],[122,162],[112,176],[118,186]]`, stroke ink 8 + paper 4.5 (ends at x <= 124, clear of the right edge). No segment hidden behind the torso.
   - Add a `weight` cap: mummy `misregistration` dx,dy at most 1.4 units (id-seeded override table `MISREG_CAP = { "mummy-wrapper": 1.4 }`).
2. `proof.css`:
   - `.proof__mummy { width: 64px; margin-inline-end: calc(-1 * var(--space-2)); }` (compact `width: 52px`); set `align-self: flex-end`, keep `z-index: 1`, but give the tag `padding-inline-start: calc(var(--space-6) + var(--space-2))` so the string hole is clear of the figure (hash text no longer overlapped).
   - Replace the rim for the mummy only: `.proof__mummy svg { filter: drop-shadow(1px 0 0 var(--mist-300)) drop-shadow(-1px 0 0 var(--mist-300)) drop-shadow(0 1px 0 var(--mist-300)) drop-shadow(0 -1px 0 var(--mist-300)); }` (1 px not 1.5).
   - Bandage: replace the two ink-bordered rectangles with **one cloth strip** `.proof__bandage-wrap` (`moon-200` fill, 2 px ink border only top and bottom, `rotate: 3deg`, `border-radius: 2px`) crossing the tag's right end, plus 2 thinner turns (`width: 10px`, `rotate: 8deg / -5deg`) and a loose end of 3 gently curved segments. This is also the object that `proof.hash` unwinds (D). Remove the jagged tag edge under the bandage by not applying `.paper-piece` deckle on the tag's right 24 px (`clip-path: none` on `.proof__tag` and put the deckle on `::before` only), or move the bandage inside the deckle.
3. `Flow.tsx` size map for `mummy-wrapper` stays 80, but move its number sign (`flow.css`) 16 px to the left so it no longer sits on the head.
4. Sizes after fix: proof 64 x 87 (52 x 71 compact); crew unchanged (92 x 125, design box); flow 80 x 109.
5. Long term: generate real `mummy-wrapper/pose` art (decision 1), which removes the placeholder issue entirely.

### B. Bats [M]

**B1 sizes** (width, CSS px; the art's design box is 95 x 80; the cutout is 190 px wide, so crisp at 1x up to 190 px and at 2x DPR up to 95 px). Re-cut the cutout at 3x for free from the existing master (`python tools/art/cutout.py` on `masters/mini-bat/pose-rest-v01.png`, output 285 x 240, write as `pose-rest@3x`/update the manifest `size`; the master is 1774 px wide, so no new image generation).

| use | desktop | compact (<768) |
|---|---|---|
| burst bat (`BatPool`) | **104**, per-flight depth scale 0.85-1.15 (89-120) | 72 |
| bg-click flight and node travel bat | **120** | 80 |
| nav perch (`AppHeader`) | 64 | 52 |
| hero roost (`.hero__bat`) | 110; **show on compact at 56** (remove `display:none`) | 56 |
| Lost Hour crack bat / scatter bats | 96 / use the pool sizes above | 64 |
| Library, Crew portrait | 80 | 56 |

Keep `MAX_BATS` 14 / 6. A bigger bat means a bigger rim: keep `--figure-rim` (1.5 px) at 104+ px.

**B2 flap with the single pose we have** (feasible now, no new art). From the alpha column profile of `pose-rest.png` (190x160): left wing spans x 5-60, right wing x 130-185, the body+head x 55-135. Build a `BatSprite` of **three stacked copies** of the same `<img>` (identical `src`, absolute, same box):
- `bat__wing--l`: `clip-path: inset(0 69% 0 0)` (x < 59 px of 190), `transform-origin: 31% 62%` (shoulder).
- `bat__wing--r`: `clip-path: inset(0 0 0 69%)`, `transform-origin: 69% 62%`.
- `bat__body`: `clip-path: inset(0 29% 0 29%)` (overlaps each wing by about 4 px so no seam).
Static `clip-path` is fine (it is not animated). Wing flap, 3 beats, `rotate` keyframes `0 -> -26deg -> +10deg -> 0` (left; mirrored for right), 90 ms down / 130 ms up / 80 ms settle (period 300 ms, phase offset per bat from `flapDelayMs`), `ease` easeOut/easeInOut, body `translateY 0 -> 3px -> 0` in antiphase with `scaleY 1 -> .96 -> 1` (squash on downstroke). Run flap as CSS keyframes on the wing/body layers (compositor), only while `.bat[data-active]` (existing hook). The seams must be checked at 3x (`detail/bat-*`); the fixer must view the result at 3x and tune the 69% / 62% numbers.
Fallback if the seam looks bad: keep one image and use `scaleX [1, .72, 1.05, 1]` + `scaleY [1, .9, 1.04, 1]` at 3 beats (still better than today's 0.58 height squash), and add ear-wobble with a small rotate on a cloned ear clip (`inset(0 40% 62% 40%)`).
Needs Codex later (priority list in E): `mini-bat/wing-l`, `wing-r`, `body` rig parts (the roster already lists them) for true wing rotation with no clipping artifacts.

**B3 flight** (`bat-flight.ts`, `burstPlan.ts`, `bat-travel.ts`, `bat-to-point.ts`):
- Replace "16 linear samples + sin wobble" with a **tangent-following** keyframe set: rotate = clamp(angle of path tangent * 0.35, -28, 28) + bank from horizontal speed; add a **weave** (sine, 10-14 px amplitude, 2.5 half-waves) perpendicular to the path.
- **Anticipation**: 90 ms crouch before launch (`scaleY .88, scaleX 1.08, y +4`), wings fold (wing rotate +12), then launch with `ease: backOut`-like overshoot to the first sample.
- Per-segment easing (Motion accepts an ease array): ease-out on the first 25%, linear mid, ease-in-out last 20%. Duration 700-1100 ms (burst), 850 ms (travel), raise `bats-burst` `MAX_MS` 950 -> 1200 and the director's burst cap to match (P2 scene cap, still one burst at a time).
- **Depth scale**: `scale` 0.85 -> 1.12 -> 0.9 along the path (bigger at the apex).
- **Landing/settle** (bat.travel to a node or peg): on arrival `scale [1, .9, 1.06, 1]`, wing flutter decays over 240 ms (3 beats at decreasing amplitude), then 140 ms hold, then fade+shrink out. For a burst, last 150 ms fade to opacity 0 with scale .6.
- **Trails**: an `ink-dot` pool of 24 `overlay-mark--ink-dot`-style dots (6, 5, 4, 3 px, gold fill with ink outline on dark; ink fill on cream: choose by `data-theme` of the element under the origin) laid along the same keyframes with delays 45, 90, 135, 180 ms and opacity .55, .4, .25, .12. Count towards a cap of 24 dots; dots reuse the director's `overlay.mark` API (add `overlay.trail(batId, keyframes)`), released with the bats.
- Contrast: the bat is walnut-grey. Keep the mist rim; add a 1 px gold-500 outline ring via a second `drop-shadow` ring (`drop-shadow(0 0 0 var(--gold-500))` is a no-op; use the same four-direction pattern with gold at 1 px, then mist at 1.5 px).
- Reduce Motion: unchanged (ink mark / marker fade).

### C. Mini Ghost, the scroll companion [M] (about 3 h)

**C1 geometry** (`GhostCompanion.tsx`, `ghostPlacement.ts`):
- Size **84 x 100** desktop (placeholder viewBox 100x120), **56 x 68** compact.
- Keep x on the thread (Property 17 holds if x = `model.atY(pageY).x` + offset) but offset the ghost **+44 px to the right of the thread** on desktop (+22 compact) so it sits beside the gold line, "holding it" with a drawn arm/tail loop; the thread's end gets a small nib dot (`r=4`, gold) at the lead point. On compact, keep it at the rail and clamp x to [28, 60].
- **Clamp to the viewport band**: viewport y = clamp(spring(0.60*vh + lean), 0.20*vh, 0.82*vh). Compute `pageY = scrollY + viewportY`, clamp to the thread's [first, last] y, and `x = model.atY(pageY).x + offset`. When the thread's end is above the band (end of page) the ghost parks at the last node and waves (below).
- **Spring with overshoot** on the *viewport offset* rather than on `leadY`: `{ stiffness: 190, damping: 13 }` (zeta ~ 0.47, about 18% overshoot, settles in ~600 ms). `lean = clamp(v * 0.03, -70, 70)` (leans ahead of the scroll direction), so a fast scroll makes it drift ahead, then bounce back when scrolling stops. Never use the 120/22 critically damped spring again.
- **Squash and stretch** with scroll speed: `sy = 1 + clamp(|v|/2600, 0, .2)`, `sx = 1 / sqrt(sy)` (origin 50% 70%), plus tilt toward scroll direction in **both** directions: `rotate = clamp(v * 0.012, -12, 12)`, also on compact (tilt max 6).
- **Wobbling tail** (secondary motion): split the placeholder into head and hem groups at y=70 (two `<g>` with the same body path clipped by `clipPath` rect), hem gets `skewX = clamp(-v * 0.006, -14, 14)` plus `rotate` lag of 80 ms (separate spring `{stiffness: 120, damping: 9}` fed by the same velocity). For real art use the same clip split (see E).
- **Eyes**: pupils (`Eye` highlight circles) translate up to 2.5 viewBox units toward `look = scrollDirection * (0, 1)` blended with the vector to the next node (`measure.nodes[active+1]`); blink via CSS (`scaleY .1` on the eye group, 120 ms, every 3.2-6 s, random negative delays). Writes go to CSS variables `--look-x/--look-y` from the existing `write()` (no React state).
- **Bob**: keep, but 8 px / 2.4 s with a small rotate +-1.5 deg on a different period (3.1 s) so it does not loop obviously.
- **Peek and ledge**: the ghost is under the ledge layer (z 40 vs 45); the nodes' ledges are in the gutter, so when the ghost crosses a node it already passes behind the plank. Make it intentional: at each node (|ghostPageY - node.y| < 28) play `ghost.arrive` (below), and let the ghost hide its lower third behind the ledge for 400 ms by translating y +26 while within 14 px of the node (peek).
- **Arrive/wave**: when `active` changes (a new region is entered) request `ghost.arrive` (P3, once per region per page, cooldown respected): hop `y [0,-14,0,-4,0]` with squash, a 2-beat wave (arm: rotate the right edge clip, or if not available a head tilt `[-12, 10, -6, 0]`), and 3 ink dots popping from the nib. Under `prefers` Reduce Motion: none.
- **Trail**: every 56 px of page travel emit one ink dot (6 px, mist-300 with ink outline) at the ghost's hem, pool of 10, lifetime 900 ms (translate down 18 px + opacity .6 -> 0, positioned in page space and offset by `-scrollY` in the same per-frame writer). Cap at 10, off when |v| < 120 px/s.
- **Reduce Motion**: ghost fixed at the first node at the new size, no bob, no blink, no trail, no tilt, eyes centred (already true for position; extend to the rest).
- Visibility guarantee: the ghost is always >= 60 px tall, fully inside the viewport between scroll positions 0 and the last node.

**C2 art.** The placeholder (mist body, ink outline) is serviceable, so do C1 with it first. **Recommendation: generate real Codex art for the ghost** (`mini-ghost/pose`, then optionally `mini-ghost/eyes-closed` and `mini-ghost/mouth-open`) with `python tools/art/codex_gen.py --id mini-ghost/pose ...` then `cutout.py`/`qa_check.py` per the `generate-mascot-asset` skill. Quota is limited: this is image #1 in the priority list (E, decision 1). The code in C1 must work with both (the clip-split and look-at logic reads rig coordinates from `MASCOT_RIG["mini-ghost"] = { hemY: .62, eyeL: [.38,.4], eyeR: [.62,.38], pivot: [.5,.7] }` in `mascots/rigs.ts`).

### D. Proof animations (task 14.6) [M] (about 3 h)

New effect ids in `animation/effects/ids.ts` `EffectParamsMap` + `EFFECT_IDS` + registry (each with `settle` and `fallback`, per the `add-motion-effect` skill; add unit tests next to the effects and 3 new checks to `motion-check.mjs`, numbered 17-19):

| id | priority / kind | max ms | key | caps |
|---|---|---|---|---|
| `proof.ladder` | P2 scene | 1500 | `proof.ladder:{caseId}` | one scene at a time; re-trigger allowed after finished |
| `proof.hash` | P2 scene | 1400 | `proof.hash:{caseId}` | same |
| `proof.jack` | P2 scene | 1100 | `proof.jack:{caseId}` | same |

Triggering: `useOnceOnEnter(proofRef, { threshold: 0.45 })` per sub-block in `CaseProof` (ladder block, Jack panel, hash row), requested once per case per page via `useEffectTrigger`. Re-trigger on hover/focus: `pointerenter` on `.proof__scroll`, `.jack-panel__jack`, `.proof__hash` (request ignored while the same key is running or within 1.5 s of finishing). Keyboard: add `tabIndex={0}` + `role="group"` is not needed; as **[S]** make Jack's figure a `<button aria-label="Show the other face of the clock claim">` for Enter/Space. The P2 queue timeout (500 ms) is fine: if the replay is mid-scrub (P1) the requests are dropped and the content stays as drawn.

**Armed state, no flash**: `CaseProof` renders `data-proof="armed"` when motion is on and the case's proof has not played; CSS hides the animated parts (`[data-proof="armed"] .ladder__rung { opacity: 0 }`, etc.). The effect removes the attribute at start (it sets each part's start values through `animator.set`) and a 2.5 s fail-safe un-arms in case the director dropped the request. Under Reduce Motion it is never armed.

1. **`proof.ladder`: the Raven unrolls the Evidence Ladder** (`.proof__scroll`, `.proof__rail-top`, rungs `.ladder__rung`, shapes `.ladder__shape`, ranks, `.proof__raven` actor `case:raven-archivist`):
   - t=0: a new bottom roller `.proof__rail-bottom` (a 6 px walnut rod) starts at the top rail and travels `y: 0 -> ladderHeight` over `100 ms * n + 260 ms` (n <= 8 rungs, so <= 1060 ms), ease linear. The rod is the "unrolling" cue; the paper itself is static, so no text is ever scaled.
   - Rungs stamp in **100 ms apart** in ladder order: rung `opacity 0 -> 1`, `x -14 -> 0`, `scaleX .97 -> 1` over 220 ms (easeOut); its `.ladder__shape` pops `scale [.5, 1.18, 1]` (300 ms, existing `stampKeyframes`); its rank number does a 1 deg tilt settle.
   - The current rung (if `current` is set) gets the existing `ladder.rung` stamp as the last beat (re-use `ladderRung` by calling the effect with the same params; do not duplicate).
   - Raven (`raven-archivist`): new pose `unroll`: wing sweep `rotate [-24, 0]` with `backOut` over 320 ms, then a tiny `y -3` hop per rung (synced with each stamp, 5 hops max) and `lookDown`: head `rotate -6` at the end. Origin = feet (pivot).
   - Fallback: rungs visible, rod at rest, 120 ms fade only on the `current` rung's stamp.
2. **`proof.hash`: the Mummy wraps the hash tag** (`.proof__mummy` actor `case:mummy-wrapper`, `.proof__bandage-wrap`, `.proof__bandage-turn` x2, `.proof__bandage-end`, `.proof__tag`):
   - 0-120 ms: Mummy anticipates (`scaleY .94, y +2`), then raises the tag arm (pose `wrap`: rotate `-10 -> 0`, origin at the arm shoulder via a clipped arm layer if available, else body `rotate [0,-6,3,0]`, origin feet).
   - 80-620 ms: the bandage strip unwinds **across the tag**: `.proof__bandage-wrap` `scaleX 0 -> 1` from the mummy's hand (origin left), `ease: [0.2, 0.9, 0.25, 1]`, with a 6 px `y` lift in the middle so it looks airborne, then it settles on the tag's right end.
   - 520-860 ms: the two turns wind on, 140 ms apart: `scaleY [0.2, 1.08, 1]`, `rotate [26deg, ...final]`.
   - 760-1100 ms: loose end flicks `rotate [-18, 8, -3, 0]` (origin at its root, ease out with overshoot).
   - 900-1200 ms: tag acknowledges the seal: `scale [1, 1.03, 1]`, hash value `x [0, 2, -1, 0]`; Mummy takes a small bow (`y [0, 3, 0]`).
   - Fallback: everything shown at rest, 120 ms fade on the strip.
3. **`proof.jack`: Two-Faced Jack flips between faces** (`.jack-panel__jack` actor `case:two-faced-jack`, the faces `.jack-panel__face--browser/--server`, a new `.jack-panel__now` caption pair):
   - 3D-less hinge flip, pivot on the pole (`transform-origin: 50% 100%`): `scaleX [1, .06]` over 170 ms (easeIn), at the hinge swap which face is "lit" (**cross-fade two stacked captions**, `opacity` 1 <-> 0, so no text is rewritten), `scaleX [.06, -1]` over 210 ms (easeOut with 6% overshoot), hold 500 ms showing the **server face** (placeholder Jack mirrored: the X-eye "affected" half and the smile half swap sides, so the mirror is a free second face; with real art, swap `pose-affected` / `pose-fixed` at the hinge), the server half lifts `y -4` and gets a 3 px ink underline (`scaleX 0 -> 1`, 220 ms); flip back `scaleX -1 -> .06 -> 1` the same way and light the browser half (`y -4`, underline). Total <= 1100 ms; **ends at rest (scaleX 1, nothing lifted)**, caption pair reset.
   - Hover/focus re-trigger plays only the flip (600 ms) and reuses the same `key`.
   - Fallback: both faces visible as now, no transform, 120 ms fade on the caption.
4. Tests: unit tests per effect (ends at settle values; fallback ends at settle; key dedupe), a property test that `settle` leaves identity transforms for N <= 8 rungs, and `motion-check` checks "proof.ladder changes >= 6 nodes", "proof.hash changes bandage strip, turns, mummy", "proof.jack scaleX passes through |x| < .2 and ends at 1".

### E. Character animation system [M for 1-4 and 6; S for the rest]

**Today**: `mascots/actors.ts` = 21 whole-element poses, one `animate()` each. **Proposal: a layered system** in `animation/rig/` (all transform/opacity, no per-mascot physics: springs are used as easing curves for one-shot gestures, not simulated bodies. The steering rule "no per-mascot physics" stays true; I flag this so the fixer does not add a physics loop).

**Tokens** in `animation/constants.ts`:
```ts
export const SPRING = {
  soft:   { stiffness: 120, damping: 14 },  // ghost lean, cloth
  bouncy: { stiffness: 260, damping: 11 },  // hops, landings (about 25% overshoot)
  snappy: { stiffness: 420, damping: 30 },  // hover reactions
  settle: { stiffness: 180, damping: 22 },  // gentle returns
} as const;
export const EASE = {
  anticipate: [0.36, 0, 0.66, -0.56],
  overshoot:  [0.34, 1.56, 0.64, 1],
  out:        [0.16, 1, 0.3, 1],
  inOut:      [0.65, 0, 0.35, 1],
} as const;
export const PIVOT = { feet: "50% 100%", belly: "50% 70%", head: "50% 25%", hang: "50% 0%" } as const;
export const POSE_MS = { anticipate: 90, act: 240, settle: 260 } as const;
```
Extend `Channel` with `skewX`, and `AnimOptions` with `spring?` and per-segment `ease` array; keep `finalValues`/`writeStyle` in sync (`skewX(...)`).

**(i) Idle life for every character** (CSS using individual transform properties `translate/rotate/scale` on an inner wrapper so director poses on the root's `transform` never fight them; gated by `html[data-ambient]:not([data-reduce-motion="true"])`, paused when hidden):
- Breathing: `scale: 1 1.018`, origin feet, 3.4-4.4 s per mascot (seeded by id so they never sync).
- Sway: `rotate +-1.2deg`, origin feet, 5-7 s.
- Blink: an **eyelid overlay** `<span class="rig__lid">` positioned from `MASCOT_RIG[id].eyes` (percent box), ink-coloured ellipse, `scaleY 0 -> 1 -> 0` in 110 ms every 3-7 s (randomised via negative delay). Works on real art with no new image (the lid is drawn in `--ink-900`). Skip for mascots with no eyes in view.
- Look-at-pointer: eyes group (placeholder) or pupil overlay (real art, a small dark disc over the eye) follows the pointer with max 2 px offset, desktop only, throttled to rAF (BoardMotion already has a `pointermove` rAF writer for the Wraith: reuse it as `useLookAt(id)` writing `--look-x/--look-y`).
- Cost: ~14 elements with 2 compositor animations each; fine (p95 16.9 ms now).

**(ii) Squash/stretch + anticipation/follow-through on every pose.** Rewrite `POSES` in `mascots/actors.ts` to a phase format:
```ts
type Phase = { to: Keyframe; ms: number; ease?: Ease; spring?: Spring };
POSES.act = { origin: PIVOT.feet, phases: [
  { to: { scaleY: .9, scaleX: 1.07, y: 3 }, ms: 90, ease: EASE.out },        // anticipate
  { to: { scaleY: 1.1, scaleX: .94, y: -18 }, ms: 160, ease: EASE.out },     // launch, stretch
  { to: { scaleY: .94, scaleX: 1.05, y: 0 }, ms: 120, ease: EASE.inOut },    // land, squash
  { to: { scaleY: 1, scaleX: 1, y: 0 }, spring: SPRING.bouncy, ms: 260 },     // settle
]}
```
Same for `wave` (a lean + 3 swings at decaying amplitude, origin feet), `bow` (anticipate up 2 px, bow 7 deg origin hip `50% 75%`, hold 120, rise with overshoot), `peek`, `enter`, `hiss`, `deny`, etc. Amplitude rule: at least 8% of the figure height for hops, 6-10 deg for rotations, with a 2-3% secondary overshoot. Default pivots from the manifest `pivot` (feet) as `transform-origin`.

**(iii) Secondary motion**: `follow` layers with a delay of 60-120 ms, same driver:
- Lantern swing (Wraith): lantern arm layer `rotate` lags the body by 90 ms and overshoots (needs the arm part, see (vi); until then the existing light pool `::before` swings with the glance).
- Cape/hem sway: clip-split the lower 35% of the figure (same technique as the bat wings, `clip-path: inset(62% 0 0 0)`), `skewX +-4 deg` and `scaleY 1 -> .985` with a 100 ms lag behind body x-velocity. Used for the Wraith, Ghost, Warden, Scribe.
- Tail/ear wag: Cauldron Cat tail (clip right 20%), Bat Scout ears.
- All secondary layers are static copies of the same cutout image with `clip-path` (not animated).

**(iv) Signature animations, per mascot** (idle = ambient loop; enter = region reaction; hover = Tier 1/2 reaction; act = Flow/Case action; signature = the one move people remember). All 14:

| Mascot | Idle | Enter | Hover / focus | Act | Signature |
|---|---|---|---|---|---|
| Wraith Director | float 7 px, lantern light sway, blink | glides in from left, then turns to the form, lantern swings with 90 ms lag | tips the hood, lantern swings | gestures with free hand to the next region | **Lantern flare**: light pool scales 1 -> 1.4 -> 1 with a gold ring when he introduces a region |
| Watchtower Warden | slow eye-lamp pulse (opacity .7-1, 2.6 s) | bow with settle | lamp narrows (scaleY .5, 140 ms) "inspects" you | slams the gate sign down (y +6, rock) | **Gate lamp sweep** left-right across the queue |
| Bat Scout | wing flutter at 3 s intervals, ear twitch | swoops in on a short arc | wings flare (rotate +-18) | points a wing at the route | **Scouting loop**: a 360 deg barrel roll of 500 ms |
| Pumpkin Mechanic | breathing, eye flicker | pops up (squash 0.9 -> overshoot) | pulls lever (arm rotate -18, 180 ms) | cranks the lever 3x with gear spin on the eye | **Gear-eye spin** (rotate 360, 600 ms, ease out) |
| Raven Archivist | head cock every 4 s, preen | drops to perch with wing flare | tilts head 12 deg, blink | stamp thump: wing down y +8 with squash | **Stamp thump** + paper knock (existing) |
| Doctor Stitch | spool sways (rotate +-4), eye blink | shuffles in, needle lowered | spool spin shimmy (existing `spin`, larger) | sews: needle arm sweep with thread dots | **Needle sweep** along the diff |
| Gargoyle Gatekeeper | stone breathing (scale 1.01), eyelid half-close | drops onto perch (y -40 -> 0, bouncy) | stern head shake with arms in | stops a visitor: palm out, scaleX .95 | **Stone stare**: eyes narrow then crack-flash |
| Cauldron Cat | ear twitch, tail swish (hem-clip skew), purr scale | peeks over the rim (y 18 -> -3 -> 0) | arches (scaleY 1.1, rotate -6, 140 ms) + hiss | bubbles pop with a tiny hop | **Arch and hiss** big enough to read (10% height) |
| Spider Weaver | gentle dangle, leg tap | drops on silk, bobs 3 times (bouncy) | bounces on the thread (y +14, damped 5 beats) | spins thread: silk scaleY grows | **Silk drop** |
| Mummy Wrapper | slow breathing, bandage end flutter (skew) | wobbles in, unwinds a bandage tail | the loose end snaps (rotate 30 -> 0) | wraps (see `proof.hash`) | **Bandage wrap** |
| Two-Faced Jack | straw sway, head tilt | spins in on the pole | **flip** to the other face (hinge, existing `flip`, bigger, with caption cross-fade) | points to the browser or server half | **Hinge flip** (see `proof.jack`) |
| Skeleton Scribe | hand tap, jaw clack | hand rises (y 28 -> 0) | quick writing scribble (larger, 6 strokes) | writes the underline | **Ink flick** (3 ink dots flick off the nib) |
| Mini Bat | wing flaps when perched (slow), ear twitch | burst/flights (B) | flap burst (3 beats) and ears up | carries a marker to a node (travel) | **Barrel hop** between perches |
| Mini Ghost | bob, blink, eyes follow scroll | arrives with a wave on each region (C) | peeks at the pointer, eyes follow | hovers over the active node | **Squash-stretch companion** with ink trail (C) |

**(v)** Shared easing/spring tokens: see the `SPRING`/`EASE` block above (put in `animation/constants.ts`, use them from `actors.ts`, effects and `GhostCompanion`).

**(vi) New art from Codex vs pure code, in priority order** (one image per request; quota is limited; the Pilot_Pack of Mini Bat, Wraith, Stitch is done):
1. `mini-ghost/pose` (full pose, the most visible character that is still a placeholder).
2. `mummy-wrapper/pose` (fixes the user's complaint at the source).
3. `raven-archivist/pose` (star of the Proof and Closing).
4. `two-faced-jack/pose-affected` + `pose-fixed` (the hinge flip uses both).
5. `wraith-director/arm-lantern` + `wraith-director/body` (without the arm, lantern lag is impossible on a single pose; the roster already lists them). Edit the existing pose with `-i` so the scale matches.
6. `mini-bat/wing-l`, `wing-r`, `body` (true wing rotation; skip if the clip-split looks fine at 3x).
7. `pumpkin-mechanic/pose`, `cauldron-cat/pose`, `spider-weaver/pose`, `gargoyle-gatekeeper/pose` in that order (each is one Tier 2 hover target).
**Pure code, no new art**: breathing, sway, blink lids, look-at, clip-split wings/hem/tail, squash and stretch, anticipation/overshoot, pivot origins, ink trails, hinge flips with mirrored placeholders.

**(vii) Performance and Reduce Motion**: transform/opacity only; `will-change: transform` only on elements that animate continuously (ghost, active bats), removed otherwise; at most 24 concurrently running compositor animations (14 idles + 10 poses) and at most 3 JS-driven per-frame writers (ghost, thread dash, thread nib); `contain: layout paint` on each rig wrapper; idle loops pause with `html[data-ambient="paused"]`; **Reduce Motion**: no idle, no blink, no look-at, no trails, poses settle to rest with at most the 120 ms fade; `data-reduce-motion="true"` CSS gating as today; every new effect keeps `settle` and `fallback`. Sprite-strip/`steps()` stays for any future frame-by-frame art.

### F. Scroll storytelling [S unless noted]

1. **[M] Thread nib and node pulse**: a gold nib dot (r=4) at the drawn tip (a `circle` moved by `transform` in the existing `writeDash` loop), scale 1 -> 1.5 with velocity; when the lead crosses a node, a ring `scale 1 -> 1.7, opacity .6 -> 0` over 500 ms from the node ring (`thread-node__ring` clone, once per node per direction), plus the ghost's `arrive`.
2. **Paper settles in** (region reveal): `.paper-sheet`, `.paper-piece`, `.stamp` use `translate: 0 24px -> 0`, `rotate: tilt+1.2deg -> tilt` over 420 ms easeOut when 25% visible, once per element (individual properties, so seeded tilts are not overwritten); armed pattern like D to avoid flash; skipped when Reduce Motion is on.
3. **Parallax in the hero**: three layers with GSAP ScrollTrigger scrub (no pin): arch `translate-y -0.06*scroll`, clock `-0.12`, Wraith `-0.2` for the first 100vh only; `translate` property so the float animation (`translate`) must move to `transform` or to an inner wrapper to avoid fighting (put parallax on `.hero__stage > *` wrappers).
4. **Lantern embers**: 6 gold specks drifting 40-80 px up around the Wraith's lantern, 5-8 s each, `translate`/`opacity`, ambient only, paused with the page.
5. **Lost Hour**: bigger scatter bats (B1), the ghost peeks out of the clock (`problem__ghost` 117 x 130) with the same eyes logic on the 03:00 jump.
6. **Frame budget**: keep p95 <= 20 ms, longest frame <= 100 ms in the scripted 14 s scroll; no layout reads in scroll handlers except the existing rAF-batched ones.

### G. Acceptance checks for round 2

`node scripts/anim-review.mjs` already implements the first 9 (baseline in `checks.txt`: 9 PASS, 9 FAIL). Fixer: make them all pass, and add the rest to the script (`metrics` hooks are in the INIT recorder; add rows for pupil offsets, skew/scale, trail dots).

Already in the script (thresholds as coded):
1. Ghost viewport-y range >= 120 px over a 14 s scroll, **ghost fully inside the viewport in >= 97% of frames** (baseline 79% desktop / 51% compact).
2. Ghost >= 60 px tall (>= 48 compact). With the plan: 100 and 68.
3. Ghost tilt >= 6 deg in wheel flicks, also on compact (baseline compact 0).
4. Burst bats >= 90 px wide (>= 64 compact): `batBurst.wMin`; click-flight bat `batClick.wMin` the same.
5. Mummy (proof): aspect within 6% of 140:190, no clipping ancestors except body/html.
6. Proof effects change >= 6 watched nodes after entering (baseline 0).
7. Jank: p95 <= 20 ms and max <= 100 ms (baseline p95 16.9).

To add:
8. Ghost squash: during a wheel flick `scaleY` (read from the ghost wrapper matrix) reaches >= 1.08 and the viewport y overshoots its rest by >= 8 px (spring overshoot) then settles within 900 ms.
9. Ghost pupils move: the eye group's translate differs between "scroll down" and "scroll up" by >= 1 px; blink occurs at least once in 8 s (`scaleY` < 0.3 sampled).
10. Ghost on arrival: `ghost.arrive` changes the ghost's `translateY` by >= 8 px when a new region becomes active.
11. Bats: wing layers `rotate` take >= 6 distinct values within 500 ms of activation; body `scaleY` varies; trail dots visible >= 3 at the mid-flight frame; no bat wider than 140 or narrower than 70 px at 1440.
12. Mummy: no stray ink beyond its head clip (SVG `clipPath` present and `getBBox()` of every ink-plate child within [0, 140] x [0, 190]); the tag-value rect does not intersect the mummy rect; Flow sign rect overlaps the head by < 5%; all `.proof__mummy` computed sizes equal 64 x 87 +- 2 (desktop) and 52 x 71 +- 2 (compact).
13. Proof: after 3 s, every `.ladder__rung` has identity transform and opacity 1 (settle); during entry, rung start times are 100 +- 25 ms apart (sampled rAF); `.proof__bandage-wrap` `scaleX` passes through [0.2, 0.8]; Jack's `scaleX` passes |x| < 0.2 and ends at 1; with `tw.reduceMotion="on"` none of these transforms change (opacity <= 150 ms).
14. Pose amplitude: crew roll-call frame-to-frame mean pixel difference inside each figure's rect >= 1.5% for >= 10 of 14 figures (computed from the frame series with Pillow).
15. Idle: at rest for 5 s, at least 8 of 14 visible mascots show a non-identity `scale`/`rotate` change; no mascot's idle exceeds 1.5 deg / 2% scale.
16. Reduce Motion: with `tw.reduceMotion="on"` the whole run records 0 transform changes on mascots, ghost fixed at the first node, thread dash offset = 0.
17. Layout: CLS 0.00 over the scripted scroll and the proof effects (PerformanceObserver `layout-shift`), 0 `longtask` > 100 ms.
18. Existing gates: `pnpm --dir frontend verify` and `motion-check` (16/16 plus the 3 new proof checks).

---

## 5. Order of work for the fixer (about one long session)

1. [M] A (mummy) and B1 (bat sizes + 3x re-cut) first: fast, visible wins.
2. [M] C1 ghost with the placeholder (viewport band, spring, squash, eyes, trail, arrive), then D (three proof effects).
3. [M] E tokens + phase-format poses + pivots + idle life; B2/B3 (wing split flap, flight arcs, trails).
4. [S] F items 1-2 (nib/node pulse, paper settles), then 3-4.
5. Re-run `node scripts/anim-review.mjs --round round2`, compare `checks.txt` and sheets to round 1, write `docs/reports/anim-review/round2/review.md`.

## 6. Decisions needed from the user

1. **Regenerate art with Codex (image quota)?** Recommended, in this order: `mini-ghost/pose`, `mummy-wrapper/pose`, `raven-archivist/pose`, `two-faced-jack/pose-affected` + `pose-fixed` (list in E vi). Round 2 does not depend on it: everything above works with the placeholders and the real art drops in later. The Pilot_Pack rule says stop for approval before the other poses.
2. OK to change the Mini Ghost's look beside the thread (to the right of the line, 84 px, with eyes and trail) and the Mini Bat sizes (104-120 px)? Both are visible design changes to a page whose "hand-inked" look is a hackathon asset.
