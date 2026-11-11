#!/usr/bin/env node
/**
 * Captures the Case view's Version_Timeline and the sheet around it for both sample cases (Reduce Motion on),
 * at 1440 and 390 px, into docs/reports/shots/case-timeline/. Run after a build:
 *   node scripts/timeline-shots.mjs
 */
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = resolve(here, "..", "dist");
const out = resolve(here, "..", "..", "docs", "reports", "shots", "case-timeline");
mkdirSync(out, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".json": "application/json" };
const server = createServer((req, res) => {
  let file = normalize(join(dist, decodeURIComponent((req.url ?? "/").split("?")[0])));
  if (!file.startsWith(dist + sep) && file !== dist) return res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("tw.reduceMotion", "on"));
    const page = await context.newPage();
    for (const [id, name] of [["fullcalendar-7998", "fc"], ["calcom-30021", "cal"]]) {
      await page.goto(base, { waitUntil: "load" });
      await page.waitForTimeout(800);
      await page.locator(`li[data-case-id="${id}"]`).getByRole("button", { name: /^Open case/ }).click();
      await page.waitForSelector(`[data-case="${id}"] .vtl`);
      await page.waitForTimeout(600);
      const sheet = page.locator(`[data-case="${id}"] .case-file`);
      const slider = page.locator(`[data-case="${id}"] .scrubber__slider`);
      const stops = name === "cal" ? [["start", "Home"], ["e11", 10], ["end", "End"]] : [["start", "Home"], ["end", "End"]];
      for (const [label, key] of stops) {
        await slider.focus();
        if (typeof key === "number") {
          await page.keyboard.press("Home");
          for (let i = 0; i < key; i++) await page.keyboard.press("ArrowRight");
        } else await page.keyboard.press(key);
        await page.waitForTimeout(300);
        await page.locator(`[data-case="${id}"] .vtl`).screenshot({ path: join(out, `timeline-${name}-${label}-${width}.png`) });
      }
      await page.locator(`[data-case="${id}"] .vtl`).scrollIntoViewIfNeeded();
      await sheet.screenshot({ path: join(out, `sheet-${name}-end-${width}.png`) });
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`timeline-shots: written to ${out}`);
