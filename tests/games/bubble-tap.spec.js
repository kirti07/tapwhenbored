// Bubble Tap: Calm mode slows every bubble, and turning it off gives each one
// back exactly the speed it had. Bombs go through the same rescale, but their
// wobble makes a per-frame speed too noisy to compare, so only plain bubbles
// are measured.

import { test, expect } from "@playwright/test";

/** Each bubble's speed in px/ms, as the median of per-frame moves. */
function speeds(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const seen = new Map();
        let last = null;
        let frames = 0;
        const read = () => {
          const out = new Map();
          for (const el of document.querySelectorAll("#playfield .bubble")) {
            const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
            if (m) out.set(el.dataset.id, { x: +m[1], y: +m[2], bomb: el.classList.contains("bomb") });
          }
          return out;
        };
        const tick = (t) => {
          const now = read();
          if (last) {
            const dt = t - last.t;
            for (const [id, p] of now) {
              const q = last.pos.get(id);
              if (!q || dt <= 0) continue;
              const s = seen.get(id) || { bomb: p.bomb, v: [] };
              s.v.push(Math.hypot(p.x - q.x, p.y - q.y) / dt);
              seen.set(id, s);
            }
          }
          last = { t, pos: now };
          if (++frames < 40) requestAnimationFrame(tick);
          else {
            const res = {};
            for (const [id, s] of seen) {
              const v = s.v.sort((a, b) => a - b);
              res[id] = { bomb: s.bomb, speed: v[Math.floor(v.length / 2)] };
            }
            resolve(res);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
}

async function toggleCalm(page) {
  await page.click("#settingsBtn");
  await page.click("#motionToggle");
  await page.click("#closeSettingsBtn");
}

test("Calm mode slows bubbles, and turning it off restores each one's speed", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/bubble-tap/");
  await expect(page.locator("#playfield .bubble").first()).toBeVisible();
  // Let the spawn animation finish so transforms are the game's own.
  await page.waitForTimeout(500);

  const before = await speeds(page);
  await toggleCalm(page);
  await expect(page.locator("#motionToggle")).toHaveAttribute("aria-checked", "true");
  const calm = await speeds(page);
  await toggleCalm(page);
  await expect(page.locator("#motionToggle")).toHaveAttribute("aria-checked", "false");
  const after = await speeds(page);

  const ids = Object.keys(before).filter((id) => calm[id] && after[id]);
  const plain = ids.filter((id) => !before[id].bomb);
  expect(plain.length).toBeGreaterThan(3);

  for (const id of plain) {
    expect(calm[id].speed / before[id].speed).toBeCloseTo(0.35, 1);
    expect(after[id].speed / before[id].speed).toBeGreaterThan(0.95);
    expect(after[id].speed / before[id].speed).toBeLessThan(1.05);
  }
  expect(errors).toEqual([]);
});
