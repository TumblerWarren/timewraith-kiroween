# Landing and home motion

The site has two entry pages with motion. Both follow the visual rules in [design-system.md](design-system.md).

## The midnight intro (`#/`)

The intro is a timed clock sequence built with GSAP. The clock hands turn, the midnight bell strikes, and the lantern wraith appears. The top bar and footer are hidden on this page.

- The lantern button ("Touch the lantern to enter TimeWraith") is enabled once the intro is ready. Activating it opens `#/home`.
- The "Skip intro" button also opens `#/home`.
- A "Sound on / Sound off" button sits beside Skip. It is the same sound setting as the other pages.
- The Home page footer has a "Replay the midnight intro" link that returns to `#/`.
- Pressing Escape does nothing. Only the two buttons above leave the intro.
- The intro pauses while the page is hidden (`document.hidden`).
- With Reduce Motion on, the clock and the lantern invitation appear at once, and the lantern button is enabled without the timed sequence.

## The home page (`#/home`)

The home page is the explanatory entry point. It has a lantern that moves across the page and text that appears as the lantern passes over it.

### Lantern and reveal

- The lantern (`LanternWraith.tsx`) moves over the page and stops for visible controls. It is driven by `requestAnimationFrame` and pauses while the page is hidden.
- Elements marked `data-lantern-reveal` start dim. Their opacity follows how close the lantern is. Once the lantern has passed over an element, it stays fully visible.
- Keyboard focus shows an element at once (`:focus-within`).
- With Reduce Motion on, the lantern is still, and the reveal is off. Everything is shown directly.
- The footer's "Pause ghost" button stops the lantern. It is disabled under Reduce Motion.

### Repository field

The hero has a "Repository URL" field. It uses Astryx `TextInput` and `Button`. On submit:

1. A value starting with `github.com/` gets `https://` added.
2. `validateField("repoUrl")` checks the value. An invalid value shows an error message and moves focus to the field.
3. A valid value opens `#/new?repo=<url>`, where the New case form is pre-filled. The investigation settings are reviewed there before a case starts.

The submit button draws an outline on hover or focus. The outline is a local SVG `rect` that CSS animates with `pathLength` (`.midnight-trace` in `midnight-home.css`). It uses no third-party code. The button's look follows Jitter's Interactive Button Trace template, which the project credits as its reference.

### Footer controls

The home page footer has four controls: sound on or off, Pause ghost, Reduce motion, and Replay the midnight intro.

## Checks

Run these from the `frontend` folder:

```sh
pnpm dev
pnpm verify
node scripts/check-cinematic.mjs
```

`check-cinematic.mjs` opens the intro in local Chrome at 1440 and 390 px, checks that the minute hand moves, and writes previews to `docs/reports/cinematic`. Artwork sources are in `frontend/src/assets/cinematic/README.md`.
