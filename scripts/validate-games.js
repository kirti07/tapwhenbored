// Structural checks that run before every build, so a broken repository cannot
// reach production. The key check is bidirectional: every registry entry has a
// page on disk and every page on disk has a registry entry. ARCHITECTURE.md §29.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { games, home, pages, SITE_URL } from "../src/data/games.js";

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
  // public/fonts/ is served at /fonts/.
  "fonts",
  // Non-game pages. "book" stays reserved: its retired URL was indexed.
  "account",
  "book",
  "wall",
]);

const REQUIRED_FIELDS = [
  "slug",
  "title",
  "tagline",
  "description",
  "path",
  "ogImage",
  "accent",
  "accentDark",
  "sticker",
  "darkThemeColor",
  "updated",
  "changefreq",
];

const errors = [];
const err = (m) => errors.push(m);

const pageSlugs = new Set(pages.map((p) => p.slug));

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

  // leaderboard is false or a scoring descriptor; it is cross-checked against
  // game_config further down.
  const lb = g.leaderboard;
  if (lb !== false) {
    if (typeof lb !== "object" || lb === null) {
      err(`${where}: "leaderboard" must be false or a descriptor object`);
    } else {
      if (typeof lb.lowerIsBetter !== "boolean")
        err(`${where}: leaderboard.lowerIsBetter must be a boolean`);
      if (typeof lb.daily !== "boolean")
        err(`${where}: leaderboard.daily must be a boolean`);
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

  // How this game's score reads. A property of the game, not its leaderboard;
  // required wherever a score exists (doodle-on has none).
  if (g.scoreFormat !== undefined && !["int", "time"].includes(g.scoreFormat))
    err(`${where}: scoreFormat must be "int" or "time"`);
  if (g.scoreFormat !== undefined && !g.scoreUnit)
    err(`${where}: scoreFormat is set, so scoreUnit must name what is measured`);
  if (g.leaderboard !== false && !g.scoreFormat)
    err(`${where}: a game with a leaderboard must declare scoreFormat/scoreUnit`);

  // The card accents; a missing one would silently ship the fallback colour.
  for (const field of ["accent", "accentDark"]) {
    const v = g[field];
    if (v && !/^#[0-9a-f]{6}$/i.test(v))
      err(`${where}: ${field} "${v}" must be a 6-digit hex colour`);
  }

  // The sticker is drawn from the sprite inlined in src/index.html, so a typo
  // here renders an empty box rather than an error.
  if (g.sticker && !/^st-[a-z-]+$/.test(g.sticker))
    err(`${where}: sticker "${g.sticker}" must look like "st-<name>"`);

  // Public assets are referenced by absolute path and copied verbatim.
  for (const field of ["ogImage"]) {
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

  // A non-module script is never emitted, so the page 404s its own script and
  // the build still exits 0. Only this check catches it.
  const classic = [...html.matchAll(/<script(?![^>]*\btype=)[^>]*\bsrc=/g)];
  if (classic.length)
    err(
      `src/${g.slug}/index.html: ${classic.length} <script src> without type="module" ` +
        `(would not be bundled or emitted)`,
    );

  // A missing theme bootstrap marker silently drops FOUC protection.
  const markers = html.split("<!-- theme-bootstrap -->").length - 1;
  if (markers !== 1)
    err(
      `src/${g.slug}/index.html: expected exactly one <!-- theme-bootstrap --> ` +
        `marker, found ${markers}`,
    );

  // Every game has a "How to play" opener, a sheet of steps and a backdrop.
  for (const id of ["howtoBtn", "howtoSheet", "howtoBackdrop"]) {
    if (!html.includes(`id="${id}"`))
      err(`src/${g.slug}/index.html: missing #${id} — every game needs "How to play"`);
  }
  if (!html.includes('class="howto-list"'))
    err(`src/${g.slug}/index.html: how-to sheet must use <ul class="howto-list">`);
  if (!html.includes("<summary>What is this?</summary>"))
    err(`src/${g.slug}/index.html: the seo-info summary should read "What is this?"`);

  // Every end card needs its exit X and wall link markers, substituted at build
  // time by sharedMarkup() in vite.config.js; a missing one fails silently.
  for (const marker of ["endcard-exit", "endcard-wall"]) {
    const found = html.split(`<!-- ${marker} -->`).length - 1;
    if (found !== 1)
      err(
        `src/${g.slug}/index.html: expected exactly one <!-- ${marker} --> ` +
          `marker on the end card, found ${found}`,
      );
  }
  if (!html.includes('class="overlay-actions"'))
    err(`src/${g.slug}/index.html: the end card's buttons must sit in .overlay-actions`);

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

  if (!html.includes("<title>")) err(`src/${g.slug}/index.html: missing <title>`);

  /* Pages hand-write their meta description, so it must match the registry's
     `description` exactly (ARCHITECTURE.md §10). */
  const meta = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!meta) {
    err(`src/${g.slug}/index.html: missing name="description"`);
  } else if (decodeEntities(meta) !== decodeEntities(g.description)) {
    err(
      `src/${g.slug}/index.html: the meta description does not match ` +
        `src/data/games.js (${g.slug}).description — they are the same text ` +
        "in two places and must not drift",
    );
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
  if (!seen.has(entry.name) && !pageSlugs.has(entry.name))
    err(
      `src/${entry.name}/index.html exists but "${entry.name}" is in neither ` +
        `games nor pages in games.js (it would build and deploy with no ` +
        `sitemap entry and nothing checking it)`,
    );
}

// ---------- homepage ----------

const homepage = path.join(srcDir, "index.html");
if (!existsSync(homepage)) {
  err("src/index.html is missing");
} else {
  const html = readFileSync(homepage, "utf8");

  // A missing marker would silently ship a homepage with no games and no
  // structured data.
  for (const [marker, what] of [
    ["<!-- games-shelf -->", "game shelf"],
      ["<!-- wall-tiles -->", "wall tiles"],
    ['"hasPart": []', "WebSite hasPart JSON-LD"],
    ["<!-- theme-bootstrap -->", "theme bootstrap"],
  ]) {
    const n = html.split(marker).length - 1;
    if (n !== 1)
      err(
        `src/index.html: expected exactly one ${what} marker \`${marker}\`, found ${n}`,
      );
  }

  // The sprite itself lives in scripts/sprite.svg and is substituted into every
  // page that asks for it, so this only has to check the page asked.
  if (!html.includes("<!-- sprite -->"))
    err("src/index.html: missing the <!-- sprite --> marker, so its stickers would not render");

  const relAsset = html.match(/(?:src|href)="assets\//);
  if (relAsset)
    err(
      'src/index.html: relative "assets/..." reference — public/ files must be ' +
        'absolute ("/assets/...") or the build fails',
    );

  // The same URL and asset checks the games get.
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

  // The homepage's social image is the site's, not a game's.
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

// ---------- the shared sprite ----------

/* Every registry sticker must be a symbol in scripts/sprite.svg. */
{
  const spritePath = path.join(rootDir, "scripts/sprite.svg");
  if (!existsSync(spritePath)) {
    err("scripts/sprite.svg is missing — no page could render a sticker");
  } else {
    const sprite = readFileSync(spritePath, "utf8");
    for (const g of games) {
      if (!g.sticker) continue;
      if (!sprite.includes(`id="${g.sticker}"`))
        err(
          `scripts/sprite.svg: no <symbol id="${g.sticker}">, but ` +
            `games.js[${g.slug}] asks for it`,
        );
    }
  }
}

// ---------- non-game pages ----------

/* Non-game pages: theme bootstrap, addressability, assets and sprite. A missing
 * sprite renders empty boxes with no error. */
for (const p of pages) {
  const file = path.join(srcDir, p.slug, "index.html");
  const where = `src/${p.slug}/index.html`;

  if (!existsSync(file)) {
    err(`games.js pages["${p.slug}"]: no page at ${where}`);
    continue;
  }

  const html = readFileSync(file, "utf8");

  const markers = html.split("<!-- theme-bootstrap -->").length - 1;
  if (markers !== 1)
    err(`${where}: expected exactly one <!-- theme-bootstrap --> marker, found ${markers}`);

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
  if (!canonical) err(`${where}: missing a canonical link`);
  else if (canonical[1] !== `${SITE_URL}${p.path}`)
    err(`${where}: canonical is "${canonical[1]}" but pages says "${SITE_URL}${p.path}"`);

  if (!/<title>[^<]+<\/title>/.test(html)) err(`${where}: missing a <title>`);
  if (!/<meta name="description" content="[^"]+"/.test(html))
    err(`${where}: missing a meta description`);

  // A relative asset path breaks the moment the page moves (§4).
  const relative = html.match(/(?:href|src)="assets\//);
  if (relative) err(`${where}: relative asset reference — use an absolute /assets/... path`);

  // A page with a social preview: the image exists, is raster, and is the one
  // the page's own og:image names — the same rules the homepage's follows.
  if (p.ogImage) {
    if (!p.ogImage.startsWith("/assets/") || /\.svg$/i.test(p.ogImage))
      err(`games.js pages["${p.slug}"]: ogImage must be a raster "/assets/..." path`);
    else if (!existsSync(path.join(publicDir, p.ogImage.slice(1))))
      err(`games.js pages["${p.slug}"]: ogImage ${p.ogImage} does not exist in public/`);
    const og = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (!og || og[1] !== `${SITE_URL}${p.ogImage}`)
      err(`${where}: og:image must be "${SITE_URL}${p.ogImage}"`);
  }

  // Any page drawing stickers has to ask for the sprite.
  if (html.includes("<use ") && !html.includes("<!-- sprite -->"))
    err(`${where}: draws stickers but has no <!-- sprite --> marker`);
}

// ---------- the manifest's colours vs. the page they frame ----------
//
// Android shows the manifest's background_color until first paint, so it must
// match the homepage or the launch flashes a different colour.
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

      // The light theme-color: the manifest has no dark variant.
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

/* Enough HTML entity decoding to compare a meta tag to a JS string. The pages
   write &amp; and the odd &rsquo;/&mdash;; the registry writes the characters. */
function decodeEntities(text) {
  return String(text ?? "")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- registry vs. the database's game_config ----------
//
// The database enforces direction and daily-ness (ARCHITECTURE.md §27); the
// registry's copy must match the checked-in seed INSERT. This reads the SQL
// file, not the live database.
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
      /* `label` is unused but still required by the regex, so a new column in
         the seed INSERT makes this parse fail loudly. */
      config.set(m[1], {
        lowerIsBetter: m[2].toLowerCase() === "true",
        daily: m[3].toLowerCase() === "true",
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
            "row in README-supabase.sql, so submit_game_run() would raise",
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

for (const e of errors) console.error(`error ${e}`);

if (errors.length) {
  console.error(`\nvalidate: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`validate: ${games.length} games ok`);
