// Challenge links: "beat my time on this exact board".
//
// A link carries a seed, and the seed alone must rebuild the board — on any
// device, whatever that browser has seen before. So the core assertions open
// one URL in two separate browser contexts and compare what the player sees.
// A challenge run is unranked, so it must never reach the leaderboard.

import { test, expect } from "@playwright/test";
import { solve } from "../helpers/lights-out.js";
import { withStorage, stored } from "../helpers/storage.js";

const RPC = "**/rest/v1/rpc/**";
const flipTiles = (page) => page.locator("#board .tile");

async function flipBoard(page) {
  await expect(flipTiles(page).first()).toBeVisible();
  return flipTiles(page).evaluateAll((els) =>
    els.map((el) => (el.classList.contains("tile--on") ? 1 : 0)),
  );
}

async function slideBoard(page) {
  await expect(page.locator("#tilesGrid .tile").first()).toBeVisible();
  return page
    .locator("#tilesGrid .cell")
    .evaluateAll((cells) => cells.map((c) => c.textContent.trim() || "_").join(","));
}

async function clearFlipBoard(page) {
  const cells = await flipBoard(page);
  const n = Math.round(Math.sqrt(cells.length));
  for (const i of solve(n, cells).picks) await flipTiles(page).nth(i).click();
  await expect(page.locator("#overlay")).toHaveClass(/show/, { timeout: 4000 });
}

/** The URL a native share sheet would have received. */
async function stubShare(page) {
  await page.addInitScript(() => {
    navigator.share = (data) => {
      window.__shared = data;
      return Promise.resolve();
    };
  });
}

function sentEvents(page) {
  return page.evaluate(() =>
    (window.dataLayer || []).filter((e) => e[0] === "event").map((e) => e[1]),
  );
}

