// Reports per-page production weight against the budgets in ARCHITECTURE.md §23.
//
// Measures the built output rather than source size, and gzip rather than raw,
// because that is what a player actually downloads.
//
// Warns rather than fails. §23 calls these "guidelines rather than absolute
// limits", and a game exceeding one should "trigger investigation" — so this
// makes the number visible in CI without blocking a justified increase. Pass
// --strict to turn breaches into a non-zero exit.

import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { games, home } from "../src/data/games.js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(rootDir, "dist");
const strict = process.argv.includes("--strict");

// §23, in gzipped bytes.
const BUDGET = { js: 50 * 1024, css: 30 * 1024 };

if (!existsSync(distDir)) {
  console.error("check-bundles: dist/ is missing — run npm run build first");
  process.exit(1);
}

const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1).padStart(6) + " kB";

/** Every /static/* file a page references, followed one level into imports. */
function pageAssets(htmlPath) {
  const html = readFileSync(htmlPath, "utf8");
  const refs = new Set(
    [...html.matchAll(/(?:href|src)="(\/static\/[^"]+)"/g)].map((m) => m[1]),
  );
  return [...refs]
    .map((r) => path.join(distDir, r.replace(/^\//, "")))
    .filter((f) => existsSync(f));
}

const pages = [
  { label: "/", html: path.join(distDir, "index.html") },
  ...games.map((g) => ({
    label: g.path,
    html: path.join(distDir, g.slug, "index.html"),
  })),
];

let breaches = 0;
console.log("Per-page production weight (gzipped)\n");
console.log("page".padEnd(20) + "JS".padStart(10) + "CSS".padStart(11) + "  status");
console.log("-".repeat(52));

for (const { label, html } of pages) {
  if (!existsSync(html)) {
    console.log(`${label.padEnd(20)}${"missing".padStart(21)}`);
    breaches++;
    continue;
  }
  let js = 0;
  let css = 0;
  for (const f of pageAssets(html)) {
    const size = gz(f);
    if (f.endsWith(".css")) css += size;
    else js += size;
  }
  // The page document itself is delivered gzipped too.
  js += 0;

  const over = [];
  if (js > BUDGET.js) over.push("JS");
  if (css > BUDGET.css) over.push("CSS");
  if (over.length) breaches++;

  console.log(
    label.padEnd(20) +
      kb(js).padStart(10) +
      kb(css).padStart(11) +
      (over.length ? `  OVER ${over.join(" + ")}` : "  ok"),
  );
}

console.log(
  `\nBudgets: JS ${BUDGET.js / 1024} kB, CSS ${BUDGET.css / 1024} kB gzipped per page (§23).`,
);

// The shell is what the PWA precaches on install, so it is worth its own line.
const swPath = path.join(distDir, "sw.js");
if (existsSync(swPath)) {
  const precache = readFileSync(swPath, "utf8").match(
    /const PRECACHE = (\[[^\]]*\])/,
  )?.[1];
  if (precache) {
    const urls = JSON.parse(precache);
    const gamePaths = new Set(games.map((g) => g.path));
    const leaked = urls.filter((u) => gamePaths.has(u));
    console.log(`Service worker precaches ${urls.length} shell entries.`);
    if (leaked.length) {
      console.error(
        `check-bundles: precache contains games (${leaked.join(", ")}). ` +
          `Installing must not download the catalogue (§19).`,
      );
      breaches++;
    }
  }
}

if (breaches && strict) {
  console.error(`\ncheck-bundles: ${breaches} budget breach(es)`);
  process.exit(1);
}
if (breaches) {
  console.warn(
    `\ncheck-bundles: ${breaches} budget breach(es) — investigate before shipping (§23).`,
  );
}
