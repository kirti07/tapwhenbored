// Runs as the Vercel Build Command. Reads SUPABASE_URL / SUPABASE_ANON_KEY
// from the host's environment variables (set in the Vercel dashboard, never
// committed) and writes them into each Supabase-backed game's config.js so
// its game.js/app.js can read them at runtime via window.TWB_CONFIG. Both
// games share one Supabase project (each has its own table/RPC — see
// README-supabase.sql — so there's no collision reusing the same env vars).
// Locally, each config.js is just hand-edited instead (see config.example.js)
// and this script never runs.
const fs = require("fs");
const path = require("path");

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_ANON_KEY || "";

const content = `window.TWB_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_ANON_KEY: ${JSON.stringify(key)},
};
`;

["bubble-tap", "honeycomb"].forEach((game) => {
  fs.writeFileSync(path.join(__dirname, "..", game, "config.js"), content);
});
console.log("config.js generated from environment variables");
