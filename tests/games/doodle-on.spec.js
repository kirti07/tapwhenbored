// Doodle On: a starting shape, a mismatched creative direction, 30 seconds.
//
// The shape and the direction are drawn from pools on every round, so these
// tests assert invariants rather than a particular round (GAME-TESTING.md §7).
// "the circle is filled" is true of one round; "a bucket tap paints pixels" is
// true of every round.
//
// Canvas content has no DOM, so progress is measured by counting opaque pixels
// on each layer and by sampling individual pixels.
//
// The 30-second clock is driven with page.clock rather than waited out. Two
// things to know about that:
//   1. install() must happen before goto, or the game module has already
//      captured the real timers.
//   2. CSS animations keep running on the real clock and do not fast-forward,
//      so the draining timer bar's transform is never asserted here — only the
//      numeral, the urgency class and the overlay, all of which are JS state.

import { test, expect } from "@playwright/test";

const PINK = [255, 95, 150];
const TEAL = [46, 230, 184];

/** Opaque pixels on a layer. The unit is arbitrary; only the direction of change matters. */
const inked = (page, sel) =>
  page.locator(sel).evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n;
  });

/** One pixel, addressed in CSS pixels relative to the canvas. */
const pixelAt = (page, sel, x, y) =>
  page.locator(sel).evaluate((c, p) => {
    const k = c.width / c.clientWidth;
    const d = c
      .getContext("2d")
      .getImageData(Math.round(p.x * k), Math.round(p.y * k), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, { x, y });

const box = (page) => page.locator("#canvas").boundingBox();

/** A straight drag across the canvas, in fractions of its box. */
async function stroke(page, x1, y1, x2, y2) {
  const b = await box(page);
  await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * ((x1 + x2) / 2), b.y + b.height * ((y1 + y2) / 2));
  await page.mouse.move(b.x + b.width * x2, b.y + b.height * y2);
  await page.mouse.up();
}

async function tapCanvas(page, fx, fy) {
  const b = await box(page);
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
}

function collectErrors(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));
  return () => errors;
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto("/doodle-on/");
  // The webfont changes the height of the rows around the canvas, so the
  // drawing box is resized shortly after load and the starting shape is
  // re-stamped at the new size. Pixel counts are only comparable on the far
  // side of that, so wait for the font and flush the debounced resize.
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(300);
});

test("a round starts with a shape on the canvas and a full clock", async ({ page }) => {
  // The prompt is the tutorial: the contradiction between the two halves is
  // the whole game, so both halves have to be there.
  await expect(page.locator("#promptText")).toHaveText(/turn this .+ into .+/i);
  expect((await page.locator("#promptShape").innerText()).trim()).not.toBe("");
  expect((await page.locator("#promptDir").innerText()).trim()).not.toBe("");

  // The starting shape is stamped before any input.
  expect(await inked(page, "#canvas")).toBeGreaterThan(0);
  expect(await inked(page, "#paintCanvas")).toBe(0);

  await expect(page.locator("#timerVal")).toHaveText("0:30");
  await expect(page.locator("#undoTool")).toBeDisabled();
  // The prompt nudges while the round waits, so it cannot be skimmed past.
  await expect(page.locator("#promptText")).toHaveClass(/nudge/);
});

test("the clock does not start until the first mark", async ({ page }) => {
  await page.clock.fastForward("00:03");
  await expect(page.locator("#timerVal")).toHaveText("0:30");

  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  await page.clock.fastForward("00:05");
  await expect(page.locator("#timerVal")).toHaveText("0:25");
});

test("lifting your finger does not end the round", async ({ page }) => {
  // This is the mechanic the redesign replaces: a lift used to be game over.
  await stroke(page, 0.2, 0.75, 0.8, 0.75);
  await expect(page.locator("#overlay")).not.toHaveClass(/show/);
  await expect(page.locator("#idlePrompt")).toHaveClass(/hide/);
  // The nudge has served its purpose once the player has started.
  await expect(page.locator("#promptText")).not.toHaveClass(/nudge/);

  const afterFirst = await inked(page, "#canvas");
  await stroke(page, 0.2, 0.85, 0.8, 0.85);
  expect(await inked(page, "#canvas")).toBeGreaterThan(afterFirst);
  await expect(page.locator("#overlay")).not.toHaveClass(/show/);
});

test("the chosen colour is the colour that lands on the canvas", async ({ page }) => {
  const swatches = page.locator("#swatches .swatch");
  await expect(swatches).toHaveCount(6);
  // Rainbow is the default, and it is what keeps the original game's identity.
  await expect(swatches.nth(0)).toHaveClass(/is-active/);

  await swatches.nth(2).click(); // pink
  await expect(swatches.nth(2)).toHaveClass(/is-active/);
  await expect(swatches.nth(0)).not.toHaveClass(/is-active/);

  const b = await box(page);
  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  const px = await pixelAt(page, "#canvas", b.width * 0.5, b.height * 0.8);
  expect(px.slice(0, 3)).toEqual(PINK);
  expect(px[3]).toBe(255);
});

