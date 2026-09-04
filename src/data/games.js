// The game catalogue — the one place a game's metadata lives.
//
// This file is loaded by BOTH the browser (the homepage renders its cards and
// JSON-LD from it) and by Node (vite.config.js emits the sitemap from it,
// scripts/validate-games.js checks it against the filesystem). So it must stay
// plain, portable ESM: no import.meta.glob, no CSS or image imports, no
// process.env, no Vite-only syntax. Image paths are plain strings for the same
// reason — they point at public/, which is copied verbatim and never hashed.
//
// Array order is the homepage shelf order.
//
// See ARCHITECTURE.md §10 for the field contract, §5 for why `path` is flat.

export const SITE_URL = "https://www.tapwhenbored.com";

export const games = [
  {
    slug: "marble-nostalgia",
    title: "Marble Nostalgia",
    tagline: "Think · Move",
    description:
      "A classic peg-solitaire marble board, free to play online. Jump marbles to capture, finish with one — undo anytime, no signup.",
    path: "/marble-nostalgia/",
    thumb: "/assets/marble-nostalgia-thumb.webp",
    thumbAlt: "Marble Nostalgia — peg solitaire marble board preview",
    ogImage: "/assets/marble-nostalgia-og.jpg",
    cardClass: "card--marble",
    darkThemeColor: "#0d0e1a",
    updated: "2026-08-24",
    changefreq: "monthly",
    hasRestart: true,
    hasOverlay: true,
    leaderboard: {
      // Fewest marbles left. Bottoms out at 1, so the global best saturates
      // quickly — that is inherent to the game, not a bug.
      lowerIsBetter: true,
      daily: false,
      unit: "marbles left",
    },
  },
  {
    slug: "bubble-tap",
    title: "Bubble Tap",
    tagline: "Tap · Relax",
    description:
      "Bored? Pop endless bubble wrap online — the same satisfying burst as popping a pimple or real bubble wrap, minus the mess. Free, no download, no signup.",
    path: "/bubble-tap/",
    thumb: "/assets/bubble-tap-thumb.svg",
    thumbAlt: "Bubble Tap — bubble wrap popping game preview",
    ogImage: "/assets/bubble-tap-og.jpg",
    cardClass: "card--bubble",
    darkThemeColor: "#0d0e1a",
    updated: "2026-08-24",
    changefreq: "monthly",
    hasRestart: true,
    // No overlay: bubble-tap predates the shared page template and shows its
    // game-over state inline instead.
    hasOverlay: false,
    leaderboard: { lowerIsBetter: false, daily: false, unit: "points" },
  },
  {
    slug: "slide-n-order",
    title: "Slide N Order",
    tagline: "Tap · Arrange",
    description:
      "A free online 15-puzzle. Slide the numbered tiles back into order 1 to 15 — no timer, no signup, undo-free thinking at your own pace.",
    path: "/slide-n-order/",
    thumb: "/assets/slide-n-order-thumb.svg",
    thumbAlt: "Slide N Order — 15-puzzle sliding tile game preview",
    ogImage: "/assets/slide-n-order-og.jpg",
    cardClass: "card--slide",
    darkThemeColor: "#0d0e1a",
    updated: "2026-08-24",
    changefreq: "monthly",
    hasRestart: true,
    hasOverlay: true,
    leaderboard: { lowerIsBetter: true, daily: false, unit: "moves" },
  },
  {
    slug: "flip-it",
    title: "Flip It",
    tagline: "Tap · Clear",
    description:
      "A free online Lights Out puzzle. Tap a tile to flip it and its four neighbours, and turn the whole grid off in as few moves as possible. Easy, medium and hard levels, new board every time, no signup.",
    path: "/flip-it/",
    thumb: "/assets/flip-it-thumb.svg",
    thumbAlt: "Flip It — Lights Out grid puzzle preview",
    ogImage: "/assets/flip-it-og.jpg",
    cardClass: "card--flip-it",
    darkThemeColor: "#070b16",
    updated: "2026-09-04",
    changefreq: "monthly",
    // The topbar refresh deals a new board. Reset — restore *this* board's
    // starting pattern — is a second, different control, and sits beside it in
    // the topbar rather than competing with the level picker under the board.
    hasRestart: true,
    hasOverlay: true,
    leaderboard: {
      // Boards are random, so "fewest moves" would only ever record whoever
      // drew the easiest one. A run counts only when it matches the board's
      // computed optimal, and then the clock is the score — an easy board
      // cannot be farmed, and the record keeps moving. Medium only: three
      // levels in one record would put the same problem straight back.
      lowerIsBetter: true,
      daily: false,
      unit: "perfect time",
    },
  },
  {
    slug: "word-steps",
    title: "Word Steps",
    tagline: "Think · Spell",
    description:
      "A free daily word ladder puzzle. Change one letter at a time to turn the start word into the target word. New puzzle every day, no signup.",
    path: "/word-steps/",
    thumb: "/assets/word-steps-thumb.svg",
    thumbAlt: "Word Steps — daily word ladder puzzle preview",
    ogImage: "/assets/word-steps-og.jpg",
    cardClass: "card--word",
    darkThemeColor: "#0d0e1a",
    updated: "2026-08-25",
    // The puzzle rotates daily, so this page genuinely changes daily.
    changefreq: "daily",
    hasRestart: true,
    hasOverlay: true,
    leaderboard: {
      // Everyone gets the same puzzle each day, so the record is scoped to the
      // day. An all-time "fewest steps" would just record the easiest puzzle
      // ever published and then never move.
      lowerIsBetter: true,
      daily: true,
      unit: "steps",
    },
  },
  {
    slug: "untangle",
    title: "Untangle",
    tagline: "Drag · Solve",
    description:
      "A free online untangle puzzle. Move the dots until no lines cross — a brand-new random puzzle every time, no levels, no signup.",
    path: "/untangle/",
    thumb: "/assets/untangle-thumb.svg",
    thumbAlt: "Untangle — dot and line untangling puzzle preview",
    ogImage: "/assets/untangle-og.jpg",
    cardClass: "card--untangle",
    darkThemeColor: "#170f11",
    updated: "2026-08-28",
    changefreq: "monthly",
    // Restarts from the overlay's "Again" button; no topbar restart control.
    hasRestart: false,
    hasOverlay: true,
    // Left out on purpose: the puzzle is 8-13 nodes with a varying number of
    // crossings, so a global "fewest moves" would only ever record whoever drew
    // the smallest layout.
    leaderboard: false,
  },
  {
    slug: "honeycomb",
    title: "Honeycomb",
    tagline: "Tap · Reshape",
    description:
      "A free online hive puzzle. Move edge tiles, watch the clue numbers change, and keep the hive connected — a brand-new random hive every time, no levels, no signup.",
    path: "/honeycomb/",
    thumb: "/assets/honeycomb-thumb.svg",
    thumbAlt: "Honeycomb — hexagonal hive puzzle preview",
    ogImage: "/assets/honeycomb-og.jpg",
    cardClass: "card--honeycomb",
    darkThemeColor: "#14101f",
    updated: "2026-08-30",
    changefreq: "monthly",
    hasRestart: false,
    hasOverlay: true,
    leaderboard: {
      // Completion time in milliseconds.
      lowerIsBetter: true,
      daily: false,
      unit: "time",
    },
  },
  {
    slug: "doodle-on",
    title: "Doodle On",
    tagline: "Draw · 30s",
    description:
      "A free online drawing game. Get a random shape and a random idea, then turn one into the other in 30 seconds. Draw, fill, share. No score, no signup.",
    path: "/doodle-on/",
    thumb: "/assets/doodle-on-thumb.svg",
    thumbAlt: "Doodle On — 30-second shape-and-idea drawing game preview",
    ogImage: "/assets/doodle-on-og.jpg",
    cardClass: "card--doodle",
    darkThemeColor: "#0d0e1a",
    updated: "2026-09-03",
    changefreq: "monthly",
    hasRestart: true,
    hasOverlay: true,
    // No score by design — the result is the picture, not a number.
    leaderboard: false,
  },
];

// The homepage's own sitemap entry. Kept here so the sitemap has a single
// source, rather than being half-generated and half-hardcoded.
//
// `ogImage` is the one field here the sitemap does not use: it exists so the
// homepage's social image is validated the same way a game's is. It used to
// borrow bubble-tap's art, which meant sharing the site previewed as a single
// game, and nothing caught it because the validator only ever walked `games`.
// Landscape rather than the games' 640² squares, so the homepage is the one
// page that earns a summary_large_image card.
export const home = {
  path: "/",
  ogImage: "/assets/tapwhenbored-og.jpg",
  updated: "2026-09-03",
  changefreq: "monthly",
  priority: "1.0",
};
