import { defineConfig, loadEnv } from "vite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
 * True only for the site homepage.
 *
 * ctx.path is "/index.html" for the homepage and "/<slug>/index.html" for a
 * game, so anything matching the tail of the path matches every page. This has
 * to be an exact comparison.
 */
const isHomepage = (ctx) => ctx.path === "/index.html" || ctx.path === "/";

const escapeHtml = (v) =>
  String(v).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

// The homepage's dark theme-color. Games carry their own in the registry.
const HOME_DARK_THEME_COLOR = "#0d0e1a";

/**
 * How many shelf cards are at or near the fold. The shelf is two columns on a
 * phone, so roughly the first four: those are fetched eagerly (the first as the
 * LCP candidate) and everything below waits until it is scrolled towards.
 *
 * Two places need this and must not disagree — the card markup below, and the
 * service worker's precache list, which carries exactly these thumbnails so an
 * installed launch paints its first screen without the network. It is a fixed
 * four whether the catalogue holds seven games or fifty, which is what keeps
 * the install proportional (ARCHITECTURE.md §19).
 */
const EAGER_CARDS = 4;

/**
 * Inlines the theme bootstrap into every page in place of its
 * `<!-- theme-bootstrap -->` marker.
 *
 * The snippet stays inline and parser-blocking in the built output — that is
 * the only way it can set data-theme before the first stylesheet applies, which
 * is what stops dark-mode players seeing a white flash. So this does not remove
 * the duplication from the *output*; it removes it from the *source*, where it
 * was eight near-copies drifting apart.
 *
 * The dark theme-color is per page and comes from the registry, because it has
 * to match that game's dark --bg or the mobile status bar clashes with the page.
 */
