// Screenshot every HTML file in a version folder at fixed viewports.
// Usage: node research/tools/shoot.js research/ux-versions/v1-arcade [outDir]
// Produces <outDir>/<page>-<mobile|desktop>-<light|dark>.png (full page).
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const dir = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3] || path.join(dir, "shots"));
fs.mkdirSync(out, { recursive: true });

const viewports = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};

(async () => {
  const browser = await chromium.launch();
  const pages = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
  for (const file of pages) {
    for (const [vpName, vp] of Object.entries(viewports)) {
      for (const scheme of ["light", "dark"]) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.deviceScaleFactor,
          isMobile: !!vp.isMobile,
          hasTouch: !!vp.hasTouch,
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        await page.goto("file://" + path.join(dir, file), { waitUntil: "load" });
        await page.waitForTimeout(300);
        const name = `${file.replace(/\.html$/, "")}-${vpName}-${scheme}.png`;
        await page.screenshot({ path: path.join(out, name), fullPage: true });
        if (errors.length) console.log(`ERRORS ${file} ${vpName} ${scheme}:`, errors.join(" | "));
        else console.log("ok", name);
        await ctx.close();
      }
    }
  }
  await browser.close();
})();
