// A whole Tap Clash, three phones: one round, the results with Share and the
// rematch controls under them, a rematch with a different game, and a host
// handoff.
//
// Runs against the preview server's in-memory room store with
// CLASH_TIME_SCALE (playwright.config.js), so every duration is scaled down.
// The boards are solved for real, inside the game iframes, by solvers
// independent of the games' own code.

import { test, expect } from "@playwright/test";
import { solve } from "../helpers/lights-out.js";
import { solveFifteen } from "../helpers/fifteen.js";

const screen = (page, name) => page.locator(`[data-screen="${name}"]`);
const EVIL = '<img src=x onerror="window.__pwned=1">';

async function phone(browser, errors, label) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`${label}: ${m.text()}`);
  });
  return page;
}

/** Play the round on this phone: wait for the board to go live, then solve it. */
async function play(page, game) {
  await expect(screen(page, "play")).toBeVisible({ timeout: 20_000 });
  const frame = page.frameLocator("iframe.round-frame");
  await expect(frame.locator("html")).toHaveAttribute("data-clash", "on");
  // Faster than the scaled minimum solve time would be refused as implausible.
  await page.waitForTimeout(400);

  if (game === "flip-it") {
    const tiles = frame.locator("#board .tile");
    const cells = await tiles.evaluateAll((els) => els.map((el) => (el.classList.contains("tile--on") ? 1 : 0)));
    const n = Math.round(Math.sqrt(cells.length));
    for (const t of solve(n, cells).picks) await tiles.nth(t).click();
  } else {
    const cells = await frame
      .locator("#tilesGrid .cell")
      .evaluateAll((els) => els.map((c) => (c.textContent.trim() ? Number(c.textContent.trim()) : null)));
    for (const v of solveFifteen(cells)) {
      await frame.locator("#tilesGrid .tile", { hasText: new RegExp(`^${v}$`) }).press("Enter");
    }
  }
}