function themeBootstrap() {
  const snippet = readFileSync(path.join(rootDir, "scripts/theme-bootstrap.js"), "utf8")
    // Strip the file's own explanatory header; it documents the build contract,
    // not the runtime behaviour, so it does not belong in every page.
    .replace(/^(?:\/\/.*\n)+/, "")
    // Collapse to one line. This is parser-blocking in the <head> of every
    // page, so it should not carry source indentation. Safe for this snippet:
    // it contains no template literals and no string with a significant run of
    // whitespace.
    .replace(/\s+/g, " ")
    .trim();

  const darkFor = new Map(games.map((g) => [g.slug, g.darkThemeColor]));

  return {
    name: "twb:theme-bootstrap",
    transformIndexHtml: {
      // "pre" so Vite still sees a plain <head> when it injects preloads.
      order: "pre",
      handler(html, ctx) {
        const slug = ctx.path.replace(/^\//, "").split("/")[0];
        const color = darkFor.get(slug) ?? HOME_DARK_THEME_COLOR;
        return html.replace(
          "<!-- theme-bootstrap -->",
          `<script>${snippet.replace("__DARK_THEME_COLOR__", color)}</script>`,
        );
      },
    },
  };
}

/**
 * Fills the homepage's game shelf and its WebSite/hasPart JSON-LD from the
 * registry, replacing what used to be seven hand-maintained card blocks and a
 * parallel hand-maintained list of the same seven games.
 *
 * Build-time rather than a runtime render, because this is indexable content
 * and essential structured data: ARCHITECTURE.md §28 requires it be static in
 * the output HTML. transformIndexHtml runs in dev too, so what you see locally
 * is what ships.
 */
function homepageFromRegistry() {
  const card = (g, i) => `    <a class="card ${g.cardClass}" href="${g.path}">
      <img class="thumb" src="${g.thumb}" width="640" height="640" decoding="async"${
        i === 0 ? ' fetchpriority="high"' : ""
      }${i < EAGER_CARDS ? "" : ' loading="lazy"'} alt="${escapeHtml(g.thumbAlt)}">
      <div class="card-body">
        <div class="card-text">
          <h2 class="card-name">${escapeHtml(g.title)}</h2>
          <p class="card-desc">${escapeHtml(g.tagline)}</p>
        </div>
        <span class="play-btn" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
      </div>
    </a>`;

  return {
    name: "twb:homepage-from-registry",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // Homepage only; every other page is served untouched.
        if (!isHomepage(ctx)) return html;

        const shelf = games.map(card).join("\n\n");
        const hasPart = games
          .map(
            (g) =>
              `    { "@type": "Game", "name": ${JSON.stringify(g.title)}, ` +
              `"url": ${JSON.stringify(SITE_URL + g.path)} }`,
          )
          .join(",\n");

        return html
          .replace("    <!-- games-shelf -->", shelf)
          .replace('  "hasPart": []', `  "hasPart": [\n${hasPart}\n  ]`);
      },
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
 * The PWA layer: manifest link, service-worker registration, and the worker
 * itself.
 *
 * The worker is emitted rather than copied from public/ because its precache
 * list needs the homepage's content-hashed filenames, which only exist after
 * the bundle is generated. It still lands at /sw.js, which is what gives it
 * root scope.
 *
 * Only the app shell is precached. Games are cached when opened, so installing
 * does not pull down every game (ARCHITECTURE.md §19).
 */
function pwa() {
  let swSource = "";
  // Collected from the homepage's final HTML, which is the only place the
  // content-hashed shell filenames appear.
  let shellAssets = [];
  return {
    name: "twb:pwa",
    // The precache list needs the emitted homepage, so this plugin's
    // generateBundle must run after vite:build-html's.
    enforce: "post",

    buildStart() {
      swSource = readFileSync(path.join(rootDir, "scripts/sw-template.js"), "utf8");
      // Rebuild when the template changes during dev.
      this.addWatchFile?.(path.join(rootDir, "scripts/sw-template.js"));
    },

    transformIndexHtml: {
      order: "post",
      handler: (html, ctx) => {
        if (isHomepage(ctx)) {
          shellAssets = [
            ...String(html).matchAll(/(?:href|src)="(\/static\/[^"]+)"/g),
          ].map((m) => m[1]);
        }
        return [
        { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" }, injectTo: "head" },
        {
          tag: "link",
          attrs: { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
          injectTo: "head",
        },
        {
          // Registered when the browser is idle, so it never competes with the
          // page's own startup. Not on "load": that waits for every image and
          // for the analytics tag, which is the slowest thing on the page and
          // is deliberately outside the worker's scope — so a slow first visit
          // installed the worker late, and the *next* launch still had no shell
          // cached. Idle gets the same non-competition without chaining to it.
          //
          // Failure is swallowed: the PWA is an enhancement and must never
          // affect whether a game runs.
          tag: "script",
          children:
            'if("serviceWorker"in navigator){' +
            'var r=function(){navigator.serviceWorker.register("/sw.js").catch(function(){})};' +
            '"requestIdleCallback"in window?requestIdleCallback(r,{timeout:3000})' +
            ':addEventListener("load",r)}',
          injectTo: "body",
        },
      ];
      },
    },

    generateBundle(_options, bundle) {
      // The shell is the homepage document plus the files it needs to paint its
      // first screen. Game chunks are deliberately excluded.
      const shell = new Set([
        "/",
        "/manifest.webmanifest",
        "/favicon.svg",
        "/icons/icon-192.png",
        // The display webfont, weight 700. Precached rather than left to the
        // runtime cache because it is render-blocking-adjacent: every page but
        // bubble-tap paints its title in it, and the whole point of self-hosting
        // it was that a cold start should never wait on a network round trip.
        //
        // Weight 800 is deliberately absent. Exactly one rule in the whole site
        // renders it — honeycomb's .tile-label — so by this section's own rule
        // it is that game's asset, and it enters the runtime cache the first
        // time honeycomb is opened, like the rest of honeycomb.
        "/fonts/nunito-latin-700.woff2",
        // The thumbnails of the cards at the fold. Without these the shelf
        // paints as empty placeholder boxes on a cold launch and fills in from
        // the network afterwards, which is most of what "the app takes a moment
        // to settle" looked like. Bounded at EAGER_CARDS, not the catalogue.
        ...games.slice(0, EAGER_CARDS).map((g) => g.thumb),
        ...shellAssets,
      ]);

      // A version that changes whenever any emitted file changes, so activate
      // can drop every older cache without guessing.
      const version = createHash("sha256")
        .update(Object.keys(bundle).sort().join("|"))
        .update(
          Object.values(bundle)
            .map((c) => c.fileName)
            .sort()
            .join("|"),
        )
        .digest("hex")
        .slice(0, 12);

      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: swSource
          .replace("__VERSION__", version)
          .replace("__PRECACHE__", JSON.stringify([...shell], null, 2)),
      });
    },

    configureServer(server) {
      // In dev there are no hashed assets and no bundle, so serve a worker
      // that only unregisters itself. A caching worker in dev would serve
      // stale modules and fight HMR — the confusing failure this avoids.
      server.middlewares.use("/sw.js", (_req, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.end(
          "// Dev build: caching is disabled so it cannot fight HMR.\n" +
            "self.addEventListener('install', () => self.skipWaiting());\n" +
            "self.addEventListener('activate', (e) => e.waitUntil(\n" +
            "  (async () => {\n" +
            "    for (const k of await caches.keys()) if (k.startsWith('twb-')) await caches.delete(k);\n" +
            "    await self.registration.unregister();\n" +
            "    await self.clients.claim();\n" +
            "  })()\n" +
            "));\n",
        );
      });
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
function warnMissingLeaderboardEnv(env) {
  return {
    name: "twb:warn-missing-leaderboard-env",
    apply: "build",
    configResolved(config) {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        config.logger.warn(
          "\n[twb] SUPABASE_URL / SUPABASE_ANON_KEY are not set.\n" +
            "      Games will build and play, but every leaderboard will read\n" +
            "      as unavailable.\n",
        );
      }

      // These are neighbours of SUPABASE_ANON_KEY in the same Supabase project
      // and in the env list the Supabase/Vercel integration writes. None of
      // them may ever reach a browser bundle, so fail the build rather than
      // ship one. This is why the two public values are injected by name in
      // `define` instead of widening envPrefix to "SUPABASE_", which would
      // have exposed every one of these automatically.
      const secrets = Object.keys(env).filter((k) =>
        /^(SUPABASE_.*(SERVICE|SECRET|PASSWORD|JWT)|POSTGRES_)/.test(k),
      );
      if (secrets.length) {
        throw new Error(
          `[twb] refusing to build: ${secrets.join(", ")} is present in the ` +
            "build environment. Nothing here reads it, but its name says it is " +
            "a server-side secret and it must not sit next to values that get " +
            "inlined into public JavaScript. Remove it from this project's " +
            "build environment (Vercel > Settings > Environment Variables).",
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // The leaderboard credentials are named without a VITE_ prefix, so Vite will
  // not expose them by itself. The "" prefix here loads every variable — from
  // .env files and from the real process env — so `.env.local` keeps working
  // locally and Vercel's variables work in CI (ARCHITECTURE.md §35). Nothing
  // from this object reaches the browser except the two names listed in
  // `define` below.
  const env = loadEnv(mode, rootDir, "");

  return {
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
    themeBootstrap(),
    homepageFromRegistry(),
    vercelInsights(),
    sitemap(),
    pwa(),
    warnMissingLeaderboardEnv(env),
  ],
  // An allowlist of exactly two names, statically replaced at build time just
  // as import.meta.env.VITE_* would be. Written out in full so the strings the
  // client reads are greppable from here (ARCHITECTURE.md §35).
  define: {
    "import.meta.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL || ""),
    "import.meta.env.SUPABASE_ANON_KEY": JSON.stringify(
      env.SUPABASE_ANON_KEY || "",
    ),
  },
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
  };
});
