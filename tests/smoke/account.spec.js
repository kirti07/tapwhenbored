// The player card at /account/.
//
// The split this page rests on is that your bests are local and your rank is
// not. So the tests that matter most are the ones where the board is
// unreachable: the page must lose the rank column and nothing else. A page that
// blanks your own bests because a server did not answer is the failure this
// file exists to catch.

import { test, expect } from "@playwright/test";
import { games, pages } from "../../src/data/games.js";
import { DAY, playedOn, stored, withStorage, blockStorage, brokenSpriteRefs } from "../helpers/storage.js";

const ACCOUNT = pages.find((p) => p.slug === "account").path;
const STANDING = "**/rest/v1/rpc/my_standing*";
const SAVE = "**/rest/v1/rpc/save_player*";
const DELETE = "**/rest/v1/rpc/delete_player*";

const boarded = games.filter((g) => g.leaderboard !== false);
const scoreless = games.filter((g) => g.leaderboard === false);

const rpc = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

test.describe("the bests table", () => {
  test("renders a row per game with JavaScript off, and every glyph resolves", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ACCOUNT);

    await expect(page.locator("#bestsBody tr")).toHaveCount(games.length);
    for (const g of games) {
      await expect(page.locator(`[data-slot="${g.slug}"]`)).toHaveCount(1);
    }
    // A <use> pointing at a symbol this page's sprite does not carry renders an
    // empty box and says nothing.
    expect(await brokenSpriteRefs(page)).toEqual([]);
    await context.close();
  });

  test("shows a local best, from storage alone", async ({ browser }) => {
    const context = await withStorage(browser, [stored("marble-nostalgia.best", "4")]);
    const page = await context.newPage();
    await page.route(STANDING, (route) => rpc(route, null));
    await page.goto(ACCOUNT);

    await expect(page.locator('[data-slot="marble-nostalgia"] [data-score]')).toHaveText("4");
    // A game never played reads as an em dash, not a zero.
    await expect(page.locator('[data-slot="slide-n-order"] [data-score]')).toHaveText("—");
    await context.close();
  });

  test("names the two cabinets that keep no board", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, null));
    await page.goto(ACCOUNT);
    for (const g of scoreless) {
      await expect(page.locator(`[data-slot="${g.slug}"] [data-rank]`)).toHaveText("no board");
    }
  });

  test("fills the rank column from the board", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, { rank: 31, total: 214, your_best: 4, above: 3 }));
    await page.goto(ACCOUNT);
    for (const g of boarded) {
      await expect(page.locator(`[data-slot="${g.slug}"] [data-rank]`)).toHaveText("#31 of 214");
    }
  });

  test("loses only the rank when the board is unreachable", async ({ browser }) => {
    const context = await withStorage(browser, [stored("marble-nostalgia.best", "4")]);
    const page = await context.newPage();
    await page.route(STANDING, (route) => route.abort());
    await page.goto(ACCOUNT);

    // The local half is untouched and complete.
    await expect(page.locator('[data-slot="marble-nostalgia"] [data-score]')).toHaveText("4");
    await expect(page.locator("#bestsBody tr")).toHaveCount(games.length);
    // The remote half is simply absent — no error, no apology in the cell.
    await expect(page.locator('[data-slot="marble-nostalgia"] [data-rank]')).toHaveText("");
    await context.close();
  });

  test("survives storage being blocked", async ({ page }) => {
    await blockStorage(page);
    await page.route(STANDING, (route) => rpc(route, null));
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(ACCOUNT);
    await expect(page.locator("#bestsBody tr")).toHaveCount(games.length);
    expect(errors).toEqual([]);
  });
});

