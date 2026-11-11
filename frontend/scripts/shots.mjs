#!/usr/bin/env node
/**
 * One-shot screenshot capture of the built site (frontend/dist).
 *
 *   pnpm --dir frontend shots              -> build, then capture into docs/reports/shots/
 *   node scripts/shots.mjs --out before    -> capture into docs/reports/shots/before/ (no build)
 *
 * Serves dist/ with a tiny built-in static server on a free port, drives the locally installed Chrome
 * (channel "chrome", no browser download), forces Reduce Motion on through localStorage so the captures are
 * deterministic, and writes full-page shots plus one viewport shot per `section[id]` at 1440x900 and 390x844.
 * Prints whether the page overflows horizontally at each width. Closes the browser and server, then exits.
 */
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..", "..");
// --dist <dir> (relative to frontend/) lets parallel work build into separate folders, e.g. dist-b1.
const distArg = process.argv.indexOf("--dist");
const distDir = resolve(here, "..", distArg > -1 ? (process.argv[distArg + 1] ?? "dist") : "dist");

const outArg = process.argv.indexOf("--out");
const subdir = outArg > -1 ? process.argv[outArg + 1] ?? "" : "";
const outDir = resolve(repoRoot, "docs", "reports", "shots", subdir);

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function serve(root) {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = normalize(join(root, urlPath));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function main() {
  if (!existsSync(join(distDir, "index.html"))) {
    console.error(`shots: ${distDir} has no index.html; run the build first.`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });

  const server = await serve(distDir);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ channel: "chrome" });
  const files = [];
  const overflow = [];

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      await context.addInitScript(() => {
        try {
          window.localStorage.setItem("tw.reduceMotion", "on");
        } catch {
          /* storage blocked: the OS setting decides */
        }
      });
      const page = await context.newPage();
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      // Walk down the board once so every loading="lazy" image has loaded before the full-page capture.
      await page.evaluate(async () => {
        const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo({ top: y, behavior: "instant" });
          await new Promise((ok) => setTimeout(ok, 150));
        }
        window.scrollTo(0, 0);
        await Promise.all(
          Array.from(document.images, (img) => (img.complete ? null : new Promise((ok) => img.addEventListener("load", ok, { once: true })))),
        );
      });

      const w = viewport.width;
      const full = `full-${w}.png`;
      await page.screenshot({ path: join(outDir, full), fullPage: true });
      files.push(full);

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      overflow.push({ width: w, ...metrics, overflows: metrics.scrollWidth > metrics.clientWidth });

      const ids = await page.$$eval("section[id]", (els) => els.map((el) => el.id));
      for (const id of ids) {
        await page.evaluate((sectionId) => {
          document.getElementById(sectionId)?.scrollIntoView({ block: "start", behavior: "instant" });
        }, id);
        await page.waitForTimeout(150);
        const name = `${id}-${w}.png`;
        await page.screenshot({ path: join(outDir, name) });
        files.push(name);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }

  console.log(`shots: wrote ${files.length} files to ${outDir}`);
  for (const f of files) console.log(`  ${f}`);
  for (const o of overflow) {
    console.log(
      `overflow @${o.width}: ${o.overflows ? "YES" : "no"} (scrollWidth ${o.scrollWidth}, clientWidth ${o.clientWidth})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
