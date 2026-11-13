import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";

const server = process.env.CINEMATIC_URL ? null : await createServer({ server: { host: "127.0.0.1", port: 5178 } });
await server?.listen();
const base = process.env.CINEMATIC_URL || `http://127.0.0.1:${server.config.server.port}`;
const output = new URL("../../docs/reports/cinematic/", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const failures = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    page.on("pageerror", error => failures.push(error.message));
    await page.goto(base);
    await page.locator(".cinema[open]").waitFor();
    await page.waitForTimeout(2400);
    await page.screenshot({ path: `${output}/clock-${width}.png` });
    const before = await page.locator('[data-hand="minute"]').getAttribute("transform");
    await page.waitForTimeout(3200);
    const after = await page.locator('[data-hand="minute"]').getAttribute("transform");
    assert.notEqual(before, after, "SVG minute hand advances");
    await page.screenshot({ path: `${output}/swarm-${width}.png` });
    await page.locator('.cinema[data-ready="true"]').waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${output}/lantern-${width}.png` });
    await page.getByRole("button", { name: "Touch the lantern to enter TimeWraith", exact: true }).click();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");
    await page.screenshot({ path: `${output}/home-${width}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow");
    await page.getByRole("button", { name: "Replay the midnight intro" }).click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog[open]").count(), 0, "Escape closes and cancels the sequence");
    await page.getByRole("button", { name: "Replay the midnight intro" }).click();
    await page.getByRole("button", { name: "Skip intro" }).click();
    await page.reload();
    assert.equal(await page.locator("dialog[open]").count(), 0, "Completed intro is remembered for this session");
    await page.getByRole("link", { name: "Open a case", exact: true }).click();
    await page.waitForURL("**/#/new");
    assert.equal(await page.locator(".page--home").count(), 0);
    await context.close();
  }
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(base);
  assert.equal(await page.locator("dialog[open]").count(), 0, "Reduced motion bypasses autoplay");
  await page.getByRole("button", { name: "Replay the midnight intro" }).click();
  await page.locator('.cinema[data-ready="true"]').waitFor();
  assert.equal(await page.locator(".cinema__clock").evaluate(el => getComputedStyle(el).opacity), "0");
  await page.getByRole("button", { name: "Touch the lantern to enter TimeWraith", exact: true }).click();
  await context.close();
  assert.deepEqual(failures, []);
  console.log("PASS: desktop/mobile sequence, SVG hands, lantern, replay, Escape, skip, session memory, routes, overflow, reduced motion, runtime errors.");
} finally { await browser.close(); await server?.close(); }
