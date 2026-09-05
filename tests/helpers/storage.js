// Shared fixtures for the specs that seed or block browser storage.
//
// These were three differently-shaped copies across home.spec.js,
// book.spec.js and a11y.spec.js, and one of them carried a real bug: the
// date helpers built their day with `toISOString().slice(0, 10)`, which is
// **UTC**, while the code under test uses the player's local date
// (src/shared/ui/day.js). In any timezone that is not UTC the two disagree for
// part of every day — and the specs most likely to break are precisely the
// daily-reset ones, which is the behaviour they exist to prove.
//
// `DAY()` below matches `localDay()` exactly. It has to.

/**
 * A day as the stored records spell it: local, "YYYY-MM-DD".
 *
 * `offset` is in days, so `DAY(-1)` is yesterday.
 */
export function DAY(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** One game's play record, keyed the way progress.js keys it. */
export function playedOn(slug, score, day = DAY()) {
  return { key: `twb:${slug}.today`, value: JSON.stringify({ day, score }) };
}

/** A stored value, for anything that is not a play record. */
export function stored(key, value) {
  return { key: `twb:${key}`, value: typeof value === "string" ? value : JSON.stringify(value) };
}

/** A context whose pages start with `entries` already in localStorage. */
export async function withStorage(browser, entries = []) {
  const context = await browser.newContext();
  await context.addInitScript((items) => {
    for (const i of items) localStorage.setItem(i.key, i.value);
  }, entries);
  return context;
}

/**
 * Make `localStorage` throw on access, the way Safari private mode does.
 *
 * Note it throws on the *property*, not on the method — returning null would
 * not reproduce the failure this guards against.
 */
export function blockStorage(target) {
  return target.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
  });
}

/** Every `<use href="#...">` on the page that points at no such symbol. */
export function brokenSpriteRefs(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("use")]
      .map((u) => u.getAttribute("href"))
      .filter((h) => h && !document.querySelector(h)),
  );
}
