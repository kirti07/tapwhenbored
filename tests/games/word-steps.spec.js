// Word Steps: the word ladder.
//
// This game got the largest source change in the Vite migration — data.js
// stopped hanging its payload on window and became a real module, so game.js
// imports it. These tests exist mainly to prove that handoff still works, and
// they do it the only honest way: by playing the game. A puzzle that renders
// proves PUZZLES and LAUNCH_DATE arrived; a rejected non-word proves DICTIONARY
// arrived as a usable lookup rather than as `undefined`.

import { test, expect } from "@playwright/test";

const WORD = /^[A-Z]{4}$/;

// The editable word is the one row of buttons; each completed step is left
// behind as a .step-card above it.
const activeRow = (page) => page.locator("#ladder .active-row");
const completedSteps = (page) => page.locator("#ladder .step-card");

/** The word currently being edited. */
async function currentWord(page) {
  return (await activeRow(page).locator(".tile").allInnerTexts()).join("").trim();
}

/** Change one letter: tap the tile at `index`, pick `letter`. */
async function playLetter(page, index, letter) {
  await activeRow(page).locator(".tile").nth(index).click();
  await expect(page.locator("#letterSheet")).toHaveClass(/show/);
  await page.locator("#letterGrid button", { hasText: new RegExp(`^${letter}$`) }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/word-steps/");
});

test("today's puzzle loads from the bundled data", async ({ page }) => {
  // If the data import had failed, DATA.PUZZLES would throw and the page would
  // be blank — so real four-letter words here are the proof it landed.
  await expect(page.locator("#startWord")).toHaveText(WORD);
  await expect(page.locator("#targetWord")).toHaveText(WORD);

  const start = await page.locator("#startWord").innerText();
  expect(await currentWord(page)).toBe(start.trim());
  await expect(page.locator("#stepPill")).toContainText("0");
});

test("the same date always yields the same puzzle", async ({ page }) => {
  // The puzzle is picked deterministically from the launch date, with no
  // network involved. Two loads on the same day must agree.
  const first = await page.locator("#startWord").innerText();
  const target = await page.locator("#targetWord").innerText();
  await page.reload();
  await expect(page.locator("#startWord")).toHaveText(first.trim());
  await expect(page.locator("#targetWord")).toHaveText(target.trim());
});

test("tapping a letter opens a full picker", async ({ page }) => {
  await activeRow(page).locator(".tile").first().click();
  await expect(page.locator("#letterSheet")).toHaveClass(/show/);
  await expect(page.locator("#letterGrid button")).toHaveCount(26);
});

test("a step that is not a word is rejected", async ({ page }) => {
  const before = await currentWord(page);
  const pillBefore = await page.locator("#stepPill").innerText();

  // Q in front of any three letters is reliably not an English word, so this
  // exercises the dictionary rather than a hardcoded outcome.
  await playLetter(page, 0, "Q");

  await expect(page.locator("#hintMsg")).not.toBeEmpty();
  // The ladder must not have advanced: no step committed, count unchanged.
  await expect(page.locator("#stepPill")).toHaveText(pillBefore);
  await expect(completedSteps(page)).toHaveCount(0);
  expect(before).not.toBe("");
});

test("a valid step advances the ladder", async ({ page }) => {
  const start = (await page.locator("#startWord").innerText()).trim();
  const stepsBefore = await completedSteps(page).count();

  // Find a real one-letter change by asking the game itself: try letters until
  // one is accepted. Testing the invariant ("some valid step exists and is
  // accepted") rather than a specific word keeps this independent of which
  // puzzle today happens to be.
  let advanced = false;
  for (const letter of "ABCDEFGHIJKLMNOPRSTUVWY") {
    if (letter === start[0]) continue;
    await playLetter(page, 0, letter);
    if ((await completedSteps(page).count()) > stepsBefore) {
      advanced = true;
      break;
    }
  }
  expect(advanced, "no single-letter change from the start word was accepted").toBe(
    true,
  );
  await expect(page.locator("#stepPill")).toContainText("1");
});

test("undo reverses a step", async ({ page }) => {
  const start = (await page.locator("#startWord").innerText()).trim();
  const stepsBefore = await completedSteps(page).count();

  for (const letter of "ABCDEFGHIJKLMNOPRSTUVWY") {
    if (letter === start[0]) continue;
    await playLetter(page, 0, letter);
    if ((await completedSteps(page).count()) > stepsBefore) break;
  }
  await expect(page.locator("#stepPill")).toContainText("1");

  await page.locator("#undoBtn").click();
  await expect(page.locator("#stepPill")).toContainText("0");
  expect(await currentWord(page)).toBe(start);
});

test("restart returns to a clean board without reloading", async ({ page }) => {
  const start = (await page.locator("#startWord").innerText()).trim();
  const stepsBefore = await completedSteps(page).count();

  for (const letter of "ABCDEFGHIJKLMNOPRSTUVWY") {
    if (letter === start[0]) continue;
    await playLetter(page, 0, letter);
    if ((await completedSteps(page).count()) > stepsBefore) break;
  }

  await page.locator("#restartBtn").click();
  await expect(page.locator("#stepPill")).toContainText("0");
  expect(await currentWord(page)).toBe(start);
});
