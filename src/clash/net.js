/* The party page's only link to the room API: posting actions, polling the
 * snapshot, keeping the server's clock, and remembering this phone's seat.
 *
 * Polling, not a socket: the API is a Vercel function over Upstash, so the
 * room is read from a snapshot the CDN caches for a second. A phone polls
 * every second while it is on screen and stops the moment it is not — a
 * locked phone costs nothing — and asks again the instant it comes back.
 */

import { getJSON, setJSON } from "../shared/ui/prefs.js";

/* The one place the URL is spelled. It carries the trailing slash the rest
   of the site uses, so `trailingSlash: true` never has to redirect it. */
const API = "/api/clash/";
const SEATS_KEY = "clash.seats";
const SEAT_TTL_MS = 3 * 60 * 60 * 1000; // a room lives three hours

/* Server time minus this phone's time. Each answer can only have been stamped
   *before* it arrived, so serverNow − receivedAt underestimates the offset by
   the trip; the largest sample is the closest. A cached snapshot is older
   still, so it can only ever lower a sample, never win. */
let offset = -Infinity;

function sample(serverNow) {
  if (Number.isFinite(serverNow)) offset = Math.max(offset, serverNow - Date.now());
}

/** The server's clock, as best this phone knows it. */
export function now() {
  return Date.now() + (Number.isFinite(offset) ? offset : 0);
}

/**
 * POST an action. Resolves `{ ok, status, data }` and never rejects: a party
 * screen shows what failed rather than stalling on an exception.
 */
export async function post(body) {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    sample(data.serverNow);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "offline" } };
  }
}

/**
 * Poll a room. `onRoom(room)` gets each snapshot newer than the last one it
 * got; `onGone()` fires once if the room does not exist. While `relaxed()`
 * is true — a round is being played, and the screen is the player's own
 * board — the poll slows to every two seconds.
 */
export function watch(code, { onRoom, onGone, relaxed }) {
  let newest = 0;
  let timer = null;
  let stopped = false;

  async function poll() {
    clearTimeout(timer);
    if (stopped || document.hidden) return;
    try {
      const res = await fetch(`${API}?r=${code}`);
      // 404: no such room. 400: not even a room code. Either way, stop.
      if (res.status === 404 || res.status === 400) {
        stopped = true;
        onGone();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        sample(data.serverNow);
        if (data.serverNow >= newest) {
          newest = data.serverNow;
          onRoom(data.room);
        }
      }
    } catch {
      /* Offline for a moment: the next poll is the retry. */
    }
    if (!stopped) timer = setTimeout(poll, relaxed() ? 2000 : 1000);
  }

  document.addEventListener("visibilitychange", poll);
  poll();

  return {
    /** A snapshot from a POST answer: fresher than any cached poll. */
    accept(room, serverNow) {
      if (serverNow >= newest) {
        newest = serverNow;
        onRoom(room);
      }
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", poll);
    },
  };
}

function seats() {
  const all = getJSON(SEATS_KEY, null);
  return all && typeof all === "object" ? all : {};
}

/** This phone's seat in a room: `{ seat, token }`, or null. */
export function loadSeat(code) {
  const s = seats()[code];
  return s && Date.now() - s.at < SEAT_TTL_MS ? { seat: s.seat, token: s.token } : null;
}

/** Remember a seat, so a reload or an app switch rejoins silently. */
export function saveSeat(code, seat, token) {
  const all = seats();
  for (const k of Object.keys(all)) if (Date.now() - all[k].at >= SEAT_TTL_MS) delete all[k];
  all[code] = { seat, token, at: Date.now() };
  setJSON(SEATS_KEY, all);
}
