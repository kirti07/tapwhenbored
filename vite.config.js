import { defineConfig } from "vite";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { games, home, SITE_URL } from "./src/data/games.js";

// Absolute, derived from this file's own location. A relative `root: "src"`
// would be resolved against process.cwd(), which is not necessarily the repo.
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");
const publicDir = path.join(rootDir, "public");

/**
 * Every page in src/, found on disk rather than listed here.
 *
 * A top-level *.html file is a page, and so is a top-level directory
 * containing index.html. That second rule is why src/shared/ and src/data/
 * are skipped automatically — they have no index.html — and why adding
 * game #50 needs no edit to this file.
 *
 * Vite emits each page at its path relative to `root`, so src/honeycomb/
 * becomes dist/honeycomb/ and serves at /honeycomb/. The object key only
 * names the page's JS chunk; it does not affect the HTML's location. Paths
 * must be absolute — Rollup resolves relative input against cwd.
 */
function discoverPages() {
  const input = {};
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) {
      input[path.basename(entry.name, ".html")] = path.join(srcDir, entry.name);
    } else if (entry.isDirectory()) {
      const html = path.join(srcDir, entry.name, "index.html");
      if (existsSync(html)) input[entry.name] = html;
    }
  }
  return input;
}

/**
 * Mirrors Vercel's `trailingSlash: true` in dev and preview: /honeycomb
 * 308-redirects to /honeycomb/.
 *
 * Without this, dev 404s a path production redirects, so the same Playwright
 * spec could not run against both. Registered directly in configureServer so
 * it lands ahead of Vite's own middlewares, which would 404 the slashless path
 * before we saw it.
 */
function trailingSlashParity() {
  const middleware = (dir) => (req, res, next) => {
    const q = req.url.indexOf("?");
    const pathname = q === -1 ? req.url : req.url.slice(0, q);
    const search = q === -1 ? "" : req.url.slice(q);
    if (
      pathname !== "/" &&
      !pathname.endsWith("/") &&
      !pathname.startsWith("/@") &&
      !path.posix.extname(pathname) &&
      existsSync(path.join(dir, decodeURIComponent(pathname), "index.html"))
    ) {
      res.statusCode = 308;
      res.setHeader("Location", `${pathname}/${search}`);
      return res.end();
    }
    next();
  };
  return {
    name: "twb:trailing-slash-parity",
    configureServer(server) {
      server.middlewares.use(middleware(srcDir));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(distDir));
    },
  };
}

/**
 * Injects the Vercel Analytics tag into every page.
 *
 * It has to be a plain (non-module) script pointing at a path that only exists
 * on Vercel's edge, so Vite would warn about it once per page and leave it
 * alone. Injecting post-order means vite:build-html has already scanned the
 * document, so the tag is never parsed for asset resolution at all — and it
 * lives in one place instead of being duplicated across eight files.
 */
function vercelInsights() {
  return {
    name: "twb:vercel-insights",
    transformIndexHtml: {
      order: "post",
      handler: () => [
        {
          tag: "script",
          attrs: { defer: true, src: "/_vercel/insights/script.js" },
          injectTo: "head",
        },
      ],
    },
  };
}

/**
 * Emits sitemap.xml from the registry.
 *
 * A plugin rather than a script, because a script would have to write either
 * into public/ (turning a source directory into a build-artifact directory) or
 * into dist/ after the build (racing emptyOutDir, and never running at all
 * under Vercel's buildCommand). This way dev and build share one
 * implementation and nothing is written to disk.
 *
 * lastmod comes from each entry's `updated` field, not the build date:
 * republishing a fresh lastmod on every deploy teaches crawlers to ignore it.
 */
function sitemap() {
  const render = () => {
    const entries = [home, ...games];
    const urls = entries
      .map(
        (e) =>
          `  <url>\n` +
          `    <loc>${SITE_URL}${e.path}</loc>\n` +
          `    <lastmod>${e.updated}</lastmod>\n` +
          `    <changefreq>${e.changefreq}</changefreq>\n` +
          `    <priority>${e.priority ?? "0.9"}</priority>\n` +
          `  </url>`,
      )
      .join("\n");
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${urls}\n</urlset>\n`
    );
  };
  return {
    name: "twb:sitemap",
    configureServer(server) {
      server.middlewares.use("/sitemap.xml", (_req, res) => {
        res.setHeader("Content-Type", "application/xml");
        res.end(render());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: render() });
    },
  };
}

/**
 * Warns — never fails — when a production build has no Supabase credentials.
 *
 * Vite only exposes VITE_-prefixed vars to client code, so a build that still
 * uses the old unprefixed names succeeds, every game works, and both
 * leaderboards silently read "unavailable" forever. This makes that loud.
 * It warns rather than fails because gameplay must not depend on the
 * leaderboard (ARCHITECTURE.md §26).
 */
function warnMissingLeaderboardEnv() {
  return {
    name: "twb:warn-missing-leaderboard-env",
    apply: "build",
    configResolved(config) {
      if (!config.env.VITE_SUPABASE_URL || !config.env.VITE_SUPABASE_ANON_KEY) {
        config.logger.warn(
          "\n[twb] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.\n" +
            "      Games will build and play, but every leaderboard will read\n" +
            "      as unavailable. Vite only exposes VITE_-prefixed variables.\n",
        );
      }
    },
  };
}

export default defineConfig({
  root: srcDir,
  base: "/",
  publicDir,
  // envDir defaults to `root`, which would look for src/.env.local. The env
  // files belong beside package.json, not inside the source tree.
  envDir: rootDir,
  // Default "spa" would serve the homepage for any unknown deep path, hiding
  // 404s in dev and diverging from Vercel.
  appType: "mpa",
  plugins: [
    trailingSlashParity(),
    vercelInsights(),
    sitemap(),
    warnMissingLeaderboardEnv(),
  ],
  build: {
    outDir: distDir,
    // Required: outDir is outside root, so Vite otherwise refuses to clean it
    // and stale pages for deleted games would pile up.
    emptyOutDir: true,
    // Hashed output goes to /static/*, leaving /assets/* for the stable,
    // already-indexed public images (ARCHITECTURE.md §25).
    assetsDir: "static",
    modulePreload: { polyfill: false },
    rollupOptions: { input: discoverPages() },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
