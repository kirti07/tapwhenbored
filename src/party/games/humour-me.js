/* Humour Me, the party page's part: the write box and the reveal.
 *
 * The round is Doodle On's, with a line of text instead of a drawing: the
 * party page runs the title card, the clock, the waiting sheet and the
 * anonymous vote; the server keeps who wrote what until the final. This
 * module draws what is Humour Me's own. Loaded only when a room picks it.
 */

import { PROMPTS } from "./humour-prompts.js";
import "./humour-me.css";

const MAX = 100;
const phrase = (room) => PROMPTS[room.prompt] || PROMPTS[0];
const blankOut = (text) => text.replace("___", "______");

/** The title card: the phrase, and how long there is to write and vote. */
export function title(room, voteSec) {
  return [blankOut(phrase(room)), `${room.cap} sec to write`, `${voteSec} sec to vote`];
}

let form = null; // { code, root, faces } while this phone is writing

/** The write box while this phone has not answered (`open`), else nothing. */
export function play(slot, { room, me, act, own, el, face, fresh }, open) {
  if (!open || form?.code !== room.code) {
    form?.root.remove();
    form = null;
  }
  if (!open) return;
  if (!form) {
    const root = el("form", "hm-write");
    const card = el("div", "hm-prompt");
    card.append(el("p", "hm-k arc-pix", "Finish the phrase"), el("p", "hm-phrase", blankOut(phrase(room))));
    const box = el("textarea", "hm-input");
    box.maxLength = MAX;
    box.rows = 3;
    box.placeholder = "Make us regret asking…";
    box.setAttribute("aria-label", "Your ending");
    box.enterKeyHint = "send";
    const count = el("span", "hm-count arc-mono", `0 / ${MAX}`);
    box.addEventListener("input", () => { count.textContent = `${box.value.length} / ${MAX}`; });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); root.requestSubmit(); }
    });
    const go = el("button", "arc-btn arc-btn--primary party-cta", "Submit answer");
    go.type = "submit";
    const err = el("p", "party-err");
    err.setAttribute("role", "alert");
    const faces = el("ul", "hm-faces");
    root.append(card, box, count, err, go, el("p", "arc-label", "Locked in"), faces);
    root.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (go.disabled || !box.value.trim()) return;
      go.disabled = true;
      const data = await act("answer", { text: box.value }, err);
      if (data?.tag) own(data.tag);
      go.disabled = false;
    });
    slot.appendChild(root);
    form = { code: room.code, root, faces };
    box.focus();
  }
  if (!fresh) return;
  // Who is locked in — faces only, never what they wrote.
  form.faces.textContent = "";
  for (const p of room.players.filter((x) => x.kickedAt == null && x.joinedAt < room.start)) {
    const li = el("li", room.results[p.seat] ? "is-in" : "");
    li.append(el("span", "hm-face", face(p.emoji)), el("span", "", p.seat === me.seat ? "You" : p.name));
    form.faces.appendChild(li);
  }
}

/** The reveal: the winning line big, then every answer with its votes. */
export function final(box, { room, el, face, nameOf, plural }, finishers) {
  box.textContent = "";
  const byseat = Object.fromEntries((room.tally || []).map((d) => [d.seat, d]));
  const who = (seat) => `${face(room.players.find((p) => p.seat === seat).emoji)} ${nameOf(seat)}`;
  if (finishers.length < 3) {
    box.appendChild(el("p", "hm-none", "Fewer than three answers came in, so there was nothing to vote on."));
    return ["Not enough answers.", blankOut(phrase(room))];
  }
  const [top] = finishers;
  const win = el("div", "hm-win");
  win.append(
    el("p", "hm-k arc-pix", "Most votes"),
    el("p", "hm-was", blankOut(phrase(room))),
    el("p", "hm-line", `“${byseat[top.seat].text}”`),
    el("p", "hm-by", `${who(top.seat)} · ${plural(top.votes, "vote")}`),
  );
  const list = el("ul", "hm-list");
  for (const x of finishers.slice(1)) {
    const li = el("li");
    li.append(el("span", "hm-who", who(x.seat)), el("span", "hm-text", byseat[x.seat].text), el("span", "hm-votes arc-mono", plural(x.votes, "vote")));
    list.appendChild(li);
  }
  box.append(win, list);
}