test.describe("the name", () => {
  /* Saving a name now talks to the board, so every spec here needs the route --
     without it the call goes to an unresolvable host and burns the client's 4s
     timeout before landing in #nameStatus as a failure. */
  test.beforeEach(async ({ page }) => {
    await page.route(SAVE, (route) => rpc(route, true));
  });

  test("reads Unsigned until one is set", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, null));
    await page.goto(ACCOUNT);
    await expect(page.locator("#nameOut")).toHaveText("Unsigned");
  });

  test("saves, and is capped at what a board accepts", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, null));
    await page.goto(ACCOUNT);
    await page.locator("#editBtn").click();
    // Padded, internally spaced, and far too long.
    await page.locator("#nameInp").fill(
      "   a   very   long   name   indeed   that   keeps   going   ",
    );
    await page.locator("#saveBtn").click();

    const shown = await page.locator("#nameOut").textContent();
    expect(shown.length).toBeLessThanOrEqual(24);
    expect(shown).toBe(shown.trim());
    expect(shown).not.toMatch(/\s{2}/);
  });

  test("renders a name containing markup as text", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, null));
    await page.goto(ACCOUNT);
    await page.locator("#editBtn").click();
    await page.locator("#nameInp").fill("<b>hi</b>");
    await page.locator("#saveBtn").click();

    await expect(page.locator("#nameOut")).toHaveText("<b>hi</b>");
    expect(await page.locator("#nameOut b").count()).toBe(0);
  });

  test("a saved name is sent to the board, and every board row gets it", async ({ page }) => {
    const sent = [];
    await page.route(STANDING, (route) => rpc(route, null));
    await page.route(SAVE, (route) => {
      sent.push(JSON.parse(route.request().postData() || "{}"));
      return rpc(route, true);
    });
    await page.goto(ACCOUNT);

    await page.locator("#editBtn").click();
    await page.locator("#nameInp").fill("Kirti");
    await page.locator("#saveBtn").click();

    await expect(page.locator("#nameStatus")).toHaveText(/Saved/);
    // The whole defect: this used to write localStorage and nothing else, so
    // the card said "Kirti" and every board said "no name yet", forever.
    expect(sent.length, "the name reached the board").toBe(1);
    expect(sent[0].p_name).toBe("Kirti");
    // A rename is authorised by the token, never by the public player id.
    expect(sent[0].p_write_token).toBeTruthy();
    expect(sent[0].p_write_token).not.toBe(sent[0].p_player_id);
  });

  test("the editor closes without waiting for the board", async ({ page }) => {
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route(STANDING, (route) => rpc(route, null));
    await page.route(SAVE, async (route) => {
      await held;
      return rpc(route, true);
    });
    await page.goto(ACCOUNT);

    await page.locator("#editBtn").click();
    await page.locator("#nameInp").fill("Kirti");
    await page.locator("#saveBtn").click();

    /* The request is still in flight and the editor is already gone. This is
       the constraint the whole design is built around: saving to the database
       must never be something the player waits on. */
    await expect(page.locator("#nameOut")).toHaveText("Kirti");
    await expect(page.locator("#editBtn")).toBeFocused();
    await expect(page.locator("#nameStatus")).toHaveText(/Saving/);

    release();
    await expect(page.locator("#nameStatus")).toHaveText(/Saved/);
  });

  test("a name the board refuses says why, and is still kept here", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, null));
    await page.route(SAVE, (route) => rpc(route, false));
    await page.goto(ACCOUNT);

    await page.locator("#editBtn").click();
    // Nothing is rewritten as you type, so the field can hold this.
    await page.locator("#nameInp").fill("Kirti.");
    await page.locator("#saveBtn").click();

    const status = page.locator("#nameStatus");
    await expect(status).toHaveClass(/arc-status--bad/);
    await expect(status).toContainText(/can.t go on a board/);
    // And it must say the local copy survived, or the player cannot tell.
    await expect(page.locator("#nameOut")).toHaveText("Kirti.");
  });

  test("an unreachable board blames the network, not the name", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, null));
    await page.route(SAVE, (route) => route.abort());
    await page.goto(ACCOUNT);

    await page.locator("#editBtn").click();
    await page.locator("#nameInp").fill("Kirti");
    await page.locator("#saveBtn").click();

    const status = page.locator("#nameStatus");
    await expect(status).toHaveClass(/arc-status--bad/);
    await expect(status).toContainText(/still on this device/);
    await expect(page.locator("#nameOut")).toHaveText("Kirti");
  });

  test("Escape leaves the edit without saving, and gives focus back", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, null));
    await page.goto(ACCOUNT);
    await page.locator("#editBtn").click();
    await page.locator("#nameInp").fill("Temporary");
    await page.locator("#nameInp").press("Escape");

    await expect(page.locator("#nameOut")).toHaveText("Unsigned");
    await expect(page.locator("#editBtn")).toBeFocused();
  });
});

