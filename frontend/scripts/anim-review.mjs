#!/usr/bin/env node
/**
 * Animation review capture (round 1 of the animation review; kept for round 2).
 *
 *   node scripts/anim-review.mjs [--round round1] [--dist dist] [--only a,b,c]
 *
 * Serves frontend/dist, drives local Chrome with motion ON (localStorage tw.reduceMotion = "off",
 * reducedMotion: "no-preference") at 1440x900 and 390x844, and writes into docs/reports/anim-review/<round>/:
 *   sheets/<moment>-<vp>.jpg   contact sheets of frames (label = ms since the moment started)
 *   detail/*.png               3x close-ups (mummy at each place, ghost, bat, jack, ladder, hash tag)
 *   metrics.json               every number the review quotes (ghost track, bat sizes, mummy boxes, proof transforms, jank)
 *   checks.txt                 PASS/FAIL of the round-2 acceptance criteria (section "Acceptance" of review.md)
 * Frames are written to a temp folder and deleted after stitching (stitching: scripts/anim-sheet.py, Pillow).
 * Moments: hero, scroll(+ghost), bats(burst/click/node), lostHour, crew, flow, case(scrub/fix), proof, detail, jank.
 */
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..", "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? (process.argv[i + 1] ?? dflt) : dflt;
};
const distDir = resolve(here, "..", arg("--dist", "dist"));
const round = arg("--round", "round1");
const only = arg("--only", "") ? arg("--only", "").split(",") : null;
const outDir = resolve(repoRoot, "docs", "reports", "anim-review", round);
const sheetsDir = join(outDir, "sheets");
const detailDir = join(outDir, "detail");
const tmpDir = join(outDir, "_frames");
const SHEET_PY = join(here, "anim-sheet.py");

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json", ".ico": "image/x-icon" };