test("the bucket paints, and repainting the same region just recolours it", async ({ page }) => {
  await page.locator("#paintTool").click();
  await expect(page.locator("#paintTool")).toHaveClass(/is-active/);

  // A corner is open paper in every round: the shape is centred and spans a
  // little over half the short side, so it never reaches here.
  const swatches = page.locator("#swatches .swatch");
  await swatches.nth(2).click(); // pink
  await tapCanvas(page, 0.06, 0.06);

  const painted = await inked(page, "#paintCanvas");
  expect(painted).toBeGreaterThan(0);

  const b = await box(page);
  expect((await pixelAt(page, "#paintCanvas", b.width * 0.06, b.height * 0.06)).slice(0, 3))
    .toEqual(PINK);

  // Boundaries are recomputed from the stroke layer, so a second fill of the
  // same region replaces the colour rather than accumulating on top of it.
  await swatches.nth(4).click(); // teal
  await tapCanvas(page, 0.06, 0.06);
  const after = await pixelAt(page, "#paintCanvas", b.width * 0.06, b.height * 0.06);
  expect(after.slice(0, 3)).toEqual(TEAL);
  expect(after[3]).toBe(255);
  expect(await inked(page, "#paintCanvas")).toBe(painted);
});

test("the bucket does not draw, and a tap on a line does nothing", async ({ page }) => {
  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  const lines = await inked(page, "#canvas");

  await page.locator("#paintTool").click();
  // A drag in paint mode must not leave a stroke.
  await stroke(page, 0.3, 0.6, 0.7, 0.6);
  expect(await inked(page, "#canvas")).toBe(lines);

  // Tapping the line itself is a no-op: there is no open region under it.
  const paintedBefore = await inked(page, "#paintCanvas");
  await tapCanvas(page, 0.5, 0.8);
  expect(await inked(page, "#paintCanvas")).toBe(paintedBefore);
});

test("undo takes back the last stroke, and the last fill", async ({ page }) => {
  const base = await inked(page, "#canvas");
  const undoBtn = page.locator("#undoTool");
  await expect(undoBtn).toBeDisabled();

  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  expect(await inked(page, "#canvas")).toBeGreaterThan(base);
  await expect(undoBtn).toBeEnabled();

  await undoBtn.click();
  expect(Math.abs((await inked(page, "#canvas")) - base)).toBeLessThanOrEqual(2);
  // One step only: there is nothing left to take back.
  await expect(undoBtn).toBeDisabled();

  await page.locator("#paintTool").click();
  await tapCanvas(page, 0.06, 0.06);
  expect(await inked(page, "#paintCanvas")).toBeGreaterThan(0);
  await expect(undoBtn).toBeEnabled();

  await undoBtn.click();
  expect(await inked(page, "#paintCanvas")).toBe(0);
  await expect(undoBtn).toBeDisabled();
});

test("Clear wipes the drawing but keeps the round and the clock", async ({ page }) => {
  const base = await inked(page, "#canvas");
  const prompt = await page.locator("#promptText").innerText();

  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  await page.clock.fastForward("00:05");
  await expect(page.locator("#timerVal")).toHaveText("0:25");
  await page.locator("#paintTool").click();
  await tapCanvas(page, 0.06, 0.06);
  expect(await inked(page, "#paintCanvas")).toBeGreaterThan(0);

  await page.locator("#clearTool").click();

  expect(Math.abs((await inked(page, "#canvas")) - base)).toBeLessThanOrEqual(2);
  expect(await inked(page, "#paintCanvas")).toBe(0);
  // Same round: Clear is not a restart.
  expect(await page.locator("#promptText").innerText()).toBe(prompt);
  await expect(page.locator("#timerVal")).toHaveText("0:25");
  await expect(page.locator("#overlay")).not.toHaveClass(/show/);
});

test("Done ends the round and shows the doodle with its prompt", async ({ page }) => {
  const shape = (await page.locator("#promptShape").innerText()).trim();
  const dir = (await page.locator("#promptDir").innerText()).trim();

  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  await page.clock.fastForward("00:08");
  await page.locator("#doneBtn").click();

  // The doodle is presented before the card appears, so let that play out.
  await page.clock.runFor(1000);
  await expect(page.locator("#overlay")).toHaveClass(/show/);
  // Finishing early is not the clock running out: the readout has to freeze at
  // what was left rather than snap to zero.
  await expect(page.locator("#timerVal")).toHaveText("0:22");
  await expect(page.locator("#overlayTitle")).toHaveText(/you made this/i);
  await expect(page.locator("#overlaySub")).toContainText(shape, { ignoreCase: true });
  await expect(page.locator("#overlaySub")).toContainText(dir, { ignoreCase: true });
  await expect(page.locator("#againBtn")).toBeVisible();
  await expect(page.locator("#shareBtn")).toBeVisible();
  // The finished picture keeps drifting while the card is up.
  await expect(page.locator("#layers")).toHaveClass(/presented/);
  // Tools are inert now, and must not look otherwise.
  await expect(page.locator(".toolbar")).toHaveClass(/locked/);
});

