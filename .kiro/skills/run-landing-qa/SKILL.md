---
name: run-landing-qa
description: Run the TimeWraith Case Board quality gate (the skill keeps its old landing-page name for history). Build the board, run unit and property tests, run Lighthouse CI (lhci autorun) on the build output, capture Playwright screenshots of the seven regions (open, lost-hour, library, case, crew, flow, close) at 1440 and 390 px in Reduce Motion mode, compare scores to the thresholds table, and write docs/reports/summary.md. Use for QA, performance, accessibility, CLS, screenshot, Lighthouse or pre-release checks of the Case Board.
metadata:
  project: timewraith
---
# Run Case Board QA

Run from the repo root. Do not start dev servers or watchers; ask the user to run `pnpm --dir frontend dev` if a live page is needed.

1. Run `pnpm --dir frontend verify` (typecheck, lint, guard:style, test:run, build). Stop and fix any failure before continuing.
2. Run `pnpm --dir frontend lh` (`lhci autorun` on `frontend/dist`, desktop preset, 3 runs, median). Reports go to `docs/reports/lighthouse/`. If Lighthouse finds no Chrome binary, set `CHROME_PATH` to the Playwright Chromium and record that in the summary.
3. Run `pnpm --dir frontend shots` (optionally `-- --out <folder>`): Playwright in Reduce Motion mode saves a full-board shot and one viewport shot per region (`section[id]`: open, lost-hour, library, case, crew, flow, close) at 1440 and 390 px to `docs/reports/shots/`, and prints whether the board overflows horizontally. Baselines are machine-local, not a CI gate.
4. Run `pnpm --dir frontend e2e` for the route, keyboard (header nav, Open-a-case form, Case library selection, scrubber), no horizontal scroll (360/768/1024/1440/1920), CLS across a full scroll, no network request on draft submit, and axe checks.
5. Open the screenshots and look for visible layout defects (overflow, clipped text, overlapping labels, dark figures sinking into tower-950 or walnut-700, missing sample or draft labels). Fix them, then repeat from step 1.
6. Write `docs/reports/summary.md`: date, one row per metric with measured value, threshold and pass or fail, links to the report and screenshot files, and any item that failed or was skipped with the reason.

## Thresholds (design table "Thresholds Confirmed or Adjusted")
| Metric | Threshold | Gate |
|---|---|---|
| Lighthouse accessibility | >= 95 | error, desktop, median of 3 |
| Lighthouse performance | >= 80 | error, desktop, median of 3 (mobile is informational, warn below 60) |
| CLS | <= 0.1 (target <= 0.02 in the Playwright scroll observer) | error |
| First contentful paint | <= 1800 ms | warn |
| Largest contentful paint | <= 2500 ms | warn |
| Single asset size | <= 300 KB (warn above 150 KB for parts) | hard fail in the cutout script |
| Initial JS | <= 200 KB gzip | target |
| Frame rate | >= 50 fps | local `pnpm perf:fps` warns, not a gate |

Report what was measured. If a tool could not run, write "not run" and the reason; do not fill in estimated numbers.
