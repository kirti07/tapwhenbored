// A Lights Out solver for the specs, independent of the game's own on purpose:
// a test that asked the game for the answer would only prove the game agrees
// with itself.

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
 * `lit`, as `{ weight, picks }` — how many taps, and the tile indices. Returns
 * null if the board cannot be cleared, which is the case these tests most want
 * to be able to detect.
 */
export function solve(n, lit) {
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