test.describe("the address and the preferences", () => {
  test("saves, and says so", async ({ page }) => {
    const sent = [];
    await page.route(STANDING, (route) => rpc(route, null));
    await page.route(SAVE, (route) => {
      sent.push(JSON.parse(route.request().postData() || "{}"));
      return rpc(route, true);
    });
    await page.goto(ACCOUNT);

    await page.locator("#emailInp").fill("Player@Example.COM");
    await page.locator("#prefStreak").check();
    await page.locator("#savePrefs").click();
    await expect(page.locator("#prefStatus")).toHaveText("Saved.");

    expect(sent[0].p_email).toBe("Player@Example.COM");
    expect(sent[0].p_notify_streak).toBe(true);
    // Identity authorises the write, and the token is never the public id.
    expect(sent[0].p_write_token).toBeTruthy();
    expect(sent[0].p_write_token).not.toBe(sent[0].p_player_id);
  });

  test("reports a refusal in place, and stays usable", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, null));
    await page.route(SAVE, (route) => rpc(route, false));
    await page.goto(ACCOUNT);

    await page.locator("#emailInp").fill("not-an-email");
    await page.locator("#savePrefs").click();
    await expect(page.locator("#prefStatus")).toHaveClass(/arc-status--bad/);
    await expect(page.locator("#savePrefs")).toBeEnabled();
  });

  test("delete asks first, then clears the name here too", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, null));
    await page.route(DELETE, (route) => rpc(route, true));
    await page.goto(ACCOUNT);

    await page.locator("#editBtn").click();
    await page.locator("#nameInp").fill("Marzipan");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#nameOut")).toHaveText("Marzipan");

    // Declining changes nothing.
    page.once("dialog", (d) => d.dismiss());
    await page.locator("#deleteBtn").click();
    await expect(page.locator("#nameOut")).toHaveText("Marzipan");

    page.once("dialog", (d) => d.accept());
    await page.locator("#deleteBtn").click();
    await expect(page.locator("#prefStatus")).toHaveText("Deleted.");
    await expect(page.locator("#nameOut")).toHaveText("Unsigned");
  });
});

// The streak sheet.
//
// The rule under test is "miss a day and it starts over", and the honest way to
// test that is through storage rather than through the clock: a run stamped
// three days ago must not render, and one stamped yesterday must — the day is
// not lost until the player's own midnight.
//
// The other thing worth guarding is that a cabinet with no run gets nothing at
// all. An eight-sticker wall of zeroes is a different, worse page, and it is the
// one a naive render produces.
test.describe("the streak sheet", () => {
  test("shows a sticker per live run, longest first, and none for the rest", async ({
    browser,
  }) => {
    const context = await withStorage(browser, [
      stored("word-steps.streak", { day: DAY(), run: 5 }),
      stored("honeycomb.streak", { day: DAY(-1), run: 2 }),
    ]);
    const page = await context.newPage();
    await page.route(STANDING, (route) => rpc(route, null));
    await page.goto(ACCOUNT);

    await expect(page.locator("#streakWall .stk")).toHaveCount(2);
    await expect(page.locator("#streakNone")).toBeHidden();
    await expect(page.locator("#streakWall .stk-run")).toHaveText(["5", "2"]);
    await expect(page.locator("#streakWall .stk-n")).toHaveText(["Word Steps", "Honeycomb"]);

    // The badge is decorative, so the run has to be in the label as words too.
    await expect(page.locator("#streakWall .stk").first()).toHaveAttribute(
      "aria-label",
      "Word Steps — 5 days in a row",
    );
    expect(await brokenSpriteRefs(page)).toEqual([]);
    await context.close();
  });

  test("drops a run that missed a day", async ({ browser }) => {
    const context = await withStorage(browser, [
      stored("untangle.streak", { day: DAY(-3), run: 9 }),
    ]);
    const page = await context.newPage();
    await page.route(STANDING, (route) => rpc(route, null));
    await page.goto(ACCOUNT);

    await expect(page.locator("#streakWall .stk")).toHaveCount(0);
    await expect(page.locator("#streakNone")).toBeVisible();
    await context.close();
  });

  test("says so plainly when nothing is running", async ({ page }) => {
    await page.route(STANDING, (route) => rpc(route, null));
    await page.goto(ACCOUNT);

    await expect(page.locator("#streakWall")).toBeHidden();
    await expect(page.locator("#streakNone")).toContainText("No streaks yet");
  });

  test("counts today's box on this page too", async ({ browser }) => {
    const context = await withStorage(browser, [
      playedOn("untangle", 12),
      playedOn("doodle-on", null),
    ]);
    const page = await context.newPage();
    await page.route(STANDING, (route) => rpc(route, null));
    await page.goto(ACCOUNT);

    // Both of these keep no board, and both still fill a slot.
    await expect(page.locator("#youBoxN")).toHaveText("2");
    await expect(page.locator("#youBox")).not.toHaveClass(/stkbox--empty/);
    await context.close();
  });
});
