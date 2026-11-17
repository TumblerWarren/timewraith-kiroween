# Design system: Violet Midnight

This document describes the visual system the frontend uses now. It replaces the parchment and clocktower direction in `TimeWraith_Product_UIUX_Design_Specification.docx`, which is out of date for colour, type and surfaces. The source of truth is the code: `frontend/src/styles/tokens.css`, `fonts.css` and `base.css`.

## Principles

- Dark night ground. Text and interface sit on near-black violet panels. There is no parchment or cream surface.
- Ink-line decoration only. Thin rules and borders are decoration. They never carry text or mark an interactive boundary.
- No effects that hide contrast. Glass blur, glows, neon gradients and blurred shadows are banned by the style guard.
- Motion is optional. Every animation has a Reduce Motion path that shows the final state.

## Colour

Colour literals are allowed only in `frontend/src/styles/tokens.css`. Every other stylesheet uses `var(--token)`.

| Token | Value | Use |
|---|---|---|
| `--night-1000` | `#000000` | Deepest black, the black surface alias |
| `--night-950` | `#06050a` | Page ground (`--bg`) |
| `--night-900` | `#100d17` | Panels |
| `--night-850` | `#191424` | Elevated surfaces |
| `--line-700` | `#382b49` | Rules and subtle panel borders (decoration only) |
| `--ink-50` | `#f4eefb` | Primary text |
| `--ink-300` | `#b9adc8` | Muted text (`--fg-muted`) |
| `--violet-300` | `#c4a0f5` | Accent, links, focus ring |
| `--violet-200` | `#dfcaff` | Bright accent |
| `--mint-300` | `#b3dbbe` | Success |
| `--rose-300` | `#ffbdc8` | Error |
| `--amber-300` | `#f0cf94` | Warning |

Contrast on the night surfaces, from the comment in `tokens.css`:

| Pair | Ratio |
|---|---|
| `ink-50` on `night-950` | 17.86 |
| `ink-300` on `night-950` | 9.55 |
| `violet-300` on `night-950` | 9.38 |
| `night-900` on `violet-300` | 8.88 |
| `mint-300` on `night-950` | 13.34 |
| `rose-300` on `night-950` | 12.93 |
| `amber-300` on `night-950` | 13.60 |

`line-700` on `night-950` is 1.56. It is decoration only.

`src/styles/__tests__/contrast-pairs.ts` lists every pair with its role (text, boundary or decoration) and size. `contrast.test.ts` checks the table against the real values in `tokens.css`. Text needs 4.5:1, large text 3:1, and components 3:1.

Semantic aliases (`--midnight-*`) map these to roles, such as `--midnight-panel`, `--midnight-muted` and `--midnight-violet`. Use the alias in new components.

## Typography

| Role | Face | Where |
|---|---|---|
| Display headings | Barlow Condensed, 800 italic (self-hosted) | `h1` and `h2` by default |
| Body, UI, sub-headings | IM Fell English, 400 roman and italic (self-hosted) | Body copy, buttons, `h3` and `h4`, the Home hero heading |
| Code, timestamps, evidence values | JetBrains Mono (variable, self-hosted) | `--font-mono` |

Fallbacks are local system fonts scaled to match the web font width, so the swap moves text as little as possible. `base.css` sets `font-synthesis: none` on body and headings, so the browser does not fake an italic or a bold.

Sizes (`tokens.css`):

| Token | Size | Use |
|---|---|---|
| `--text-xs` | 11 px | Mono labels, badges, footer |
| `--text-sm` | 13 px | Navigation, buttons, meta, captions |
| `--text-base` | 15 px | Body copy |
| `--text-lg` | 18 px | Lead copy |
| `--text-xl` | 22 px | Panel and card titles |
| `--text-h2` | 36 to 60 px, fluid | Section headings |
| `--text-display` | 54 to 94 px, fluid | Hero headings |

Line heights: display 0.88, tight 0.95, snug 1.3, body 1.65. The body measure token (`--measure`) is 62 characters.

## Layout and spacing

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96 and 128 px (`--space-1` to `--space-10`).
- Content width: `.midnight-wrap` caps at 1510 px. Side gutters are `clamp(20px, 5.3vw, 82px)`.
- Top bar height: 76 px. Interactive targets are at least 44 px.
- Corners: 3 px (`--radius`).
- Stacking order: thread 10, content 20, overlay 40, ledge 45, node 46, nav 50, skip link 60.

## Layout of the site

- `#/` shows the clock landing. The lantern and clock intro play, and Skip or the lantern enters the Home page. The top bar is hidden on this page.
- `#/home` is the Home page. It has the hero with the repository field, the workflow tabs, the list of time bugs, and a footer.
- The other pages (`#/new`, `#/cases`, `#/cases/:id`, `#/crew`, `#/about`) share the top bar and the footer. The footer holds the sound toggle, the Reduce Motion toggle and the replay link.

## Motion

| Token | Value | Use |
|---|---|---|
| `--ease-snap` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entrances and reveals |
| `--ease-ink` | `cubic-bezier(0.4, 0, 0.2, 1)` | Ink-style fades and state changes |
| `--reduced-fade` | 120 ms | The only fade allowed under Reduce Motion |

Reduce Motion (`a11y/ReduceMotionProvider.tsx`):

- The first value is the stored choice in `localStorage["tw.reduceMotion"]`. If no choice is stored, the `prefers-reduced-motion: reduce` setting is used.
- The choice is written to `html[data-reduce-motion]`, and Motion's `reducedMotion` setting follows it. The site toggle overrides the operating system in both directions.
- The clock intro shows its final frame at once, and the Home page lantern stays still. See [landing-motion.md](landing-motion.md).

Sound (`audio/soundEffects.ts`) is procedural Web Audio. It starts on, and the footer toggle turns it off. The setting is kept in memory only, so a reload starts with sound on.

## Shape and component rules

The `pnpm --dir frontend guard:style` script (`scripts/check-style-guard.mjs`) scans every `.css` and `.tsx` file under `frontend/src`. It fails on these rules:

| Rule | Meaning |
|---|---|
| `backdrop-filter` | Glass blur is banned |
| `blurred-box-shadow` | Shadows with a blur radius are banned |
| `text-shadow-glow` | Glowing text is banned |
| `drop-shadow-blur` | Blurred drop shadows are banned |
| `radial-conic-gradient` | Radial and conic gradients are banned |
| `purple-cyan-gradient` | Purple, magenta, cyan and neon gradients are banned |
| `stray-color-literal` | Colour literals outside `tokens.css` are banned |
| `pumpkin-600-text` | Pumpkin-600 as text is banned unless marked `allow-pumpkin-large` |
| `nested-rounded-card` | A rounded card inside another rounded card is banned |
| `uppercase-label` | `text-transform: uppercase` is banned unless marked `allow-uppercase` |

Uppercase is avoided: labels use sentence case.

## Artwork

The cinematic artwork is in `frontend/src/assets/cinematic/`: the clock dial and hands, the lantern wraith, the spider parts and the spider web. `frontend/src/assets/cinematic/README.md` lists each file and its source. The Barlow Condensed licence is in `OFL.txt`.

## Checks

```sh
pnpm --dir frontend guard:style
pnpm --dir frontend test:run    # includes the contrast property test
node frontend/scripts/check-cinematic.mjs
```

`pnpm --dir frontend verify` runs the style guard, the tests and the build together. The cinematic check opens the landing in a local Chrome at 1440 and 390 px and writes previews to `docs/reports/cinematic`.
