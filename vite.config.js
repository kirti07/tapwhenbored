import { defineConfig, loadEnv } from "vite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { games, home, pages, SITE_URL } from "./src/data/games.js";

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
const isBook = (ctx) => ctx.path === "/book/index.html" || ctx.path === "/book/";
const isWall = (ctx) => ctx.path === "/wall/index.html" || ctx.path === "/wall/";

const escapeHtml = (v) =>
  String(v).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

// The homepage's dark theme-color. Games carry their own in the registry.
const HOME_DARK_THEME_COLOR = "#0f0e18";

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
 * Markup that every page draws the same way, kept in one file each.
 *
 * The sprite was 50 identical lines in two documents and the theme button four
 * lines in eleven, which had already drifted into three variants — the games'
 * copy was missing the `aria-hidden` the others had. Neither is a runtime
 * concern, so neither belongs in a module: they are substituted into the HTML
 * at build time, exactly like the shelf and the slots.
 *
 * The button's class differs by page family (`.iconbtn` on the homepage and the
 * book, `.icon-btn` in the game shells), so that one bit is a parameter.
 */
function sharedMarkup() {
  let sprite = "";
  let themeBtn = "";

  const read = () => {
    sprite = readFileSync(path.join(rootDir, "scripts/sprite.svg"), "utf8").trim();
    themeBtn = readFileSync(path.join(rootDir, "scripts/theme-button.html"), "utf8").trim();
  };

  return {
    name: "twb:shared-markup",
    buildStart() {
      read();
      this.addWatchFile?.(path.join(rootDir, "scripts/sprite.svg"));
      this.addWatchFile?.(path.join(rootDir, "scripts/theme-button.html"));
    },
    configureServer() {
      read();
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (html.includes("<!-- sprite -->")) {
          html = html.replace("<!-- sprite -->", sprite);
        }
        return html.replace(/([ \t]*)<!-- theme-btn(?::([\w-]+))? -->/g, (_m, indent, cls) =>
          indent +
          themeBtn
            .replace("{cls}", cls || "iconbtn")
            .split("\n")
            .join("\n" + indent),
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
  /* A small deterministic tilt per card. Decoration, so it is derived from
     position rather than stored in the registry — a field nothing but a
     rotation reads would be a field nobody maintains. */
  const TILT = [2.6, -3, 1.2, -1.8, 2.2, -2.6, 1.5, -0.9];
  const tilt = (i) => TILT[i % TILT.length];

  const vars = (g) => `--accent:${g.accent};--accent-d:${g.accentDark}`;

  const sticker = (g, size, rot) =>
    `<span class="sb" style="${vars(g)};--sz:${size};--rot:${rot}deg" aria-hidden="true">` +
    `<svg viewBox="0 0 48 48"><use href="#${g.sticker}"/></svg></span>`;

  const card = (g, i) => `        <a class="card" href="${g.path}" style="${vars(g)}">
          <span class="card-art">${sticker(g, "64px", tilt(i))}</span>
          <span class="card-b">
            <h2 class="card-n">${escapeHtml(g.title)}</h2>
            <span class="card-t">${escapeHtml(g.tagline)}</span>
            <span class="card-f">
              <span class="card-best" data-best="${g.slug}" hidden></span>
              <span class="card-new" data-new="${g.slug}">New sticker</span>
              <span class="card-go" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8.5 5.6 18 12l-9.5 6.4z"/></svg></span>
            </span>
          </span>
        </a>`;

  /* One outline per game, in shelf order. home.js swaps a slot to its filled
     sticker when that game has a local best. Rendered here rather than in JS so
     the strip has its final height on the first frame. */
  const slot = (g) => `        <span class="slot slot--e" data-slot="${g.slug}" title="${escapeHtml(g.title)}">` +
    `<svg viewBox="0 0 48 48" aria-hidden="true"><use href="#${g.sticker}"/></svg>` +
    `<span class="slot-fill">${sticker(g, "100%", 0)}</span></span>`;

  /* The wall, one tile per game that actually has a board. The number and the
     signature arrive from the network; both are rendered as placeholders that
     already occupy their final height, so the tile never grows under the
     reader. `unit` finally has a consumer. */
  const tile = (g, i) => `        <figure class="stk" data-slug="${g.slug}" style="${vars(g)};--rot:${tilt(i)}deg">
          <span class="ico" aria-hidden="true"><svg viewBox="0 0 48 48"><use href="#${g.sticker}"/></svg></span>
          <figcaption class="g">${escapeHtml(g.title)}</figcaption>
          <p class="s num" data-score>&mdash;</p>
          <p class="u">${escapeHtml(g.scoreUnit)}</p>
          <p class="sig" data-sig>Unsigned</p>
        </figure>`;

  /* The book page's full-size slots. Same registry, same sprite, but a card
     rather than a chip: each one carries the game's name and has room for
     today's score. Rendered at build time so the grid has its final height on
     the first frame — the counts arrive from script a moment later, and nothing
     may move underneath the reader when they do. */
  const bookSlot = (g, i) => `        <div class="slot slot--e" data-slot="${g.slug}" style="${vars(g)};--rot:${tilt(i)}deg">
          <span class="ico" aria-hidden="true"><svg viewBox="0 0 48 48"><use href="#${g.sticker}"/></svg></span>
          <p class="g">${escapeHtml(g.title)}</p>
          <p class="lab" data-lab>Not played today</p>
          <p class="s num" data-score hidden></p>
          <p class="u" data-unit hidden>${escapeHtml(g.scoreUnit || "")}</p>
          <p class="sig" data-sig hidden></p>
          <a class="btn btn--s" href="${g.path}">Play</a>
        </div>`;

  /* The wall, one row per game that has a board.
     Same read as the homepage tiles, laid out as a list so each record has room
     for the things a tile has no space for: which way round the game scores,
     and when the record was set. Rendered here rather than in script so the
     list has its final height on the first frame — the numbers arrive from the
     network a moment later and must not push anything down. */
  const wallRow = (g) => `        <li class="wrow" data-slug="${g.slug}">
          <a class="stk" href="${g.path}" style="${vars(g)}">
            <span class="ico" aria-hidden="true"><svg viewBox="0 0 48 48"><use href="#${g.sticker}"/></svg></span>
            <span class="wg">
              <span class="g">${escapeHtml(g.title)}</span>
              <span class="wrule">${g.leaderboard.lowerIsBetter ? "fewer is better" : "higher is better"}</span>
            </span>
            <span class="wn" data-holder>Unsigned</span>
            <span class="wt" data-when></span>
            <span class="wv">
              <span class="s num" data-score>&mdash;</span>
              <span class="u">${escapeHtml(g.scoreUnit)}</span>
            </span>
          </a>
        </li>`;

  return {
    name: "twb:homepage-from-registry",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (isBook(ctx)) {
          return html.replace(
            "        <!-- book-slots -->",
            games.map(bookSlot).join("\n"),
          );
        }
        if (isWall(ctx)) {
          return html.replace(
            "        <!-- wall-rows -->",
            games.filter((g) => g.leaderboard !== false).map(wallRow).join("\n"),
          );
        }
        // Homepage only; every other page is served untouched.
        if (!isHomepage(ctx)) return html;

        const shelf = games.map(card).join("\n");
        const slots = games.map(slot).join("\n");
        const boarded = games.filter((g) => g.leaderboard !== false);
        const tiles = boarded.map(tile).join("\n");
        const hasPart = games
          .map(
            (g) =>
              `    { "@type": "Game", "name": ${JSON.stringify(g.title)}, ` +
              `"url": ${JSON.stringify(SITE_URL + g.path)} }`,
          )
          .join(",\n");

        return html
          .replace("    <!-- games-shelf -->", shelf)
          .replace("        <!-- book-slots -->", slots)
          .replace("        <!-- wall-tiles -->", tiles)
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
    const entries = [home, ...pages, ...games];
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
 * The PWA layer: the manifest link, the apple-touch icon, and the snippet that
 * clears out the service worker this site used to ship.
 *
 * The app is installable and nothing more. There is no worker and no cache, so
 * neither a browser tab nor the installed app has an offline mode
 * (ARCHITECTURE.md §18, §19) — and installability does not need one: Chrome
 * dropped the registered-worker requirement in 108 on mobile and 112 on
 * desktop.
 */
function pwa() {
  let swCleanup = "";
  return {
    name: "twb:pwa",

    buildStart() {
      // Same read-as-a-string treatment as the theme bootstrap: the header
      // documents the contract rather than the runtime behaviour, so it does
      // not belong in every page, and the body is collapsed to one line. That
      // collapse is why the file's code carries no `//` comments.
      swCleanup = readFileSync(path.join(rootDir, "scripts/sw-cleanup.js"), "utf8")
        .replace(/^(?:\/\/.*\n)+/, "")
        .replace(/\s+/g, " ")
        .trim();
      // Rebuild when it changes during dev.
      this.addWatchFile?.(path.join(rootDir, "scripts/sw-cleanup.js"));
    },

    transformIndexHtml: {
      order: "post",
      handler: () => [
        {
          tag: "link",
          attrs: { rel: "manifest", href: "/manifest.webmanifest" },
          injectTo: "head",
        },
        {
          tag: "link",
          attrs: { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
          injectTo: "head",
        },
        {
          // Unregisters any worker still installed from an earlier build and
          // drops its caches. See scripts/sw-cleanup.js for why the page does
          // this rather than leaving it to the browser's own update check.
          //
          // Inlined rather than shipped as a chunk. The homepage otherwise
          // emits no JavaScript at all, so an external file would add a request
          // to every page for ~350 bytes of source.
          tag: "script",
          children: swCleanup,
          injectTo: "body",
        },
      ],
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
    sharedMarkup(),
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