function serve(root) {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = normalize(join(root, urlPath));
    if (!file.startsWith(root + sep) && file !== root) return void res.writeHead(403).end();
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const metrics = {};
if (process.argv.includes("--only") && existsSync(resolve(repoRoot, "docs", "reports", "anim-review", arg("--round", "round1"), "metrics.json"))) Object.assign(metrics, JSON.parse(readFileSync(resolve(repoRoot, "docs", "reports", "anim-review", arg("--round", "round1"), "metrics.json"), "utf8")));
const checks = [];
const check = (name, pass, detail) => {
  checks.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  console.log(checks[checks.length - 1]);
};
const want = (key) => !only || only.includes(key);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(3, "0");

/** Runs in every page from the first frame: a per-frame recorder for the ghost, the bats, the wraith and frame times. */
const INIT = `
try { localStorage.setItem("tw.reduceMotion", "off"); } catch {}
window.__rec = { on: false, t0: 0, rows: [] };
(() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const q = (n) => Math.round(n * 10) / 10; return [q(r.x), q(r.y), q(r.width), q(r.height)]; };
  const ang = (el) => { if (!el) return null; const t = getComputedStyle(el).transform; if (!t || t === "none") return 0; const m = new DOMMatrixReadOnly(t); return Math.round(Math.atan2(m.b, m.a) * 1800 / Math.PI) / 10; };
  let last = performance.now();
  const tick = (now) => {
    const dt = now - last; last = now;
    const rec = window.__rec;
    if (rec.on) {
      const g = document.querySelector("[data-ghost]");
      const bats = Array.from(document.querySelectorAll(".bat[data-active]")).map((b) => ({ r: R(b.querySelector("img,svg")), op: Number(getComputedStyle(b).opacity) }));
      const hand = document.getElementById("hero-clock-hand-minute");
      rec.rows.push({
        t: Math.round(now - rec.t0), dt: Math.round(dt * 10) / 10, sy: Math.round(scrollY),
        g: g ? R(g.querySelector("img,svg")) : null, gtilt: g ? ang(g.querySelector(".ghost__tilt")) : null,
        gop: g ? Number(getComputedStyle(g).opacity) : null, hand: hand ? ang(hand) : null, bats,
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
window.__smoothScroll = (to, ms) => new Promise((done) => {
  const from = scrollY, t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    window.scrollTo({ top: from + (to - from) * e, behavior: "instant" });
    if (k < 1) requestAnimationFrame(step); else done();
  };
  requestAnimationFrame(step);
});
`;

const recStart = (page) => page.evaluate(() => { window.__rec.rows = []; window.__rec.t0 = performance.now(); window.__rec.on = true; });
const recStop = (page) => page.evaluate(() => { window.__rec.on = false; return window.__rec.rows; });

/** Takes `n` jpeg frames every `every` ms (minus the screenshot cost) while `trigger` runs; returns files. */
async function frames(page, key, { n, every, clip, trigger }) {
  const dir = join(tmpDir, key);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const run = trigger ? trigger() : Promise.resolve();
  const files = [];
  for (let i = 0; i < n; i++) {
    const t = Date.now() - t0;
    const file = join(dir, `${pad(i)}-${t}ms.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 82, ...(clip ? { clip } : {}) });
    files.push(file);
    const wait = every - (Date.now() - t0 - t);
    if (wait > 0) await sleep(wait);
  }
  await run;
  return files;
}

function sheet(key, files, { cols, max, cellW }) {
  mkdirSync(sheetsDir, { recursive: true });
  let pick = files;
  if (files.length > max) pick = Array.from({ length: max }, (_, i) => files[Math.round((i * (files.length - 1)) / (max - 1))]);
  const out = join(sheetsDir, `${key}.jpg`);
  const png = out.replace(/\.jpg$/, ".png");
  execFileSync("python", [SHEET_PY, png, String(cols), String(max), String(cellW), ...pick], { stdio: "inherit" });
  // convert to jpg to keep the folder small
  execFileSync("python", ["-c", `from PIL import Image; im=Image.open(r"${png}"); im.save(r"${out}", quality=85); import os; os.remove(r"${png}")`]);
  return out;
}

const clipAround = (rect, vp, w, h, dx = 0, dy = 0) => {
  const cx = rect.x + rect.width / 2 + dx, cy = rect.y + rect.height / 2 + dy;
  const x = Math.max(0, Math.min(vp.width - w, Math.round(cx - w / 2)));
  const y = Math.max(0, Math.min(vp.height - h, Math.round(cy - h / 2)));
  return { x, y, width: Math.min(w, vp.width), height: Math.min(h, vp.height) };
};
const rectOf = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, sel);
const scrollTop = (page, y) => page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
const scrollToEl = (page, sel, frac = 0.3) =>
  page.evaluate(([s, f]) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); window.scrollTo({ top: Math.max(0, r.top + scrollY - innerHeight * f), behavior: "instant" }); return true; }, [sel, frac]);

async function fresh(browser, vp, base, extra = {}) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: extra.dsf ?? 1, reducedMotion: "no-preference", isMobile: false });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("pageerror", String(e)));
  await page.goto(base, { waitUntil: "commit" });
  return { context, page };
}

/** Opens the first case on the shelf, if any. The board ships no bundled cases, so an empty shelf leaves the empty sheet. */
async function openCal(page) {
  await scrollToEl(page, "#library", 0.1);
  await sleep(500);
  const btn = page.locator("ol.library__cards li").first().getByRole("button", { name: /^Open case/ });
  if ((await btn.count()) === 0) return;
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await sleep(1400);
}

const summarize = (rows) => {
  const g = rows.filter((r) => r.g);
  if (!g.length) return { frames: 0 };
  const w = g.map((r) => r.g[2]), h = g.map((r) => r.g[3]);
  const vx = g.map((r) => r.g[0]), vy = g.map((r) => r.g[1]);
  const py = g.map((r) => r.g[1] + r.sy); // page y of the ghost's top
  const range = (a) => Math.round((Math.max(...a) - Math.min(...a)) * 10) / 10;
  const tilts = g.map((r) => r.gtilt ?? 0);
  const inView = g.filter((r) => r.g[0] >= 0 && r.g[0] + r.g[2] <= innerW && r.g[1] >= 0).length;
  return {
    frames: g.length, ghostW: Math.round(Math.min(...w)), ghostH: Math.round(Math.min(...h)),
    viewportXRange: range(vx), viewportYRange: range(vy), pageYTravel: range(py), pageYTravelPxTotal: Math.round(Math.max(...py) - Math.min(...py)),
    tiltMin: Math.min(...tilts), tiltMax: Math.max(...tilts), minX: Math.round(Math.min(...vx)), maxX: Math.round(Math.max(...vx)),
    viewportYMin: Math.round(Math.min(...vy)), viewportYMax: Math.round(Math.max(...vy)), fullyInViewFrames: inView, opacityMin: Math.min(...g.map((r) => r.gop ?? 1)),
  };
};
let innerW = 1440;

const jank = (rows) => {
  const dts = rows.map((r) => r.dt).filter((d) => d > 0 && d < 1000).sort((a, b) => a - b);
  if (!dts.length) return null;
  const q = (p) => dts[Math.min(dts.length - 1, Math.floor(p * dts.length))];
  return { frames: dts.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: dts[dts.length - 1], over50: dts.filter((d) => d > 50).length };
};

async function momentsFor(browser, vp, base) {
  const tag = vp.name;
  const m = (metrics[tag] ??= {});
  innerW = vp.width;
  const clipVp = { x: 0, y: 0, width: vp.width, height: vp.height };

  // ---------------------------------------------------------------- a. hero load
  if (want("hero")) {
    const { context, page } = await fresh(browser, vp, base);
    await recStart(page);
    const files = await frames(page, `hero-${tag}`, { n: 14, every: 110, clip: clipVp });
    sheet(`a-hero-${tag}`, files, { cols: 5, max: 14, cellW: vp.width === 1440 ? 440 : 230 });
    const rows = await recStop(page);
    const hands = rows.filter((r) => r.hand !== null).map((r) => r.hand);
    m.hero = { handDistinctAngles: new Set(hands).size, handFirst: hands[0], handLast: hands[hands.length - 1] };
    await context.close();
  }

  // ---------------------------------------------------------------- b. scroll + ghost
  if (want("scroll") || want("jank")) {
    const { context, page } = await fresh(browser, vp, base);
    await page.waitForSelector('[data-thread-mode="scroll"]', { timeout: 6000 }).catch(() => {});
    await sleep(2800);
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    m.pageHeight = max + vp.height;
    // b1: no screenshots -> clean frame timing and the ghost track over a 14 s scripted scroll
    await recStart(page);
    await page.evaluate((to) => window.__smoothScroll(to, 14000), max);
    const rows = await recStop(page);
    m.ghostScroll = summarize(rows);
    m.jankScroll = jank(rows);
    // ghost track samples every ~1 s for the report
    m.ghostTrack = rows.filter((_, i) => i % 60 === 0 && rows[i].g).map((r) => ({ t: r.t, sy: r.sy, x: r.g[0], y: r.g[1], w: r.g[2], h: r.g[3], tilt: r.gtilt }));
    // b2: wheel bursts like a real user: 4 flicks, stop, 4 flicks (tilt and settle)
    await scrollTop(page, 0);
    await sleep(1500);
    await recStart(page);
    for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, 320); await sleep(60); }
    await sleep(1200);
    for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, 320); await sleep(60); }
    await sleep(1500);
    const wheelRows = await recStop(page);
    m.ghostWheel = summarize(wheelRows);
    // b3: screenshots while scrolling (what the user sees); frames every 150 ms
    await scrollTop(page, 0);
    await sleep(1200);
    if (want("scroll")) {
      const files = await frames(page, `scroll-${tag}`, { n: 60, every: 150, clip: clipVp, trigger: () => page.evaluate((to) => window.__smoothScroll(to, 9000), max) });
      sheet(`b-scroll-${tag}`, files, { cols: 6, max: 18, cellW: vp.width === 1440 ? 300 : 190 });
      // ghost close-up while scrolling: clip around the ghost
      await scrollTop(page, 1200);
      await sleep(1500);
      const gr = await rectOf(page, "[data-ghost] img, [data-ghost] svg");
      if (gr) {
        const clip = clipAround(gr, vp, 300, 300);
        const f2 = await frames(page, `ghostclose-${tag}`, {
          n: 20, every: 80, clip,
          trigger: async () => { for (let k = 0; k < 5; k++) { await page.mouse.wheel(0, 260); await sleep(70); } },
        });
        sheet(`b2-ghost-closeup-${tag}`, f2, { cols: 5, max: 20, cellW: 240 });
      }
    }
    // ghost / overlay stacking facts
    m.ghostDom = await page.evaluate(() => {
      const g = document.querySelector("[data-ghost]");
      const art = g?.querySelector("img,svg");
      const ov = document.querySelector(".overlay-layer");
      const cs = g ? getComputedStyle(g) : null;
      const r = art?.getBoundingClientRect();
      const top = r ? document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2).slice(0, 4).map((e) => e.tagName + "." + String(e.className?.baseVal ?? e.className).slice(0, 40)) : [];
      return {
        exists: Boolean(g), artTag: art?.tagName, artData: art?.getAttribute("data-art"), width: art?.getAttribute("width"), z: ov ? getComputedStyle(ov).zIndex : null,
        overlayOverflow: ov ? getComputedStyle(ov).overflow : null, opacity: cs?.opacity, visibility: cs?.visibility, bobAnimation: g ? getComputedStyle(g.querySelector(".ghost__bob")).animationName : null,
        bobRange: g ? getComputedStyle(g.querySelector(".ghost__bob")).translate : null, rect: r ? [r.x, r.y, r.width, r.height] : null, topAtCenter: top,
      };
    });
    if (want("jank")) {
      // 3 further runs for stability
      const longest = [];
      for (let k = 0; k < 2; k++) {
        await scrollTop(page, 0); await sleep(1000);
        await recStart(page);
        await page.evaluate((to) => window.__smoothScroll(to, 8000), max);
        longest.push(jank(await recStop(page)));
      }
      m.jankRuns = longest;
    }
    await context.close();
  }

  // ---------------------------------------------------------------- c. bats
  if (want("bats")) {
    const { context, page } = await fresh(browser, vp, base);
    await sleep(3500);
    const batStats = (rows) => {
      const all = rows.flatMap((r) => r.bats.filter((b) => b.r && b.op > 0.2));
      if (!all.length) return { samples: 0 };
      const w = all.map((b) => b.r[2]), h = all.map((b) => b.r[3]);
      return { samples: all.length, maxConcurrent: Math.max(...rows.map((r) => r.bats.length)), wMin: Math.round(Math.min(...w)), wMax: Math.round(Math.max(...w)), hMin: Math.round(Math.min(...h)), hMax: Math.round(Math.max(...h)), peakOpacity: Math.max(...all.map((b) => b.op)) };
    };
    // submit burst
    await page.getByRole("radio", { name: "Local app" }).check().catch(() => {});
    await page.getByLabel("Local app URL", { exact: false }).fill("http://localhost:4321").catch(() => {});
    await page.getByRole("radio", { name: /^Open hunt/ }).check().catch(() => {});
    await page.evaluate(() => document.activeElement?.blur());
    const btn = page.getByRole("button", { name: "Open the case" });
    await btn.scrollIntoViewIfNeeded();
    await sleep(600);
    const br = await btn.boundingBox();
    const clip = clipAround(br, vp, Math.min(vp.width, 760), Math.min(vp.height, 560), 0, -170);
    await recStart(page);
    const files = await frames(page, `burst-${tag}`, { n: 18, every: 60, clip, trigger: () => btn.click() });
    m.batBurst = batStats(await recStop(page));
    sheet(`c1-burst-${tag}`, files, { cols: 6, max: 18, cellW: vp.width === 1440 ? 300 : 230 });
    await sleep(1500);

    // background click flight
    await scrollTop(page, 0);
    await sleep(1500);
    const spot = await page.evaluate(() => {
      for (let y = 220; y < innerHeight - 120; y += 40)
        for (let x = innerWidth - 60; x > innerWidth * 0.5; x -= 40) {
          const el = document.elementFromPoint(x, y);
          if (!el) continue;
          const direct = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
          if (["DIV", "SECTION", "MAIN"].includes(el.tagName) && !direct && !el.closest("a,button,input,p,h1,h2,li,label,select,textarea,svg")) return { x, y };
        }
      return null;
    });
    if (spot) {
      await recStart(page);
      const f2 = await frames(page, `bgclick-${tag}`, { n: 18, every: 60, clip: clipVp, trigger: () => page.mouse.click(spot.x, spot.y) });
      m.batClick = { ...batStats(await recStop(page)), spot };
      sheet(`c2-bg-click-flight-${tag}`, f2, { cols: 6, max: 18, cellW: vp.width === 1440 ? 300 : 190 });
    } else m.batClick = { spot: null };
    await sleep(1500);

    // node click flight
    await scrollTop(page, 0);
    await sleep(1200);
    const nodeSel = vp.width >= 768 ? "a.thread-node >> nth=2" : "a.thread-node >> nth=2";
    const node = page.locator(nodeSel);
    if (await node.count()) {
      await recStart(page);
      const f3 = await frames(page, `node-${tag}`, { n: 20, every: 60, clip: clipVp, trigger: () => node.click({ force: true }).catch(() => {}) });
      m.batNode = batStats(await recStop(page));
      sheet(`c3-node-click-flight-${tag}`, f3, { cols: 5, max: 20, cellW: vp.width === 1440 ? 300 : 190 });
    }
    // perch + roost sizes
    m.batPlaces = await page.evaluate(() => {
      const q = (sel) => Array.from(document.querySelectorAll(sel)).slice(0, 4).map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      return { perch: q('[data-perch="nav-bat"] img, [data-perch="nav-bat"] svg'), hero: q('.hero__bat img, .hero__bat svg'), problem: q('.problem__bat img, .problem__bat svg'), library: q('.library__bat img, .library__bat svg'), problemGhost: q('.problem__ghost img, .problem__ghost svg'), pool: q('.bat img, .bat svg'), crew: q('#crew [data-mascot="mini-bat"]'), all: Array.from(document.querySelectorAll('[data-mascot="mini-bat"]')).length };
    });
    await context.close();
  }

  // ---------------------------------------------------------------- d. lost hour
  if (want("lost")) {
    const { context, page } = await fresh(browser, vp, base);
    await sleep(3000);
    const track = await page.evaluate(() => { const t = document.querySelector(".problem__track"); if (!t) return null; return { top: t.getBoundingClientRect().top + scrollY, h: t.offsetHeight }; });
    if (track) {
      const y = (p) => Math.round(track.top - 64 + (track.h - vp.height + 64) * p);
      const dir = join(tmpDir, `lost-${tag}`);
      rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
      const files = [];
      const ps = [0, 0.15, 0.3, 0.45, 0.58, 0.68, 0.74, 0.78, 0.8, 0.84, 0.92, 1];
      let t0 = Date.now();
      for (let i = 0; i < ps.length; i++) {
        await scrollTop(page, y(ps[i]));
        await sleep(i >= 5 && i <= 9 ? 120 : 350);
        const f = join(dir, `${pad(i)}-${Math.round(ps[i] * 100)}pct.jpg`);
        await page.screenshot({ path: f, type: "jpeg", quality: 82, clip: clipVp });
        files.push(f);
      }
      sheet(`d-lost-hour-scrub-${tag}`, files, { cols: 4, max: 12, cellW: vp.width === 1440 ? 360 : 190 });
      // timed series right after crossing the jump
      await scrollTop(page, y(0.6)); await sleep(800);
      const f2 = await frames(page, `lostjump-${tag}`, { n: 16, every: 70, clip: clipVp, trigger: () => scrollTop(page, y(0.8)) });
      sheet(`d2-lost-hour-jump-${tag}`, f2, { cols: 4, max: 16, cellW: vp.width === 1440 ? 360 : 190 });
    }
    await context.close();
  }

  // ---------------------------------------------------------------- e. crew + f. flow
  if (want("crew") || want("flow")) {
    const { context, page } = await fresh(browser, vp, base);
    await sleep(3000);
    if (want("crew")) {
      await scrollToEl(page, ".crew__portrait", 1.2); // just below view; the roll-call latches on entering
      await sleep(300);
      const files = await frames(page, `crew-${tag}`, { n: 20, every: 100, clip: clipVp, trigger: () => scrollToEl(page, ".crew__portrait", 0.15) });
      sheet(`e1-crew-rollcall-${tag}`, files, { cols: 5, max: 20, cellW: vp.width === 1440 ? 300 : 190 });
      await sleep(1500);
      // tier 2 hover: cat, jack, mummy
      for (const id of ["cauldron-cat", "two-faced-jack", "mummy-wrapper", "spider-weaver"]) {
        const sel = `#crew button[data-sitter="${id}"]`;
        const r = await rectOf(page, sel);
        if (!r) continue;
        await page.mouse.move(2, 2); await sleep(500);
        const clip = clipAround(r, vp, 340, 340);
        const f = await frames(page, `hover-${id}-${tag}`, { n: 12, every: 50, clip, trigger: () => page.hover(sel).catch(() => {}) });
        sheet(`e2-hover-${id}-${tag}`, f, { cols: 6, max: 12, cellW: 170 });
      }
      m.crewSizes = await page.evaluate(() => Array.from(document.querySelectorAll("#crew [data-sitter] > svg, #crew [data-sitter] > img")).map((el) => [el.parentElement.getAttribute("data-sitter"), Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)]));
    }
    if (want("flow")) {
      await scrollToEl(page, "#flow", 0);
      await sleep(900);
      const y = await page.evaluate(() => { const li = document.querySelector('#flow li[data-step="approve"]'); const r = li.getBoundingClientRect(); return Math.round(r.top + scrollY + r.height / 2 - innerHeight * 0.6); });
      await scrollTop(page, y - 700); await sleep(800);
      const files = await frames(page, `flow-${tag}`, { n: 16, every: 90, clip: clipVp, trigger: () => page.evaluate((to) => window.__smoothScroll(to, 700), y) });
      sheet(`f-flow-approve-${tag}`, files, { cols: 4, max: 16, cellW: vp.width === 1440 ? 360 : 190 });
      const ye = await page.evaluate(() => { const li = document.querySelector('#flow li[data-step="evidence"]'); const r = li.getBoundingClientRect(); return Math.round(r.top + scrollY + r.height / 2 - innerHeight * 0.6); });
      await scrollTop(page, ye - 500); await sleep(600);
      const f2 = await frames(page, `flowev-${tag}`, { n: 12, every: 90, clip: clipVp, trigger: () => page.evaluate((to) => window.__smoothScroll(to, 600), ye) });
      sheet(`f2-flow-evidence-mummy-${tag}`, f2, { cols: 4, max: 12, cellW: vp.width === 1440 ? 360 : 190 });
    }
    await context.close();
  }

  // ---------------------------------------------------------------- g. case + h. proof
  if (want("case") || want("proof") || want("mummy")) {
    const { context, page } = await fresh(browser, vp, base);
    await sleep(3000);
    await openCal(page);
    if (want("case")) {
      await scrollToEl(page, ".case-file", 0.05);
      await sleep(600);
      const f1 = await frames(page, `case-${tag}`, { n: 8, every: 120, clip: clipVp, trigger: async () => {} });
      sheet(`g1-case-sheet-${tag}`, f1, { cols: 4, max: 8, cellW: vp.width === 1440 ? 360 : 190 });
    }
    if (want("proof") || want("mummy")) {
      await page.keyboard.press("Home").catch(() => {});
      await scrollToEl(page, ".case__proof", 1.0);
      await sleep(900);
      const watched = ".ladder__rung, .proof__scroll *, .jack-panel__jack, .jack-panel__jack *, .proof__mummy, .proof__mummy *, .proof__bandage *, .proof__tag, .jack-panel__face";
      const snap = () => page.evaluate((s) => Array.from(document.querySelectorAll(s)).map((el) => { const cs = getComputedStyle(el); return cs.transform + "|" + cs.opacity + "|" + cs.translate + "|" + cs.rotate + "|" + cs.scale + "|" + (el.getAttribute("style") ?? "") + "|" + (el.getAttribute("transform") ?? ""); }), watched);
      const before = await snap();
      const files = await frames(page, `proof-${tag}`, { n: 14, every: 150, clip: clipVp, trigger: () => scrollToEl(page, ".case__proof", 0.1) });
      sheet(`h1-proof-enter-${tag}`, files, { cols: 5, max: 14, cellW: vp.width === 1440 ? 300 : 190 });
      await sleep(1200);
      const mid = await snap();
      await sleep(1500);
      const after = await snap();
      const diff = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
      m.proofTransforms = { watchedElements: after.length, changedAfterEnter: diff(before, mid), changedAtRest1500ms: diff(mid, after) };
      const hover = await rectOf(page, ".jack-panel__jack");
      if (hover) {
        const clip = clipAround(hover, vp, Math.min(vp.width, 700), 420, 0, -40);
        const f = await frames(page, `jackhover-${tag}`, { n: 10, every: 80, clip, trigger: () => page.hover(".jack-panel__jack").catch(() => {}) });
        sheet(`h2-jack-hover-${tag}`, f, { cols: 5, max: 10, cellW: 280 });
      }
    }
    // mummy boxes at the 3 places
    const boxes = {};
    const MUM = {
      proof: ".proof__mummy svg, .proof__mummy img",
      crew: '#crew [data-sitter="mummy-wrapper"] > svg, #crew [data-sitter="mummy-wrapper"] > img',
      flow: '#flow li[data-step="evidence"] [data-mascot="mummy-wrapper"]',
    };
    for (const [place, sel] of Object.entries(MUM)) {
      boxes[place] = await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const chain = [];
        for (let p = el.parentElement; p && chain.length < 8; p = p.parentElement) {
          const cs = getComputedStyle(p);
          const clips = cs.overflow !== "visible" || cs.clipPath !== "none" || cs.contain.includes("paint");
          const sc = (cs.transform !== "none" ? cs.transform : "") + (cs.scale !== "none" ? " scale:" + cs.scale : "");
          if (clips || sc) chain.push({ el: p.tagName + "." + String(p.className).slice(0, 36), overflow: cs.overflow, clipPath: cs.clipPath.slice(0, 40), contain: cs.contain, xf: sc.slice(0, 60) });
        }
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName, kind: el.getAttribute("data-art"), attrW: el.getAttribute("width"), attrH: el.getAttribute("height"), rect: [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10],
          viewBox: el.getAttribute("viewBox"), cssW: cs.width, cssH: cs.height, svgOverflow: cs.overflow, filter: cs.filter.slice(0, 80), objectFit: cs.objectFit, clippingAncestors: chain,
          plateShift: el.querySelector('[data-plate="fill"]')?.getAttribute("transform") ?? null,
        };
      }, sel);
    }
    m.mummy = boxes;
    await context.close();
  }
}

