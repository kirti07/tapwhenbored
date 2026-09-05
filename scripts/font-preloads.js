// Which webfont files a page must preload, worked out from the page's own CSS.
//
// Derived rather than declared, on purpose. A registry field saying "this game
// uses weight 800" is a claim that can be wrong, and the failure is invisible:
// a preloaded face is fetched at the browser's highest priority, ahead of the
// things the page actually paints with, so preloading a weight nothing renders
// spends ~16 kB of the critical path on nothing. Every page but honeycomb
// shipped the 800 face that way for a while. The stylesheet already settles the
// question, so ask it instead.
//
// Both vite.config.js (which emits the <link rel="preload"> tags) and
// scripts/validate-games.js import this, so there is one rule in one place.
// tests/smoke/site.spec.js deliberately keeps its own implementation and runs
// it against the *built* CSS — that is the black-box half, and it would still
// catch a minifier or @import-order surprise this cannot see.
//
// See ARCHITECTURE.md §25.

/**
 * Strips CSS comments.
 *
 * Not optional. tokens.css's own header explains the `--font-display` token in
 * prose, so the literal text `var(--font-display)` appears inside a comment
 * there. A scan that skipped this step would conclude that every page importing
 * tokens.css renders the display face — including bubble-tap, which is
 * deliberately system-font and preloads nothing.
 */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The font files `css` needs preloaded, as absolute public paths.
 *
 * Pass a page's own stylesheet, not the shared files it imports: the shared
 * sheets only *declare* --font-display, they never render with it. The
 * validator pins that down so it stays true.
 *
 * Weight 700 is needed by anything that renders the display family at all —
 * `font-weight: 600` against these faces resolves to the 700 file, because CSS
 * font matching for a target above 500 checks heavier weights first.
 *
 * Weight 800 needs one rule to set BOTH the display family and that weight.
 * Searching for the weight alone would wrongly flag word-steps and bubble-tap,
 * which use 800 against the *system* font stack and consume nothing from
 * public/fonts/.
 */
export function preloadsFor(css) {
  const clean = stripComments(css);
  if (!clean.includes("var(--font-display)")) return [];

  const rendersAt800 = clean
    .split("}")
    .some(
      (rule) =>
        /font-family:\s*var\(--font-display\)/.test(rule) &&
        /font-weight:\s*800/.test(rule),
    );

  const files = ["/fonts/nunito-latin-700.woff2"];
  if (rendersAt800) files.push("/fonts/nunito-latin-800.woff2");
  return files;
}
