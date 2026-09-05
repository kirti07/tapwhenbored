// The three platform surfaces every game page carries: the "How to play" sheet,
// the share button, and the end-card overlay.
//
// These were pasted into all eight games and drifted. The how-to open/close pair
// was byte-identical in eight copies. The share function was the same algorithm
// in five shapes — one game forgot to strip the query string, so a challenge
// link shared itself back; another mutated the button label instead of showing
// the note. Two of eight had an overlay that forgot to reset the share note, so
// "Link copied" was still on screen when the next round ended.
//
// WHAT THIS IS NOT. It is not a game engine, and it is held at three functions
// on purpose (ARCHITECTURE.md §9). No state, no lifecycle, no growing options
// object. Each function wires DOM that scripts/validate-games.js already
// guarantees exists, and returns.
//
// A fourth function is the signal that the code belongs in the game instead.
// Two candidates were left where they were for that reason: the challenge
// banner (three games, three different query parameters and two different show
// mechanisms) and the AudioContext helper (seven games, four signatures).
//
// A game may opt out of any one of these. doodle-on keeps its own share,
// because it shares a rendered PNG through navigator.canShare({files}) with an
// <a download> fallback — for that game the picture is the result, and the
// download is the only way a browser without Web Share keeps it. Folding that
// in would cost a files branch plus a fallback hook, which is exactly the
// growth this module refuses. It still uses initHowto and bindOverlay.

const $ = (id) => document.getElementById(id);

/**
 * Wires the "How to play" sheet: the opener button shows it, the backdrop
 * dismisses it.
 *
 * The backdrop is a full-screen layer, so it blocks board taps while the sheet
 * is open and no separate interaction guard is needed.
 *
 * `onOpen` and `onClose` exist for a game that must suspend something while the
 * sheet covers the board — doodle-on holds its 30-second timer. They are hooks
 * rather than a second pair of listeners in the game because whatever closes
 * the sheet next (an Escape key, a close button) has to run them too, and a
 * game-side listener on the backdrop would silently stop covering every case.
 *
 * Returns { open, close } for a game that needs to drive the sheet itself.
 */
export function initHowto({ onOpen, onClose } = {}) {
  const sheet = $("howtoSheet");
  const backdrop = $("howtoBackdrop");

  const open = () => {
    sheet.classList.add("show");
    backdrop.classList.add("show");
    onOpen?.();
  };

  const close = () => {
    sheet.classList.remove("show");
    backdrop.classList.remove("show");
    onClose?.();
  };

  $("howtoBtn").addEventListener("click", open);
  backdrop.addEventListener("click", close);

  return { open, close };
}

/**
 * Wires the share button.
 *
 * `payload()` is called per click, so a game can describe the run that just
 * ended rather than the one that was loaded. It returns `{ text, url }`, or a
 * promise of one, or null to cancel. `url` is optional: word-steps puts its
 * link inside the text, because its share is a multi-line ladder result.
 *
 * `title` is the share sheet's title, which is the game's name.
 *
 * The system share sheet first, the clipboard as the fallback. Both failures
 * are swallowed: a share sheet the player dismissed is not an error, and a
 * clipboard the browser refused leaves nothing useful to say.
 *
 * The confirmation wording lives in each page's #shareNote element rather than
 * in an argument here, so changing "Link copied" is an HTML edit.
 */
export function initShare({ title, payload }) {
  const button = $("shareBtn");
  const note = $("shareNote");

  button.addEventListener("click", async () => {
    const result = await payload();
    if (!result) return;

    const { text, url } = result;

    if (navigator.share) {
      // .catch, not try/catch around await: a dismissed share sheet rejects,
      // and that must not abort anything the caller does after this.
      navigator.share(url ? { title, text, url } : { title, text }).catch(() => {});
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url ? `${text} ${url}` : text)
        .then(() => note.classList.add("show"))
        .catch(() => {});
    }
  });
}

/**
 * Binds an overlay element, returning the two calls that move it.
 *
 * Takes an element rather than finding one, because bubble-tap has two: its end
 * card and its pause screen.
 *
 * `show()` clears any share note inside the overlay before revealing it. That
 * pairing is the reason this is shared at all — it was duplicated in five games
 * and missing from two, which is how "Link copied" survived into the next
 * round's end card.
 *
 * A game fills its own text first and calls show() last. Anything else a
 * particular end card has to reset — a badge, a global-best line, a won class —
 * stays in that game's own showOverlay/hideOverlay wrapper.
 */
export function bindOverlay(el) {
  return {
    show() {
      el.querySelector(".share-note")?.classList.remove("show");
      el.classList.add("show");
    },
    hide() {
      el.classList.remove("show");
    },
    get open() {
      return el.classList.contains("show");
    },
  };
}