test("a clash: pick a game, join by link and by code, end the round, podium, rematch another game, handoff", async ({ browser }) => {
  test.setTimeout(180_000);
  const errors = [];

  // The host picks Flip It with a 30 s limit and opens the room.
  const host = await phone(browser, errors, "host");
  await host.goto("/clash/");
  await host.fill("#setupName", "Aman");
  await host.locator("#setupPick .pick--flip-it").click();
  await host.locator("#setupPick .pick-cap", { hasText: "30s" }).click();
  await host.click("#setupGo");
  await expect(screen(host, "lobby")).toBeVisible();
  const code = new URL(host.url()).searchParams.get("r");
  expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  await expect(host.locator("#codeTiles")).toHaveText(code);
  await expect(host.locator("#lobbyGame")).toHaveText("Flip It · 30s");
  await expect(host.locator("#qr svg")).toBeVisible();
  await expect(host.locator("#startBtn")).toBeDisabled();

  // Riya scans the QR (opens the link).
  const riya = await phone(browser, errors, "riya");
  await riya.goto(`/clash/?r=${code}`);
  await expect(riya.locator("#joinNote")).toHaveText(/^Flip It · 30s/);
  await riya.fill("#joinName", "Riya");
  await riya.click("#joinForm button[type=submit]");
  await expect(screen(riya, "lobby")).toBeVisible();
  await expect(host.locator("#startBtn")).toBeEnabled(); // two is enough

  // The third player types the code, and a name that is markup.
  const evil = await phone(browser, errors, "evil");
  await evil.goto("/clash/?join");
  await evil.fill("#codeInput", "aeio");
  await evil.click("#codeForm button[type=submit]");
  await expect(evil.locator("#codeErr")).not.toBeEmpty();
  await evil.fill("#codeInput", code.toLowerCase());
  await evil.click("#codeForm button[type=submit]");
  await evil.fill("#joinName", EVIL);
  await evil.locator("#joinFaces .face").nth(3).click();
  await evil.click("#joinForm button[type=submit]");
  await expect(screen(evil, "lobby")).toBeVisible();

  await expect(host.locator("#roomList li")).toHaveCount(3);
  await expect(host.locator("#roomList")).toContainText(EVIL.slice(0, 24));
  await expect(host.locator("#roomList img")).toHaveCount(0);
  await expect(riya.locator("#startBtn")).toBeHidden();
  await expect(riya.locator("#lobbyWait")).toHaveText("Waiting for Aman to start…");

  // The round: two solve and wait on the sheet; the third never touches the
  // board, so the host calls time.
  await host.click("#startBtn");

  // Joining closes when the host starts: a fourth phone opening the link now
  // is told so, not offered a seat.
  const lateP = await phone(browser, errors, "late");
  await lateP.goto(`/clash/?r=${code}`);
  await expect(screen(lateP, "gone")).toBeVisible();
  await expect(lateP.locator("#goneH")).toHaveText("This clash has already started");
  await lateP.context().close();

  await Promise.all([play(host, "flip-it"), play(riya, "flip-it")]);
  await expect(host.locator("#sheet")).toBeVisible();
  // The sheet lists only who has finished, ranked, and counts the rest.
  const finished = host.locator("#sheetList li");
  await expect(finished).toHaveCount(2);
  await expect(host.locator("#sheetList")).toContainText("Aman");
  await expect(host.locator("#sheetList")).toContainText("Riya");
  await expect(host.locator("#sheetList")).not.toContainText(EVIL.slice(0, 12));
  await expect(finished.first().locator(".medal")).toHaveText("1");
  await expect(host.locator("#sheetLabel")).toHaveText("Finished · 2 of 3");
  await expect(host.locator("#sheetStill")).toHaveText("1 still playing");
  await expect(riya.locator("#endBtn")).toBeHidden();
  await host.click("#endBtn");

  // The finale on every phone: podium, the full table, awards.
  for (const p of [host, riya, evil]) await expect(screen(p, "final")).toBeVisible({ timeout: 20_000 });
  await expect(host.locator("#podH")).toHaveText(/ takes it\.$/);
  const rows = host.locator("#resList .res-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText("didn't finish");

  // What next, on the same screen: Share for everyone, rematch for the host.
  await expect(riya.locator("#shareBtn")).toBeVisible();
  await expect(riya.locator("#hostOwn")).toBeVisible();
  await expect(host.locator("#hostActions")).toBeVisible();
  await expect(riya.locator("#hostActions")).toBeHidden();
  await expect(riya.locator("#rematchWait")).toBeVisible();
  expect(await riya.evaluate(() => JSON.parse(localStorage.getItem("twb:clash.guest")).host)).toBe("Aman");

  // A reload lands back on the results in the same seat, not on the join form.
  await riya.reload();
  await expect(screen(riya, "final")).toBeVisible();

  // Rematch with a different game: everyone is pulled in with the same name.
  await host.click("#changeBtn");
  await host.locator("#changePick .pick--slide-n-order").click();
  await host.locator("#changePick .pick-cap", { hasText: "60s" }).click();
  await host.click("#changeForm button[type=submit]");
  await expect(screen(host, "lobby")).toBeVisible();
  await expect(host.locator("#lobbyGame")).toHaveText("Slide N Order · 60s");
  const next = new URL(host.url()).searchParams.get("r");
  expect(next).not.toBe(code);
  for (const p of [riya, evil]) {
    await expect(p).toHaveURL(new RegExp(`r=${next}$`), { timeout: 15_000 });
    await expect(screen(p, "lobby")).toBeVisible();
  }
  await expect(host.locator("#roomList li")).toHaveCount(3);

  // The new round: everyone solves, so it closes as soon as they have.
  await host.click("#startBtn");
  await Promise.all([play(host, "slide-n-order"), play(riya, "slide-n-order"), play(evil, "slide-n-order")]);
  for (const p of [host, riya, evil]) await expect(screen(p, "final")).toBeVisible({ timeout: 20_000 });
  await expect(host.locator("#resList .res-row")).toHaveCount(3);
  await expect(host.locator("#resList")).not.toContainText("didn't finish");

  // The host leaves. After the (scaled) 20 s away window, the guest who joined
  // the new room first becomes the host and gets the rematch controls.
  await host.context().close();
  await expect
    .poll(async () => (await riya.locator("#hostActions").isVisible()) || (await evil.locator("#hostActions").isVisible()), { timeout: 20_000 })
    .toBe(true);

  for (const p of [riya, evil]) expect(await p.evaluate(() => window.__pwned)).toBeUndefined();
  expect(errors).toEqual([]);
});