test("the clock running out ends the round on its own", async ({ page }) => {
  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  const drawn = await inked(page, "#canvas");

  await page.clock.fastForward("00:26");
  await expect(page.locator("#timerPill")).toHaveClass(/urgent/);
  await expect(page.locator("#overlay")).not.toHaveClass(/show/);

  await page.clock.fastForward("00:06");
  await expect(page.locator("#timerVal")).toHaveText("0:00");
  await expect(page.locator("#overlay")).toHaveClass(/show/);

  // A finished round accepts no more input.
  await stroke(page, 0.2, 0.4, 0.8, 0.4);
  expect(await inked(page, "#canvas")).toBe(drawn);
});

test("reading the rules does not burn the clock", async ({ page }) => {
  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  await page.clock.fastForward("00:05");
  await expect(page.locator("#timerVal")).toHaveText("0:25");

  await page.locator("#howtoBtn").click();
  await expect(page.locator("#howtoSheet")).toHaveClass(/show/);
  await page.clock.fastForward("00:10");
  await expect(page.locator("#timerVal")).toHaveText("0:25");

  await page.locator("#howtoBackdrop").click();
  await expect(page.locator("#howtoSheet")).not.toHaveClass(/show/);
  await page.clock.fastForward("00:05");
  await expect(page.locator("#timerVal")).toHaveText("0:20");
});

test("New prompt gives a different round and a clean canvas", async ({ page }) => {
  const before = await page.locator("#promptText").innerText();
  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  await page.locator("#paintTool").click();
  await tapCanvas(page, 0.06, 0.06);
  await page.clock.fastForward("00:05");

  await page.locator("#restartBtn").click();

  // Neither half of the prompt may repeat, so the sentence always changes.
  expect(await page.locator("#promptText").innerText()).not.toBe(before);
  await expect(page.locator("#timerVal")).toHaveText("0:30");
  expect(await inked(page, "#paintCanvas")).toBe(0);
  expect(await inked(page, "#canvas")).toBeGreaterThan(0);
  await expect(page.locator("#undoTool")).toBeDisabled();
  await expect(page.locator("#idlePrompt")).not.toHaveClass(/hide/);

  // And it is playable again, without a reload.
  const shapeOnly = await inked(page, "#canvas");
  await page.locator("#pencilTool").click();
  await stroke(page, 0.2, 0.7, 0.8, 0.7);
  expect(await inked(page, "#canvas")).toBeGreaterThan(shapeOnly);
});

test("Play again after finishing starts a fresh round", async ({ page }) => {
  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  await page.locator("#doneBtn").click();
  await page.clock.runFor(1000);
  await expect(page.locator("#overlay")).toHaveClass(/show/);

  await page.locator("#againBtn").click();
  await expect(page.locator("#overlay")).not.toHaveClass(/show/);
  await expect(page.locator("#layers")).not.toHaveClass(/presented/);
  await expect(page.locator(".toolbar")).not.toHaveClass(/locked/);
  await expect(page.locator("#promptText")).toHaveClass(/nudge/);
  await expect(page.locator("#timerVal")).toHaveText("0:30");
  expect(await inked(page, "#paintCanvas")).toBe(0);

  const shapeOnly = await inked(page, "#canvas");
  await stroke(page, 0.2, 0.7, 0.8, 0.7);
  expect(await inked(page, "#canvas")).toBeGreaterThan(shapeOnly);
});

test("hammering the tools does not break the round", async ({ page }) => {
  const errors = collectErrors(page);
  for (let i = 0; i < 8; i++) {
    await page.locator("#paintTool").click();
    await page.locator("#pencilTool").click();
  }
  const before = await inked(page, "#canvas");
  await stroke(page, 0.2, 0.8, 0.8, 0.8);
  expect(await inked(page, "#canvas")).toBeGreaterThan(before);

  // A drag that leaves the canvas and comes back must not throw.
  const b = await box(page);
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x - 60, b.y + b.height * 0.5);
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6);
  await page.mouse.up();

  expect(errors()).toEqual([]);
});

test("touch drives the pencil and the bucket", async ({ page, browserName }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "touch input is asserted on the mobile project");

  const b = await box(page);
  const base = await inked(page, "#canvas");
  await page.touchscreen.tap(b.x + b.width * 0.5, b.y + b.height * 0.85);
  expect(await inked(page, "#canvas")).toBeGreaterThan(base);
  await expect(page.locator("#idlePrompt")).toHaveClass(/hide/);

  await page.locator("#paintTool").click();
  await page.touchscreen.tap(b.x + b.width * 0.06, b.y + b.height * 0.06);
  expect(await inked(page, "#paintCanvas")).toBeGreaterThan(0);
});
