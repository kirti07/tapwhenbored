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
  "category",
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
  for (const f of ["hasRestart", "hasOverlay", "leaderboard"]) {
    if (typeof g[f] !== "boolean") err(`${where}: "${f}" must be a boolean`);
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
