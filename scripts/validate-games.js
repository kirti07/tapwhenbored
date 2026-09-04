// Structural checks that run before every build (npm run build == validate &&
// vite build), so a broken repository cannot reach production.
//
// The important one is bidirectional: every registry entry must have a page on
// disk, AND every page on disk must have a registry entry. Filesystem discovery
// means vite.config.js never needs editing when a game is added; this check
// means the homepage, sitemap, and smoke tests cannot silently fall behind.
//
// See ARCHITECTURE.md §29.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { games, home, SITE_URL } from "../src/data/games.js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(rootDir, "src");
const publicDir = path.join(rootDir, "public");

// Slugs that would collide with build output or platform paths.
const RESERVED = new Set([
  "assets",
  "static",
  "icons",
  "data",
  "shared",
  "api",
  "_vercel",
]);

const REQUIRED_FIELDS = [
  "slug",
  "title",
  "tagline",
  "description",
  "path",
  "thumb",
  "thumbAlt",
  "ogImage",
  "cardClass",
  "darkThemeColor",
  "updated",
  "changefreq",
];

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---------- registry shape ----------

const seen = new Set();
for (const g of games) {
  const where = `games.js[${g.slug ?? "?"}]`;

  for (const f of REQUIRED_FIELDS) {
    if (g[f] === undefined || g[f] === "") err(`${where}: missing field "${f}"`);
  }
  for (const f of ["hasRestart", "hasOverlay"]) {
    if (typeof g[f] !== "boolean") err(`${where}: "${f}" must be a boolean`);
  }

  // leaderboard is either false, or a descriptor recording how the game is
  // scored. The values the database actually enforces live in game_config; the
  // cross-check further down is what stops this copy from drifting away from
  // them.
  const lb = g.leaderboard;
  if (lb !== false) {
    if (typeof lb !== "object" || lb === null) {
      err(`${where}: "leaderboard" must be false or a descriptor object`);
    } else {
      if (typeof lb.lowerIsBetter !== "boolean")
        err(`${where}: leaderboard.lowerIsBetter must be a boolean`);
      if (typeof lb.daily !== "boolean")
        err(`${where}: leaderboard.daily must be a boolean`);
      if (!lb.unit) err(`${where}: leaderboard.unit must name what is measured`);
    }
  }

  if (!g.slug) continue;

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug))
    err(`${where}: slug must be lowercase kebab-case`);
  if (RESERVED.has(g.slug)) err(`${where}: "${g.slug}" is a reserved slug`);
  if (seen.has(g.slug)) err(`${where}: duplicate slug`);
  seen.add(g.slug);

  if (g.path !== `/${g.slug}/`)
    err(`${where}: path "${g.path}" must be "/${g.slug}/"`);

  if (g.updated && !/^\d{4}-\d{2}-\d{2}$/.test(g.updated))
    err(`${where}: updated "${g.updated}" must be YYYY-MM-DD`);

  if (g.darkThemeColor && !/^#[0-9a-f]{6}$/.test(g.darkThemeColor))
    err(`${where}: darkThemeColor "${g.darkThemeColor}" must be #rrggbb`);

  // og:image must be a raster format — social crawlers render SVG poorly or
  // not at all (ARCHITECTURE.md §25).
  if (g.ogImage && /\.svg$/i.test(g.ogImage))
    err(`${where}: ogImage "${g.ogImage}" is an SVG; use a raster format`);

  // Public assets are referenced by absolute path and copied verbatim.
  for (const field of ["thumb", "ogImage"]) {
    const ref = g[field];
    if (!ref) continue;
    if (!ref.startsWith("/"))
      err(`${where}: ${field} "${ref}" must be an absolute path`);
    else if (!existsSync(path.join(publicDir, ref.slice(1))))
      err(`${where}: ${field} "${ref}" does not exist under public/`);
  }
}

if (!home || home.path !== "/") err("games.js: home.path must be \"/\"");

// ---------- registry <-> filesystem, both directions ----------