/** 3x close-ups for the critique and the round-2 before/after comparison. */
async function details(browser, base) {
  mkdirSync(detailDir, { recursive: true });
  const vp = { name: "1440", width: 1440, height: 900 };
  innerW = vp.width;
  const { context, page } = await fresh(browser, vp, base, { dsf: 3 });
  await sleep(3200);
  const shotEl = async (sel, name, pad = 24) => {
    const loc = page.locator(sel).first();
    if (!(await loc.count())) return console.log("detail: missing", sel);
    await loc.scrollIntoViewIfNeeded();
    await sleep(500);
    const b = await loc.boundingBox();
    if (!b) return;
    const clip = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(vp.width, b.width + pad * 2), height: Math.min(vp.height, b.height + pad * 2) };
    await page.screenshot({ path: join(detailDir, name), clip });
  };
  await shotEl("[data-ghost]", "ghost-3x.png", 40);
  await shotEl('[data-perch="nav-bat"]', "bat-perch-3x.png", 30);
  await shotEl('#crew [data-sitter="mummy-wrapper"]', "mummy-crew-3x.png", 40);
  await shotEl('#flow li[data-step="evidence"] .flow__mascot', "mummy-flow-3x.png", 30);
  await shotEl('.hero__bat', "bat-hero-3x.png", 30);
  await shotEl('.problem__bat', "bat-problem-3x.png", 30);
  await openCal(page);
  await shotEl(".proof__mummy", "mummy-proof-3x.png", 40);
  await shotEl(".jack-panel", "jack-panel-3x.png", 20);
  await shotEl(".proof__scroll", "ladder-3x.png", 20);
  await shotEl(".case__proof", "proof-area-1x-3x.png", 10);
  await context.close();
}

