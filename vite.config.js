import { defineConfig, loadEnv } from "vite";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { games, home, pages, SITE_URL } from "./src/data/games.js";
import { createHandler } from "./api/_lib/party.js";
import { createMemoryStore } from "./scripts/party-dev-store.js";

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
 * Serves the Tap Party room API in dev and preview, from the same handler the
 * Vercel function uses (api/_lib/party.js) over an in-memory store.
 *
 * So `npm run dev`, `npm run preview` and the Playwright suite run the real
 * server code with no network and no database. `PARTY_TIME_SCALE` shrinks
 * every party duration — the suite sets 0.05 — and rate limits are off here,
 * because every test runs from one address. Both are production-only concerns
 * that api.spec.js covers against the handler directly.
 */
function partyApi(env) {
  const handle = createHandler({
    store: createMemoryStore(),
    scale: Number(env.PARTY_TIME_SCALE) || 1,
    limits: null,
  });

  const middleware = async (req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== "/api/party/" && url.pathname !== "/api/party") return next();

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    headers.set("x-real-ip", req.socket.remoteAddress || "local");

    const response = await handle(
      new Request(url, {
        method: req.method,
        headers,
        body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
      }),
    );
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    // Bytes, not text: a doodle is a JPEG.
    res.end(Buffer.from(await response.arrayBuffer()));
  };

  return {
    name: "twb:party-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
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
          // async, not defer: a slow analytics host must not hold back
          // DOMContentLoaded for the game.
          attrs: { async: true, src: "/_vercel/insights/script.js" },
          injectTo: "head",
        },
      ],
    },
  };
}

/**
 * Injects the Google Analytics 4 tag into every page.
 *
 * Google's instruction is to paste its snippet into every page immediately
 * after <head>. Both halves of that are declined on purpose.
 *
 * One place instead of eleven, for the same reason as the Vercel tag above.
 * Pasting a plain <script src> into the pages would also fail
 * scripts/validate-games.js, which rejects a non-module <script src> in a game
 * page because Vite would neither bundle nor emit it (§4).
 *
 * `injectTo: "head"` appends at the *end* of the head rather than the start.
 * "head-prepend" would put an inline script ahead of the theme bootstrap, which
 * exists solely to set data-theme before the first stylesheet applies and is
 * the only thing standing between a dark-mode player and a white flash. First
 * paint must never wait on the network (§34), and nothing is lost by waiting:
 * the tag is async and built from JavaScript, so where it sits in the head does
 * not change what GA4 records.
 *
 * "post" for the same reason as the Vercel tag: vite:build-html has already
 * scanned the document, so nothing here is parsed for asset resolution.
 *
 * See scripts/gtag.js for the hostname guard and why gtag() is defined even
 * where the library is not loaded.
 */
