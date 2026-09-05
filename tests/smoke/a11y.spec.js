// Accessibility, tap targets, motion and orientation, across every registry
// page.
//
// None of this existed before: the suite had no focus-order, keyboard,
// reduced-motion, landscape or hit-size assertion anywhere, which is why the
// end card could sit in eight games for months without being a dialog and the
// back link could be 13 pixels tall.
//
// Everything here drives the page the way a player does — tab, Escape, a real
// tap on a real control — rather than asserting that a particular attribute
// was set. The one exception is `inert`, which is checked directly because its
// whole purpose is to be invisible to the kind of interaction a test can make.

import { test, expect } from "@playwright/test";
import { games, pages } from "../../src/data/games.js";
import { blockStorage } from "../helpers/storage.js";

const paths = games.map((g) => g.path);
/* Games plus every other page on the site. The game-only describes below use
   `paths`; the ones that apply to anything with a URL use this. */
const allPages = ["/", ...pages.map((p) => p.path), ...paths];

/* Controls whose width is fixed by a grid pitch rather than by choice. Both are
   44 tall, which is the axis that was actually costing taps; widening them to
   44 would overlap their neighbours and steal each other's taps, which is a
   worse bug than the one it fixes. Phone keyboards make the same trade. */
const NARROW_BY_DESIGN = ["letter-btn", "swatch", "tool"];

test.describe("tap targets", () => {
  for (const path of allPages) {
    test(`${path} has no control under 44px`, async ({ page }) => {
      await page.goto(path);
      const small = await page.evaluate((narrow) => {
        const out = [];
        for (const el of document.querySelectorAll(
          "a[href], button, [role=switch], summary",
        )) {
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") continue;
          const after = getComputedStyle(el, "::after");
          // The hit area is widened with a centred pseudo-element so the
          // design is untouched, so the target is the larger of the two boxes.
          const w = Math.max(r.width, parseFloat(after.width) || 0);
          const h = Math.max(r.height, parseFloat(after.height) || 0);
          const cls = typeof el.className === "string" ? el.className : "";
          const exempt = narrow.some((n) => cls.split(/\s+/).includes(n));
          const floor = exempt ? { w: 30, h: 44 } : { w: 44, h: 44 };
          if (w < floor.w || h < floor.h) {
            out.push(`${el.id || cls || el.tagName} ${Math.round(w)}x${Math.round(h)}`);
          }
        }
        return out;
      }, NARROW_BY_DESIGN);
      expect(small, `sub-44 controls on ${path}`).toEqual([]);
    });
  }
});

test.describe("the how-to sheet is a dialog", () => {
  for (const path of paths) {
    test(`${path} traps, closes on Escape, and returns focus`, async ({ page }) => {
      await page.goto(path);
      const sheet = page.locator("#howtoSheet");
      const opener = page.locator("#howtoBtn");

      await expect(sheet).toHaveAttribute("role", "dialog");
      await expect(sheet).toHaveAttribute("aria-modal", "true");
      await expect(opener).toHaveAttribute("aria-expanded", "false");

      await opener.click();
      await expect(sheet).toHaveClass(/show/);
      await expect(opener).toHaveAttribute("aria-expanded", "true");

      // The page behind an open sheet is out of reach for everyone, not just
      // for a pointer that the backdrop happens to block.
      const behindInert = await page.evaluate(() => {
        const root = document.querySelector(".stage") || document.querySelector(".app");
        return root ? root.hasAttribute("inert") : null;
      });
      expect(behindInert, "the page behind the sheet is inert").toBe(true);

      await page.keyboard.press("Escape");
      await expect(sheet).not.toHaveClass(/show/);
      await expect(opener).toHaveAttribute("aria-expanded", "false");

      // Focus goes back where it came from, not to the top of the document.
      await expect(opener).toBeFocused();

      const stillInert = await page.evaluate(() => {
        const root = document.querySelector(".stage") || document.querySelector(".app");
        return root ? root.hasAttribute("inert") : null;
      });
      expect(stillInert, "the page is reachable again once the sheet closes").toBe(false);
    });
  }
});

/* A real doodle-on end card, reached the way its own spec reaches one: draw a
   stroke so the clock starts, then run the clock out. Cheaper than a solve, and
   it is a genuine finished round rather than an overlay opened by hand. */
async function openDoodleEndCard(page) {
  await page.clock.install();
  await page.goto("/doodle-on/");
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(300);

  const b = await page.locator("#canvas").boundingBox();
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.8);
  await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.8);
  await page.mouse.up();

  await page.clock.fastForward("00:35");
  await expect(page.locator("#overlay")).toHaveClass(/show/, { timeout: 4000 });
}

test.describe("the end card is a dialog", () => {
  // doodle-on because its round ends on a clock rather than on a solve, so a
  // genuine end card is one fastForward away instead of a full playthrough.
  test("focus lands on Play again, Enter replays, and the board is inert", async ({
    page,
  }) => {
    await openDoodleEndCard(page);
    const overlay = page.locator("#overlay");
    await expect(overlay).toHaveAttribute("role", "dialog");
    await expect(overlay).toHaveAttribute("aria-modal", "true");

    // The persona finding this exists for: finish, press Enter, be playing
    // again — with no dismissal step in between.
    await expect(page.locator("#againBtn")).toBeFocused();

    const inert = await page.evaluate(() =>
      document.querySelector(".stage").hasAttribute("inert"),
    );
    expect(inert, "the board behind the end card is inert").toBe(true);

    await page.keyboard.press("Enter");
    await expect(overlay).not.toHaveClass(/show/);

    const after = await page.evaluate(() =>
      document.querySelector(".stage").hasAttribute("inert"),
    );
    expect(after, "the board is playable again").toBe(false);
  });

  test("Escape dismisses the card and gives the page back", async ({ page }) => {
    await openDoodleEndCard(page);
    const overlay = page.locator("#overlay");

    await page.keyboard.press("Escape");
    await expect(overlay).not.toHaveClass(/show/);
    expect(
      await page.evaluate(() => document.querySelector(".stage").hasAttribute("inert")),
    ).toBe(false);
  });
});

