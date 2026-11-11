#!/usr/bin/env node
/**
 * Proves that the board's animations actually run in a real browser (tasks 11.2, 11.3, 12.4, 12.5).
 *
 *   pnpm --dir frontend motion-check            -> build, then check
 *   node scripts/motion-check.mjs [--dist dir]  -> check an existing build
 *
 * Same static server and local Chrome as scripts/shots.mjs, but with motion ON: localStorage["tw.reduceMotion"]="off"
 * and `reducedMotion: "no-preference"`. Checks, each printed as PASS or FAIL:
 *   1. hero clock entry: the minute hand's computed angle changes over time and ends at 23:59 (354 deg)
 *   2. open reaction: the Wraith Director's figure is transformed by its enter reaction at some point
 *   3. ambient: the Wraith's float loop and the Mini Ghost's bob are running
 *   4. thread: the main stroke's dash offset changes after scrolling to the middle (GSAP scrub loaded)
 *   5. ghost: the Mini Ghost moved after the scroll
 *   6. background click: a pooled bat becomes visible
 *   7. node click: a bat becomes visible after clicking a Section_Node
 *   8. Reduce Motion toggle: the thread is fully drawn and the header toggle reads "Motion: reduced"; toggling back
 *      resumes scrubbing
 * Then, on a fresh page (task 14 region effects, each latched once per page):
 *   9. Lost Hour: scrubbing past the jump reads 03:00, opens the crack and scatters visible Mini Bats
 *  10. Crew roll-call: the 14 figures are transformed one after another when the Crew enters
 *  11. Tier 2 hover and focus reactions, six tab stops in the portrait
 *  12. Flow: the approve landing at the lead line gets aria-current, the marker, moving figures and a Bat Burst
 *  13. Submit: a valid case makes bats visible and adds a focused draft card that drops in
 *  14. Version_Timeline: scrubbing the Cal.com case to e11 reaches the reproduced milestone and animates it
 * Writes mid-animation screenshots to docs/reports/shots/motion/. Exits non-zero if any check fails.
 */
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..", "..");
const distArg = process.argv.indexOf("--dist");
const distDir = resolve(here, "..", distArg > -1 ? (process.argv[distArg + 1] ?? "dist") : "dist");
const outDir = resolve(repoRoot, "docs", "reports", "shots", "motion");

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

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

/** In-page: rotation angle in degrees of an element's computed transform (0 for none). */
const ANGLE_FN = `(el) => {
  const t = el ? getComputedStyle(el).transform : "none";
  if (!t || t === "none") return 0;
  const m = new DOMMatrixReadOnly(t);
  return Math.round(((Math.atan2(m.b, m.a) * 180) / Math.PI) * 10) / 10;
}`;

/**
 * In-page: watches the elements matching `sel` for `ms` and counts how many changed their computed transform or
 * opacity from the state they had when the watch started.
 */
const WATCH_FN = `(args) => new Promise((done) => {
  const [sel, ms] = args;
  const els = Array.from(document.querySelectorAll(sel));
  const key = (el) => { const cs = getComputedStyle(el); return cs.transform + "|" + Math.round(Number(cs.opacity) * 100); };
  const base = els.map(key);
  const moved = new Set();
  const t0 = performance.now();
  const tick = () => {
    els.forEach((el, i) => { if (key(el) !== base[i]) moved.add(i); });
    if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done({ total: els.length, moved: moved.size });
  };
  tick();
})`;

/** In-page: the highest opacity any pooled bat reached within `ms`. */
const BATS_FN = `(ms) => new Promise((done) => {
  let best = 0;
  const t0 = performance.now();
  const tick = () => {
    for (const b of document.querySelectorAll(".bat[data-active]")) best = Math.max(best, Number(getComputedStyle(b).opacity));
    if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(Math.round(best * 100) / 100);
  };
  tick();
})`;

const watch = (page, sel, ms) => page.evaluate(`(${WATCH_FN})(${JSON.stringify([sel, ms])})`);
const watchBatsFor = (page, ms) => page.evaluate(`(${BATS_FN})(${ms})`);
const scrollToY = (page, y) => page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);

