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
    seoTitle: "Marble Nostalgia — Free Online Peg Solitaire Game",
    ogDescription:
      "A classic peg-solitaire marble board, free to play online. Jump marbles to capture, finish with one.",
    schemaDescription:
      "A free online peg-solitaire marble board game. Jump marbles to capture, finish with one.",
    genre: "Puzzle",
    path: "/marble-nostalgia/",
    thumb: "/assets/marble-nostalgia-thumb.webp",
    thumbAlt: "Marble Nostalgia — peg solitaire marble board preview",
    ogImage: "/assets/marble-nostalgia-og.jpg",
    accent: { light: "#1684d1", dark: "#22d3ee" },
    themeColor: { light: "#eef3ec", dark: "#0d0e1a" },
    updated: "2026-08-24",
    changefreq: "monthly",
    hasRestart: true,
    leaderboard: {
      // Fewest marbles left. Bottoms out at 1, so the global best saturates
      // quickly — that is inherent to the game, not a bug.
      lowerIsBetter: true,
      daily: false
    },
  },
  {
    slug: "bubble-tap",
    title: "Bubble Tap",
    tagline: "Tap · Relax",
    description:
      "Bored? Pop endless bubble wrap online — the same satisfying burst as popping a pimple or real bubble wrap, minus the mess. Free, no download, no signup.",
    seoTitle: "Bubble Tap — Free Online Bubble Wrap Popping Game",
    ogDescription:
      "Pop endless bubble wrap online. Some bubbles hide a bomb — tap one and it's game over.",
    schemaDescription:
      "A free online bubble wrap popping game. Tap bubbles to score points, but watch out — some hide a bomb.",
    genre: "Casual",
    path: "/bubble-tap/",
    thumb: "/assets/bubble-tap-thumb.svg",
    thumbAlt: "Bubble Tap — bubble wrap popping game preview",
    ogImage: "/assets/bubble-tap-og.jpg",
    accent: { light: "#4fb6e0", dark: "#22e5ff" },
    themeColor: { light: "#eaf6fb", dark: "#0d0e1a" },
    updated: "2026-08-24",
    changefreq: "monthly",
    hasRestart: true,
    leaderboard: { lowerIsBetter: false, daily: false },
  },
  {
    slug: "slide-n-order",
    title: "Slide N Order",
    tagline: "Tap · Arrange",
    description:
      "A free online 15-puzzle. Slide the numbered tiles back into order 1 to 15 — no timer, no signup, undo-free thinking at your own pace.",
    seoTitle: "Slide N Order — Free Online 15 Puzzle Game",
    ogDescription:
      "A free online 15-puzzle. Slide the numbered tiles back into order 1 to 15 — no timer, just moves.",
    schemaDescription:
      "A free online sliding number puzzle (15-puzzle). Arrange tiles 1 to 15 in order around one empty slot.",
    genre: "Puzzle",
    path: "/slide-n-order/",
    thumb: "/assets/slide-n-order-thumb.svg",
    thumbAlt: "Slide N Order — 15-puzzle sliding tile game preview",
    ogImage: "/assets/slide-n-order-og.jpg",
    accent: { light: "#8b7fe0", dark: "#a855f7" },
    themeColor: { light: "#f1eefb", dark: "#0d0e1a" },
    updated: "2026-08-24",
    changefreq: "monthly",
    hasRestart: true,
    leaderboard: { lowerIsBetter: true, daily: false },
  },
  {
    slug: "flip-it",
    title: "Flip It",
    tagline: "Tap · Clear",
    description:
      "A free online Lights Out puzzle. Tap a tile to flip it and its four neighbours, and turn the whole grid off in as few moves as possible. Easy, medium and hard levels, new board every time, no signup.",
    seoTitle: "Flip It — Free Online Lights Out Puzzle Game",
    ogDescription:
      "Tap a tile and it flips itself and its four neighbours. Turn the whole grid off in as few moves as you can.",
    schemaDescription:
      "A free online Lights Out puzzle. Tapping a tile flips it and its four orthogonal neighbours; clear the grid by turning every tile off.",
    genre: "Puzzle",
    path: "/flip-it/",
    thumb: "/assets/flip-it-thumb.svg",
    thumbAlt: "Flip It — Lights Out grid puzzle preview",
    ogImage: "/assets/flip-it-og.jpg",
    accent: { light: "#f0a825", dark: "#ffd60a" },
    themeColor: { light: "#fdf6e9", dark: "#070b16" },
    updated: "2026-09-04",
    changefreq: "monthly",
    // The topbar refresh deals a new board. Reset — restore *this* board's
    // starting pattern — is a second, different control, and sits beside it in
    // the topbar rather than competing with the level picker under the board.
    hasRestart: true,
    leaderboard: {
      // Boards are random, so "fewest moves" would only ever record whoever
      // drew the easiest one. A run counts only when it matches the board's
      // computed optimal, and then the clock is the score — an easy board
      // cannot be farmed, and the record keeps moving. Medium only: three
      // levels in one record would put the same problem straight back.
      lowerIsBetter: true,
      daily: false
    },
  },
  {
    slug: "word-steps",
    title: "Word Steps",
    tagline: "Think · Spell",
    description:
      "A free daily word ladder puzzle. Change one letter at a time to turn the start word into the target word. New puzzle every day, no signup.",
    seoTitle: "Word Steps — Free Daily Word Ladder Puzzle",
    ogDescription:
      "Change one letter at a time to turn the start word into the target word. A new puzzle every day.",
    schemaDescription:
      "A free daily word ladder puzzle. Change one letter at a time to turn the start word into the target word.",
    genre: "Word",
    path: "/word-steps/",
    thumb: "/assets/word-steps-thumb.svg",
    thumbAlt: "Word Steps — daily word ladder puzzle preview",
    ogImage: "/assets/word-steps-og.jpg",
    accent: { light: "#1f9974", dark: "#34e19a" },
    themeColor: { light: "#fdf3d9", dark: "#0d0e1a" },
    updated: "2026-08-25",
    // The puzzle rotates daily, so this page genuinely changes daily.
    changefreq: "daily",
    hasRestart: true,
    leaderboard: {
      // Everyone gets the same puzzle each day, so the record is scoped to the
      // day. An all-time "fewest steps" would just record the easiest puzzle
      // ever published and then never move.
      lowerIsBetter: true,
      daily: true
    },
  },
  {
    slug: "untangle",
    title: "Untangle",
    tagline: "Drag · Solve",
    description:
      "A free online untangle puzzle. Move the dots until no lines cross — a brand-new random puzzle every time, no levels, no signup.",
    seoTitle: "Untangle — Free Online Puzzle Game",
    ogDescription:
      "Move the dots until no lines cross. A new random puzzle every time.",
    schemaDescription:
      "A free online untangle puzzle. Move dots connected by lines until none of the lines cross.",
    genre: "Puzzle",
    path: "/untangle/",
    thumb: "/assets/untangle-thumb.svg",
    thumbAlt: "Untangle — dot and line untangling puzzle preview",
    ogImage: "/assets/untangle-og.jpg",
    accent: { light: "#ef6a55", dark: "#ff6b57" },
    themeColor: { light: "#fdf2ef", dark: "#170f11" },
    updated: "2026-08-28",
    changefreq: "monthly",
    // Restarts from the overlay's "Again" button; no topbar restart control.
    hasRestart: false,
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
    seoTitle: "Honeycomb — Free Online Hex Puzzle Game",
    ogDescription:
      "Move the edge tiles of a hive without breaking it apart. A new random hive every time.",
    schemaDescription:
      "A free online hive puzzle. Move edge tiles, watch the clue numbers change, and keep the hive connected.",
    genre: "Puzzle",
    path: "/honeycomb/",
    thumb: "/assets/honeycomb-thumb.svg",
    thumbAlt: "Honeycomb — hexagonal hive puzzle preview",
    ogImage: "/assets/honeycomb-og.jpg",
    accent: { light: "#8b6fd9", dark: "#b48cff" },
    themeColor: { light: "#fdf8e9", dark: "#14101f" },
    updated: "2026-08-30",
    changefreq: "monthly",
    hasRestart: false,
    leaderboard: {
      // Completion time in milliseconds.
      lowerIsBetter: true,
      daily: false
    },
  },
  {
    slug: "doodle-on",
    title: "Doodle On",
    tagline: "Draw · 30s",
    description:
      "A free online drawing game. Get a random shape and a random idea, then turn one into the other in 30 seconds. Draw, fill, share. No score, no signup.",
    seoTitle: "Doodle On — Free 30-Second Drawing Game, Random Prompts",
    ogDescription:
      "A circle and \"something that flies\". You get 30 seconds to turn one into the other.",
    schemaDescription:
      "A free online drawing game. Every round gives you a starting shape and a creative direction — turn a circle into something that lives in water, in 30 seconds.",
    genre: "Casual",
    path: "/doodle-on/",
    thumb: "/assets/doodle-on-thumb.svg",
    thumbAlt: "Doodle On — 30-second shape-and-idea drawing game preview",
    ogImage: "/assets/doodle-on-og.jpg",
    accent: { light: "#7c5cff", dark: "#ff5fb3" },
    themeColor: { light: "#eaf6ee", dark: "#0d0e1a" },
    updated: "2026-09-03",
    changefreq: "monthly",
    hasRestart: true,
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
  themeColor: { light: "#f6f6fb", dark: "#0d0e1a" },
  updated: "2026-09-03",
  changefreq: "monthly",
  priority: "1.0",
};
