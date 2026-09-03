// One global best per game, stored in Supabase.
//
// A game submits a plain number and gets back the current global best, or null.
//
// Two things this module deliberately does NOT know: whether higher or lower
// wins, and whether a game's record resets daily. Both live in the database
// (game_config), so the SQL function only ever moves a record in the improving
// direction and only ever writes the period the game is actually configured
// for. A page cannot claim a direction it does not have, and there is no
// scoring framework here to grow — which is what ARCHITECTURE.md §27 asks for.
//
// The game still owns the *presentation* of a result: whether to say "new
// record", and how to format its own number.

// Statically replaced at build time. These two are named without a VITE_
// prefix, so Vite does not expose them on its own — vite.config.js injects
// them by name through `define`. Always write the full literal: a computed key
// like import.meta.env[`SUPABASE_${n}`] is NOT replaced, so it works in dev
// and silently yields undefined in production. See ARCHITECTURE.md §35.
const SUPABASE_URL = import.meta.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY || "";

// The run is already over by the time this is called, so all that is waiting on
// the network is one line of text on the end card. Not worth making a player
// sit through a long timeout.
const TIMEOUT_MS = 4000;

const RPC = "submit_game_score";

/**
 * Whether a leaderboard is configured at all.
 *
 * Games use this to decide whether to show a global-best line before they have
 * anything to put in it.
 */
export function isLeaderboardAvailable() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Submits a finished run's score; resolves with the current global best.
 *
 * `day` is only for games whose puzzle is the same for everyone each day. Pass
 * the local date the puzzle was chosen from ("YYYY-MM-DD"): the server picks
 * its puzzle by UTC date, so without this a player in UTC+13 would have
 * tomorrow's puzzle filed under today and compared against a different one. The
 * server clamps it to a day either side of its own date, so it corrects the
 * timezone without letting a caller write into an arbitrary day.
 *
 * Resolves with null — and never rejects — when the leaderboard is
 * unconfigured, unreachable, slow, or answers with anything that is not a
 * number. Callers treat null as "nothing to show" and carry on.
 *
 * Never rejecting is load-bearing, not defensive: call sites use a bare
 * .then() inside their game-over handler. An unhandled rejection there would
 * abort the rest of that handler, so a leaderboard hiccup would cost the player
 * their overlay, share button and replay control.
 */
export async function submitScore(slug, score, day) {
  if (!isLeaderboardAvailable()) return null;
  // A broken timer or counter must not become a 400 the player waits 4s for.
  if (!Number.isFinite(score)) return null;

  const body = { p_slug: slug, p_score: Math.round(score) };
  // Sent only when the game has one; the server ignores it for all-time games.
  if (day) body.p_day = day;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${RPC}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // This fires at game over, which is exactly when a player is most likely
      // to close the tab or background the app. keepalive lets the record land.
      keepalive: true,
    });
    if (!res.ok) {
      // A game with no row in game_config raises rather than silently creating
      // one. That is a wiring mistake, so say so in dev and degrade in prod.
      if (import.meta.env.DEV) {
        console.error(`[leaderboard] ${slug}: ${res.status}`, await res.text());
      }
      return null;
    }
    const data = await res.json();
    return typeof data === "number" ? data : null;
  } catch {
    return null;
  }
}

/** Today's date as the server-comparable "YYYY-MM-DD", in the player's timezone. */
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Renders a game's global-best line on its end card.
 *
 * Every game ran its own copy of this five-state machine — hidden, pending,
 * unavailable, record, plain value — and the copies drifted: one game forgot
 * the availability guard and announced "unavailable" on a normal end card,
 * another never showed a pending line at all. The mechanics are identical
 * everywhere, so they live here now.
 *
 * What stays with the game is the wording and the direction, because
 * ARCHITECTURE.md §27 puts presentation and "which way is better" on the game
 * side. So this takes `isRecord` and the strings rather than a `lowerIsBetter`
 * flag: still no scoring framework here to grow.
 *
 * `el` is the game's `#globalBest` element. Visibility is the `hidden`
 * attribute in every game, so callers must not also toggle a class for it.
 *
 * Returns the submitScore promise, for tests and for callers that want to
 * sequence something after the line resolves. It never rejects.
 */
export function renderGlobalBest(
  el,
  { slug, score, day, isRecord, label, recordLabel, pending, unavailable },
) {
  // Nothing to put on the line, so do not show one at all. A build with no
  // credentials must read as a missing line, never as an error (§27).
  if (!isLeaderboardAvailable()) {
    el.hidden = true;
    el.classList.remove("new-global");
    return Promise.resolve(null);
  }

  el.hidden = false;
  el.classList.remove("new-global");
  el.textContent = pending;

  return submitScore(slug, score, day).then((best) => {
    if (best === null) {
      el.textContent = unavailable;
      return null;
    }
    const record = isRecord(score, best);
    el.textContent = record ? recordLabel : label(best);
    el.classList.toggle("new-global", record);
    return best;
  });
}
