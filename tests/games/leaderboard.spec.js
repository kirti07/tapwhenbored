// The shared leaderboard, and — more importantly — what happens when it fails.
//
// GAME-TESTING.md §13 is unambiguous: a leaderboard or network failure must not
// break the game. That matters more than usual here because both call sites use
// a bare .then() with no .catch(), so a rejected promise would abort the rest of
// the game-over handler and cost the player their overlay and replay button.
// These tests exercise abort, 500, and a hang against the real pages.

import { test, expect } from "@playwright/test";
import { games } from "../../src/data/games.js";
import { DICTIONARY } from "../../src/word-steps/dictionary.js";

const RPC = "**/rest/v1/rpc/**";
const withLeaderboard = games.filter((g) => g.leaderboard);
const withoutLeaderboard = games.filter((g) => !g.leaderboard);

/** Fails the test on an uncaught exception or unhandled rejection. */
function failOnUncaught(page) {
  const seen = [];
  page.on("pageerror", (e) => seen.push(e.message));
  return () => seen;
}

test("the module is wired into exactly the games that declare it", async ({ page }) => {
  // A game with leaderboard: false must never contact Supabase
  // (ARCHITECTURE.md §27), and the registry is the source of that claim.
  for (const g of withoutLeaderboard) {
    const calls = [];
    page.on("request", (r) => {
      if (r.url().includes("/rest/v1/")) calls.push(r.url());
    });
    await page.goto(g.path);
    await page.waitForTimeout(400);
    expect(calls, `${g.slug} must not talk to Supabase`).toEqual([]);
    page.removeAllListeners("request");
  }
});

for (const g of withLeaderboard) {
  test.describe(`${g.slug} survives leaderboard failure`, () => {
    for (const [label, handler] of [
      ["the network is unreachable", (route) => route.abort()],
      ["the server returns 500", (route) => route.fulfill({ status: 500, body: "" })],
      [
        "the response is not a number",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"code":"PGRST202"}',
          }),
      ],
    ]) {
      test(label, async ({ page }) => {
        const uncaught = failOnUncaught(page);
        await page.route(RPC, handler);
        await page.goto(g.path);
        await page.waitForTimeout(500);

        // The page must remain fully interactive: this is the whole point.
        await expect(page.locator(".back-link")).toBeVisible();
        await expect(page.locator("#shareBtn")).toHaveCount(1);
        if (g.hasRestart) await expect(page.locator("#restartBtn")).toBeEnabled();
        expect(uncaught(), "no uncaught errors").toEqual([]);
      });
    }

    test("a hanging request does not block the page", async ({ page }) => {
      const uncaught = failOnUncaught(page);
      // Never resolve: the module's own 4s timeout must be what ends this.
      await page.route(RPC, () => {});
      await page.goto(g.path);
      await page.waitForTimeout(500);

      await expect(page.locator(".back-link")).toBeVisible();
      // Navigation still works while a leaderboard request is outstanding.
      await page.locator(".back-link").click();
      await expect(page).toHaveURL(/\/$/);
      expect(uncaught()).toEqual([]);
    });
  });
}

test("a game plays with no credentials configured", async ({ page }) => {
  // Blocking Supabase entirely is the closest a built page can get to an
  // unconfigured build: either way submitScore resolves null and the game must
  // be unaffected.
  const uncaught = failOnUncaught(page);
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto("/honeycomb/");
  await page.waitForTimeout(400);

  await expect(page.locator("#board .tile").first()).toBeVisible();
  await page.locator("#board .tile--tappable").first().click();
  await expect(page.locator("#timeVal")).not.toHaveText("0:00", { timeout: 3000 });
  expect(uncaught()).toEqual([]);
});

// ---------------------------------------------------------------------------
// The end card, with the RPC mocked.
//
// marble-nostalgia is the only game whose end state is reachable by playing,
// without writing a solver, so it is where the global-best line can actually be
// observed. Mocking submit_game_score also covers the happy path without
// depending on the database being migrated.
// ---------------------------------------------------------------------------

/**
 * Plays to a finished board and returns whether the end overlay appeared.
 *
 * Peg solitaire always terminates because every jump removes a marble, so any
 * legal-move-until-stuck strategy finishes. Which marble can move is worked
 * out from the board's own data-r/data-c coordinates, so each jump costs two
 * clicks; an earlier version discovered the move by clicking every marble in
 * turn, up to 32 clicks a jump, and timed out on the mobile project under a
 * full-suite load.
 *
 * The landing hole is then taken from the game's own .valid-target marking
 * rather than from the coordinates: selecting a marble marks its legal targets
 * synchronously, and letting the game name them keeps this helper honest about
 * the rules instead of reimplementing them.
 *
 * Each jump waits for the marble count to actually drop. A captured marble
 * stays in the DOM while it fades, so a fixed delay let the next iteration
 * read a board that still contained it, pick a jump over a marble that was
 * already gone, and stall on a marble the game refused to select.
 */