test.describe("one vocabulary", () => {
  for (const path of paths) {
    test(`${path} says "Play again" and "Share"`, async ({ page }) => {
      await page.goto(path);
      const labels = await page.evaluate(() => {
        const again =
          document.getElementById("againBtn") || document.getElementById("restartBtn");
        const share = document.getElementById("shareBtn");
        return {
          again: again ? again.textContent.trim() : null,
          share: share ? share.textContent.trim() : null,
        };
      });
      // The markup carries the same string everywhere; a game may still shout
      // it in CSS if that is its register.
      expect(labels.again).toBe("Play again");
      expect(labels.share).toBe("Share");
    });
  }
});

test.describe("theme", () => {
  for (const path of paths) {
    test(`${path} can change theme without leaving the game`, async ({ page }) => {
      await page.goto(path);
      const btn = page.locator("#themeBtn");
      await expect(btn).toBeVisible();

      const before = await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme"),
      );
      await btn.click();
      const after = await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme"),
      );
      expect(after).not.toBe(before);

      // It has to survive a navigation, or it is a toy.
      await page.reload();
      expect(
        await page.evaluate(() => document.documentElement.getAttribute("data-theme")),
      ).toBe(after);
    });
  }

  test("a shared ?theme= link applies before the first paint", async ({ page }) => {
    await page.goto("/untangle/?theme=dark");
    expect(
      await page.evaluate(() => document.documentElement.getAttribute("data-theme")),
    ).toBe("dark");
    await page.goto("/untangle/?theme=light");
    expect(
      await page.evaluate(() => document.documentElement.getAttribute("data-theme")),
    ).toBe("light");
  });
});

test.describe("sound", () => {
  const withTopbarMute = paths.filter((p) => p !== "/bubble-tap/");

  for (const path of withTopbarMute) {
    test(`${path} can be muted`, async ({ page }) => {
      await page.goto(path);
      const btn = page.locator("#soundBtn");
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "false");
      await expect(btn).toHaveAttribute("aria-label", "Sound off");
      await page.reload();
      await expect(page.locator("#soundBtn")).toHaveAttribute("aria-pressed", "false");
    });
  }

  test("the mute is one site-wide preference, not one per game", async ({ page }) => {
    await page.goto("/untangle/");
    await page.locator("#soundBtn").click();
    await expect(page.locator("#soundBtn")).toHaveAttribute("aria-pressed", "false");

    await page.goto("/honeycomb/");
    await expect(page.locator("#soundBtn")).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("motion", () => {
  for (const path of allPages) {
    test(`${path} runs nothing forever under reduced motion`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      await page.waitForTimeout(300);

      const looping = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          if (cs.animationName === "none") continue;
          if (cs.animationIterationCount.split(",").some((v) => v.trim() === "infinite")) {
            const cls = typeof el.className === "string" ? el.className : "";
            out.push(`${el.tagName}.${cls} ${cs.animationName}`);
          }
        }
        return out;
      });
      expect(looping, `endless animation on ${path}`).toEqual([]);
    });
  }

  test("a reduced-motion how-to sheet still arrives", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/untangle/");
    await page.locator("#howtoBtn").click();
    await expect(page.locator("#howtoSheet")).toHaveClass(/show/);
    await page.waitForTimeout(250);
    // Base CSS must be the *final* state, so turning the animation off leaves
    // the sheet correct rather than invisible or stuck off screen.
    const shown = await page.evaluate(() => {
      const el = document.getElementById("howtoSheet");
      const cs = getComputedStyle(el);
      return { opacity: Number(cs.opacity), transform: cs.transform };
    });
    expect(shown.opacity).toBe(1);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(shown.transform);
  });
});

test.describe("landscape", () => {
  for (const path of allPages) {
    test(`${path} fits a phone on its side`, async ({ page }) => {
      // 844x390 — an iPhone 12/13/14 rotated, the case no spec covered.
      await page.setViewportSize({ width: 844, height: 390 });
      await page.goto(path);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(overflow.scrollWidth, `horizontal overflow on ${path}`).toBeLessThanOrEqual(
        overflow.inner,
      );
    });
  }

  for (const path of paths) {
    test(`${path} drops its decorative lines when the screen is short`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.goto(path);
      const shown = await page.evaluate(() =>
        [...document.querySelectorAll(".subtitle, .seo-info")].filter(
          (el) => getComputedStyle(el).display !== "none",
        ).length,
      );
      expect(shown, "subtitle and disclosure are hidden in landscape").toBe(0);
    });
  }
});

test.describe("storage", () => {
  test("a game still loads when localStorage throws", async ({ page }) => {
    // Safari private mode does not return null here, it throws on the property
    // access — which is what used to kill bubble-tap before it drew a frame.
    await blockStorage(page);

    for (const path of paths) {
      const errors = [];
      page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
      await page.goto(path);
      await expect(page.locator("#howtoBtn")).toBeVisible();
      expect(errors, `${path} threw with storage blocked`).toEqual([]);
    }
  });
});
