# Violet Midnight animation assets

Visual source: the user's `TimeWraith-consolidated-mockup.zip`, supplied November 12, 2026. The clock and ghost are extracted from its original landing page, not replacements generated from a new prompt.

- `clock-face.webp`: optimized painted clock plate (309,592 bytes, down from 1,803,472).
- `clock-hour.webp`, `clock-minute.webp`, `clock-hub.webp`: lossless transparent moving parts. Original PNG masters are retained alongside them.
- `midnight-clock.svg`: reusable SVG assembly with independent `hourHand` and `minuteHand` groups. Keep the four WebP files beside it. The artwork is raster; the SVG supplies independently animated joints, not a vector trace.
- `lantern-wraith.svg`: the editable vector redraw used in the intro and on Home. The cloak, eyes, hand, lantern and flame have separate groups or IDs.
- `lantern-wraith.jpg`: the original 725 × 559 ghost artwork used as reference.
- `barlow-condensed-800-italic.ttf`: the reference's condensed italic display typeface, self-hosted. See `OFL.txt` for its SIL Open Font License.

Runtime components: `MidnightClock.tsx`, `LanternWraith.tsx`, and `animation/react/MidnightIntro.tsx`. The swarm uses the reference's bat silhouette with seeded perspective flight on a single canvas, avoiding hundreds of per-frame DOM updates.

## Timing

0.55s clock fades in; 2.6–4.7s hands reach midnight; 4.8–8.4s bats rush forward; 8.4–9s black hold; 9–11.6s ghost arrives; 11.6s lantern is interactive. Clicking the lantern enters the real app's home, without creating a case. Skip and Escape bypass the sequence. Replay is available on home. The clock landing lives at `#/`; entry opens the home page at `#/home`. Reduced motion presents the static lantern immediately. The sequence pauses in hidden tabs; ambient light/float stop when hidden or offscreen.

## UI and motion sources

Astryx Core supplies the landing's TextInput, Button, and TabList. The repository button's SVG outline adapts Jitter's [Interactive Button Trace](https://jitter.video/template/interactive-button-trace/). The original mockup supplies the composition, artwork, workflow copy, and ghost route. The existing GSAP runtime sequences the cinematic.

Barlow Condensed and the artwork are served locally.