async function playToEnd(page) {
  await expect(page.locator(".marble").first()).toBeVisible();
  const overlay = page.locator("#overlay.show");

  // 32 marbles means at most 31 jumps; the cap is a stuck-loop guard.
  for (let i = 0; i < 40; i++) {
    if (await overlay.count()) break;

    const move = await page.evaluate(() => {
      const cell = (el) => el.dataset.r + "," + el.dataset.c;
      const marbles = new Set(
        [...document.querySelectorAll(".marble")].map(cell),
      );
      const board = new Set([...document.querySelectorAll(".hole")].map(cell));

      // Jump two orthogonally, over a marble, into an empty on-board hole.
      for (const from of marbles) {
        const [r, c] = from.split(",").map(Number);
        for (const [dr, dc] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]) {
          const over = r + dr + "," + (c + dc);
          const land = r + 2 * dr + "," + (c + 2 * dc);
          if (marbles.has(over) && board.has(land) && !marbles.has(land))
            return { from: [r, c] };
        }
      }
      return null; // the board is finished
    });
    if (!move) break;

    const marbles = page.locator(".marble");
    const before = await marbles.count();

    await page
      .locator(`.marble[data-r="${move.from[0]}"][data-c="${move.from[1]}"]`)
      .click({ force: true });

    const targets = page.locator(".hole.valid-target");
    if (!(await targets.count())) break; // the game disagrees; stop cleanly
    await targets.first().click({ force: true });

    // Every jump captures exactly one marble. Waiting for that rather than for
    // a duration is what keeps the next board read accurate.
    await expect(marbles).toHaveCount(before - 1, { timeout: 3000 });
  }

  // checkEnd() delays the overlay by 200-500ms so the last capture is visible.
  await overlay.waitFor({ state: "attached", timeout: 3000 }).catch(() => {});
  return (await overlay.count()) > 0;
}

const mockBest = (page, best) =>
  page.route(RPC, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(best),
    }),
  );

