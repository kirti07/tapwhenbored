// Flip It: the Lights Out puzzle.
//
// A new board is generated on every load and every "New Puzzle", so these tests
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
  const board = await readBoard(page);
  expect(board.length).toBe(25); // 5x5 is the default size

  // An all-off board is already solved, so it is never a puzzle.
  expect(board.some((v) => v === 1)).toBe(true);

  await expect(page.locator("#movesVal")).toHaveText("0");
  await expect(page.locator("#timeVal")).toHaveText("00:00");
  await expect(page.locator("#overlay")).not.toHaveClass(/show/);
});

test("a tap flips the tile and its four neighbours, and nothing else", async ({ page }) => {
  // Checked at a corner, an edge and the middle, because the interesting part
  // of the rule is what happens where neighbours fall off the board.
  for (const i of [0, 2, 12, 20, 24]) {
    const before = await readBoard(page);
    await tiles(page).nth(i).click();
    const after = await readBoard(page);
    expect(changedIndices(before, after), `tap at ${i}`).toEqual(plus(5, i));
  }
});

test("the clock starts on the first move, not on load", async ({ page }) => {
  // Sitting on the board thinking must not cost anything.
  await page.waitForTimeout(1500);
  await expect(page.locator("#timeVal")).toHaveText("00:00");

  await tiles(page).nth(0).click();
  await expect(page.locator("#timeVal")).not.toHaveText("00:00", { timeout: 4000 });
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
  const taps = [6, 6, 11, 11, 18, 18, 3, 3];
  for (const i of taps) await tiles(page).nth(i).click({ force: true });
  await page.waitForTimeout(400);

  expect(await readBoard(page)).toEqual(expected);
  await expect(page.locator("#movesVal")).toHaveText(String(taps.length));
});

test("Reset restores the starting board; New Puzzle deals another", async ({ page }) => {
  const start = await readBoard(page);

  await tiles(page).nth(4).click();
  await tiles(page).nth(13).click();
  await expect(page.locator("#movesVal")).toHaveText("2");
  await expect(page.locator("#timeVal")).not.toHaveText("00:00", { timeout: 4000 });

  await page.locator("#resetBtn").click();
  expect(await readBoard(page)).toEqual(start);
  await expect(page.locator("#movesVal")).toHaveText("0");
  await expect(page.locator("#timeVal")).toHaveText("00:00");

  await page.locator("#newBtn").click();
  await expect(page.locator("#movesVal")).toHaveText("0");
  await expect(page.locator("#timeVal")).toHaveText("00:00");
  expect((await readBoard(page)).length).toBe(25);
});

test("every board the game deals can be cleared, and clearing it wins", async ({ page }) => {
  // Solvability is the one property generation must never get wrong, so it is
  // checked against boards the game actually dealt rather than argued about.
  for (let round = 0; round < 3; round++) {
    if (round > 0) {
      await page.locator("#againBtn").click();
      await expect(page.locator("#overlay")).not.toHaveClass(/show/);
    }

    const board = await readBoard(page);
    const answer = solve(5, board);
    expect(answer, "the dealt board must be solvable").not.toBeNull();

    // The floor generation enforces: a board worth playing.
    expect(answer.weight).toBeGreaterThanOrEqual(8);

    for (const i of answer.picks) await tiles(page).nth(i).click();

    expect(await readBoard(page), "every tile is off").toEqual(new Array(25).fill(0));

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
  const board = await readBoard(page);
  const answer = solve(5, board);

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
  const answer = solve(5, await readBoard(page));
  for (const i of answer.picks) await tiles(page).nth(i).click();
  await expect(page.locator("#overlay")).toHaveClass(/show/, { timeout: 4000 });

  await tiles(page).nth(12).click({ force: true });
  expect(await readBoard(page)).toEqual(new Array(25).fill(0));
  await expect(page.locator("#movesVal")).toHaveText(String(answer.weight));
});

test("the size picker deals 6x6 and 7x7, and the rule still holds", async ({ page }) => {
  for (const n of [6, 7]) {
    await page.locator(`.size-btn[data-size="${n}"]`).click();
    await expect(tiles(page)).toHaveCount(n * n);
    await expect(page.locator("#movesVal")).toHaveText("0");

    const cells = (await readBoard(page)).length;
    expect(sizeOf(cells)).toBe(n);

    // A corner has two neighbours and the middle has four, at every size.
    for (const i of [0, n * n - 1, Math.floor((n * n) / 2)]) {
      const before = await readBoard(page);
      await tiles(page).nth(i).click();
      const after = await readBoard(page);
      expect(changedIndices(before, after), `${n}x${n} tap at ${i}`).toEqual(plus(n, i));
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
