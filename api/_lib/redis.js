// The Tap Clash room store: Upstash Redis over its REST API.
//
// No SDK. Every call is one pipeline POST, so a handler that needs three
// commands pays one round trip, and the whole client is this file. The two
// env names are server-only: they are never in Vite's `define` allowlist, so no
// page can ever carry them (ARCHITECTURE.md §35).

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Run commands in order, e.g. pipeline([["HGETALL", key]]). Resolves with each
 * command's result; rejects if the store is unreachable or any command fails,
 * so a handler never mistakes an error for an empty room.
 */
export async function pipeline(commands) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = await res.json();
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(`redis ${failed.error}`);
  return out.map((r) => r.result);
}