test.describe("the end card shows the global best", () => {
  // A full playthrough is a few hundred real clicks, and the first one in a
  // worker also pays page-load cost.
  test.beforeEach(() => test.setTimeout(90_000));

  test("reports the record, and submits its own slug and score", async ({ page }) => {
    const uncaught = failOnUncaught(page);
    const sent = [];
    // 1 marble is a perfect game, so any real result is worse than this.
    await page.route(RPC, async (route) => {
      sent.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({ status: 200, contentType: "application/json", body: "1" });
    });

    await page.goto("/marble-nostalgia/");
    expect(await playToEnd(page), "did not reach an end state").toBe(true);

    const line = page.locator("#globalBest");
    await expect(line).toBeVisible();
    await expect(line).toContainText(/global best 1 marble/i);
    await expect(line).not.toHaveClass(/new-global/);

    // Guards the registry against drifting from the database's game_config.
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].p_slug).toBe("marble-nostalgia");
    expect(Number.isInteger(sent[0].p_score)).toBe(true);
    // Not a daily game, so it must not pin a day.
    expect(sent[0].p_day).toBeUndefined();
    expect(uncaught()).toEqual([]);
  });

  test("celebrates when the run matched or beat the record", async ({ page }) => {
    const uncaught = failOnUncaught(page);
    // A huge "best" means whatever the player scores is an improvement.
    await mockBest(page, 999);
    await page.goto("/marble-nostalgia/");
    expect(await playToEnd(page), "did not reach an end state").toBe(true);

    const line = page.locator("#globalBest");
    await expect(line).toBeVisible();
    await expect(line).toContainText(/new global best/i);
    await expect(line).toHaveClass(/new-global/);
    expect(uncaught()).toEqual([]);
  });

  test("says so, and stays playable, when the leaderboard is down", async ({ page }) => {
    const uncaught = failOnUncaught(page);
    await page.route(RPC, (route) => route.abort());
    await page.goto("/marble-nostalgia/");
    expect(await playToEnd(page), "did not reach an end state").toBe(true);

    await expect(page.locator("#globalBest")).toContainText(/unavailable/i);
    // The rest of the end card must be intact — that is the whole point.
    await expect(page.locator("#againBtn")).toBeVisible();
    await expect(page.locator("#shareBtn")).toBeVisible();
    await page.locator("#againBtn").click();
    await expect(page.locator("#overlay")).not.toHaveClass(/show/);
    expect(uncaught()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The end card, on more games than one.
//
// marble-nostalgia used to be the only game whose end card was ever asserted,
// and the other four had each quietly drifted: honeycomb skipped the
// availability guard and announced "unavailable" on a normal end card, and
// bubble-tap hid the line with a class where every other game used the
// `hidden` attribute. A suite that only tested failure modes saw neither.
//
// So these play the two other games whose end state is reachable without
// writing a solver — bubble-tap by tapping a bomb, word-steps by walking a
// real ladder. Between them and marble-nostalgia they cover both wordings,
// both score directions, and the one daily board. slide-n-order and honeycomb
// still reach their end cards only through a 15-puzzle or hive solve, so they
// stay covered by the failure matrix above and by sharing this one code path.
// ---------------------------------------------------------------------------

test.describe("bubble-tap reports the global best", () => {
  /** Taps a bomb, which is the only way this game ends. */
  async function popABomb(page) {
    const bomb = page.locator("#playfield .bubble.bomb").first();
    await bomb.waitFor({ state: "visible", timeout: 20_000 });
    await bomb.click({ force: true });
    // endRun reveals the bomb, then shows the card 620ms later.
    await expect(page.locator("#gameOverOverlay")).not.toHaveClass(/hidden/, {
      timeout: 5000,
    });
  }

  test("shows the record on the end card", async ({ page }) => {
    const uncaught = failOnUncaught(page);
    const sent = [];
    await page.route(RPC, async (route) => {
      sent.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "4321",
      });
    });

    await page.goto("/bubble-tap/");
    await popABomb(page);

    // Highest wins, and a bomb on the first tap scores nothing, so 4321
    // stands. This is also the regression guard for the line being hidden by
    // the `hidden` attribute now rather than a class: if bubble-tap's own CSS
    // kept overriding that, toBeVisible would fail here.
    const line = page.locator("#globalBest");
    await expect(line).toBeVisible();
    await expect(line).toHaveText("GLOBAL BEST 04321");
    await expect(line).not.toHaveClass(/new-global/);

    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].p_slug).toBe("bubble-tap");
    // Not a daily game, so it must not pin a day.
    expect(sent[0].p_day).toBeUndefined();
    expect(uncaught()).toEqual([]);
  });

  test("stays playable, and says so, when the leaderboard is down", async ({ page }) => {
    const uncaught = failOnUncaught(page);
    await page.route(RPC, (route) => route.abort());

    await page.goto("/bubble-tap/");
    await popABomb(page);

    await expect(page.locator("#globalBest")).toHaveText("GLOBAL BEST UNAVAILABLE");
    // The rest of the card must survive it — that is the whole point.
    await expect(page.locator("#restartBtn")).toBeVisible();
    await expect(page.locator("#shareBtn")).toBeVisible();
    await page.locator("#restartBtn").click();
    await expect(page.locator("#gameOverOverlay")).toHaveClass(/hidden/);
    expect(uncaught()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// word-steps, played to the end for real.
//
// The registry says this is the one daily board, so it is the only game that
// must pin a day — and the only place a wrong `p_day` would silently file a
// score against yesterday's puzzle.
// ---------------------------------------------------------------------------

/**
 * The shortest ladder from `start` to `target`, one letter at a time.
 *
 * The puzzle data stores only the start, the target and how many steps the
 * best path takes — not the path — so the test has to find one. BFS over the
 * game's own bundled dictionary is the same rule the game enforces, and being
 * breadth-first it returns a shortest path, which is what "PERFECT" means.
 */
function ladder(start, target) {
  const words = new Set(DICTIONARY);
  const seen = new Set([start]);
  let frontier = [[start]];

  while (frontier.length) {
    const next = [];
    for (const path of frontier) {
      const word = path[path.length - 1];
      for (let i = 0; i < word.length; i++) {
        for (let c = 65; c <= 90; c++) {
          const cand =
            word.slice(0, i) + String.fromCharCode(c) + word.slice(i + 1);
          if (cand === word || seen.has(cand) || !words.has(cand)) continue;
          if (cand === target) return [...path, cand];
          seen.add(cand);
          next.push([...path, cand]);
        }
      }
    }
    frontier = next;
  }
  return null;
}

test.describe("word-steps reports the global best for today", () => {
  test.beforeEach(() => test.setTimeout(60_000));

  test("solves today's ladder and pins the day it was playing", async ({ page }) => {
    const uncaught = failOnUncaught(page);
    const sent = [];
    await page.route(RPC, async (route) => {
      sent.push(JSON.parse(route.request().postData() || "{}"));
      // 1 step is unbeatable, so a real solve is never a record against it.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "1",
      });
    });

    await page.goto("/word-steps/");

    // Take the words from the page, not from a re-derived day index: the page
    // is the only thing that knows which puzzle it chose.
    const activeRow = page.locator("#ladder .active-row");
    const start = await page.locator("#startWord").innerText();
    const target = await page.locator("#targetWord").innerText();
    const path = ladder(start, target);
    expect(path, `no ladder from ${start} to ${target}`).toBeTruthy();

    for (let step = 1; step < path.length; step++) {
      const from = path[step - 1];
      const to = path[step];
      const i = [...from].findIndex((ch, k) => ch !== to[k]);
      await activeRow.locator(".tile").nth(i).click();
      await expect(page.locator("#letterSheet")).toHaveClass(/show/);
      await page
        .locator("#letterGrid button", { hasText: new RegExp(`^${to[i]}$`) })
        .click();
    }

    await expect(page.locator("#overlay")).toHaveClass(/show/);

    const line = page.locator("#globalBest");
    await expect(line).toBeVisible();
    await expect(line).toHaveText("Best today, worldwide: 1 step");
    await expect(line).not.toHaveClass(/new-global/);

    // The daily board is the whole reason this game sends a date.
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].p_slug).toBe("word-steps");
    expect(sent[0].p_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(uncaught()).toEqual([]);
  });
});
