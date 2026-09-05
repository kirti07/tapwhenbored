/* The three page-shell behaviours every game had its own copy of: the how-to
 * sheet, the share flow, and the end card.
 *
 * Deliberately three functions and no more. There is a strong pull to grow a
 * file like this into a game engine with a lifecycle and a spreading options
 * object; the games are supposed to stay independent, so this only standardises
 * the edges that were already identical eight times over.
 *
 * The end card is the reason this exists at all. It was never a dialog in any
 * game: the board behind it kept its place in the tab order and the
 * accessibility tree, the restart and how-to controls stayed clickable through
 * it, focus never moved, and Escape did nothing. bindOverlay() fixes all four
 * without touching a single line of game logic — it watches the class the game
 * already toggles rather than asking every game to call a new API. That keeps
 * the diff in each game to one import and one call.
 *
 * On focus destination: it goes to the replay control, never to a text field.
 * The end card is for reading, not for asking. A player who finishes and hits
 * Enter should be playing again, not filling something in.
 */

var FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusable(root) {
  var all = root.querySelectorAll(FOCUSABLE);
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    /* offsetParent is null for anything display:none. The end card is shown
       with opacity, so its buttons are laid out and this keeps them. */
    if (el.offsetParent !== null || el === document.activeElement) out.push(el);
  }
  return out;
}

/* Focus without yanking the page around. An end card is already in view, and
   preventScroll stops a stray scroll offset on a document base.css keeps
   scrollable. */
function focusSafely(el) {
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { /* ignore */ } }
}

/* Keep Tab inside `root` while it is open. */
function trap(root, e) {
  if (e.key !== "Tab") return;
  var items = focusable(root);
  if (!items.length) { e.preventDefault(); return; }
  var first = items[0];
  var last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
    e.preventDefault();
    focusSafely(last);
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    focusSafely(first);
  }
}

/* `inert` removes a subtree from hit-testing, the tab order and the
   accessibility tree in one attribute — which is exactly the set of things the
   old opacity-plus-pointer-events overlays got wrong. Baseline since 2023;
   where it is missing the aria-hidden fallback still hides the board from a
   screen reader, and the overlay's own backdrop still covers it visually. */
function setInert(target, value) {
  if (!target) return;
  /* Accepts one element or several. Most games can make a single `.stage`
     inert because the end card is its sibling; bubble-tap keeps its overlays
     *inside* the page wrapper, so it names the siblings to freeze instead. */
  var list = target.length !== undefined && !target.tagName ? target : [target];
  for (var i = 0; i < list.length; i++) {
    var el = list[i];
    if (!el) continue;
    if (value) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    } else {
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    }
  }
}

/**
 * Give an existing end-card element real dialog semantics.
 *
 * Watches the class the game already toggles, so game code is unchanged.
 *
 *   bindOverlay(document.getElementById("overlay"), {
 *     primary: againBtn,          // where focus lands, and what Enter activates
 *     inertRoot: document.querySelector(".stage"),
 *     label: "Puzzle complete",
 *   });
 *
 * `openWhen` exists for bubble-tap, whose overlay is shown by *removing* a
 * class rather than adding one.
 */
export function bindOverlay(el, opts) {
  if (!el) return { isOpen: function () { return false; } };
  opts = opts || {};

  var inertRoot = opts.inertRoot || document.querySelector(".stage");
  var openWhen = opts.openWhen || function () { return el.classList.contains("show"); };
  var open = false;
  var returnTo = null;

  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  if (opts.label) el.setAttribute("aria-label", opts.label);
  else if (opts.labelledBy) el.setAttribute("aria-labelledby", opts.labelledBy);
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");

  function primary() {
    if (typeof opts.primary === "function") return opts.primary();
    if (opts.primary) return opts.primary;
    var items = focusable(el);
    return items.length ? items[0] : el;
  }

  function onKeydown(e) {
    if (!open) return;
    if (e.key === "Escape") {
      /* Dismiss the card, not the game. The board underneath is a finished
         puzzle worth looking at, and the topbar controls come back live —
         which is why this is not a trap even though nothing else closes it. */
      if (opts.onEscape) opts.onEscape();
      else close();
      return;
    }
    trap(el, e);
  }

  function close() {
    if (opts.hide) opts.hide();
    else el.classList.remove("show");
    /* The observer fires on that class change and runs sync(). */
  }

  function activate() {
    if (open) return;
    open = true;
    returnTo = document.activeElement;
    setInert(inertRoot, true);
    document.addEventListener("keydown", onKeydown, true);
    /* One frame, so the element is painted and focusable before we move to it;
       focusing mid-transition is what makes some browsers scroll the page. */
    requestAnimationFrame(function () {
      if (open) focusSafely(primary());
    });
  }

  function deactivate() {
    if (!open) return;
    open = false;
    setInert(inertRoot, false);
    document.removeEventListener("keydown", onKeydown, true);
    /* Only pull focus back if it is still inside the card we are closing —
       otherwise we would steal it from whatever the player just clicked. */
    if (returnTo && el.contains(document.activeElement)) focusSafely(returnTo);
    returnTo = null;
  }

  function sync() {
    if (openWhen()) activate();
    else deactivate();
  }

  new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ["class"] });
  sync();

  return {
    isOpen: function () { return open; },
    refresh: sync,
    close: close,
  };
}

