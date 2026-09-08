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
import { localDay, isoWeek } from "./day.js";
import { identity, getName, newId } from "./player.js";

/* Re-exported so the callers that already ask this module for the day — and
   the leaderboard's own `period` handling — keep working unchanged. The
   definition moved to day.js when the sticker book needed it in two games that
   never talk to a server. */
export { localDay };

const SUPABASE_URL = import.meta.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY || "";

// The run is already over by the time this is called, so all that is waiting on
// the network is one line of text on the end card. Not worth making a player
// sit through a long timeout.
const TIMEOUT_MS = 4000;

const RPC = "submit_game_run";

/** The two headers every request needs, and nothing else. */
function auth() {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

/**
 * POST to a security-definer function. Resolves with the parsed body, or null.
 *
 * Never rejects and never throws, which is the whole contract of this module:
 * a caller sequences this inside a game-over handler with a bare `.then()`,
 * and an unhandled rejection there would cost the player their overlay.
 *
 * `keepalive` because the interesting call happens at game over, which is
 * exactly when a player is most likely to close the tab or background the app.
 */
async function rpc(name, body, { keepalive = false } = {}) {
  if (!isLeaderboardAvailable()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      keepalive,
    });
    if (!res.ok) {
      // A game with no game_config row raises rather than silently creating
      // one. That is a wiring mistake, so say so in dev and degrade in prod.
      if (import.meta.env.DEV) {
        console.error(`[leaderboard] ${name}: ${res.status}`, await res.text());
      }
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/** GET a table or view. Resolves with an array, or null. */
async function read(path) {
  if (!isLeaderboardAvailable()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: auth(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

/**
 * Whether a leaderboard is configured at all. Internal: a game asks for its
 * global-best line and gets "unavailable" rendered into it, rather than testing
 * this itself first.
 */
function isLeaderboardAvailable() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Submits a finished run. Resolves with the board's answer, or null.
 *
 * The local day always goes with it, for every game, and no caller passes one.
 *
 * It used to be an option, and only word-steps — the one game whose puzzle is
 * the same for everyone each day — remembered to set it. The other five left it
 * off, so the server fell back to its own `current_date`, which is UTC: their
 * Today and This week boards were keyed in UTC while the wall reads them with
 * `localDay()`. For a player at UTC+5:30 that filed every run between 00:00 and
 * 05:29 on yesterday's board, where the wall would never look for it — and the
 * rank the end card printed came from that same UTC day, so the card could say
 * "3rd today" for a board the wall did not show them on.
 *
 * Sending it unconditionally is safe for the five: `is_daily` in the database —
 * not this argument — is what decides whether a game's *record* is day-scoped.
 * All `p_day` picks is which day and week board the run lands on, which is
 * exactly what was wrong. The server still clamps it to a day either side of
 * its own date, so it corrects a timezone without letting a caller write into
 * an arbitrary day.
 *
 * The player's name rides along too, when they have set one. It costs nothing:
 * this POST already happens at game over, so a name reaches the boards without
 * a second request. It is deliberately omitted when empty — the server treats
 * a missing name as "this run brought none" and never as "clear it", so one
 * stale read here cannot unsign somebody from every board at once. Clearing a
 * name is `savePlayer`'s job, from the account page.
 *
 * The answer is `{ best, accepted, your_best, rank, total, above }` — the
 * game-wide record, whether this run was written, and where the player stands
 * on today's board. One round trip, because the end card wants all of it at
 * once and the player is waiting.
 *
 * `accepted` is false for a duplicate, a throttled caller or an implausible
 * number, and the function still resolves with the current numbers rather than
 * an error (§27). A game shows the same end card either way; nothing about a
 * refused submission is the player's problem.
 *
 * The run id is minted per call. It exists so a *resend* of one finished run
 * cannot be counted twice, which matters the moment there is a retry queue —
 * the queue will hold the id alongside the score. Until then it dedupes
 * nothing and costs one uuid.
 */
async function submitRun(slug, score) {
  // A broken timer or counter must not become a 400 the player waits 4s for.
  if (!Number.isFinite(score)) return null;

  const who = identity();
  const body = {
    p_slug: slug,
    p_score: Math.round(score),
    p_day: localDay(),
    p_player_id: who.id,
    p_write_token: who.token,
    p_run_id: newId(),
  };
  // Omitted rather than sent empty: a run may set a name, never clear one.
  const name = getName();
  if (name) body.p_name = name;

  const data = await rpc(RPC, body, { keepalive: true });
  return data && typeof data === "object" ? data : null;
}

/**
 * Every game's record, in one request. Exactly one row per game.
 *
 * A plain PostgREST read of `game_scores`, not an RPC. The table carries a
 * public read policy and has insert/update/delete revoked from anon, so this
 * can see every record and change none of them — which is what makes the
 * homepage roll possible with no function of its own.
 *
 * `period=eq.all` is the whole filter, and it means one thing for every game:
 * the best anyone has ever managed. It used to ask for `in.(all,<day>)` and
 * leave the caller to pick, which meant the number silently meant "all time"
 * for five games and "today" for word-steps — under one heading, with no way
 * for a reader to tell which row was which. Daily games now keep an `'all'`
 * row of their own, so the ambiguity is gone rather than merely handled.
 *
 * A daily game's per-day rows are still there; they are what its end card
 * reads through `submitRun`, and nothing on the homepage or the wall wants
 * them.
 *
 * The holder's name rides along, embedded through the foreign key rather than
 * denormalised onto the record — so renaming yourself changes every board you
 * are on at once, and this query could never return an address even if it
 * asked, because `players` grants `select` by column (§27).
 *
 * A record whose holder is gone — deleted, or from before the boards existed —
 * comes back with `players: null`. That is a real state, not an error: the
 * score was real and there is no name to put on it (§27).
 *
 * Resolves with null — and never rejects — when the leaderboard is
 * unconfigured, unreachable or slow. The homepage is not allowed to show an
 * error for this; a roll with no numbers is the degraded state (§27).
 */
export function fetchAllBests() {
  return read(
    "game_scores?select=game_slug,best_score,updated_at,players(name)" +
      "&period=eq.all",
  );
}

/**
 * One board: the top rows for a game and a period, names included.
 *
 * Also a plain read, not a function. `game_leaders` has a public read policy
 * and a foreign key to `players`, so PostgREST can embed the name — and
 * because `players` grants `select` by column, that embed can return a name
 * and could never return an email (§27).
 *
 * `period` is "day", "week" or "all". Ordering is the house rule: the better
 * score first, and a tie goes to whoever posted it first.
 */
export function fetchBoard({ slug, period = "day", day = localDay(), lowerIsBetter = true, limit = 10 }) {
  const key = period === "all" ? "all" : period === "week" ? isoWeek(day) : day;
  return read(
    "game_leaders?select=best_score,achieved_at,player_id,players(name)" +
      `&game_slug=eq.${encodeURIComponent(slug)}` +
      `&period_kind=eq.${encodeURIComponent(period)}` +
      `&period_key=eq.${encodeURIComponent(key)}` +
      `&order=best_score.${lowerIsBetter ? "asc" : "desc"},achieved_at.asc` +
      `&limit=${Number(limit) | 0}`,
  );
}

/**
 * Where this browser stands on one board: rank, board size, and the score one
 * place ahead. Resolves with null when there is nothing to say.
 *
 * Rank and board size are not columns, which is the only reason this is a
 * function call and the board above is not.
 */
export async function fetchStanding({ slug, period = "day", day = localDay() }) {
  const data = await rpc("my_standing", {
    p_slug: slug,
    p_period_kind: period,
    p_day: day,
    p_player_id: identity().id,
  });
  return data && typeof data === "object" ? data : null;
}

/**
 * Saves any of the name, the email and the notification preferences.
 *
 * Resolves true only when the write landed. A wrong token, a name the board
 * will not take, a malformed address or a throttled caller all resolve false
 * rather than throwing — the caller is a form on a page that must stay usable.
 *
 * Pass `name: ""` to clear a name. Omit a field to leave it alone.
 */
export async function savePlayer({ name, email, notifyDisplaced, notifyStreak } = {}) {
  const who = identity();
  const body = { p_player_id: who.id, p_write_token: who.token };

  if (name !== undefined) body.p_name = name;
  if (email !== undefined) body.p_email = email;
  if (notifyDisplaced !== undefined) body.p_notify_displaced = notifyDisplaced;
  if (notifyStreak !== undefined) body.p_notify_streak = notifyStreak;
  // The server nudges a streak reminder at 8pm local, so it needs the zone.
  try {
    body.p_tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch { /* no Intl, no reminder */ }

  return (await rpc("save_player", body)) === true;
}

/**
 * Deletes this browser's player: the name, the email, and every board row.
 *
 * The game-wide record a player happens to hold survives as a number with no
 * holder, which is the honest outcome — the score was real, the name is gone.
 */
export async function deletePlayer() {
  const who = identity();
  return (await rpc("delete_player", {
    p_player_id: who.id,
    p_write_token: who.token,
  })) === true;
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
 * The line has one more state than it used to. A board now knows where the
 * player stands, so a run that is neither a record nor nothing can say "3rd
 * today" instead of only repeating the record. `standing` is the game's
 * wording for that, and a game that does not pass one keeps the old two-state
 * behaviour exactly.
 *
 * There is no `day` option. `submitRun` sends the player's local day for every
 * game, always — leaving it to each game meant five of six forgot, and their
 * Today boards ended up keyed in UTC. A game cannot get that wrong any more
 * because it is no longer a game's decision.
 *
 * Returns the submission promise, resolving with the board's whole answer for
 * callers that want the rank as well as the line. It never rejects.
 */
export function renderGlobalBest(
  el,
  { slug, score, isRecord, label, recordLabel, pending, unavailable, standing },
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

  return submitRun(slug, score).then((answer) => {
    const best = answer && typeof answer.best === "number" ? answer.best : null;
    if (best === null) {
      el.textContent = unavailable;
      return null;
    }

    const record = isRecord(score, best);
    if (record) {
      el.textContent = recordLabel;
    } else if (standing && typeof answer.rank === "number") {
      // A place on the board is more interesting than a record you did not
      // beat, so it wins when the game offers wording for it.
      el.textContent = standing(answer.rank, answer.total, best);
    } else {
      el.textContent = label(best);
    }
    el.classList.toggle("new-global", record);
    return answer;
  });
}