for (const g of games) {
  if (!g.slug) continue;
  const page = path.join(srcDir, g.slug, "index.html");
  if (!existsSync(page)) {
    err(`games.js[${g.slug}]: no page at src/${g.slug}/index.html`);
    continue;
  }

  const html = readFileSync(page, "utf8");

  // A non-module script is left in the output HTML while its file is never
  // emitted, so the built page 404s its own game script — and the build still
  // exits 0. This check is the only thing that catches it.
  const classic = [...html.matchAll(/<script(?![^>]*\btype=)[^>]*\bsrc=/g)];
  if (classic.length)
    err(
      `src/${g.slug}/index.html: ${classic.length} <script src> without type="module" ` +
        `(would not be bundled or emitted)`,
    );

  // The theme bootstrap is inlined from one source at build time. Losing the
  // marker does not error — it silently drops FOUC protection, so dark-mode
  // players get a white flash and nothing else reports it. Hence this check.
  const markers = html.split("<!-- theme-bootstrap -->").length - 1;
  if (markers !== 1)
    err(
      `src/${g.slug}/index.html: expected exactly one <!-- theme-bootstrap --> ` +
        `marker, found ${markers}`,
    );

  // Every game explains itself the same way: a "How to play" opener, a sheet of
  // bullet steps, and a backdrop to dismiss it. Two games were missing this
  // entirely, which is the drift this check prevents.
  for (const id of ["howtoBtn", "howtoSheet", "howtoBackdrop"]) {
    if (!html.includes(`id="${id}"`))
      err(`src/${g.slug}/index.html: missing #${id} — every game needs "How to play"`);
  }
  if (!html.includes('class="howto-list"'))
    err(`src/${g.slug}/index.html: how-to sheet must use <ul class="howto-list">`);
  if (!html.includes("<summary>What is this?</summary>"))
    err(`src/${g.slug}/index.html: the seo-info summary should read "What is this?"`);

  // A game with a leaderboard must have a line to put it on, and a game
  // without one must not pretend to.
  const hasGlobalEl = html.includes('id="globalBest"');
  if (g.leaderboard && !hasGlobalEl)
    err(`src/${g.slug}/index.html: leaderboard is enabled but there is no #globalBest`);
  if (!g.leaderboard && hasGlobalEl)
    err(`src/${g.slug}/index.html: has #globalBest but leaderboard is false`);

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const expected = `${SITE_URL}${g.path}`;
  if (!canonical) err(`src/${g.slug}/index.html: no canonical link`);
  else if (canonical !== expected)
    err(`src/${g.slug}/index.html: canonical "${canonical}" should be "${expected}"`);

  const ogUrl = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  if (ogUrl && ogUrl !== expected)
    err(`src/${g.slug}/index.html: og:url "${ogUrl}" should be "${expected}"`);

  for (const tag of ["<title>", 'name="description"']) {
    if (!html.includes(tag)) err(`src/${g.slug}/index.html: missing ${tag}`);
  }

  // Every /assets/... reference must resolve, whether written absolute or as a
  // full production URL.
  const refs = new Set(
    [...html.matchAll(/\/assets\/[A-Za-z0-9._-]+/g)].map((m) => m[0]),
  );
  for (const ref of refs) {
    if (!existsSync(path.join(publicDir, ref.slice(1))))
      err(`src/${g.slug}/index.html: references missing asset ${ref}`);
  }
}

// Any src/ directory holding an index.html is a page, so it must be registered.
for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (!existsSync(path.join(srcDir, entry.name, "index.html"))) continue;
  if (!seen.has(entry.name))
    err(
      `src/${entry.name}/index.html exists but "${entry.name}" is not in games.js ` +
        `(it would build and deploy with no homepage card and no sitemap entry)`,
    );
}

// ---------- homepage ----------