/**
 * The "How to play" bottom sheet: open, close, Escape, focus trap, return
 * focus. Previously eight copies that could only be closed by clicking the
 * backdrop.
 *
 *   initHowto({ btn: howtoBtn, sheet: howtoSheet, backdrop: howtoBackdrop });
 */
export function initHowto(opts) {
  var btn = opts.btn;
  var sheet = opts.sheet;
  var backdrop = opts.backdrop;
  if (!btn || !sheet) return { open: function () {}, close: function () {} };

  var open = false;
  var returnTo = null;
  /* Same treatment as the end card. The backdrop already blocks pointers and
     the trap already holds Tab, but neither stops a screen reader swiping
     through the board behind an open sheet. */
  var inertRoot = opts.inertRoot || document.querySelector(".stage");

  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  var title = sheet.querySelector(".howto-title");
  if (title) {
    if (!title.id) title.id = "howtoTitle";
    sheet.setAttribute("aria-labelledby", title.id);
  }
  if (!sheet.hasAttribute("tabindex")) sheet.setAttribute("tabindex", "-1");
  btn.setAttribute("aria-expanded", "false");

  function onKeydown(e) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    trap(sheet, e);
  }

  function openSheet() {
    if (open) return;
    open = true;
    returnTo = document.activeElement;
    sheet.classList.add("show");
    if (backdrop) backdrop.classList.add("show");
    btn.setAttribute("aria-expanded", "true");
    /* Timed games stop their clock while the rules are up — reading how to
       play must not cost the player their round. */
    if (opts.onOpen) opts.onOpen();
    setInert(inertRoot, true);
    document.addEventListener("keydown", onKeydown, true);
    requestAnimationFrame(function () {
      if (open) focusSafely(focusable(sheet)[0] || sheet);
    });
  }

  function close() {
    if (!open) return;
    open = false;
    sheet.classList.remove("show");
    if (backdrop) backdrop.classList.remove("show");
    btn.setAttribute("aria-expanded", "false");
    if (opts.onClose) opts.onClose();
    setInert(inertRoot, false);
    document.removeEventListener("keydown", onKeydown, true);
    focusSafely(returnTo || btn);
    returnTo = null;
  }

  btn.addEventListener("click", openSheet);
  if (backdrop) backdrop.addEventListener("click", close);

  return { open: openSheet, close: close, isOpen: function () { return open; } };
}

/**
 * The share flow: Web Share where it exists, clipboard otherwise, and a
 * confirmation line that announces itself and then goes away again.
 *
 *   initShare({ btn: shareBtn, note: shareNote, text: function () { ... } });
 *
 * `text` is called at click time, not at bind time, so it sees the finished
 * score rather than whatever the board held when the page loaded.
 */
/**
 * The share confirmation line.
 *
 * Two bugs lived in the eight hand-rolled copies of this. It was a silent
 * visual change — no game gave the line an aria-live region, so a screen
 * reader user pressed Share and was told nothing at all. And it never reset:
 * it appeared on the first share and stayed up until the next time the end
 * card was shown, so a second share produced no feedback whatsoever.
 *
 * Exported separately from initShare() because two games (word-steps builds a
 * multi-line result, doodle-on shares a PNG) have genuinely different share
 * logic worth keeping, and only need the note.
 */
export function createNote(note) {
  var timer = 0;

  if (note) {
    /* polite, not assertive: this is a confirmation, not a warning, and it
       must not interrupt whatever the reader is already saying. */
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
  }

  function show(message) {
    if (!note) return;
    if (message) note.textContent = message;
    note.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(function () { note.classList.remove("show"); }, 2400);
  }

  function hide() {
    if (!note) return;
    clearTimeout(timer);
    note.classList.remove("show");
  }

  return { show: show, hide: hide };
}

export function initShare(opts) {
  var btn = opts.btn;
  var note = opts.note;
  if (!btn) return;

  var confirmNote = createNote(note);
  var confirm = confirmNote.show;

  function shareUrl() {
    if (opts.url) return opts.url();
    var url = new URL(location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  btn.addEventListener("click", function () {
    var text = typeof opts.text === "function" ? opts.text() : opts.text || "";
    var url = shareUrl();

    if (navigator.share) {
      navigator
        .share({ title: opts.title || document.title, text: text, url: url })
        /* A completed native share needs no confirmation line — the sheet the
           player just used is the confirmation. Only a cancel lands in catch,
           and that deserves silence too. */
        .catch(function () {});
      return;
    }

    var payload = text ? text + " " + url : url;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(payload)
        .then(function () { confirm(opts.copiedText || "Link copied"); })
        /* Never claim a copy that did not happen. A share button that lies is
           worse than one that does nothing. */
        .catch(function () { confirm("Press and hold to copy"); });
      return;
    }
    confirm("Press and hold to copy");
  });

  return { confirm: confirm };
}