/** Task 14 region effects: Lost Hour scatter, Crew roll-call and Tier 2 reactions, a Flow landing, the submit flow. */
async function regionChecks(page, shot) {
  // ---- 9. Lost Hour: scrubbing through the jump opens the crack and scatters the Mini Bats
  const lostY = await page.evaluate(() => {
    const t = document.querySelector(".problem__track");
    const top = t.getBoundingClientRect().top + window.scrollY;
    return Math.round(top - 64 + (t.offsetHeight - window.innerHeight + 64) * 0.8);
  });
  const lostBats = watchBatsFor(page, 1400);
  await scrollToY(page, lostY);
  await page.waitForTimeout(380);
  await shot(page, "07-lost-hour-scatter-1440.png");
  const lostBest = await lostBats;
  const lost = await page.evaluate(() => ({
    time: document.getElementById("problem-clock")?.getAttribute("data-clock-time"),
    frame: document.querySelector(".problem__scene")?.getAttribute("data-frame"),
    crack: Number(getComputedStyle(document.querySelector(".problem__crack")).opacity),
  }));
  check(
    "Lost Hour: the scrub jumps 01:59 to 03:00, the crack opens and Mini Bats scatter (problem.scatter)",
    lostBest > 0.3 && lost.time === "03:00" && lost.crack > 0.99,
    `clock ${lost.time}, frame ${lost.frame}, crack opacity ${lost.crack}, max bat opacity ${lostBest}`,
  );

  // ---- 10. Crew roll-call
  await page.waitForTimeout(1300);
  const crewY = await page.evaluate(() => {
    const p = document.querySelector(".crew__portrait");
    return Math.round(p.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.15);
  });
  const crewArt = "#crew [data-sitter] > svg, #crew [data-sitter] > img";
  const crewWatch = watch(page, crewArt, 1700);
  await scrollToY(page, crewY);
  await page.waitForTimeout(520);
  await shot(page, "08-crew-rollcall-1440.png");
  const crew = await crewWatch;
  check("Crew roll-call transforms the figures one after another (crew.rollcall)", crew.total === 14 && crew.moved >= 12, `${crew.moved} of ${crew.total} figures moved`);

  // ---- 11. Tier 2 reactions on hover and on keyboard focus
  await page.waitForTimeout(900);
  const catArt = '#crew button[data-sitter="cauldron-cat"] > svg, #crew button[data-sitter="cauldron-cat"] > img';
  const hoverWatch = watch(page, catArt, 500);
  await page.hover('#crew button[data-sitter="cauldron-cat"]');
  const hover = await hoverWatch;
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  const jackArt = '#crew button[data-sitter="two-faced-jack"] > svg, #crew button[data-sitter="two-faced-jack"] > img';
  const focusWatch = watch(page, jackArt, 500);
  await page.evaluate(() => document.querySelector('#crew button[data-sitter="two-faced-jack"]').focus());
  const focus = await focusWatch;
  const tabStops = await page.evaluate(
    () => Array.from(document.querySelectorAll("#crew .crew__portrait button, #crew .crew__portrait [tabindex]")).filter((el) => el.tabIndex >= 0).length,
  );
  check(
    "Tier 2 mascots react to hover and focus (mascot.hover), six tab stops in the portrait",
    hover.moved === 1 && focus.moved === 1 && tabStops === 6,
    `hover cat moved ${hover.moved}, focus jack moved ${focus.moved}, ${tabStops} tab stops`,
  );
  await page.evaluate(() => document.activeElement?.blur());

  // ---- 12. Flow: the approve landing at the lead line lights up, its Warden acts and the Bat Burst plays
  await page.waitForTimeout(700);
  const approveY = await page.evaluate(() => {
    const li = document.querySelector('#flow li[data-step="approve"]');
    const r = li.getBoundingClientRect();
    return Math.round(r.top + window.scrollY + r.height / 2 - window.innerHeight * 0.6);
  });
  const flowBats = watchBatsFor(page, 1200);
  const flowWatch = watch(page, '#flow li[data-step="approve"] .flow__mascot > svg, #flow li[data-step="approve"] .flow__mascot > img, #flow li[data-step="approve"] .flow__sign', 1100);
  await scrollToY(page, approveY);
  await page.waitForTimeout(260);
  await shot(page, "09-flow-approve-1440.png");
  const [flowBest, flowMoved] = await Promise.all([flowBats, flowWatch]);
  const landing = await page.evaluate(() => {
    const li = document.querySelector('#flow li[data-step="approve"]');
    return { current: li.getAttribute("aria-current"), marker: li.querySelector("[data-flow-active]")?.textContent ?? "" };
  });
  check(
    "Flow landing activation: approve marked active (text and shape), its figures act, Bat Burst at the gate (flow.step)",
    landing.current === "step" && landing.marker !== "" && flowMoved.moved >= 1 && flowBest > 0.3,
    `aria-current=${landing.current}, marker "${landing.marker}", ${flowMoved.moved} of ${flowMoved.total} moved, max bat opacity ${flowBest}`,
  );

  // ---- 13. Submit a valid case: Bat Burst from the button and a new draft card dropping in
  await scrollToY(page, 0);
  await page.waitForTimeout(800);
  await page.getByRole("radio", { name: "Local app" }).check();
  await page.getByLabel("Local app URL", { exact: false }).fill("http://localhost:4321");
  await page.getByRole("radio", { name: /^Open hunt/ }).check();
  await page.evaluate(() => document.activeElement?.blur());
  const draftsBefore = await page.locator('ol.library__cards > li[data-case-kind="draft"]').count();
  const submitBats = watchBatsFor(page, 900);
  const dropWatch = page.evaluate(
    () =>
      new Promise((done) => {
        const known = new Set(document.querySelectorAll('ol.library__cards > li[data-case-kind="draft"]'));
        let card = null;
        let animated = false;
        const t0 = performance.now();
        const tick = () => {
          card ??= Array.from(document.querySelectorAll('ol.library__cards > li[data-case-kind="draft"]')).find((li) => !known.has(li))?.querySelector(".case-card") ?? null;
          if (card) {
            const cs = getComputedStyle(card);
            if (Number(cs.opacity) < 0.99 || (cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)")) animated = true;
          }
          if (performance.now() - t0 < 2200) requestAnimationFrame(tick);
          else done({ found: card !== null, animated, focused: card !== null && document.activeElement === card });
        };
        tick();
      }),
  );
  await page.getByRole("button", { name: "Open the case" }).click();
  await page.waitForTimeout(120);
  await shot(page, "10-submit-burst-1440.png");
  // The drop-in starts once the smooth scroll has brought the new card half into view.
  await page.waitForFunction(() => {
    const c = document.querySelector('ol.library__cards > li[data-case-kind="draft"] .case-card');
    if (!c) return false;
    const r = c.getBoundingClientRect();
    return r.top < window.innerHeight * 0.8 && r.bottom > 0;
  }, undefined, { timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(260);
  await shot(page, "11-draft-create-1440.png");
  const [submitBest, drop] = await Promise.all([submitBats, dropWatch]);
  const draftsAfter = await page.locator('ol.library__cards > li[data-case-kind="draft"]').count();
  check(
    "Submit: Bat Burst from the button, a new focused draft card that drops in (bats.burst, case.draft-create)",
    submitBest > 0.3 && draftsAfter === draftsBefore + 1 && drop.found && drop.animated && drop.focused,
    `max bat opacity ${submitBest}, drafts ${draftsBefore} -> ${draftsAfter}, card animated ${drop.animated}, focused ${drop.focused}`,
  );
}

/** Task 14.10: scrubbing the Cal.com case to e11 makes the Version_Timeline's "reproduced" milestone reached, with motion. */
async function timelineCheck(page, shot) {
  await page.locator('li[data-case-id="calcom-30021"]').getByRole("button", { name: /^Open case/ }).click();
  await page.waitForSelector('[data-case="calcom-30021"] .vtl', { timeout: 4000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const el = document.querySelector(".vtl");
    window.scrollTo({ top: Math.round(el.getBoundingClientRect().top + window.scrollY - 140), behavior: "instant" });
  });
  await page.waitForTimeout(500);
  const state = () => page.evaluate(() => document.querySelector('[data-milestone="reproduced"]')?.getAttribute("data-state") ?? "missing");
  await page.locator('[data-case="calcom-30021"] .scrubber__slider').focus();
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(700);
  const before = await state();
  const reveal = page.evaluate(`(${WATCH_FN})(${JSON.stringify(['[data-milestone="reproduced"] .vtl__ring, [data-milestone="reproduced"] .vtl__state, [data-milestone="reproduced"] .vtl__seg', 700])})`);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(260);
  await shot(page, "12-timeline-milestone-1440.png");
  const moved = await reveal;
  const after = await state();
  const stampText = await page.evaluate(() => document.querySelector('[data-milestone="reproduced"] .vtl__state')?.textContent ?? "");
  check(
    "Version_Timeline: scrubbing the Cal.com case to e11 reaches the reproduced milestone and its ring and stamp animate (timeline.milestone)",
    before === "ahead" && after === "reached" && stampText === "reached" && moved.moved >= 1,
    `state ${before} -> ${after}, stamp "${stampText}", ${moved.moved} of ${moved.total} parts animated`,
  );
}
async function main() {
  if (!existsSync(join(distDir, "index.html"))) {
    console.error(`motion-check: ${distDir} has no index.html; run the build first.`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const server = await serve(distDir);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ channel: "chrome" });
  const shots = [];
  const shot = async (page, name) => {
    await page.screenshot({ path: join(outDir, name) });
    shots.push(name);
  };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
    await context.addInitScript(`
      try { window.localStorage.setItem("tw.reduceMotion", "off"); } catch {}
      // Samples the hero minute hand and the Wraith figure every frame from the first frame on.
      window.__motion = { minute: [], wraith: [] };
      const angle = ${ANGLE_FN};
      const t0 = performance.now();
      const tick = () => {
        const t = performance.now() - t0;
        const hand = document.getElementById("hero-clock-hand-minute");
        if (hand) window.__motion.minute.push([Math.round(t), angle(hand)]);
        const fig = document.querySelector(".hero__wraith > *");
        if (fig) window.__motion.wraith.push([Math.round(t), getComputedStyle(fig).transform]);
        if (t < 3000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.__lt = [];
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration), e.name]))).observe({ type: "longtask", buffered: true }); } catch {}
    `);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    // ---- 1. Clock entry
    await page.goto(base, { waitUntil: "commit" });
    await page.waitForSelector("#hero-clock-hand-minute", { state: "attached" });
    const start = Date.now();
    const readMinute = () => page.evaluate(`(${ANGLE_FN})(document.getElementById("hero-clock-hand-minute"))`);
    await page.waitForTimeout(Math.max(0, 300 - (Date.now() - start)));
    // No screenshot here: a capture blocks frames for about 300 ms and would hide the sweep it is measuring.
    const a300 = await readMinute();
    await page.waitForTimeout(Math.max(0, 1200 - (Date.now() - start)));
    const a1200 = await readMinute();
    const samples = await page.evaluate(() => window.__motion.minute);
    if (process.env.MOTION_DEBUG) console.log("long tasks", JSON.stringify(await page.evaluate(() => window.__lt)));
    const angles = samples.map(([, a]) => a);
    const distinct = new Set(angles).size;
    const final = angles[angles.length - 1];
    // 354 deg reads as -6 deg from the matrix.
    const atFinal = (a) => Math.abs(a - -6) < 0.6 || Math.abs(a - 354) < 0.6;
    const startedElsewhere = angles.some((a) => !atFinal(a));
    check(
      "hero clock minute hand sweeps to 23:59",
      (a300 !== a1200 || (startedElsewhere && atFinal(a1200))) && atFinal(final) && distinct >= 3,
      `300 ms: ${a300} deg, 1200 ms: ${a1200} deg, ${distinct} distinct angles in ${angles.length} frames, first frames ${samples
        .slice(0, 6)
        .map(([t, a]) => `${t}ms:${a}`)
        .join(" ")}, last ${final}`,
    );

    // ---- 2. Open reaction (Wraith glance), delayed until the clock scene has finished
    await page.waitForTimeout(1200);
    const wraith = await page.evaluate(() => window.__motion.wraith.map(([, t]) => t));
    const moved = wraith.filter((t) => t && t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)");
    check("open region reaction poses the Wraith Director", moved.length > 0, `${moved.length} of ${wraith.length} frames transformed`);

    // ---- 3. Ambient loops
    const ambient = await page.evaluate(async () => {
      const w = document.querySelector(".hero__wraith");
      const g = document.querySelector(".ghost__bob");
      const read = () => [w ? getComputedStyle(w).translate : "", g ? getComputedStyle(g).translate : ""];
      const a = read();
      await new Promise((r) => setTimeout(r, 700));
      const b = read();
      return {
        attr: document.documentElement.getAttribute("data-ambient"),
        wraithAnim: w ? getComputedStyle(w).animationName : "",
        a,
        b,
      };
    });
    check(
      "ambient loops run (Wraith float, Mini Ghost bob)",
      ambient.attr === "running" && ambient.wraithAnim === "wraith-float" && ambient.a[0] !== ambient.b[0] && ambient.a[1] !== ambient.b[1],
      `data-ambient=${ambient.attr}, wraith ${ambient.a[0]} -> ${ambient.b[0]}, ghost ${ambient.a[1]} -> ${ambient.b[1]}`,
    );

    // ---- 4/5. Thread draw and Mini Ghost while scrolling
    await page.waitForSelector('[data-thread-mode="scroll"]', { timeout: 5000 }).catch(() => {});
    const mode = await page.evaluate(() => document.querySelector("[data-thread]")?.getAttribute("data-thread-mode") ?? "missing");
    const readThread = () =>
      page.evaluate(() => ({
        offset: Number.parseFloat(getComputedStyle(document.querySelector('[data-thread-path="main"]')).strokeDashoffset),
        dash: getComputedStyle(document.querySelector('[data-thread-path="main"]')).strokeDasharray,
        ghost: document.querySelector("[data-ghost]")?.style.transform ?? "",
      }));
    const top = await readThread();
    await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.round(max / 2), behavior: "instant" });
    });
    await page.waitForTimeout(250);
    await shot(page, "02-scroll-mid-250ms-1440.png");
    await page.waitForTimeout(1200);
    const mid = await readThread();
    await shot(page, "03-scroll-mid-settled-1440.png");
    check(
      "thread draws with scroll (stroke-dashoffset changes)",
      mode === "scroll" && Number.isFinite(top.offset) && Number.isFinite(mid.offset) && Math.abs(top.offset - mid.offset) > 50,
      `mode ${mode}, dasharray ${top.dash.split(",")[0]}, offset top ${top.offset} -> middle ${mid.offset}`,
    );
    check("Mini Ghost follows the thread", top.ghost !== "" && top.ghost !== mid.ghost, `${top.ghost} -> ${mid.ghost}`);

    // ---- 6. Background click flies a bat
    const watchBats = () =>
      page.evaluate(
        () =>
          new Promise((done) => {
            let best = 0;
            const t0 = performance.now();
            const tick = () => {
              for (const b of document.querySelectorAll(".bat[data-active]")) best = Math.max(best, Number(getComputedStyle(b).opacity));
              if (performance.now() - t0 < 500) requestAnimationFrame(tick);
              else done(best);
            };
            tick();
          }),
      );
    const point = await page.evaluate(() => {
      const BLOCK = "a, button, input, select, textarea, label, summary, details, [role], [tabindex]:not([tabindex='-1']), form, p, h1, h2, h3, h4, li, .mono, img, svg";
      for (let y = Math.round(window.innerHeight * 0.45); y < window.innerHeight - 40; y += 37) {
        for (let x = 40; x < window.innerWidth - 40; x += 53) {
          const el = document.elementFromPoint(x, y);
          if (!el || el.closest(BLOCK)) continue;
          const text = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim() !== "");
          if (!text && el.closest("section")) return { x, y, el: `${el.tagName.toLowerCase()}.${el.className}` };
        }
      }
      return null;
    });
    if (point) {
      const watching = watchBats();
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(200);
      await shot(page, "04-bat-to-point-200ms-1440.png");
      const best = await watching;
      check("background click flies a Mini Bat (bat.to-point)", best > 0.3, `click at ${point.x},${point.y} on ${point.el}, max bat opacity ${best}`);
    } else {
      check("background click flies a Mini Bat (bat.to-point)", false, "no background point found");
    }

    // ---- 7. Section_Node click
    await page.waitForTimeout(900);
    const node = page.locator(".thread-node[aria-current]");
    if ((await node.count()) > 0) {
      const watching = watchBats();
      await node.first().click();
      await page.waitForTimeout(150);
      await shot(page, "05-bat-travel-150ms-1440.png");
      const best = await watching;
      check("Section_Node click sends the Mini Bat (bat.travel)", best > 0.3, `max bat opacity ${best}`);
    } else {
      check("Section_Node click sends the Mini Bat (bat.travel)", false, "no active node");
    }

    // ---- 8. Reduce Motion toggle, live
    await page.waitForTimeout(1000);
    await page.locator(".rm-toggle").click();
    await page.waitForTimeout(300);
    const reduced = await page.evaluate(() => ({
      attr: document.documentElement.getAttribute("data-reduce-motion"),
      offset: Number.parseFloat(getComputedStyle(document.querySelector('[data-thread-path="main"]')).strokeDashoffset),
      mode: document.querySelector("[data-thread]")?.getAttribute("data-thread-mode"),
      label: document.querySelector(".rm-toggle__state")?.textContent,
      wraithAnim: getComputedStyle(document.querySelector(".hero__wraith")).animationName,
    }));
    await shot(page, "06-reduce-motion-on-1440.png");
    const rmWatch = watchBats();
    if (point) await page.mouse.click(point.x, point.y).catch(() => {});
    const rmBat = await rmWatch;
    const mark = await page.evaluate(() => document.querySelectorAll("[data-overlay-mark]").length);
    check(
      "Reduce Motion: thread fully drawn, loops off, click leaves a static mark instead of a flight",
      reduced.attr === "true" && reduced.mode === "static" && Math.abs(reduced.offset) < 1 && reduced.wraithAnim === "none" && rmBat < 0.05 && mark > 0,
      `data-reduce-motion=${reduced.attr}, mode ${reduced.mode}, offset ${reduced.offset}, label "${reduced.label}", wraith animation ${reduced.wraithAnim}, bat ${rmBat}, marks ${mark}`,
    );
    await page.locator(".rm-toggle").click();
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => ({
      mode: document.querySelector("[data-thread]")?.getAttribute("data-thread-mode"),
      offset: Number.parseFloat(getComputedStyle(document.querySelector('[data-thread-path="main"]')).strokeDashoffset),
    }));
    check("Reduce Motion off again: scrubbing resumes", back.mode === "scroll" && back.offset > 1, `mode ${back.mode}, offset ${back.offset}`);

    // ---- 9 to 13. Region effects (task 14) on a fresh page, so no once-only latch has been used yet
    const rp = await context.newPage();
    rp.on("pageerror", (e) => errors.push(String(e)));
    await rp.goto(base, { waitUntil: "load" });
    await rp.waitForTimeout(2600);
    await rp.waitForSelector('[data-thread-mode="scroll"]', { timeout: 5000 }).catch(() => {});
    await regionChecks(rp, shot);
    await timelineCheck(rp, shot);
    await rp.close();

    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

    // Mid-sweep capture of the clock entry on a fresh load (taken once the hand has left its start angle).
    const fresh = await context.newPage();
    await fresh.goto(base, { waitUntil: "commit" });
    await fresh
      .waitForFunction(
        `(() => { const a = (${ANGLE_FN})(document.getElementById("hero-clock-hand-minute")); return a !== 0 && a !== 180 && a !== -180 && Math.abs(a + 6) > 20; })()`,
        undefined,
        { polling: "raf", timeout: 3000 },
      )
      .catch(() => {});
    await shot(fresh, "01-clock-entry-mid-sweep-1440.png");
    await fresh.close();
    await context.close();
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
  console.log(`motion-check: ${shots.length} screenshots in ${outDir}`);
  const failed = results.filter((r) => !r.pass);
  console.log(`motion-check: ${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