const homepage = path.join(srcDir, "index.html");
if (!existsSync(homepage)) {
  err("src/index.html is missing");
} else {
  const html = readFileSync(homepage, "utf8");

  // The shelf and the WebSite/hasPart JSON-LD are filled from the registry at
  // build time, so the source holds markers rather than links. A missing marker
  // would silently ship a homepage with no games on it and no structured data,
  // which is why it is checked here rather than trusted.
  for (const [marker, what] of [
    ["<!-- games-shelf -->", "game shelf"],
    ['"hasPart": []', "WebSite hasPart JSON-LD"],
    ["<!-- theme-bootstrap -->", "theme bootstrap"],
  ]) {
    const n = html.split(marker).length - 1;
    if (n !== 1)
      err(
        `src/index.html: expected exactly one ${what} marker \`${marker}\`, found ${n}`,
      );
  }

  const relAsset = html.match(/(?:src|href)="assets\//);
  if (relAsset)
    err(
      'src/index.html: relative "assets/..." reference — public/ files must be ' +
        'absolute ("/assets/...") or the build fails',
    );

  // The same URL and asset checks the games get. Their absence is how the
  // homepage came to advertise bubble-tap's artwork as the whole site's social
  // image: every check above this point walked `games` only.
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const expected = `${SITE_URL}${home.path}`;
  if (!canonical) err("src/index.html: no canonical link");
  else if (canonical !== expected)
    err(`src/index.html: canonical "${canonical}" should be "${expected}"`);

  const ogUrl = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  if (ogUrl && ogUrl !== expected)
    err(`src/index.html: og:url "${ogUrl}" should be "${expected}"`);

  for (const tag of ["<title>", 'name="description"']) {
    if (!html.includes(tag)) err(`src/index.html: missing ${tag}`);
  }

  for (const ref of new Set(
    [...html.matchAll(/\/assets\/[A-Za-z0-9._-]+/g)].map((m) => m[0]),
  )) {
    if (!existsSync(path.join(publicDir, ref.slice(1))))
      err(`src/index.html: references missing asset ${ref}`);
  }

  // The homepage's social image is the site's, not a game's. Sharing the root
  // URL previewing as one game is the bug this pins down.
  if (!home.ogImage || !home.ogImage.startsWith("/assets/"))
    err('games.js: home.ogImage must be an absolute "/assets/..." path');
  else if (home.ogImage.endsWith(".svg"))
    err("games.js: home.ogImage must be a raster format — social networks render SVG poorly");
  else if (!existsSync(path.join(publicDir, home.ogImage.slice(1))))
    err(`games.js: home.ogImage ${home.ogImage} does not exist under public/`);
  else {
    for (const tag of ["og:image", "twitter:image"]) {
      const got = html.match(
        new RegExp(`<meta (?:property|name)="${tag}" content="([^"]+)"`),
      )?.[1];
      const want = `${SITE_URL}${home.ogImage}`;
      if (got !== want)
        err(`src/index.html: ${tag} is "${got}" but home.ogImage says "${want}"`);
    }
    const gameOg = new Set(games.map((g) => `${SITE_URL}${g.ogImage}`));
    if (gameOg.has(`${SITE_URL}${home.ogImage}`))
      err("games.js: home.ogImage borrows a game's artwork — the site needs its own");
  }
}

// ---------- the manifest's colours vs. the page they frame ----------
//
// Android paints an installed PWA's launch screen in the manifest's
// background_color, holds it until the page's first paint, then cross-fades to
// the page. So background_color is not decoration: it is the colour of the
// screen the homepage fades in from, and if it disagrees with the homepage the
// launch reads as a coloured flash rather than as the app opening.
//
// That is exactly what shipped once — background_color was changed to a purple
// while the page stayed near-white — and nothing could catch it, because all
// three values are just string literals in three different files. Pin them
// together.
{
  const manifestPath = path.join(publicDir, "manifest.webmanifest");
  if (!existsSync(manifestPath)) {
    err("public/manifest.webmanifest is missing");
  } else {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (e) {
      err(`public/manifest.webmanifest: not valid JSON — ${e.message}`);
    }

    if (manifest) {
      const { background_color: bg, theme_color: theme } = manifest;

      if (!bg) err("public/manifest.webmanifest: no background_color");
      if (!theme) err("public/manifest.webmanifest: no theme_color");

      if (bg && theme && bg !== theme)
        err(
          `public/manifest.webmanifest: background_color "${bg}" and theme_color ` +
            `"${theme}" disagree — the launch screen would not match the page ` +
            "it fades into",
        );

      // The homepage's light theme-color. The bootstrap swaps it for the dark
      // one at runtime, but the manifest has no dark variant to match, so the
      // light value is the one that has to agree.
      const pageColor = existsSync(homepage)
        ? readFileSync(homepage, "utf8").match(
            /<meta name="theme-color" content="([^"]+)"/,
          )?.[1]
        : null;

      if (pageColor && bg && pageColor !== bg)
        err(
          `public/manifest.webmanifest: background_color "${bg}" but ` +
            `src/index.html's theme-color is "${pageColor}" — the launch screen ` +
            "and the page it opens must be the same colour",
        );
    }
  }
}

