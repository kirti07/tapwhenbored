// Runs as the Vercel Build Command. Reads SUPABASE_URL / SUPABASE_ANON_KEY
// from the host's environment variables (set in the Vercel dashboard, never
// committed) and writes them into config.js so app.js can read them at
// runtime via window.TWB_CONFIG. Locally, config.js is just hand-edited
// instead (see config.example.js) and this script never runs.
const fs = require("fs");
const path = require("path");

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_ANON_KEY || "";

const content = `window.TWB_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_ANON_KEY: ${JSON.stringify(key)},
};
`;

fs.writeFileSync(path.join(__dirname, "..", "config.js"), content);
console.log("config.js generated from environment variables");