async function main() {
  if (!existsSync(join(distDir, "index.html"))) {
    console.error(`anim-review: ${distDir} has no index.html; run the build first.`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  const server = await serve(distDir);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const vp of VIEWPORTS) {
      console.log(`---- ${vp.name}`);
      await momentsFor(browser, vp, base);
    }
    if (want("detail")) await details(browser, base);

    // ------------------------------------------------ acceptance criteria for round 2 (see review.md, section 9)
    for (const tag of ["1440", "390"]) {
      const m = metrics[tag];
      if (!m) continue;
      if (m.ghostScroll) {
        check(`[${tag}] ghost moves vertically in the viewport by >= 120 px over a scripted scroll or has a visible companion motion`, m.ghostScroll.viewportYRange >= 120, `viewport y range ${m.ghostScroll.viewportYRange}px, page-y travel ${m.ghostScroll.pageYTravelPxTotal}px`);
        check(`[${tag}] ghost is >= 60 px tall${tag === "390" ? " (>= 48 px compact)" : ""}`, m.ghostScroll.ghostH >= (tag === "390" ? 48 : 60), `${m.ghostScroll.ghostW}x${m.ghostScroll.ghostH}`);
        check(`[${tag}] ghost stays fully inside the viewport`, m.ghostScroll.fullyInViewFrames >= 0.97 * m.ghostScroll.frames, `${m.ghostScroll.fullyInViewFrames}/${m.ghostScroll.frames} frames, x ${m.ghostScroll.minX}..${m.ghostScroll.maxX}`);
        check(`[${tag}] ghost tilt/squash reacts to scroll speed (|tilt| >= 6 deg during wheel bursts)`, Math.max(Math.abs(m.ghostWheel?.tiltMin ?? 0), Math.abs(m.ghostWheel?.tiltMax ?? 0)) >= 6, `tilt ${m.ghostWheel?.tiltMin}..${m.ghostWheel?.tiltMax}`);
      }
      if (m.batBurst) check(`[${tag}] burst bats are >= ${tag === "390" ? 64 : 90} px wide`, m.batBurst.wMin >= (tag === "390" ? 64 : 90), `width ${m.batBurst.wMin}..${m.batBurst.wMax}`);
      if (m.batClick?.samples !== undefined) check(`[${tag}] click-flight bat is >= ${tag === "390" ? 64 : 90} px wide`, (m.batClick.wMin ?? 0) >= (tag === "390" ? 64 : 90), `width ${m.batClick.wMin}..${m.batClick.wMax}`);
      if (m.mummy?.proof) {
        const r = m.mummy.proof.rect;
        check(`[${tag}] proof mummy box within design aspect 140:190 +-6% and no clipping ancestors`, Math.abs(r[2] / r[3] - 140 / 190) < 0.06 * (140 / 190) && m.mummy.proof.clippingAncestors.filter((c) => !/^(BODY|HTML)/.test(c.el)).every((c) => c.overflow === "visible"), `${r[2]}x${r[3]}, clips: ${m.mummy.proof.clippingAncestors.map((c) => c.el).join(" > ") || "none"}`);
      }
      if (m.proofTransforms) check(`[${tag}] proof effects change transforms over time (>= 6 watched nodes change after entering)`, m.proofTransforms.changedAfterEnter >= 6, `${m.proofTransforms.changedAfterEnter} changed of ${m.proofTransforms.watchedElements}`);
      const j = m.jankScroll;
      if (j) check(`[${tag}] no jank: p95 frame <= 20 ms and no frame > 100 ms during a 14 s scroll (round 1 saw one run with max 83 ms from lazy decode)`, j.p95 <= 20 && j.max <= 100, `p50 ${j.p50}, p95 ${j.p95}, max ${j.max}, >50ms: ${j.over50}`);
    }
    writeFileSync(join(outDir, "metrics.json"), JSON.stringify(metrics, null, 2));
    writeFileSync(join(outDir, "checks.txt"), checks.join("\n") + "\n");
  } finally {
    await browser.close();
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


