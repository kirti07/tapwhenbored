// One global best per game, stored in Supabase.
//
// A game submits a plain number and gets back the current global best, or null.
// Whether higher or lower is better is decided in two places, neither of them
// here: the SQL function only ever moves the record in the improving direction,
// and the game decides how to phrase the result on its end card. That is why
// there is no direction flag — adding one would be the first step toward the
// generalized scoring framework ARCHITECTURE.md §27 rules out.

// Statically replaced at build time. Always write the full literal: a computed
// key like import.meta.env[`VITE_${n}`] is NOT replaced, so it works in dev and
// silently yields undefined in production.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// The run is already over by the time this is called, so all that is waiting on
// the network is one line of text on the end card. Not worth making a player
// sit through a long timeout.
const TIMEOUT_MS = 4000;

// The RPC each game's leaderboard shipped with. These predate the single
// game_scores table described in ARCHITECTURE.md §27: each game has its own
// table and its own security-definer function (see README-supabase.sql), so
// they cannot be collapsed without discarding the existing records.
//
// The mapping lives here rather than in the games because a game holding an RPC
// name would be a game holding Supabase-specific database code, which §27
// forbids. When the migration to game_scores happens this table goes away and
// no game changes, because no game knows these names either way.
const RPCS = {
  "bubble-tap": { fn: "submit_score", arg: "new_score" },
  honeycomb: { fn: "submit_honeycomb_time", arg: "new_time_ms" },
};

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
 * Resolves with null — and never rejects — when the leaderboard is
 * unconfigured, unreachable, slow, or answers with anything that is not a
 * number. Callers treat null as "nothing to show" and carry on.
 *
 * Never rejecting is load-bearing, not defensive: both call sites use a bare
 * .then() inside their game-over handler. An unhandled rejection there would
 * abort the rest of that handler, so a leaderboard hiccup would cost the player
 * their overlay, share button and replay control.
 */
export async function submitScore(slug, score) {
  const rpc = RPCS[slug];
  if (!rpc) {
    // A bad slug is a programming error rather than a network condition, so say
    // so in dev — but still degrade to "unavailable" instead of throwing out of
    // a game-over handler.
    if (import.meta.env.DEV) {
      console.error(`[leaderboard] no RPC registered for slug "${slug}"`);
    }
    return null;
  }
  if (!isLeaderboardAvailable()) return null;
  // A broken timer or counter must not become a 400 the player waits 4s for.
  if (!Number.isFinite(score)) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc.fn}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      // Both RPCs take an int. Every current caller already passes one; this
      // guards a future caller passing a performance.now() delta.
      body: JSON.stringify({ [rpc.arg]: Math.round(score) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // This fires at game over, which is exactly when a player is most likely
      // to close the tab or background the app. keepalive lets the record land.
      keepalive: true,
    });
    if (!res.ok) return null;
    const data = await res.json();
    // honeycomb_global_best.best_ms is nullable until the first ever
    // submission, so a null body is a real answer, not only an error.
    return typeof data === "number" ? data : null;
  } catch {
    return null;
  }
}
