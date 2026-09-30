// One global best per game, stored in Supabase. Direction (higher/lower wins)
// and daily resets live in the database's game_config, not here; the game owns
// presentation (ARCHITECTURE.md §27).

import { localDay, isoWeek } from "./day.js";
import { identity, getName, newId } from "./player.js";

// Injected by vite.config.js `define`. Write the full literal: a computed key
// like import.meta.env[`SUPABASE_${n}`] is not replaced in production (§35).
const SUPABASE_URL = import.meta.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY || "";

// Only one end-card line waits on this, so keep it short.
const TIMEOUT_MS = 4000;

const RPC = "submit_game_run";

function auth() {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

/**
 * POST to a security-definer function. Resolves with the parsed body, or null.
 * Never rejects: callers chain a bare `.then()` in game-over handlers.
 * `keepalive` because game over is when players close the tab.
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
      // e.g. a game with no game_config row: loud in dev, silent in prod.
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

function isLeaderboardAvailable() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Seeded runs (challenge/party) and framed runs (party) are unranked (§27).
 * Read at submit time: leaving a challenge strips the query and re-ranks.
 */
function isRanked() {
  return !new URLSearchParams(location.search).has("seed") && window.self === window.top;
}

/**
 * Submits a finished run. Resolves with
 * `{ best, accepted, your_best, rank, total, above }`, or null.
 *
 * Always sends the local day so Today/Week boards match the wall's `localDay()`
 * (the server clamps it to ±1 day). `is_daily` in the database, not `p_day`,
 * decides whether the record is day-scoped. `accepted` is false for refused
 * runs; the answer still carries current numbers (§27). The run id lets a
 * future retry queue dedupe resends.
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
  // Omitted when empty: a run may set a name, never clear one (savePlayer does).
  const name = getName();
  if (name) body.p_name = name;

  const data = await rpc(RPC, body, { keepalive: true });
  return data && typeof data === "object" ? data : null;
}

/**
 * Every game's all-time record, one row per game, via a plain public read.
 * The name is embedded through the foreign key; `players` grants `select` by
 * column, so this can never return an email. `players: null` means the holder
 * is gone. Resolves null, never rejects, when unavailable (§27).
 */
export function fetchAllBests() {
  return read(
    "game_scores?select=game_slug,best_score,updated_at,players(name)" +
      "&period=eq.all",
  );
}

/**
 * Top rows for a game and period ("day", "week" or "all"), names included via
 * the same column-limited embed (§27). Ties go to whoever posted first.
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
 * This browser's rank, board size and the score one place ahead, or null.
 * An RPC because rank and size are not columns.
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
 * Saves any of name, email and notification preferences. Resolves true only
 * when the write landed; never throws. `name: ""` clears; omit to leave alone.
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
 * Deletes this browser's player: name, email and every board row. A game-wide
 * record they hold survives with no holder.
 */
export async function deletePlayer() {
  const who = identity();
  return (await rpc("delete_player", {
    p_player_id: who.id,
    p_write_token: who.token,
  })) === true;
}

/**
 * Renders a game's global-best line on its end card. The game supplies
 * wording and `isRecord` (direction stays game-side, §27); `standing` is
 * optional wording for a board rank.
 *
 * `el` is `#globalBest`; visibility is its `hidden` attribute only, so callers
 * must not also toggle a class. Resolves with the board's answer; never rejects.
 */
export function renderGlobalBest(
  el,
  { slug, score, isRecord, label, recordLabel, pending, unavailable, standing },
) {
  // Nothing to put on the line, so do not show one at all. A build with no
  // credentials must read as a missing line, never as an error (§27), and an
  // unranked run is never submitted.
  if (!isLeaderboardAvailable() || !isRanked()) {
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
      // A board place beats repeating a record you did not beat.
      el.textContent = standing(answer.rank, answer.total, best);
    } else {
      el.textContent = label(best);
    }
    el.classList.toggle("new-global", record);
    return answer;
  });
}