test.describe("Flip It", () => {
  for (const level of ["easy", "medium"]) {
    test(`a ${level} seed builds the same board in two browsers`, async ({ browser }) => {
      const url = `/flip-it/?seed=k3x9z&level=${level}&beat=42000&by=Riya`;
      const a = await browser.newContext();
      const pageA = await a.newPage();
      await pageA.goto(url);
      const board = await flipBoard(pageA);

      // The second browser has already been served that exact board, which
      // would make a normal deal pass it over. A challenge must not care.
      const sig = board.join("");
      const b = await withStorage(browser, [stored("flip-it.recent", [sig])]);
      const pageB = await b.newPage();
      await pageB.goto(url);
      expect(await flipBoard(pageB)).toEqual(board);

      await expect(pageB.locator("#challenge")).toBeVisible();
      await expect(pageB.locator("#challengeWho")).toHaveText("Riya cleared this in");
      await expect(pageB.locator("#challengeBeat")).toHaveText("Beat 0:42");
      await expect(pageB.locator("#challengeLevel")).toHaveText(level.toUpperCase());
      await expect(pageB.locator("#beatVal")).toHaveText("0:42");
      await expect(pageB.locator(`.level-btn[data-level="${level}"]`)).toHaveClass(/is-active/);
      expect(await sentEvents(pageB)).toContain("challenge_link_opened");

      await a.close();
      await b.close();
    });
  }

  test("different seeds build different boards", async ({ page }) => {
    await page.goto("/flip-it/?seed=1&level=medium&beat=42000");
    const one = await flipBoard(page);
    await page.goto("/flip-it/?seed=2&level=medium&beat=42000");
    expect(await flipBoard(page)).not.toEqual(one);
  });

  for (const [why, query] of [
    ["hard is not a challenge level", "seed=k3x9z&level=hard&beat=42000"],
    ["the level is unknown", "seed=k3x9z&level=insane&beat=42000"],
    ["the seed is malformed", "seed=NOT_A_SEED&level=easy&beat=42000"],
    ["the seed is out of range", "seed=zzzzzzz&level=easy&beat=42000"],
    ["there is no time to beat", "seed=k3x9z&level=easy"],
  ]) {
    test(`a link is played as a normal game when ${why}`, async ({ page }) => {
      await page.goto(`/flip-it/?${query}`);
      await flipBoard(page);
      await expect(page.locator("#challenge")).toBeHidden();
      await expect(page.locator("#beatStat")).toBeHidden();
    });
  }

  test("the sharer's name is text, never markup, and capped", async ({ page }) => {
    const evil = '<img src=x onerror="window.__pwned=1">';
    await page.goto(`/flip-it/?seed=k3x9z&level=easy&beat=42000&by=${encodeURIComponent(evil)}`);
    await expect(page.locator("#challenge img")).toHaveCount(0);
    await expect(page.locator("#challengeWho")).toHaveText(`${evil.slice(0, 24)} cleared this in`);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test("a challenge run never reaches the leaderboard, and leaving it does", async ({ page }) => {
    let calls = 0;
    await page.route(RPC, (route) => {
      calls++;
      route.fulfill({ status: 200, contentType: "application/json", body: '{"best":1}' });
    });

    // A time nobody can miss, so the verdict is deterministic.
    await page.goto("/flip-it/?seed=k3x9z&level=medium&beat=3600000&by=Riya");
    await clearFlipBoard(page);
    await expect(page.locator("#globalBest")).toHaveText(/^You beat Riya by \d+\.\ds$/);
    await expect(page.locator("#lbHint")).toBeHidden();
    expect(calls).toBe(0);

    // A new board leaves the challenge: the query goes, and so does the card.
    await page.locator("#againBtn").click();
    await expect(page.locator("#challenge")).toBeHidden();
    expect(new URL(page.url()).search).toBe("");

    // Same level, now a random deal: a perfect clear is ranked again.
    const cells = await flipBoard(page);
    const n = Math.round(Math.sqrt(cells.length));
    for (const i of solve(n, cells).picks) await flipTiles(page).nth(i).click();
    await expect(page.locator("#overlay")).toHaveClass(/show/, { timeout: 4000 });
    await expect.poll(() => calls).toBe(1);
  });

  test("sharing a cleared board sends a link that replays it", async ({ browser }) => {
    const context = await withStorage(browser, [stored("player", { name: "Kabir" })]);
    const page = await context.newPage();
    await stubShare(page);
    await page.goto("/flip-it/");
    const board = await flipBoard(page);
    await clearFlipBoard(page);
    await page.locator("#shareBtn").click();

    const shared = new URL(await page.evaluate(() => window.__shared.url));
    expect(shared.pathname).toBe("/flip-it/");
    expect(shared.searchParams.get("level")).toBe("easy");
    expect(shared.searchParams.get("by")).toBe("Kabir");
    expect(Number(shared.searchParams.get("beat"))).toBeGreaterThan(0);
    expect(await sentEvents(page)).toContain("challenge_shared");

    const friend = await browser.newPage();
    await friend.goto(shared.pathname + shared.search);
    expect(await flipBoard(friend)).toEqual(board);
    await expect(friend.locator("#challengeWho")).toHaveText("Kabir cleared this in");

    await friend.close();
    await context.close();
  });

  test("a Hard board shares a plain link, not a challenge", async ({ page }) => {
    await stubShare(page);
    await page.goto("/flip-it/");
    await page.locator('.level-btn[data-level="hard"]').click();
    await clearFlipBoard(page);
    await page.locator("#shareBtn").click();
    const shared = new URL(await page.evaluate(() => window.__shared.url));
    expect(shared.search).toBe("");
  });
});

test.describe("Slide N Order", () => {
  test("a seed builds the same scramble in two browsers", async ({ browser }) => {
    const url = "/slide-n-order/?seed=k3x9z&beat=38&by=Riya";
    const a = await browser.newContext();
    const b = await browser.newContext();
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await pageA.goto(url);
    await pageB.goto(url);
    expect(await slideBoard(pageB)).toBe(await slideBoard(pageA));

    await expect(pageB.locator("#challengeWho")).toHaveText("Riya solved this in");
    await expect(pageB.locator("#challengeBeat")).toHaveText("Beat 38 moves");
    await expect(pageB.locator("#bestVal")).toHaveText("To beat 38");
    expect(await sentEvents(pageB)).toContain("challenge_link_opened");
    await a.close();
    await b.close();
  });

  test("a bad link is played as a normal game", async ({ page }) => {
    await page.goto("/slide-n-order/?seed=k3x9z&beat=-4");
    await slideBoard(page);
    await expect(page.locator("#challenge")).toBeHidden();
  });

  test("restart leaves the challenge and the query behind", async ({ page }) => {
    await page.goto("/slide-n-order/?seed=k3x9z&beat=38");
    const scramble = await slideBoard(page);
    await page.locator("#restartBtn").click();
    await expect(page.locator("#challenge")).toBeHidden();
    await expect(page.locator("#bestVal")).not.toHaveText(/To beat/);
    expect(new URL(page.url()).search).toBe("");
    expect(await slideBoard(page)).not.toBe(scramble);
  });

  test("share sends a link that replays the scramble", async ({ browser }) => {
    const page = await browser.newPage();
    await stubShare(page);
    await page.goto("/slide-n-order/");
    const scramble = await slideBoard(page);

    // Solving a 15-puzzle in a test is its own project; the share URL is built
    // from the seed and the move count, and neither needs a finished run.
    await page.evaluate(() => {
      document.getElementById("overlay").classList.add("show");
    });
    await page.locator("#shareBtn").click();
    const shared = new URL(await page.evaluate(() => window.__shared.url));
    expect(shared.searchParams.get("seed")).toMatch(/^[0-9a-z]{1,7}$/);

    const friend = await browser.newPage();
    await friend.goto(shared.pathname + shared.search.replace(/beat=\d+/, "beat=40"));
    expect(await slideBoard(friend)).toBe(scramble);
    await page.close();
    await friend.close();
  });
});
