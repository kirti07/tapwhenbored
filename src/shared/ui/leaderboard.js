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

// Statically replaced at build time. Always write the full literal: a computed
// key like import.meta.env[`VITE_${n}`] is NOT replaced, so it works in dev and
// silently yields undefined in production.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

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
