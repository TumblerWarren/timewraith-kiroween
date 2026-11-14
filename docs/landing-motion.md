# Violet Midnight landing

The clock cinematic opens at `#/`. Lantern entry, Skip, and Escape open the explanatory home page at `#/home`. Header brand and Home links return to home. Replay opens the clock landing again.

The supplied consolidated mockup is the visual source for the intro, navigation, repository entry, roaming lantern, workflow, evidence examples, time bug list, and footer. The evidence in the walkthrough is illustrative.

The repository field validates GitHub URLs and prefills the existing case form. The user reviews the investigation settings there. The lantern roams the page and moves toward clicks or taps outside controls. The opening headline and kicker are visible from the start. Other text stays dark until the lantern reaches it, then settles at 70% opacity as the lantern moves away. Keyboard focus and reduced motion reveal controls directly. The footer offers pause, reduced motion, and intro replay.

The repository field and error states use [Astryx TextInput](https://astryx.atmeta.com/components/TextInput). Astryx supplies the [Button](https://astryx.atmeta.com/components/Button) and [TabList](https://astryx.atmeta.com/components/TabList) behavior. The submit control adapts [Jitter's Interactive Button Trace](https://jitter.video/template/interactive-button-trace/) with a local SVG path that draws on hover or keyboard focus.

Run these commands from the frontend folder.

```sh
pnpm dev
pnpm verify
node scripts/check-cinematic.mjs
```

The browser check uses locally installed Chrome and captures desktop and mobile previews in `docs/reports/cinematic`. Artwork provenance and animation assets are described in `frontend/src/assets/cinematic/README.md`.
