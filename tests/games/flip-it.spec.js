// Flip It: the Lights Out puzzle.
//
// A new board is generated on every load and every re-deal, so these tests
// assert the rules rather than a particular layout (GAME-TESTING.md §7). "The
// board clears in 13 taps" is true of one board; "tapping a tile flips exactly
// itself and its orthogonal neighbours, and every board the game deals can be
// cleared" is true of all of them.
//
// The solver below is deliberately a second, independent implementation. The
// game computes OPTIMAL to fill in its end card; if these tests asked the game
// for the answer they would only prove it is self-consistent. Working it out
// here means the number on the end card is checked against something else.

import { test, expect } from "@playwright/test";

const tiles = (page) => page.locator("#board .tile");

/** matrixFor(n)[i] = the tiles that pressing tile i toggles. */
function matrixFor(n) {
  const N = n * n;
  const m = [];
  for (let i = 0; i < N; i++) {
    const row = new Uint8Array(N);
    const r = Math.floor(i / n);
    const c = i % n;
    row[i] = 1;
    if (r > 0) row[i - n] = 1;
    if (r < n - 1) row[i + n] = 1;
    if (c > 0) row[i - 1] = 1;
    if (c < n - 1) row[i + 1] = 1;
    m.push(row);
  }
  return m;
}

/**
 * The minimum-weight solution of Ax = b over GF(2): the fewest taps that clear
 * `lit`, as a list of tile indices. Returns null if the board cannot be
 * cleared, which is the case these tests most want to be able to detect.
 */
function solve(n, lit) {
  const N = n * n;
  const m = matrixFor(n);
  const rows = [];
  for (let i = 0; i < N; i++) {
    const row = new Uint8Array(N + 1);
    row.set(m[i]);
    row[N] = lit[i];
    rows.push(row);
  }

  const pivotCol = [];
  let rank = 0;
  for (let col = 0; col < N && rank < N; col++) {
    let p = -1;
    for (let k = rank; k < N; k++) if (rows[k][col]) { p = k; break; }
    if (p < 0) continue;
    [rows[rank], rows[p]] = [rows[p], rows[rank]];
    for (let k = 0; k < N; k++) {
      if (k === rank || !rows[k][col]) continue;
      for (let j = col; j <= N; j++) rows[k][j] ^= rows[rank][j];
    }
    pivotCol.push(col);
    rank++;
  }
  for (let k = rank; k < N; k++) if (rows[k][N]) return null;

  const isPivot = new Uint8Array(N);
  pivotCol.forEach((c) => { isPivot[c] = 1; });

  const base = new Uint8Array(N);
  pivotCol.forEach((c, i) => { base[c] = rows[i][N]; });

  const basis = [];
  for (let f = 0; f < N; f++) {
    if (isPivot[f]) continue;
    const v = new Uint8Array(N);
    v[f] = 1;
    pivotCol.forEach((c, i) => { if (rows[i][f]) v[c] = 1; });
    basis.push(v);
  }

  let best = null;
  for (let mask = 0; mask < 1 << basis.length; mask++) {
    const sol = new Uint8Array(base);
    basis.forEach((v, i) => {
      if (!(mask & (1 << i))) return;
      for (let j = 0; j < N; j++) sol[j] ^= v[j];
    });
    let w = 0;
    for (let j = 0; j < N; j++) w += sol[j];
    if (best === null || w < best.weight) {
      best = { weight: w, picks: [...sol].map((v, i) => (v ? i : -1)).filter((i) => i >= 0) };
    }
  }
  return best;
}

/** The lit/unlit state of every tile, read from the DOM the player sees. */
async function readBoard(page) {
  return tiles(page).evaluateAll((els) =>
    els.map((el) => (el.classList.contains("tile--on") ? 1 : 0)),
  );
}

const sizeOf = (cells) => Math.round(Math.sqrt(cells));

// The levels the game offers, restated here on purpose: asking the game which
// sizes and move counts a level uses would only prove it agrees with itself.
// Each level spans two sizes, picked at random per deal, so a test may not
// assume which one it got — it reads the size off the board it was dealt.
const LEVELS = {
  easy: { sizes: [4, 5], moves: { 4: [3, 4], 5: [4, 5] } },
  medium: { sizes: [5, 6], moves: { 5: [7, 9], 6: [8, 11] } },
  hard: { sizes: [6, 7], moves: { 6: [14, 17], 7: [16, 20] } },
};
const DEFAULT_LEVEL = "easy";

/** The board as dealt, plus the size the game chose for it. */
async function readSizedBoard(page) {
  const cells = await readBoard(page);
  return { cells, n: sizeOf(cells.length) };
}