// ---------- registry vs. the database's game_config ----------
//
// Direction and daily-ness are enforced by submit_game_score() from
// game_config, not by the client (ARCHITECTURE.md §27). The registry keeps its
// own copy so a reader can see how a game is scored without opening the SQL —
// which is only worth having if the two cannot disagree. So parse the seed
// INSERT and compare.
//
// This reads the checked-in SQL, not the live database. It catches the mistake
// that is actually likely — editing one file and forgetting the other — and
// cannot tell you whether the migration has been applied.
{
  const sqlPath = path.join(rootDir, "README-supabase.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const block = sql.match(
    /insert into game_config[^;]*?values([\s\S]*?)on conflict/i,
  );

  if (!block) {
    err(
      "README-supabase.sql: no `insert into game_config ... values ... on " +
        "conflict` block, so the registry cannot be checked against it",
    );
  } else {
    const config = new Map();
    const row =
      /\(\s*'([^']+)'\s*,\s*(true|false)\s*,\s*(true|false)\s*,\s*'([^']*)'\s*\)/gi;
    let m;
    while ((m = row.exec(block[1])) !== null) {
      config.set(m[1], {
        lowerIsBetter: m[2].toLowerCase() === "true",
        daily: m[3].toLowerCase() === "true",
        label: m[4],
      });
    }

    if (!config.size)
      err("README-supabase.sql: the game_config INSERT has no readable rows");

    for (const g of games) {
      const where = `src/data/games.js (${g.slug})`;
      const cfg = config.get(g.slug);

      if (g.leaderboard && !cfg) {
        err(
          `${where}: leaderboard is enabled but ${g.slug} has no game_config ` +
            "row in README-supabase.sql, so submit_game_score() would raise",
        );
        continue;
      }
      if (!g.leaderboard && cfg) {
        err(
          `${where}: leaderboard is false but README-supabase.sql seeds a ` +
            `game_config row for ${g.slug}`,
        );
        continue;
      }
      if (!g.leaderboard || typeof g.leaderboard !== "object") continue;

      if (g.leaderboard.lowerIsBetter !== cfg.lowerIsBetter)
        err(
          `${where}: leaderboard.lowerIsBetter is ${g.leaderboard.lowerIsBetter} ` +
            `but game_config.lower_is_better is ${cfg.lowerIsBetter}`,
        );
      if (g.leaderboard.daily !== cfg.daily)
        err(
          `${where}: leaderboard.daily is ${g.leaderboard.daily} but ` +
            `game_config.is_daily is ${cfg.daily}`,
        );
    }

    // A row for a game that is not in the registry at all.
    const slugs = new Set(games.map((g) => g.slug));
    for (const slug of config.keys()) {
      if (!slugs.has(slug))
        err(
          `README-supabase.sql: game_config seeds "${slug}", which is not a ` +
            "game in src/data/games.js",
        );
    }
  }
}

// ---------- report ----------

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);

if (errors.length) {
  console.error(`\nvalidate: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(
  `validate: ${games.length} games ok` +
    (warnings.length ? `, ${warnings.length} warning(s)` : ""),
);
