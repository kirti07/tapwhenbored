// Reports gzipped per-page production weight against ARCHITECTURE.md §23.
// Warns rather than fails, since §23 budgets are guidelines; --strict exits
// non-zero on a breach.

import { gzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { games, pages } from "../src/data/games.js";

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

/** Every /static/* file a page's HTML references: its entry script, the
 *  chunks it modulepreloads and its stylesheets. A chunk fetched later by
 *  import() (word-steps' dictionary, party's game modules) is not counted. */
function pageAssets(htmlPath) {
  const html = readFileSync(htmlPath, "utf8");
  const refs = new Set(
    [...html.matchAll(/(?:href|src)="(\/static\/[^"]+)"/g)].map((m) => m[1]),
  );
  return [...refs]
    .map((r) => path.join(distDir, r.replace(/^\//, "")))
    .filter((f) => existsSync(f));
}

const measured = [
  { label: "/", html: path.join(distDir, "index.html") },
  ...[...pages, ...games].map((e) => ({
    label: e.path,
    html: path.join(distDir, e.slug, "index.html"),
  })),
];

let breaches = 0;
console.log("Per-page production weight (gzipped)\n");
console.log("page".padEnd(20) + "JS".padStart(10) + "CSS".padStart(11) + "  status");
console.log("-".repeat(52));

for (const { label, html } of measured) {
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

if (breaches && strict) {
  console.error(`\ncheck-bundles: ${breaches} budget breach(es)`);
  process.exit(1);
}
if (breaches) {
  console.warn(
    `\ncheck-bundles: ${breaches} budget breach(es) — investigate before shipping (§23).`,
  );
}