/** The tiles a tap at `i` should flip: itself and its in-bounds N/S/E/W. */
function plus(n, i) {
  const r = Math.floor(i / n);
  const c = i % n;
  const out = [i];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out.sort((a, b) => a - b);
}

function changedIndices(before, after) {
  const out = [];
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) out.push(i);
  return out;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/flip-it/");
  await expect(tiles(page).first()).toBeVisible();
});

test("a fresh board is dealt, lit, and waiting", async ({ page }) => {
  const { cells: board, n } = await readSizedBoard(page);
  // Easy is the default level and spans two sizes, so either is correct.
  expect(LEVELS[DEFAULT_LEVEL].sizes).toContain(n);

  // An all-off board is already solved, so it is never a puzzle.
  expect(board.some((v) => v === 1)).toBe(true);

  await expect(page.locator("#movesVal")).toHaveText("0");
  // 0:00, not 00:00 — flip-it was the only game that zero-padded its minutes,
  // and it now spells a duration the way the rest of the site does.
  await expect(page.locator("#timeVal")).toHaveText("0:00");
  await expect(page.locator("#overlay")).not.toHaveClass(/show/);
});

test("a tap flips the tile and its four neighbours, and nothing else", async ({ page }) => {
  // Checked at both corners, an edge and the middle, because the interesting
  // part of the rule is what happens where neighbours fall off the board.
  const n = (await readSizedBoard(page)).n;
  const spots = [0, 2, Math.floor((n * n) / 2), n * (n - 1), n * n - 1];
  for (const i of spots) {
    const before = await readBoard(page);
    await tiles(page).nth(i).click();
    const after = await readBoard(page);
    expect(changedIndices(before, after), `${n}x${n} tap at ${i}`).toEqual(plus(n, i));
  }
});

test("the clock starts on the first move, not on load", async ({ page }) => {
  // Sitting on the board thinking must not cost anything.
  await page.waitForTimeout(1500);
  await expect(page.locator("#timeVal")).toHaveText("0:00");

  await tiles(page).nth(0).click();
  await expect(page.locator("#timeVal")).not.toHaveText("0:00", { timeout: 4000 });
});

test("tapping the same tile twice returns the board and costs two moves", async ({ page }) => {
  // Taps are self-inverse: this is how a player takes a move back, and it is
  // also the rapid-repeat case. The move counter must be honest about the cost.
  const before = await readBoard(page);
  await tiles(page).nth(7).click();
  await tiles(page).nth(7).click();

  expect(await readBoard(page)).toEqual(before);
  await expect(page.locator("#movesVal")).toHaveText("2");
});

test("rapid tapping does not desynchronise the board", async ({ page }) => {
  // Faster than the 180ms flip animation. Nothing is animation-gated, so the
  // model and the tiles must still agree afterwards.
  const expected = await readBoard(page);
  const taps = [6, 6, 11, 11, 15, 15, 3, 3]; // in range on the smallest board
  for (const i of taps) await tiles(page).nth(i).click({ force: true });
  await page.waitForTimeout(400);

  expect(await readBoard(page)).toEqual(expected);
  await expect(page.locator("#movesVal")).toHaveText(String(taps.length));
});

test("Reset restores the starting board; the topbar refresh deals another", async ({ page }) => {
  const start = await readBoard(page);

  await tiles(page).nth(4).click();
  await tiles(page).nth(13).click();
  await expect(page.locator("#movesVal")).toHaveText("2");
  await expect(page.locator("#timeVal")).not.toHaveText("0:00", { timeout: 4000 });

  await page.locator("#resetBtn").click();
  expect(await readBoard(page)).toEqual(start);
  await expect(page.locator("#movesVal")).toHaveText("0");
  await expect(page.locator("#timeVal")).toHaveText("0:00");

  await page.locator("#restartBtn").click();
  await expect(page.locator("#movesVal")).toHaveText("0");
  await expect(page.locator("#timeVal")).toHaveText("0:00");
  expect(LEVELS[DEFAULT_LEVEL].sizes).toContain((await readSizedBoard(page)).n);
});

