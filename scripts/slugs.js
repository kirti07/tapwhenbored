// The slugs a game may take, for `npm run game:new` and `npm run validate`.

import { pages } from "../src/data/games.js";

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Slugs that would collide with build output, platform paths or another page.
export const RESERVED = new Set([
  "assets",
  "static",
  "icons",
  "data",
  "shared",
  "api",
  "_vercel",
  // public/fonts/ is served at /fonts/.
  "fonts",
  // Retired page; its URL was indexed.
  "book",
  ...pages.map((p) => p.slug),
]);
