/* Shared page-shell behaviours: the end card dialog, the how-to sheet and the
 * share flow. Deliberately not a game engine; games stay independent.
 * End-card focus goes to the replay control, never a text field: Enter replays.
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
    /* offsetParent is null for display:none; the end card uses opacity. */
    if (el.offsetParent !== null || el === document.activeElement) out.push(el);
  }
  return out;
}

function focusSafely(el) {
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { /* ignore */ } }
}

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

/**
 * Everything in the stage except the top bar, which must stay live (the how-to
 * sheet has no close control of its own). `inert` cannot be undone on a
 * descendant, so the children are marked one at a time. Captured at bind time.
 */
function stageBehindTopbar() {
  var stage = document.querySelector(".stage");
  if (!stage) return null;

  var out = [];
  for (var i = 0; i < stage.children.length; i++) {
    var el = stage.children[i];
    if (!el.classList.contains("topbar")) out.push(el);
  }
  return out;
}

/* aria-hidden is the fallback where `inert` is unsupported. Accepts one
   element or a list. */
function setInert(target, value) {
  if (!target) return;
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
 * Give an existing end-card element dialog semantics by watching the class the
 * game already toggles.
 *
 *   bindOverlay(document.getElementById("overlay"), {
 *     primary: againBtn,          // where focus lands, and what Enter activates
 *     inertRoot: [board, banner],  // optional; defaults to the stage
 *                                  // minus its top bar
 *     label: "Puzzle complete",
 *   });
 *
 * `openWhen` exists for bubble-tap, whose overlay is shown by *removing* a
 * class rather than adding one.
 */
export function bindOverlay(el, opts) {
  if (!el) return;
  opts = opts || {};

  var inertRoot = opts.inertRoot || stageBehindTopbar();
  var openWhen = opts.openWhen || function () { return el.classList.contains("show"); };
  var open = false;
  var returnTo = null;

  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  if (opts.label) el.setAttribute("aria-label", opts.label);
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");

  function onKeydown(e) {
    if (!open) return;
    if (e.key === "Escape") {
      /* Dismiss the card, not the game: the finished board is worth seeing. */
      close();
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
    /* Wait a frame: focusing mid-transition scrolls the page in some browsers. */
    requestAnimationFrame(function () {
      if (open) focusSafely(opts.primary);
    });
  }

  function deactivate() {
    if (!open) return;
    open = false;
    setInert(inertRoot, false);
    document.removeEventListener("keydown", onKeydown, true);
    /* Only restore focus if it is still inside the card, so we do not steal it. */
    if (returnTo && el.contains(document.activeElement)) focusSafely(returnTo);
    returnTo = null;
  }

  function sync() {
    if (openWhen()) activate();
    else deactivate();
  }

  new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ["class"] });
  sync();
}

/**
 * The "How to play" bottom sheet: open, close, Escape, focus trap, return focus.
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
  /* Inert so a screen reader cannot swipe through the board behind the sheet. */
  var inertRoot = opts.inertRoot || stageBehindTopbar();

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
    /* Timed games pause here so reading the rules does not cost the round. */
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
 * The share confirmation line: a polite live region that hides itself again.
 * Exported for games with their own share logic (word-steps, doodle-on).
 */
export function createNote(note) {
  var timer = 0;

  if (note) {
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

  return { show: show };
}

/**
 * The share flow: Web Share where it exists, clipboard otherwise.
 *
 *   initShare({ btn: shareBtn, note: shareNote, text: function () { ... } });
 *
 * `text` is called at click time so it sees the finished score.
 */
export function initShare(opts) {
  var btn = opts.btn;
  var note = opts.note;
  if (!btn) return;

  var confirm = createNote(note).show;

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
      /* Omit an empty `url`: word-steps puts its link in the text. */
      var shareData = { title: opts.title || document.title, text: text };
      if (url) shareData.url = url;
      navigator
        .share(shareData)
        /* The native sheet is its own confirmation; a cancel stays silent. */
        .catch(function () {});
      return;
    }

    var payload = text && url ? text + " " + url : text || url;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(payload)
        .then(function () { confirm("Link copied"); })
        /* Never claim a copy that did not happen. */
        .catch(function () { confirm("Press and hold to copy"); });
      return;
    }
    confirm("Press and hold to copy");
  });
}
