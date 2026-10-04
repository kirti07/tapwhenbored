// A whole Tap Party, three phones: one round, the results with Share and the
// rematch controls under them, a rematch with a different game, and a host
// handoff.
//
// Runs against the preview server's in-memory room store with
// PARTY_TIME_SCALE (playwright.config.js), so every duration is scaled down.
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
  await expect(frame.locator("html")).toHaveAttribute("data-party", "on");
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

test("a party: pick a game, join by link and by code, end the round, podium, rematch another game, handoff", async ({ browser }) => {
  test.setTimeout(180_000);
  const errors = [];

  // The host picks Flip It with a 30 s limit and opens the room.
  const host = await phone(browser, errors, "host");
  await host.goto("/party/");
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
  await riya.goto(`/party/?r=${code}`);
  await expect(riya.locator("#joinNote")).toHaveText(/^Flip It · 30s/);
  await riya.fill("#joinName", "Riya");
  await riya.click("#joinForm button[type=submit]");
  await expect(screen(riya, "lobby")).toBeVisible();
  await expect(host.locator("#startBtn")).toBeEnabled(); // two is enough

  // The third player types the code, and a name that is markup.
  const evil = await phone(browser, errors, "evil");
  await evil.goto("/party/?join");
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
  await lateP.goto(`/party/?r=${code}`);
  await expect(screen(lateP, "gone")).toBeVisible();
  await expect(lateP.locator("#goneH")).toHaveText("This party has already started");
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
  // Share says who won and links the setup page, not this room.
  await riya.evaluate(() => { navigator.share = (d) => { window.shared = d; return Promise.resolve(); }; });
  await riya.click("#shareBtn");
  const shared = await riya.evaluate(() => window.shared);
  expect(shared.text).toMatch(/^.+ won ".+" — Flip It on Tap Party\. Start your own:$/);
  expect(shared.url).toMatch(/\/party\/\?from=share$/);
  await expect(riya.locator("#hostOwn")).toBeVisible();
  await expect(host.locator("#hostActions")).toBeVisible();
  await expect(riya.locator("#hostActions")).toBeHidden();
  await expect(riya.locator("#rematchWait")).toBeVisible();
  expect(await riya.evaluate(() => JSON.parse(localStorage.getItem("twb:party.guest")).host)).toBe("Aman");

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

/** Scribble on the round's canvas, inside the frame, then hand it in. */
async function scribble(page) {
  await expect(screen(page, "play")).toBeVisible({ timeout: 20_000 });
  const frame = page.frameLocator("iframe.round-frame");
  await expect(frame.locator("html")).toHaveAttribute("data-party", "on");
  await expect(frame.locator("#promptDir")).not.toBeEmpty();
  // Faster than the scaled minimum drawing time would be refused.
  await page.waitForTimeout(500);
  const box = await frame.locator("#canvas").boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await frame.locator("#doneBtn").click();
}

test("a Doodle On party: draw, name it, vote anonymously, the reveal", async ({ browser }) => {
  test.setTimeout(120_000);
  const errors = [];

  const host = await phone(browser, errors, "host");
  await host.goto("/party/");
  await host.fill("#setupName", "Aman");
  await host.locator("#setupPick .pick--doodle-on").click();
  await expect(host.locator("#setupPick .pick-cap")).toHaveText(["30s", "45s", "60s"]);
  await host.click("#setupGo");
  await expect(host.locator("#lobbyGame")).toHaveText("Doodle On · 30s");
  const code = new URL(host.url()).searchParams.get("r");

  const guests = [];
  for (const name of ["Riya", "Dev", "Kabir"]) {
    const p = await phone(browser, errors, name);
    await p.goto(`/party/?r=${code}`);
    await expect(p.locator("#joinNote")).toHaveText(/everyone draws, then the room votes/);
    await p.fill("#joinName", name);
    await p.click("#joinForm button[type=submit]");
    await expect(screen(p, "lobby")).toBeVisible();
    guests.push(p);
  }
  const [riya, dev, kabir] = guests;

  await host.click("#startBtn");
  // The title card says what to draw. It lasts a second at test speed, so
  // only the host — first to hear the start — is sure to catch it.
  await expect(screen(host, "title")).toBeVisible();
  await expect(host.locator("#titleRule")).toHaveText(/^Turn this \w+ into .+\.$/);

  // Aman and Riya draw; Kabir taps Done on a blank page; Dev never touches it.
  await Promise.all([scribble(host), scribble(riya)]);
  await expect(kabir.frameLocator("iframe.round-frame").locator("html")).toHaveAttribute("data-party", "on");
  await kabir.waitForTimeout(400);
  await kabir.frameLocator("iframe.round-frame").locator("#doneBtn").click();
  await expect(kabir.locator("#sheetH")).toHaveText("Nothing drawn");
  await expect(host.locator("#pbDone")).toHaveText("3 / 4");
  await expect(host.locator("#sheetH")).toHaveText("Your doodle's in");
  await expect(host.locator("#sheetStill")).toHaveText(/still drawing/);
  await expect(dev.locator("#toast")).toContainText("is done");
  // Aman names it — secret until the reveal.
  await host.fill("#titleInput", "a very sleepy shark");
  await host.click("#titleForm button[type=submit]");
  await expect(host.locator("#titleNote")).toHaveText(/^Saved/);
  await host.click("#endBtn");

  // The vote: two doodles, no names; your own is greyed.
  for (const p of [host, riya, dev, kabir]) await expect(screen(p, "vote")).toBeVisible({ timeout: 20_000 });
  for (const p of [host, riya, dev, kabir]) await expect(p.locator("#voteGrid .vote-tile")).toHaveCount(2);
  await expect(host.locator("#voteGrid")).not.toContainText("Aman");
  await expect(host.locator(".vote-tile.is-own")).toHaveCount(1);
  await expect(host.locator(".vote-tile.is-own")).toBeDisabled();
  await expect(dev.locator(".vote-tile.is-own")).toHaveCount(0);
  const tag = await host.locator(".vote-tile.is-own").getAttribute("data-tag");
  await host.locator(".vote-tile:not(.is-own)").click();
  await riya.locator(".vote-tile:not(.is-own)").click();
  await dev.locator(`.vote-tile[data-tag="${tag}"]`).click();
  await expect(dev.locator(`.vote-tile[data-tag="${tag}"]`)).toHaveClass(/is-picked/);
  await kabir.locator(`.vote-tile[data-tag="${tag}"]`).click();

  // Everyone voted: the reveal, with the title as the answer.
  for (const p of [host, riya, dev, kabir]) await expect(screen(p, "final")).toBeVisible({ timeout: 20_000 });
  await expect(riya.locator("#podH")).toHaveText("Aman takes it.");
  await expect(riya.locator("#topTitle")).toHaveText("“a very sleepy shark”");
  await expect(riya.locator("#topBy")).toContainText("Aman · 3 votes");
  await expect(riya.locator("#restDoodles .doodle")).toHaveCount(1);
  await expect(riya.locator("#resList .res-row")).toHaveCount(4);
  await expect(riya.locator("#resList .res-row").nth(2)).toContainText("didn't draw");
  await expect(riya.locator("#resList .res-row").nth(3)).toContainText("didn't draw");
  await expect.poll(() => riya.locator("#topImg").evaluate((img) => img.naturalWidth)).toBe(256);
  await expect(riya.locator("#recapOpt")).toBeVisible();

  // Share makes the recap card: a file on phones that take one, else a download.
  const download = riya.waitForEvent("download");
  await riya.evaluate(() => { navigator.canShare = undefined; });
  await riya.click("#shareBtn");
  expect((await download).suggestedFilename()).toBe("tap-party.jpg");

  expect(errors).toEqual([]);
});

test("a Doodle On party where every page comes back blank still reaches the final", async ({ browser }) => {
  test.setTimeout(120_000);
  const errors = [];

  const host = await phone(browser, errors, "host");
  await host.goto("/party/");
  await host.fill("#setupName", "Aman");
  await host.locator("#setupPick .pick--doodle-on").click();
  await host.click("#setupGo");
  await expect(screen(host, "lobby")).toBeVisible();
  const code = new URL(host.url()).searchParams.get("r");
  const phones = [host];
  for (const name of ["Riya", "Dev", "Kabir"]) {
    const p = await phone(browser, errors, name);
    await p.goto(`/party/?r=${code}`);
    await p.fill("#joinName", name);
    await p.click("#joinForm button[type=submit]");
    await expect(screen(p, "lobby")).toBeVisible();
    phones.push(p);
  }
  await host.click("#startBtn");

  // Everyone taps Done without drawing a line.
  await Promise.all(phones.map(async (p) => {
    await expect(screen(p, "play")).toBeVisible({ timeout: 20_000 });
    const frame = p.frameLocator("iframe.round-frame");
    await expect(frame.locator("html")).toHaveAttribute("data-party", "on");
    await p.waitForTimeout(400);
    await frame.locator("#doneBtn").click();
  }));

  for (const p of phones) await expect(screen(p, "final")).toBeVisible({ timeout: 20_000 });
  await expect(host.locator("#podH")).toHaveText("Nobody drew anything.");
  await expect(host.locator("#topDoodle")).toBeHidden();
  await expect(host.locator("#restDoodles")).toBeHidden();
  await expect(host.locator("#resList .res-row")).toHaveCount(4);

  expect(errors).toEqual([]);
});

test("setup: the games first, grouped by kind; the face and the party name stay optional", async ({ browser }) => {
  const errors = [];
  const host = await phone(browser, errors, "host");
  await host.goto("/party/");

  // Two groups, each a labelled half of one radio group.
  const kinds = host.locator("#setupPick .pick-kind");
  await expect(kinds).toHaveCount(2);
  await expect(kinds.nth(0)).toContainText("Competitive");
  await expect(kinds.nth(0).locator(".pick-game")).toHaveCount(2);
  await expect(kinds.nth(1)).toContainText("Social");
  await expect(kinds.nth(1).locator(".pick--doodle-on")).toContainText("Draw it, then the room votes.");
  // How many players each game takes, beside its name.
  for (const [slug, range] of [["flip-it", "2–10"], ["slide-n-order", "2–10"], ["doodle-on", "4–12"], ["humour-me", "4–12"], ["sounds-sus", "4–12"]]) {
    await expect(host.locator(`#setupPick .pick--${slug} .pick-who`)).toHaveText(range);
  }
  await expect(host.locator('#setupPick [role=radiogroup][aria-label="Game"] [aria-checked=true]')).toHaveCount(1);

  // Picking across groups keeps one choice, and the limits follow the game.
  await host.locator("#setupPick .pick--doodle-on").click();
  await expect(host.locator("#setupPick .pick-game[aria-checked=true]")).toHaveCount(1);
  await expect(host.locator("#setupPick .pick-cap")).toHaveText(["30s", "45s", "60s"]);
  await expect(host.locator('#setupPick .pick-cap[aria-checked="true"]')).toHaveText("30s");
  await host.locator("#setupPick .pick--slide-n-order").focus();
  await host.keyboard.press("Enter");
  await expect(host.locator("#setupPick .pick--slide-n-order")).toHaveAttribute("aria-checked", "true");
  await expect(host.locator("#setupPick .pick-cap")).toHaveCount(4);

  // The face is a button showing the chosen one; the grid opens on demand.
  await expect(host.locator("#setupFaces")).toBeHidden();
  await host.click("#setupFaceBtn");
  await expect(host.locator("#setupFaceBtn")).toHaveAttribute("aria-expanded", "true");
  await host.locator("#setupFaces .face").nth(2).click();
  await expect(host.locator("#setupFaces")).toBeHidden();
  await expect(host.locator("#setupFaceBtn")).toHaveText("🦖");

  // The party name is a line until it is renamed.
  await expect(host.locator("#setupPartyField")).toBeHidden();
  await host.click("#setupPartyEdit");
  await expect(host.locator("#setupParty")).toBeFocused();
  await host.fill("#setupParty", "Game Night");

  await host.fill("#setupName", "Aman");
  await host.click("#setupGo");
  await expect(screen(host, "lobby")).toBeVisible();
  await expect(host.locator("#lobbyName")).toHaveText("Game Night");
  await expect(host.locator("#lobbyGame")).toHaveText("Slide N Order · 90s");
  await expect(host.locator("#roomList")).toContainText("🦖");
  expect(errors).toEqual([]);
});

/** A host who picks `pick` and three guests who join: [host, ...guests]. */
async function room4(browser, errors, pick) {
  const host = await phone(browser, errors, "host");
  await host.goto("/party/");
  await host.fill("#setupName", "Aman");
  await host.locator(`#setupPick .pick--${pick}`).click();
  // One fixed timer: nothing to pick.
  await expect(host.locator("#setupPick .pick-caps")).toBeHidden();
  await host.click("#setupGo");
  await expect(screen(host, "lobby")).toBeVisible();
  await expect(host.locator("#startBtn")).toHaveText("Waiting for 3 more");
  const code = new URL(host.url()).searchParams.get("r");
  const phones = [host];
  for (const name of ["Riya", "Dev", "Kabir"]) {
    const p = await phone(browser, errors, name);
    await p.goto(`/party/?r=${code}`);
    await p.fill("#joinName", name);
    await p.click("#joinForm button[type=submit]");
    await expect(screen(p, "lobby")).toBeVisible();
    phones.push(p);
  }
  await expect(host.locator("#startBtn")).toHaveText("Start · 4 players");
  return phones;
}

test("Humour Me with 9 players: the title card counts the longer vote", async ({ browser }) => {
  test.setTimeout(120_000);
  const errors = [];
  const host = await phone(browser, errors, "host");
  await host.goto("/party/");
  await host.fill("#setupName", "Aman");
  await host.locator("#setupPick .pick--humour-me").click();
  await host.click("#setupGo");
  await expect(screen(host, "lobby")).toBeVisible();
  const code = new URL(host.url()).searchParams.get("r");
  for (let n = 1; n < 9; n++) {
    const p = await phone(browser, errors, `P${n}`);
    await p.goto(`/party/?r=${code}`);
    await p.fill("#joinName", `P${n}`);
    await p.click("#joinForm button[type=submit]");
    await expect(screen(p, "lobby")).toBeVisible();
  }
  await expect(host.locator("#startBtn")).toHaveText("Start · 9 players");
  await host.click("#startBtn");

  // Two more seconds for each entry past eight.
  await expect(screen(host, "title")).toBeVisible();
  await expect(host.locator("#titleChip")).toHaveText("32 sec to vote");
  await expect(host.locator("#titleFoot")).toHaveText("9 players ready");
  expect(errors).toEqual([]);
});

test("Humour Me: everyone finishes the phrase, votes anonymously, the reveal, play again", async ({ browser }) => {
  test.setTimeout(120_000);
  const errors = [];
  const phones = await room4(browser, errors, "humour-me");
  const [host, riya, dev, kabir] = phones;
  await host.click("#startBtn");

  await expect(screen(host, "title")).toBeVisible();
  await expect(host.locator("#titleGame")).toHaveText("Humour Me");
  const phrase = (await host.locator("#titleRule").textContent()).replace("______", "");
  for (const p of phones) await expect(p.locator(".hm-phrase")).toBeVisible({ timeout: 20_000 });
  await expect(host.locator(".hm-phrase")).toContainText(phrase.trim().slice(0, 10));

  // The phrase doesn't suit the room: only the host can skip it, and the
  // round starts again on a new one, title card and all.
  await expect(riya.getByRole("button", { name: /Skip phrase/ })).toBeHidden();
  await host.getByRole("button", { name: "Skip phrase" }).click();
  for (const p of phones) await expect(screen(p, "title")).toBeVisible({ timeout: 20_000 });
  const next = (await host.locator("#titleRule").textContent()).replace("______", "");
  expect(next).not.toBe(phrase);
  for (const p of phones) await expect(p.locator(".hm-phrase")).toContainText(next.trim().slice(0, 10), { timeout: 20_000 });
  await expect(host.getByRole("button", { name: "Skip phrase" })).toBeHidden(); // once a round

  const lines = ["my emotional support traffic jam", EVIL, "a very good dog needed me", "I was here first"];
  // The host answers last: their answer opens the vote, and must still be
  // marked as theirs.
  for (const [n, p] of [...phones.entries()].reverse()) {
    await p.fill(".hm-input", lines[n]);
    await p.click(".hm-write button[type=submit]");
  }
  // Everyone answered: straight to the vote.
  for (const p of phones) await expect(screen(p, "vote")).toBeVisible({ timeout: 20_000 });
  await expect(host.locator("#voteH")).toHaveText("Which one's the funniest?");
  await expect(host.locator("#voteGrid .vote-tile")).toHaveCount(4);
  await expect(host.locator(".vote-tile.is-own")).toContainText(lines[0]);
  await expect(host.locator("#voteGrid")).not.toContainText("Aman");
  const evil = host.locator(".vote-tile", { hasText: EVIL });
  await expect(evil).toHaveCount(1); // shown as text, never as markup
  await Promise.all([
    ...[host, riya, kabir].map((p) => p.locator(".vote-tile", { hasText: lines[2] }).click()),
    dev.locator(".vote-tile", { hasText: lines[0] }).click(),
  ]);

  for (const p of phones) await expect(screen(p, "final")).toBeVisible({ timeout: 20_000 });
  await expect(riya.locator("#podH")).toHaveText("Dev takes it.");
  await expect(riya.locator(".hm-line")).toHaveText(`“${lines[2]}”`);
  await expect(riya.locator(".hm-by")).toContainText("Dev · 3 votes");
  await expect(riya.locator(".hm-list li")).toHaveCount(3);
  expect(await riya.evaluate(() => window.__pwned)).toBeUndefined();

  // Play again: everyone follows into a new room with the same game.
  await host.click("#rematchBtn");
  for (const p of phones) await expect(screen(p, "lobby")).toBeVisible({ timeout: 20_000 });
  await expect(riya.locator("#lobbyGame")).toHaveText("Humour Me");
  expect(errors).toEqual([]);
});

test("Sounds Sus: secret cards, clues, an innocent voted out, the spy caught in lap 2", async ({ browser }) => {
  test.setTimeout(150_000);
  const errors = [];
  const phones = await room4(browser, errors, "sounds-sus");
  const [host] = phones;
  await host.click("#startBtn");
  for (const p of phones) await expect(screen(p, "game")).toBeVisible({ timeout: 20_000 });
  // The title card said the vote's length: a flat 30 s, however many play.
  await expect(host.locator("#titleChip")).toHaveText("30 sec to vote");

  // Everyone peeks: three see the word, one sees SPY.
  const seen = [];
  for (const p of phones) {
    await p.getByRole("button", { name: "Reveal my card" }).click();
    await expect(p.locator(".ss-card .ss-w")).not.toHaveText("…");
    seen.push(await p.locator(".ss-card .ss-w").textContent());
    await p.getByRole("button", { name: "Hide & ready" }).click();
  }
  const spy = seen.indexOf("SPY");
  expect(spy).toBeGreaterThanOrEqual(0);
  expect(new Set(seen.filter((w) => w !== "SPY")).size).toBe(1);

  // Lap 1: the speaker taps Done; the host calls the vote.
  // The vote is short at test speed: every phone is on the clues first.
  await Promise.all(phones.map((p) => expect(p.locator(".ss-order")).toBeVisible({ timeout: 20_000 })));
  await host.getByRole("button", { name: "Start voting" }).click();
  const names = ["Aman", "Riya", "Dev", "Kabir"];
  const inno = [1, 2, 3].find((n) => n !== spy);
  // The vote is short at test speed: every phone votes at once.
  await Promise.all(phones.map(async (p, n) => {
    const target = n === inno ? names[n === 0 ? 1 : 0] : names[inno]; // never yourself
    await p.locator(".ss-tile", { hasText: target }).click({ timeout: 20_000 });
  }));
  // Out, but the spy is not named.
  await expect(host.locator(".ss-now")).toContainText(`${names[inno]} is out`, { timeout: 20_000 });
  await expect(host.locator(".ss-now")).toContainText("wasn't the spy");
  await host.getByRole("button", { name: "Next lap" }).click();
  await expect(phones[inno].locator(".ss-out")).toContainText("You're out", { timeout: 20_000 });
  await Promise.all(phones.map((p) => expect(p.locator(".ss-order")).toBeVisible({ timeout: 20_000 })));

  // Lap 2: everyone still in votes for the spy.
  await host.getByRole("button", { name: "Start voting" }).click();
  await Promise.all(phones.map(async (p, n) => {
    if (n === inno) return;
    const target = n === spy ? names[[0, 1, 2, 3].find((x) => x !== spy && x !== inno)] : names[spy];
    await p.locator(".ss-tile", { hasText: target }).click({ timeout: 20_000 });
  }));
  // Caught: the spy gets one guess out loud; anyone else judges it, even a
  // player already out. The spy can't, and nobody's screen shows the word
  // but those who hold it.
  const word = seen.find((w) => w !== "SPY");
  await expect(phones[spy].locator(".ss-now")).toContainText("You're caught", { timeout: 20_000 });
  await expect(phones[spy].getByRole("button", { name: "Wrong guess" })).toHaveCount(0);
  await expect(screen(phones[spy], "game")).not.toContainText(word);
  await expect(phones[inno].locator(".ss-now")).toContainText(`${names[spy]} is the spy`);
  await expect(screen(phones[inno], "game")).toContainText(`The word is ${word}.`);
  await phones[inno].getByRole("button", { name: "Wrong guess" }).click();
  for (const p of phones) await expect(screen(p, "final")).toBeVisible({ timeout: 20_000 });
  await expect(host.locator("#podH")).toHaveText("The room wins.");
  await expect(host.locator(".ss-reveal")).toContainText(`${names[spy]} was the spy`);
  await expect(host.locator(".ss-reveal")).toContainText(`The word was ${seen[inno === 0 ? 1 : 0] === "SPY" ? seen[2] : seen[inno === 0 ? 1 : 0]}.`);
  expect(errors).toEqual([]);
});

test("lobby: How to play for every game, opens and closes, gone once the host starts", async ({ browser }) => {
  test.setTimeout(120_000);
  const errors = [];
  // Every game's room has its own bar, and its sheet says who can play.
  for (const [slug, title, players] of [
    ["flip-it", "Flip It", "2–10 players"],
    ["slide-n-order", "Slide N Order", "2–10 players"],
    ["doodle-on", "Doodle On", "4–12 players"],
    ["humour-me", "Humour Me", "4–12 players"],
  ]) {
    const p = await phone(browser, errors, slug);
    await p.goto("/party/");
    await p.fill("#setupName", "Aman");
    await p.locator(`#setupPick .pick--${slug}`).click();
    await p.click("#setupGo");
    await expect(p.getByRole("button", { name: `How to play ${title}` })).toBeVisible();
    await p.getByRole("button", { name: `How to play ${title}` }).click();
    await expect(p.locator(".ht-sheet .ht-title")).toHaveText(title);
    await expect(p.locator(".ht-chip").first()).toHaveText(players);
    await expect(p.locator(".ht-steps li").first()).toBeVisible();
    await p.context().close();
  }

  const phones = await room4(browser, errors, "sounds-sus");
  const [host, riya] = phones;
  await expect(riya.getByRole("button", { name: "How to play Sounds Sus" })).toBeVisible();
  // While the sheet is up the page behind is inert, so find the bar by class.
  const bar = riya.locator(".ht-bar");
  const sheet = riya.locator(".ht-sheet");
  await bar.click();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".ht-steps li")).toHaveCount(5);
  await expect(sheet.locator(".ht-chip").first()).toHaveText("4–12 players");
  await expect(sheet).toContainText("Never the word itself, and not a clue so easy it gives the word away.");
  await expect(sheet).toContainText("You have 45 seconds; tap Done");
  await expect(bar).toHaveAttribute("aria-expanded", "true");
  // Four ways out, each handing focus back to the bar.
  await riya.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(bar).toBeFocused();
  await bar.click();
  await riya.click(".ht-ok");
  await expect(sheet).toBeHidden();
  await bar.click();
  await riya.click(".ht-x");
  await expect(sheet).toBeHidden();
  await bar.click();
  await riya.locator(".howto-backdrop").click({ position: { x: 10, y: 10 } });
  await expect(sheet).toBeHidden();

  // Open when the host starts: it closes, and the bar goes with the lobby.
  await bar.click();
  await expect(sheet).toBeVisible();
  await host.click("#startBtn");
  await expect(riya.locator('[data-screen="game"]')).toBeVisible({ timeout: 20_000 });
  await expect(sheet).toBeHidden();
  await expect(bar).toBeHidden();
  expect(errors).toEqual([]);
});
