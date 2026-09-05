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
    ogImage: "/assets/marble-nostalgia-og.jpg",
    accent: "#1684d1",
    accentDark: "#22d3ee",
    sticker: "st-marble",
    scoreUnit: "marbles left",
    scoreFormat: "int",
    darkThemeColor: "#0d0e1a",
    updated: "2026-08-24",
    changefreq: "monthly",
    hasRestart: true,
    leaderboard: {
      // Fewest marbles left. Bottoms out at 1, so the global best saturates
      // quickly — that is inherent to the game, not a bug.
      lowerIsBetter: true,
      daily: false,
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
    ogImage: "/assets/bubble-tap-og.jpg",
    accent: "#4fb6e0",
    accentDark: "#22e5ff",
    sticker: "st-bubble",
    scoreUnit: "points",
    scoreFormat: "int",
    darkThemeColor: "#0d0e1a",
    updated: "2026-08-24",
    changefreq: "monthly",
    hasRestart: true,
    // No overlay: bubble-tap predates the shared page template and shows its
    // game-over state inline instead.
    hasOverlay: false,
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
    ogImage: "/assets/slide-n-order-og.jpg",
    accent: "#8b7fe0",
    accentDark: "#a855f7",
    sticker: "st-slide",
    scoreUnit: "moves",
    scoreFormat: "int",
    darkThemeColor: "#0d0e1a",
    updated: "2026-08-24",
    changefreq: "monthly",
    hasRestart: true,
    hasOverlay: true,
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
    ogImage: "/assets/flip-it-og.jpg",
    accent: "#f0a825",
    accentDark: "#ffd60a",
    sticker: "st-flip",
    scoreUnit: "perfect time",
    scoreFormat: "time",
    darkThemeColor: "#070b16",
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
      daily: false,
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
    ogImage: "/assets/word-steps-og.jpg",
    accent: "#1f9974",
    accentDark: "#34e19a",
    sticker: "st-word",
    scoreUnit: "steps",
    scoreFormat: "int",
    darkThemeColor: "#0d0e1a",
    updated: "2026-08-25",
    // The puzzle rotates daily, so this page genuinely changes daily.
    changefreq: "daily",
    hasRestart: true,
    leaderboard: {
      // Everyone gets the same puzzle each day, so the record is scoped to the
      // day. An all-time "fewest steps" would just record the easiest puzzle
      // ever published and then never move.
      lowerIsBetter: true,
      daily: true,
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
    ogImage: "/assets/untangle-og.jpg",
    accent: "#ef6a55",
    accentDark: "#ff6b57",
    sticker: "st-untangle",
    scoreUnit: "moves",
    scoreFormat: "int",
    darkThemeColor: "#170f11",
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
    ogImage: "/assets/honeycomb-og.jpg",
    accent: "#8b6fd9",
    accentDark: "#b48cff",
    sticker: "st-honey",
    scoreUnit: "time",
    scoreFormat: "time",
    darkThemeColor: "#14101f",
    updated: "2026-08-30",
    changefreq: "monthly",
    hasRestart: false,
    leaderboard: {
      // Completion time in milliseconds.
      lowerIsBetter: true,
      daily: false,
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
    ogImage: "/assets/doodle-on-og.jpg",
    accent: "#7c5cff",
    accentDark: "#ff5fb3",
    sticker: "st-doodle",
    darkThemeColor: "#0d0e1a",
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
/* Pages that are neither the homepage nor a game.
 *
 * The build discovers pages from the filesystem, but validation, the sitemap
 * and the test suites are all registry-driven — so a directory that is not
 * listed here fails `npm run validate`, which gates the deploy. Anything with
 * an index.html under src/ belongs in `games`, in `pages`, or nowhere. */
export const pages = [
  {
    slug: "book",
    title: "Your sticker book",
    path: "/book/",
    updated: "2026-09-05",
    changefreq: "monthly",
    priority: "0.5",
  },
  {
    slug: "wall",
    title: "The wall",
    path: "/wall/",
    // Every game's record on one page. Unlike the book, this is public content
    // and is indexed, so it changes as often as somebody beats a record.
    updated: "2026-09-05",
    changefreq: "weekly",
    priority: "0.7",
  },
];

export const home = {
  path: "/",
  ogImage: "/assets/tapwhenbored-og.jpg",
  themeColor: { light: "#f6f6fb", dark: "#0d0e1a" },
  updated: "2026-09-03",
  changefreq: "monthly",
  priority: "1.0",
};
