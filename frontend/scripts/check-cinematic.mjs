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
    const replay = page.getByRole("link", { name: "Replay the midnight intro" });
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
    await page.waitForFunction(() => {
      const clock = document.querySelector(".cinema__clock");
      const swarm = document.querySelector(".cinema__swarm");
      return clock && swarm && getComputedStyle(clock).visibility === "hidden" && Number(getComputedStyle(swarm).opacity) > 0;
    });
    const clockStayedHidden = await page.evaluate(() => new Promise(resolve => {
      const clock = document.querySelector(".cinema__clock");
      const scene = document.querySelector(".cinema");
      function check() {
        if (getComputedStyle(clock).visibility !== "hidden") return resolve(false);
        if (scene.dataset.ready === "true") return resolve(true);
        requestAnimationFrame(check);
      }
      check();
    }));
    assert(clockStayedHidden, "Clock stays hidden through the swarm fade and ghost reveal");
    await page.locator('.cinema[data-ready="true"]').waitFor({ timeout: 15000 });
    const ghostSource = await page.locator(".cinema__figure img").getAttribute("src");
    assert.match(ghostSource, /lantern-wraith[^/]*\.svg(?:\?|$)/);
    await page.screenshot({ path: `${output}/lantern-${width}.png` });
    await page.getByRole("button", { name: "Touch the lantern to enter TimeWraith", exact: true }).click();
    await page.waitForURL("**/#/home");
    await page.locator(".cinema[open]").waitFor({ state: "detached" });
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");
    const wraith = page.locator(".landing-wraith");
    assert.equal(await wraith.locator("img").getAttribute("src"), `${ghostSource}#animated`);
    await wraith.locator("img").evaluate(image => image.decode());
    const start = await wraith.evaluate(figure => figure.style.transform || figure.style.getPropertyValue("--wraith-y"));
    await page.waitForTimeout(420);
    assert.notEqual(await wraith.evaluate(figure => figure.style.getPropertyValue("--wraith-y")), start, "The lantern ghost moves after entry");
    assert.equal(await page.locator(".midnight-lead").evaluate(area => getComputedStyle(area).opacity), "0", "Unvisited text starts black");
    assert.equal(await page.locator(".midnight-form").evaluate(area => getComputedStyle(area).pointerEvents), "none", "An unlit form does not intercept clicks meant for the lantern");
    await page.screenshot({ path: `${output}/home-${width}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow");
    const lead = await page.locator(".midnight-lead").boundingBox();
    assert(lead);
    const clickX = lead.x + lead.width / 2;
    const clickY = lead.y + lead.height / 2;
    const waitForLight = () => page.waitForFunction(() => {
      const area = document.querySelector(".midnight-lead");
      return Number(area.style.getPropertyValue("--lantern-near")) > .96 && Number(getComputedStyle(area).opacity) > .9;
    });
    await page.mouse.click(clickX, clickY);
    await waitForLight();
    await page.waitForFunction(({ x, y }) => {
      const figure = document.querySelector(".landing-wraith").getBoundingClientRect();
      return Math.hypot(figure.left + figure.width * .64 - x, figure.top + figure.height * .55 - y) < 16;
    }, { x: clickX, y: clickY });
    await page.mouse.click(width - 9, 10);
    await page.waitForFunction(() => {
      const area = document.querySelector(".midnight-lead");
      const opacity = Number(getComputedStyle(area).opacity);
      return Number(area.style.getPropertyValue("--lantern-near")) < .08 && opacity >= .69 && opacity < .75;
    });
    await page.mouse.click(clickX, clickY);
    await waitForLight();
    await page.getByRole("tab", { name: "Clone" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await page.getByRole("tabpanel", { name: "Analyze" }).waitFor();
    await page.getByRole("button", { name: "Next: Test" }).press("Enter");
    await page.getByRole("tabpanel", { name: "Test" }).waitFor();
    await replay.press("Enter");
    await page.locator(".cinema[open]").waitFor();
    await page.keyboard.press("Escape");
    await page.waitForURL("**/#/home");
    await page.locator(".cinema[open]").waitFor({ state: "detached" });
    assert.equal(await page.locator("dialog[open]").count(), 0, "Escape closes and cancels the sequence");
    await replay.press("Enter");
    await page.getByRole("button", { name: "Skip intro" }).click();
    await page.waitForURL("**/#/home");
    await page.reload();
    assert.equal(await page.locator("dialog[open]").count(), 0, "Home reload stays on home");
    const repo = page.getByRole("textbox", { name: "Repository URL" });
    await repo.fill("not-a-repository");
    await page.getByRole("button", { name: "Start investigation" }).click();
    await page.locator("form").getByText(/Enter a GitHub repository address/).waitFor();
    await repo.fill("github.com/owner/repo");
    await page.getByRole("button", { name: "Start investigation" }).click();
    await page.waitForURL(/#\/new\?repo=/);
    assert.equal(await page.locator("#case-form-repoUrl").inputValue(), "https://github.com/owner/repo");
    await context.close();
  }
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('.cinema[data-ready="true"]').waitFor();
  assert.equal(await page.locator(".cinema__clock").isVisible(), false);
  await page.getByRole("button", { name: "Touch the lantern to enter TimeWraith", exact: true }).click();
  await page.waitForURL("**/#/home");
  assert.equal(await page.locator(".midnight-lead").evaluate(area => getComputedStyle(area).opacity), "1", "Reduced motion keeps text readable");
  await context.close();
  assert.deepEqual(failures, []);
  console.log("PASS: desktop/mobile sequence, clean clock cut, click targeting, persistent light, relighting, replay, keyboard, routing, and reduced motion.");
} finally { await browser.close(); await server?.close(); }
