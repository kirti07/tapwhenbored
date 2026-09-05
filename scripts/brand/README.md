# Brand artwork

`mark.svg` is the source for every piece of brand imagery the site ships: the
app icons, the social card, and the favicon's design. It lives here rather than
in `public/` or `src/` for the same reason `theme-bootstrap.js` does — it is an
input to the build's *authoring*, not a file any page requests.

512 × 512 viewBox, vector, no external references. It replaced a raster
illustration of a shelf of toys: that drawing had a handheld console, a balloon,
three blocks, a marble, a spool and a space invader on two shelves, and at the
size an icon is actually seen none of it was legible. The mark is now one idea —
a finger tapping, a ball popping away from it — which is also the whole site in
one gesture.

Being vector is worth more than it sounds. Every derivative is crisp at any
size, and the files got dramatically smaller: `icon-512.png` went from 132 kB of
compressed photographic gradient to 33 kB.

## Palette

| Role | Value | Note |
| --- | --- | --- |
| Tile purple | `#c9a4f0` | the mark's own tile, and the icon canvas |
| Outline navy | `#1e1b3a` | |
| Ball | `#ff7a95` → `#f43f5e` → `#c81e42` | radial, lit from the upper left |
| Ripples, hand | `#ffffff` / `#fdfdff` | |

The tile purple is deliberately close to the site's own accent — `#8b7fe0` in
light, `#a855f7` in dark — so the icon, the splash and the homepage read as one
product.

The social card also uses the site's tokens from `src/style.css`: `#262b3d` ink,
`#ff6f5e` warm and `#1f9974` cool for the wordmark, `#767a8c` for the URL, on
the `#f6f6fb` page ground.

## Derivatives

| File | Size | How |
| --- | --- | --- |
| `public/icons/icon-192.png` | 192 × 192 | purple fill, mark drawn full-canvas |
| `public/icons/icon-512.png` | 512 × 512 | purple fill, mark drawn full-canvas |
| `public/icons/maskable-512.png` | 512 × 512 | purple fill, mark at **56%**, centred |
| `public/assets/tapwhenbored-og.jpg` | 1200 × 630 | `#f6f6fb` ground; mark 400 square at x 86 with a soft shadow; wordmark, tagline and `tapwhenbored.com` stacked in the right column, wordmark shrunk to fit |
| `public/favicon.svg` | 32 viewBox | hand-drawn reduction — see below |

Three things about that table are load-bearing.

**The icons are full-bleed.** The canvas is filled with the same purple the mark
uses for its own rounded tile, so those corners vanish. That means no
transparency for iOS to mishandle on the apple-touch-icon, and no
double-rounding when the OS applies its own mask.

Note that the icon canvas is *not* the manifest's `background_color`. That is
`#f6f6fb`, the homepage's ground, because Android holds the launch screen in
`background_color` and then cross-fades to the page — so it has to match the
page, not the icon. `npm run validate` pins it to `home.themeColor.light` in
the registry.

**The maskable inset.** Android may crop a maskable icon to a circle of 80%
diameter, and the largest square inside that circle has a side of
`0.8 / √2 ≈ 0.566` of the canvas. Anything larger loses its corners.

**The PNGs are posterized to 5 bits per channel.** The art is flat vector with
one soft gradient, and it is the gradient's dither — not the drawing — that PNG
cannot compress. Dropping the low bits roughly halves each file with no banding
visible at any size the icon is shown. `icon-192.png` is also the
apple-touch-icon every page links, so its weight is paid on more than the
install.

**`favicon.svg` is a reduction, not a scale.** At 16px the hand and the tap
ripples are indistinguishable mush, so the favicon keeps only what survives: the
tile, the ball with its highlight, and a single motion arc.

## Regenerating

There is no build step and no committed script — these are authored once and
change about as often as the logo does. Any tool that can rasterize an SVG and
composite PNGs will do; the table above is the whole specification. The
derivatives were produced with a throwaway CoreGraphics script on macOS.

Two things to keep in mind if you replace the social card:

- **Use a new filename.** WhatsApp, Facebook and X cache previews keyed on the
  URL and will keep serving the old picture indefinitely, and `vercel.json`
  gives `/assets/*` a 24-hour CDN TTL on top of that.
  `scripts/validate-games.js` checks `home.ogImage` in `src/data/games.js`
  against the homepage's `og:image`, so both have to move together.
- **Keep `background_color` matching the homepage, not the icon.** It is the
  colour Android holds the launch screen in before cross-fading to the page, so
  a mismatch reads as a coloured flash. It is pinned to `home.themeColor.light`
  by `npm run validate`, so change it there.