function googleAnalytics() {
  let snippet = "";
  return {
    name: "twb:google-analytics",

    buildStart() {
      // Same read-as-a-string treatment as the theme bootstrap and the worker
      // cleanup: the header documents the contract rather than the runtime
      // behaviour, so it does not belong in every page, and the body is
      // collapsed to one line. That collapse is why the file's code carries no
      // `//` comments.
      snippet = readFileSync(path.join(rootDir, "scripts/gtag.js"), "utf8")
        .replace(/^(?:\/\/.*\n)+/, "")
        .replace(/\s+/g, " ")
        .trim();
      // Rebuild when it changes during dev.
      this.addWatchFile?.(path.join(rootDir, "scripts/gtag.js"));
    },

    transformIndexHtml: {
      order: "post",
      handler: () => [
        {
          tag: "script",
          children: snippet,
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
const isAccount = (ctx) => ctx.path === "/account/index.html" || ctx.path === "/account/";
const isWall = (ctx) => ctx.path === "/wall/index.html" || ctx.path === "/wall/";

const escapeHtml = (v) =>
  String(v).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

// The homepage's dark theme-color. Games carry their own in the registry.
const HOME_DARK_THEME_COLOR = "#0b0c18";

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
 * The sprite was 50 identical lines in three documents and the theme button four
 * lines in eleven, which had already drifted into three variants — the games'
 * copy was missing the `aria-hidden` the others had. Neither is a runtime
 * concern, so neither belongs in a module: they are substituted into the HTML
 * at build time, exactly like the shelf and the slots.
 *
 * The end card's two exits joined them for the same reason and before any drift
 * had happened: both carry an inline SVG, both go into all eight games, and the
 * repo already held two divergent copies of a close glyph at different stroke
 * widths. A marker that is dropped fails silently, so scripts/validate-games.js
 * checks that every game still has both.
 *
 * The button's class differs by page family (`.iconbtn` on the homepage and the
 * book, `.icon-btn` in the game shells), so that one bit is a parameter — the
 * only partial that takes one.
 */
const PARTIALS = {
  "theme-btn": "scripts/theme-button.html",
  "endcard-exit": "scripts/end-card-exit.html",
  "endcard-wall": "scripts/end-card-wall.html",
};

function sharedMarkup() {
  let sprite = "";
  const partials = {};

  const read = () => {
    sprite = readFileSync(path.join(rootDir, "scripts/sprite.svg"), "utf8").trim();
    for (const [name, file] of Object.entries(PARTIALS)) {
      partials[name] = readFileSync(path.join(rootDir, file), "utf8").trim();
    }
  };

  return {
    name: "twb:shared-markup",
    buildStart() {
      read();
      this.addWatchFile?.(path.join(rootDir, "scripts/sprite.svg"));
      for (const file of Object.values(PARTIALS)) {
        this.addWatchFile?.(path.join(rootDir, file));
      }
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
        // `<!-- name -->`, or `<!-- name:argument -->` where the partial takes
        // one. The indent of the marker is applied to every line of the
        // partial, so the emitted HTML reads the way a hand-written block would.
        return html.replace(
          /([ \t]*)<!-- ([\w-]+)(?::([\w-]+))? -->/g,
          (whole, indent, name, arg) => {
            const partial = partials[name];
            if (partial === undefined) return whole;
            return (
              indent +
              partial
                .replace("{cls}", arg || "iconbtn")
                .split("\n")
                .join("\n" + indent)
            );
          },
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
  const vars = (g) => `--accent:${g.accent};--accent-d:${g.accentDark}`;

  /* A cabinet.
   *
   * marquee -> glyph well -> body. The title lives in the marquee, which is why
   * the h2 is in there: one heading announced once, rather than a pixel label
   * beside a hidden real one.
   *
   * The meta line has three states and each is true rather than decorative: the
   * player's best, "not played yet" for a board they have not reached, and
   * "no board, on purpose" for the two games that keep no score. The last is
   * emitted final; home.js fills the others, and every state is one line tall
   * so the card never grows under the reader. */
  const card = (g) => {
    const scoreless = g.leaderboard === false;
    return `        <a class="card arc" href="${g.path}" style="${vars(g)}">
          <span class="arc-marquee"><h2 class="card-n arc-pix">${escapeHtml(g.title)}</h2></span>
          <span class="arc-mini" aria-hidden="true"><svg viewBox="0 0 48 48"><use href="#${g.sticker}"/></svg></span>
          <span class="card-b">
            <span class="card-t">${escapeHtml(g.tagline)}</span>
            <span class="card-m ${scoreless ? "card-m--none" : "card-m--dim"}" data-best="${g.slug}">${
              scoreless ? "no board, on purpose" : "not played yet"
            }</span>
          </span>
        </a>`;
  };

  /* The high score roll.
   *
   * Names and units are emitted here because they are indexable content (§28);
   * the holder and the score arrive from the board and start as "Unsigned" and
   * a dash, both already at their final size so neither arrival moves the
   * panel. The row number is baked in now that the roll has no sort able to
   * reorder it. */
  const rollRow = (g, i) => `        <li class="roll-row arc" data-slug="${g.slug}" style="${vars(g)}">
          <span class="roll-no" aria-hidden="true">${i + 1}</span>
          <span class="roll-g">${escapeHtml(g.title)}</span>
          <span class="roll-who" data-sig>Unsigned</span>
          <span class="roll-v"><span class="roll-s num" data-score>&mdash;</span><span class="roll-u">${escapeHtml(g.scoreUnit)}</span></span>
        </li>`;

  /* One row of the player card's bests table.
   *
   * The best is local and the rank is not — that split is the whole design of
   * the page, and its error copy says so. Both cells are emitted at their final
   * height, so a board that never answers leaves the table exactly as it is. */
  const accountRow = (g) => `          <tr data-slot="${g.slug}" style="${vars(g)}">
            <th scope="row" class="acc-g"><span class="acc-ico" aria-hidden="true"><svg viewBox="0 0 48 48"><use href="#${g.sticker}"/></svg></span>${escapeHtml(g.title)}</th>
            <td class="acc-best num" data-score>&mdash;</td>
            <td class="acc-rank" data-rank>${g.leaderboard === false ? "no board" : ""}</td>
          </tr>`;

  /* One tab per cabinet, all eight of them.
   *
   * The two games with no board are here too, labelled as such: the arcade
   * says so out loud rather than leaving a gap somebody has to interpret.
   * Untangle draws a different puzzle every run and Doodle On has no score by
   * design, so neither has a game_config row and neither ever will (§27).
   *
   * Emitted at build time because the names are indexable content (§28); the
   * scores are not, and arrive from the board. `--accent` comes from the
   * registry the same way every other emitted element gets it, so adding
   * game #9 needs no CSS and no edit here. */
  const cabinetTab = (g, i) => {
    const board = g.leaderboard !== false;
    const first = i === 0;
    return `          <button class="arc-cabtab arc" role="tab" type="button"
            id="cab-${g.slug}" data-slug="${g.slug}"
            aria-controls="cabinet" aria-selected="${first}" tabindex="${first ? 0 : -1}"
            style="${vars(g)}">
            <span class="arc-marquee"><span class="arc-pix">${escapeHtml(g.title)}</span></span>
            <span class="arc-cabtab-foot">
              <span class="arc-cabtab-k">${board ? "All-time best" : "No board"}</span>
              <span class="arc-cabtab-v" data-top>&mdash;</span>
              <span class="arc-cabtab-w" data-holder>${board ? "" : "just for the doing"}</span>
            </span>
          </button>`;
  };

  return {
    name: "twb:homepage-from-registry",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (isAccount(ctx)) {
          return html.replace(
            "          <!-- account-rows -->",
            games.map(accountRow).join("\n"),
          );
        }
        if (isWall(ctx)) {
          return html.replace(
            "          <!-- cabinet-tabs -->",
            games.map(cabinetTab).join("\n"),
          );
        }
        // Homepage only; every other page is served untouched.
        if (!isHomepage(ctx)) return html;

        const shelf = games.map(card).join("\n");
        const boarded = games.filter((g) => g.leaderboard !== false);
        const roll = boarded.map(rollRow).join("\n");
        const hasPart = games
          .map(
            (g) =>
              `    { "@type": "Game", "name": ${JSON.stringify(g.title)}, ` +
              `"url": ${JSON.stringify(SITE_URL + g.path)} }`,
          )
          .join(",\n");

        return html
          .replace("    <!-- games-shelf -->", shelf)
          .replace("        <!-- wall-tiles -->", roll)
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
 * Preconnects to Supabase on the three pages that read from it at load, so the
 * DNS and TLS handshake overlap the page's own files instead of following them.
 */
function supabasePreconnect(env) {
  return {
    name: "twb:supabase-preconnect",
    transformIndexHtml: {
      order: "post",
      handler: (_html, ctx) =>
        env.SUPABASE_URL && (isHomepage(ctx) || isAccount(ctx) || isWall(ctx))
          ? [
              {
                tag: "link",
                attrs: { rel: "preconnect", href: new URL(env.SUPABASE_URL).origin, crossorigin: true },
                injectTo: "head-prepend",
              },
            ]
          : [],
    },
  };
}

/**
 * The PWA layer (ARCHITECTURE.md §18, §19): manifest and iOS links, the
 * generated service worker, and the snippet that registers it. TWB_SW=off is
 * the kill switch: it ships the tombstone worker and the cleanup snippet
 * instead. Dev never registers a worker.
 */
function pwa(env) {
  const off = env.TWB_SW === "off";
  const read = (file) => readFileSync(path.join(rootDir, file), "utf8");
  const inline = (file) =>
    read(file).replace(/^(?:\/\/.*\n)+/, "").replace(/\s+/g, " ").trim();
  const cleanup = inline("scripts/sw-cleanup.js");
  const register = inline("scripts/sw-register.js");
  const meta = (name, content) => ({ tag: "meta", attrs: { name, content }, injectTo: "head" });

  return {
    name: "twb:pwa",
    // After vite:build-html, so the pages are in the bundle by generateBundle.
    enforce: "post",

    transformIndexHtml: {
      order: "post",
      handler: (_html, ctx) => [
        { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" }, injectTo: "head" },
        {
          tag: "link",
          attrs: { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/apple-touch-icon.png" },
          injectTo: "head",
        },
        meta("mobile-web-app-capable", "yes"),
        meta("apple-mobile-web-app-capable", "yes"),
        meta("apple-mobile-web-app-status-bar-style", "default"),
        { tag: "script", children: off || ctx.server ? cleanup : register, injectTo: "body" },
      ],
    },

    generateBundle(_, bundle) {
      if (off) {
        this.emitFile({ type: "asset", fileName: "sw.js", source: read("scripts/sw-tombstone.js") });
        return;
      }

      // A page's files: its HTML's /static/ references and everything they import.
      const add = (file, out) => {
        const item = bundle[file];
        if (!item || out.has(file)) return;
        out.add(file);
        if (item.type !== "chunk") return;
        for (const dep of [...item.imports, ...item.dynamicImports]) add(dep, out);
        for (const css of item.viteMetadata?.importedCss ?? []) out.add(css);
      };
      const groups = Object.keys(bundle)
        .filter((file) => file.endsWith("index.html"))
        .sort()
        .map((file) => {
          const files = new Set([file]);
          for (const [, ref] of String(bundle[file].source).matchAll(/"\/(static\/[^"]+)"/g)) {
            add(ref, files);
          }
          return [...files];
        });

      const fixed = [
        "manifest.webmanifest",
        "favicon.svg",
        "icons/apple-touch-icon.png",
        ...readdirSync(path.join(publicDir, "fonts"))
          .filter((f) => f.endsWith(".woff2"))
          .map((f) => `fonts/${f}`),
      ];
      const bytes = (file) => {
        const item = bundle[file];
        if (!item) return readFileSync(path.join(publicDir, file));
        return item.type === "chunk" ? item.code : item.source;
      };
      const hash = createHash("sha256").update(read("scripts/sw.js"));
      for (const file of [...fixed, ...groups.flat()]) hash.update(file).update(bytes(file));

      const url = (file) => "/" + file.replace(/index\.html$/, "");
      const shell = groups.find((g) => g[0] === "index.html");
      const rest = groups.filter((g) => g !== shell);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: read("scripts/sw.js")
          .replace("__BUILD__", JSON.stringify(hash.digest("hex").slice(0, 12)))
          .replace("__SHELL__", JSON.stringify([...fixed, ...shell].map(url)))
          .replace("__PAGES__", JSON.stringify(rest.map((g) => g.map(url)))),
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
    partyApi(env),
    themeBootstrap(),
    sharedMarkup(),
    homepageFromRegistry(),
    vercelInsights(),
    googleAnalytics(),
    sitemap(),
    supabasePreconnect(env),
    pwa(env),
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
