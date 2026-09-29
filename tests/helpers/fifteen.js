// A 15-puzzle solver for the specs: IDA* with the Manhattan distance.
//
// Party scrambles are a 26-move walk from solved, so the optimal solution is
// at most 26 moves and this finds it in milliseconds. It returns the tile
// *values* to slide, in order, which is what a player taps.

const N = 4;

/** `cells`: 16 entries, numbers 1..15 and null for the gap, row by row. */
export function solveFifteen(cells) {
  const board = cells.map((v) => (v == null ? 0 : v));
  let blank = board.indexOf(0);
  const path = [];

  const dist = (v, i) => {
    const goal = v - 1;
    return Math.abs(Math.floor(i / N) - Math.floor(goal / N)) + Math.abs((i % N) - (goal % N));
  };
  let h = board.reduce((sum, v, i) => (v ? sum + dist(v, i) : sum), 0);

  const neighbours = (i) => {
    const out = [];
    if (i >= N) out.push(i - N);
    if (i < N * (N - 1)) out.push(i + N);
    if (i % N) out.push(i - 1);
    if (i % N < N - 1) out.push(i + 1);
    return out;
  };

  function search(g, bound, prev) {
    const f = g + h;
    if (f > bound) return f;
    if (h === 0) return true;
    let min = Infinity;
    for (const next of neighbours(blank)) {
      if (next === prev) continue;
      const v = board[next];
      const delta = dist(v, blank) - dist(v, next);
      board[blank] = v;
      board[next] = 0;
      const from = blank;
      blank = next;
      h += delta;
      path.push(v);
      const t = search(g + 1, bound, from);
      if (t === true) return true;
      if (t < min) min = t;
      path.pop();
      h -= delta;
      blank = from;
      board[next] = v;
      board[from] = 0;
    }
    return min;
  }

  let bound = h;
  for (;;) {
    const t = search(0, bound, -1);
    if (t === true) return path;
    if (t === Infinity) return null;
    bound = t;
  }
}
