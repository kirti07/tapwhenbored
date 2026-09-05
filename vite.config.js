import { defineConfig, loadEnv } from "vite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { games, home, SITE_URL } from "./src/data/games.js";
import { preloadsFor } from "./scripts/font-preloads.js";

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
// The one thing a game page's <head> still says for itself.
const MARKER = "<!-- head-meta -->";

const isHomepage = (ctx) => ctx.path === "/index.html" || ctx.path === "/";

const escapeHtml = (v) =>
  String(v).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

/**
 * How many shelf cards are at or near the fold. The shelf is two columns on a
 * phone, so roughly the first four: those are fetched eagerly (the first as the
 * LCP candidate) and everything below waits until it is scrolled towards.
 *
 * A fixed four whether the catalogue holds seven games or fifty — the point is
 * that the launch cost does not grow with the shelf (ARCHITECTURE.md §19).
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

  const darkFor = new Map(games.map((g) => [g.slug, g.themeColor.dark]));

  return {
    name: "twb:theme-bootstrap",
    transformIndexHtml: {
      // "pre" so Vite still sees a plain <head> when it injects preloads.
      order: "pre",
      handler(html, ctx) {
        const slug = ctx.path.replace(/^\//, "").split("/")[0];
        const color = darkFor.get(slug) ?? home.themeColor.dark;
        return html.replace(
          "<!-- theme-bootstrap -->",
          `<script>${snippet.replace("__DARK_THEME_COLOR__", color)}</script>`,
        );
      },
    },
  };
}

/**
 * Writes every game page's <head> from the registry, in place of its
 * `<!-- head-meta -->` marker.
 *
 * This is the change that made a platform edit cost one edit instead of eight.
 * Each game used to paste ~45 lines of head by hand — viewport, theme colour,
 * title, description, the Open Graph and Twitter sets, two JSON-LD blocks and
 * the font preloads — and the copies drifted. Only the canonical and og:url
 * were ever validated; a theme colour was already one hex digit out from the
 * stylesheet it was supposed to match, and nothing could see it.
 *
 * Build-time substitution, not a runtime render: transformIndexHtml with
 * order: "pre", the same mechanism as homepageFromRegistry(). Every tag is
 * static in the shipped HTML, so ARCHITECTURE.md §28's rule that essential SEO
 * never depends on runtime JS still holds, and §41's ban on runtime-generated
 * SEO is untouched. It runs in dev too, so local matches production.
 *
 * The homepage is deliberately not run through this. Its head is a different
 * shape — summary_large_image at 1200x630, og:site_name, og:locale,
 * og:image:alt, a WebSite JSON-LD and a FAQPage JSON-LD — and there is exactly
 * one of it, so the duplication this exists to remove does not apply. Growing
 * this into a branch per field to cover one page would cost more than it saves.
 *
 * Preloads are derived from the page's own stylesheet rather than declared in
 * the registry, so no field can claim a weight the page does not render. See
 * scripts/font-preloads.js.
 */
function headFromRegistry() {
  const bySlug = new Map(games.map((g) => [g.slug, g]));

  // Identical on every game page, so they are constants here rather than
  // fields nothing would ever vary (ARCHITECTURE.md §10).
  const VIEWPORT = "width=device-width, initial-scale=1";
  const OG_IMAGE_SIZE = "640";

  const head = (g, css) => {
    const url = SITE_URL + g.path;
    const img = SITE_URL + g.ogImage;
    const meta = (k, v, prop) =>
      `<meta ${prop ? "property" : "name"}="${k}" content="${escapeHtml(v)}">`;

    return [
      `<meta name="viewport" content="${VIEWPORT}">`,
      meta("theme-color", g.themeColor.light),
      `<title>${escapeHtml(g.seoTitle)}</title>`,
      meta("description", g.description),
      `<link rel="canonical" href="${url}">`,
      meta("og:type", "website", true),
      meta("og:title", g.seoTitle, true),
      meta("og:description", g.ogDescription, true),
      meta("og:url", url, true),
      meta("og:image", img, true),
      meta("og:image:width", OG_IMAGE_SIZE, true),
      meta("og:image:height", OG_IMAGE_SIZE, true),
      meta("twitter:card", "summary"),
      meta("twitter:title", g.seoTitle),
      meta("twitter:description", g.ogDescription),
      meta("twitter:image", img),
      `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`,
      `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Game",
  "name": ${JSON.stringify(g.title)},
  "url": ${JSON.stringify(url)},
  "description": ${JSON.stringify(g.schemaDescription)},
  "image": ${JSON.stringify(img)},
  "genre": ${JSON.stringify(g.genre)},
  "playMode": "SinglePlayer",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}
</script>`,
      `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Tap When Bored", "item": ${JSON.stringify(SITE_URL + home.path)} },
    { "@type": "ListItem", "position": 2, "name": ${JSON.stringify(g.title)}, "item": ${JSON.stringify(url)} }
  ]
}
</script>`,
      ...preloadsFor(css).map(
        (f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`,
      ),
    ].join("\n");
  };

  return {
    name: "twb:head-from-registry",
    // "pre" so Vite still sees a plain <head> when it injects preloads, and so
    // the stylesheet link this reads is still the source one.
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (!html.includes(MARKER)) return html;

        const slug = ctx.path.replace(/^\//, "").split("/")[0];
        const g = bySlug.get(slug);
        if (!g) return html;

        const stylesheet = path.join(srcDir, slug, "style.css");
        // So `vite dev` re-runs this when a game restyles itself into or out of
        // needing a font weight.
        this.addWatchFile?.(stylesheet);

        return html.replace(MARKER, head(g, readFileSync(stylesheet, "utf8")));
      },
    },
  };
}

/**
 * Fills the homepage's game shelf and its WebSite/hasPart JSON-LD from the
 * registry, replacing what used to be seven hand-maintained card blocks and a
 * parallel hand-maintained list of the same seven games.
 *
 * Each card carries its accent as two inline custom properties rather than a
 * `.card--<slug>` class, which is what those sixteen rules in style.css were.
 * Two properties and not one, because the accent is per theme: style.css picks
 * between them with `.card` and `[data-theme="dark"] .card`. A single inline
 * `--accent` could not switch theme, and would out-specify the dark rule.
 *
 * Build-time rather than a runtime render, because this is indexable content
 * and essential structured data: ARCHITECTURE.md §28 requires it be static in
 * the output HTML. transformIndexHtml runs in dev too, so what you see locally
 * is what ships.
 */
function homepageFromRegistry() {
  const card = (g, i) => `    <a class="card" style="--accent-light:${g.accent.light};--accent-dark:${g.accent.dark}" href="${g.path}">
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
          .replace('  "hasPart": []', `  "hasPart": [\n${hasPart}\n  ]`)
          // The homepage's two theme colours, from the registry. They used to be
          // literals in four files — here, the meta tag, the toggle below it and
          // style.css — which is how the manifest once shipped a purple launch
          // screen in front of a near-white page. Both placeholders appear more
          // than once, hence the global replace.
          .replaceAll("__THEME_LIGHT__", home.themeColor.light)
          .replaceAll("__THEME_DARK__", home.themeColor.dark);
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
    headFromRegistry(),
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