test("every board the game deals can be cleared, and clearing it wins", async ({ page }) => {
  // Solvability is the one property generation must never get wrong, so it is
  // checked against boards the game actually dealt rather than argued about.
  for (let round = 0; round < 3; round++) {
    if (round > 0) {
      await page.locator("#againBtn").click();
      await expect(page.locator("#overlay")).not.toHaveClass(/show/);
    }

    const { cells: board, n } = await readSizedBoard(page);
    const answer = solve(n, board);
    expect(answer, "the dealt board must be solvable").not.toBeNull();

    // The band the default level generates within: a board worth playing that
    // is still short enough to be called easy.
    const [lo, hi] = LEVELS[DEFAULT_LEVEL].moves[n];
    expect(answer.weight, `${n}x${n} optimal within the easy band`)
      .toBeGreaterThanOrEqual(lo);
    expect(answer.weight).toBeLessThanOrEqual(hi);

    for (const i of answer.picks) await tiles(page).nth(i).click();

    expect(await readBoard(page), "every tile is off").toEqual(new Array(n * n).fill(0));

    const overlay = page.locator("#overlay");
    await expect(overlay).toHaveClass(/show/, { timeout: 4000 });
    await expect(page.locator("#overlayTitle")).toHaveText("CLEARED!");

    // Played at the optimum, so the game's own OPTIMAL must agree with the
    // solver here, and it must say so.
    await expect(page.locator("#overlaySub")).toHaveText(
      `YOU ${answer.weight} MOVES · OPTIMAL ${answer.weight}`,
    );
    await expect(page.locator("#overlayBadge")).toBeVisible();
    await expect(page.locator("#movesVal")).toHaveText(String(answer.weight));
  }
});

test("a solve above the optimum is scored as such, with no PERFECT", async ({ page }) => {
  const { cells: board, n } = await readSizedBoard(page);
  const answer = solve(n, board);

  // Two taps on the same tile: a real detour that leaves the board untouched,
  // so the same solution still applies and the only difference is the count.
  await tiles(page).nth(0).click();
  await tiles(page).nth(0).click();
  for (const i of answer.picks) await tiles(page).nth(i).click();

  await expect(page.locator("#overlay")).toHaveClass(/show/, { timeout: 4000 });
  await expect(page.locator("#overlaySub")).toHaveText(
    `YOU ${answer.weight + 2} MOVES · OPTIMAL ${answer.weight}`,
  );
  await expect(page.locator("#overlayBadge")).toBeHidden();
});

test("the board is locked once it is cleared", async ({ page }) => {
  const { cells, n } = await readSizedBoard(page);
  const answer = solve(n, cells);
  for (const i of answer.picks) await tiles(page).nth(i).click();
  await expect(page.locator("#overlay")).toHaveClass(/show/, { timeout: 4000 });

  await tiles(page).nth(n * n - 1).click({ force: true });
  expect(await readBoard(page)).toEqual(new Array(n * n).fill(0));
  await expect(page.locator("#movesVal")).toHaveText(String(answer.weight));
});

test("the level picker deals that level's sizes, and the rule still holds", async ({ page }) => {
  for (const level of ["medium", "hard"]) {
    await page.locator(`.level-btn[data-level="${level}"]`).click();
    await expect(page.locator("#movesVal")).toHaveText("0");

    const n = (await readSizedBoard(page)).n;
    expect(LEVELS[level].sizes, `${level} deals one of its two sizes`).toContain(n);
    await expect(tiles(page)).toHaveCount(n * n);

    // A corner has two neighbours and the middle has four, at every size.
    for (const i of [0, n * n - 1, Math.floor((n * n) / 2)]) {
      const before = await readBoard(page);
      await tiles(page).nth(i).click();
      const after = await readBoard(page);
      expect(changedIndices(before, after), `${n}x${n} tap at ${i}`).toEqual(plus(n, i));
    }
  }
});

test("each level deals boards inside its own difficulty band", async ({ page }) => {
  // The point of the levels: Easy really is a handful of moves and Hard really
  // is not. Checked against the independent solver, over several deals, since
  // the size within a level is random.
  for (const level of ["easy", "medium", "hard"]) {
    await page.locator(`.level-btn[data-level="${level}"]`).click();

    for (let round = 0; round < 3; round++) {
      if (round > 0) await page.locator("#restartBtn").click();
      await expect(page.locator("#movesVal")).toHaveText("0");

      const { cells, n } = await readSizedBoard(page);
      expect(LEVELS[level].sizes).toContain(n);

      const answer = solve(n, cells);
      expect(answer, `${level} ${n}x${n} must be solvable`).not.toBeNull();

      const [lo, hi] = LEVELS[level].moves[n];
      expect(answer.weight, `${level} ${n}x${n} optimal`).toBeGreaterThanOrEqual(lo);
      expect(answer.weight, `${level} ${n}x${n} optimal`).toBeLessThanOrEqual(hi);
    }
  }
});

test("the how-to sheet opens and closes", async ({ page }) => {
  // The sheet animates out with transform rather than display, so it stays
  // "visible" to Playwright after closing. The `show` class is the real state.
  await page.locator("#howtoBtn").click();
  await expect(page.locator("#howtoSheet")).toHaveClass(/show/);
  await page.locator("#howtoBackdrop").click();
  await expect(page.locator("#howtoSheet")).not.toHaveClass(/show/);
});
