# Leaderboards, identity capture and registration for tiny casual web games

Research brief for **Tap When Bored** (tapwhenbored.com) — 8 single-player browser
games, MPA, vanilla JS/CSS, ~50 kB gzip JS budget per page, light+dark, mobile-first.
Today: one anonymous "global best" number per game on the end card, via a Supabase RPC.
Wanted: per-game leaderboards, name+email capture at the end of a game, an optional
registration path — playful but very stable, consistent across 8 games and the homepage.

Method: web research against live products and their docs/forums, September 2026.
Claims marked **(from memory)** could not be re-verified with a live fetch in this pass
and come from prior knowledge — treat those as "probably true, verify before betting on it."

---

## 1. Reference products

Eighteen products, chosen to span the whole spectrum from "no identity at all" to
"account required to even play". For each: where the leaderboard lives, what identity
it costs, when the ask happens, how friction is avoided, playful touches.

### 1.1 Monkeytype — the "account is the leaderboard" end of the scale
- **Leaderboard surface:** a dedicated `/leaderboards` page (English 15s / 60s, all-time
  and daily), plus your PB shown inline on the result screen after every test.
- **Identity required:** a full account, *and* a qualification threshold — "your account
  must have 2 hours typed to be placed on the leaderboard", and your WPM must beat the
  lowest score currently on the 1000-slot board.
- **When asked:** never interrupts. You can type forever anonymously; the result screen
  shows a small persistent "sign in to save your result" line.
- **Friction avoidance:** the test itself never blocks. Nothing modal. The board is a
  *destination*, not an interruption.
- **Playful touches:** the whole surface is a theme playground (hundreds of themes),
  and the result screen animates a graph rather than shouting. Playfulness lives in
  customisation, not in confetti.
- **Lesson for TWB:** a leaderboard with a *qualification bar* keeps the board meaningful
  and quietly answers "why isn't my score there" — but you must tell people the bar
  exists; Monkeytype's own community repeatedly asks "how do I qualify?", which is a
  documented UX failure (two separate GitHub discussions on exactly this).
- https://monkeytype.com/leaderboards ·
  https://github.com/monkeytypegame/monkeytype/discussions/1460 ·
  https://github.com/monkeytypegame/monkeytype/discussions/5307

### 1.2 Human Benchmark — the canonical "score → percentile → optional save" flow
- **Leaderboard surface:** end-of-test card shows your raw number, a percentile
  ("you were faster than 62% of people"), and a distribution histogram; a separate
  leaderboard page holds all-time tops per test.
- **Identity required:** nothing to play or to see your percentile. To appear on the
  board you "take any test, then submit your score with a username and country when
  prompted." A free account (email) syncs history across sessions.
- **When asked:** *after* the result is already shown and already meaningful. The
  percentile is the reward; the account is an upsell on top of a reward already given.
- **Friction avoidance:** all 30 tests are fully playable without an account; the
  account only adds history + board placement.
- **Playful touches:** the histogram with "you are here" marker is the single most
  copied pattern in this whole space — it converts a bare number into a story.
- **Lesson for TWB:** *give the meaning before you ask for the identity.* A percentile
  or "better than 74% of players today" line costs one extra number from the RPC and
  buys enormous willingness to type a name.
- https://humanbenchmark.com/ · (mirror descriptions of the flow:
  https://humanbenchmark.now/features · https://humanbenchmark.now/leaderboard —
  note these are clone sites, treat copy as indicative, not canonical)

### 1.3 Lichess Puzzle Storm / Puzzle Racer — deliberately *no* leaderboard
- **Leaderboard surface:** none, on purpose. You see your best score today, and your
  all-time best is shown on your own profile page.
- **Identity required:** none to play; a Lichess account to have the score persisted
  to a profile. Anonymous play is allowed and anonymous players were observed topping
  community-built unofficial boards.
- **Rationale, in their words:** "where there is a leaderboard, there is cheating",
  and they don't consider moderating it a good use of resources.
- **Playful touches:** the combo bar / speed-run pressure carries all the motivation
  that a leaderboard would otherwise carry.
- **Lesson for TWB:** this is the honest counter-argument to the whole project. A
  client-side single-player game *cannot* produce trustworthy scores. Either (a) accept
  a "for fun, lightly policed" board and say so in the copy, or (b) scope the board to
  something cheap-to-verify (daily puzzle with a fixed seed, move-count verification
  server-side). Do not pretend it's a competitive ranking.
- https://lichess.org/page/storm · https://lichess.org/page/racer ·
  https://lichess.org/forum/general-chess-discussion/puzzle-stormracer-leaderboard ·
  https://lichess.org/forum/lichess-feedback/puzzle-racer-anonymous-accounts

### 1.4 TypeRacer — guest play that saves nothing
- **Leaderboard surface:** per-text and global boards, plus a "Pit Stop" profile page.
- **Identity required:** an account, full stop. "If you play as a guest… the app won't
  save any of your scores and there will be no records of any of your races."
  Display names are not changeable after creation.
- **When asked:** you race first as `guest`, and the loss is felt immediately.
- **Friction avoidance:** almost none — this is the *harsh* version. It works because
  TypeRacer is a habit product with real competitive stakes.
- **Lesson for TWB:** the "you just lost that score" moment is powerful, but only
  ethical if you warn beforehand. TWB should never discard a score it could have kept
  locally. Store the score locally *first*, then offer to publish it.
- https://typeracer.fandom.com/wiki/TypeRacer_accounts · https://data.typeracer.com/pit/profile?user=guest

### 1.5 GeoGuessr — the cautionary tale
- **Leaderboard surface:** daily challenge board, friend boards, ranked ladder.
- **Identity required:** a free account with email just to play the one free daily; the
  rest is behind Pro. GeoGuessr ended free-to-play in January 2024.
- **Consequence:** an entire ecosystem of clones exists specifically because of the
  signup+paywall (WorldGuessr, EarthGuessr, etc.), several ranking for
  "play GeoGuessr free" — i.e. the wall *created* the competitors.
- **Lesson for TWB:** for a site whose entire promise is "tap when bored", any gate
  before play is fatal. Registration must be strictly post-hoc and strictly optional.
- https://www.geoguessr.com/ · https://www.worldguessr.com/ ·
  https://maponica.com/blog/is-geoguessr-free

### 1.6 NYT Games / Wordle — identity as *continuity*, not as competition
- **Leaderboard surface:** none public. The "board" is your own stats modal: played,
  win %, current streak, max streak, guess distribution.
- **Identity required:** a free NYT account to view stats and to sync a streak across
  devices. Wordle originally kept everything in `localStorage`; NYT moved stats behind
  a free account.
- **When asked:** at the end of the daily, inside the stats modal — "Log in or create a
  free account", with Google/Facebook/Apple as one-tap options.
- **The pitch is loss aversion:** your streak is at risk if you don't sign in. Real
  incidents of lost streaks during the NYT migration are widely reported, which is
  exactly what makes the pitch land.
- **Playful touches:** the share-emoji-grid — the single highest-leverage playful
  artifact any daily puzzle has ever shipped, and it requires no identity at all.
- **Lesson for TWB:** the strongest reason a casual player gives an email is
  *"so I don't lose this"*, not *"so I can be #4"*. Word Steps (the daily) is where
  streak-continuity framing will convert best.
- https://www.pcgamer.com/games/puzzle/wordle-stats-new-york-times-account-required/ ·
  https://www.tomsguide.com/how-to/how-to-save-wordle-streak-across-devices

### 1.7 neal.fun — the "no account, ever" benchmark
- **Leaderboard surface:** mostly none; a few pieces (e.g. *Design the Next iPhone*)
  have a community board, and score-based toys (*Auction Game*) keep a local high score.
- **Identity required:** nothing. "All experiences are accessible without downloading
  anything or creating an account."
- **Design language:** minimal, uncluttered, "no navigation maze, no aggressive pop-ups,
  no dark-pattern subscription prompts", one tile + one line per experience.
- **Lesson for TWB:** neal.fun is the closest analogue to Tap When Bored's *feel*, and
  it deliberately has almost no identity layer. Whatever TWB adds must be invisible to
  a player who ignores it — the end card must still work with zero taps.
- https://neal.fun/ · https://www.thegamer.com/best-nealfun-games/

### 1.8 Sporcle — free account, per-quiz boards, results page as home base
- **Leaderboard surface:** per-quiz leaderboards for global comparison; a results page
  that shows your personal best "at the bottom of the page, along with scores from your
  Sporcle friends".
- **Identity required:** free account to record and track results; play is open.
- **Playful touches:** friend scores adjacent to your own — a *small* social circle
  beats a global top-10 for repeat motivation.
- **Lesson for TWB:** "you + people near you" is more motivating than "you + the world's
  best", and it's cheaper to render.
- https://support.sporcle.com/hc/en-us/articles/34071500816141-How-do-I-track-my-quiz-results ·
  https://www.sporcle.com/faq/

### 1.9 JKLM.fun (BombParty, PopSauce) — nickname-first, room-scoped
- **Identity required:** a nickname and a four-letter room code. Accounts exist but are
  optional; a room host can toggle "prevent non-logged-in users (Guest) from joining".
- **When asked:** before play, but it costs one field and zero validation.
- **Lesson for TWB:** the nickname box is the cheapest identity primitive that exists,
  and players *expect* it. It reads as "pick a name for the game", not as "sign up".
- https://jklm.fun/ · https://jklm.fun/faq/

### 1.10 TETR.IO — anonymous play, explicit trade stated up front
- **Identity required:** "You can play anonymously, but you won't be able to submit
  scores to the leaderboards or play in matchmaking when anonymous." Signup is
  "username, password and **optional email**".
- **Qualification bar:** 10 games before a rank/TR is shown; level 10 to enter Tetra League.
- **Lesson for TWB:** *optional email* on registration is a real, shipped pattern in
  this space. It lets you have named accounts without holding PII for people who don't
  want to give it — email becomes an opt-in recovery/notification feature, not a key.
- https://tetr.io/about/ · https://tetrio.wiki.gg/wiki/TETRA_CHANNEL

### 1.11 Slither.io / Agar.io — the nickname box as the entire onboarding
- **Surface:** a single input on the splash screen ("Nickname"), a Play button, a skin
  picker, and a live in-game top-10 overlay in the corner.
- **Identity required:** nothing; the nickname is not even unique.
- **Design intent, per the creator:** a game "suitable for all ages and with the easiest
  gameplay… people can freely play it without the constraints of in-game purchases".
- **Lesson for TWB:** the top-10 overlay that is *always visible during play* teaches
  the leaderboard's existence without a single modal. TWB's equivalent is a small
  persistent "best today: 14 moves" line on the game screen itself.
- https://agario.fandom.com/wiki/Nickname_Box

### 1.12 Cool Math Games — site-wide points, weekly reset, generated usernames
- **Leaderboard surface:** a profile leaderboard page, tabs **This Week / Last Week /
  All Time**, ranked by *completed games* (a cross-game currency, not a per-game score).
  Rows are avatar + username + number + rank, e.g. "MightyTurtle483", "FantasticCoyote689".
- **Explicit copy:** "Weekly leaderboards reset each Sunday. Rankings are updated daily."
- **Identity required:** an account; usernames are auto-generated adjective+animal+number,
  so a new player never has to invent one or hit a "name taken" error.
- **Lesson for TWB:** (a) auto-generated friendly names remove the hardest field in the
  form; (b) a weekly reset makes the board winnable for newcomers; (c) a cross-game
  "arcade points" board is a way to have *one* board across 8 games instead of 8 lonely ones.
- https://www.coolmathgames.com/profile/leaderboard · https://www.coolmathgames.com/c/high-score-games

### 1.13 Arkadium — the mainstream casual-games consent pattern
- **Surface:** per-game daily leaderboards, share-your-score, a free account that "keeps
  sign-in across visits".
- **Identity + consent:** the platform lets users "post their nickname and scores to the
  leaderboard" and *separately* offers "occasional emails about new games and special
  events" — i.e. leaderboard participation and marketing consent are two distinct choices,
  a direct consequence of their GDPR work.
- **Lesson for TWB:** this is exactly the split TWB needs. **Name → board. Email →
  notifications.** Two checkboxes-worth of intent, never bundled.
- https://www.arkadium.com/ · https://www.arkadium.com/privacy-policy/ · https://partners.arkadium.com/

### 1.14 itch.io — there is no platform leaderboard
- **Finding:** itch.io provides no built-in leaderboard; jam devs bolt on third-party
  services (Talo, Silent Wolf, hand-rolled APIs) or skip boards entirely.
- **Lesson for TWB:** there is no off-the-shelf "web game leaderboard" convention to
  inherit; every small site invents it. That is licence to design something specific,
  and a warning that players will not arrive with expectations you can lean on.
- https://itch.io/t/4469163/talo-an-open-source-backend-for-leaderboards-analytics-and-multiplayer ·
  https://itch.io/devlog/561056/you-can-use-my-leaderboards-api-now.amp

### 1.15 Duolingo Leagues — the playful-progress reference
- **Surface:** a weekly league of ~30 randomly-assigned users ranked by XP; promotion
  and demotion zones; a persistent tab in the main nav.
- **Identity required:** an account (it's a learning app), but the *mechanic* is the
  thing to steal.
- **Why it works:** pool size ~30 makes top-five plausible for anyone who shows up;
  random assignment among similar-pace users makes it feel fair; the weekly reset means
  "every week feels winnable" and prevents leaderboard fatigue.
- **Caveat, from the research literature:** the same mechanic demotivates a meaningful
  minority — a qualitative study documents learners who found leagues stressful or who
  gamed them; leaderboard design principles research recommends relative/segmented
  boards over absolute global ones.
- https://duolingo.deconstructoroffun.com/mechanics/leagues ·
  https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth ·
  https://arxiv.org/pdf/2203.16175 · https://pmc.ncbi.nlm.nih.gov/articles/PMC8097522/

### 1.16 The arcade "AAA" initials pattern — 45 years old and still legible
- **Surface:** on a qualifying score only, a full-screen "NEW HIGH SCORE — ENTER YOUR
  INITIALS" state; three character slots; joystick up/down to cycle A–Z, button to commit.
- **Origin and constraint:** Star Fire and Atari's *Asteroids* introduced initials entry;
  three characters became the 1980s standard, chosen for memory limits, input simplicity,
  and explicitly "as a way to limit obscenities in the game's attract mode".
- **Playful touches:** default table filled with AAA/BBB/CCC or staff nicknames, so the
  board is never empty; the entry screen is a *reward state* with its own music.
- **Lesson for TWB:** the 3-char cap is a free profanity mitigation *and* the most
  recognisable "you did well" signal in games. It's also the smallest possible identity:
  no keyboard needed, no validation, no uniqueness, no PII.
- https://arcadeblogger.com/2021/01/31/anatomy-of-arcade-high-score-tables/

### 1.17 Chess.com puzzles / Puzzle Rush — rating over ranking **(from memory)**
- Puzzle Rush shows a personal best per mode and a friends board; the primary feedback
  is a *rating number that moves*, not a global rank. Free account required to play more
  than a few puzzles a day.
- **Lesson for TWB:** a personal number that visibly moves (rating, streak, PB) is a
  complete motivation system on its own and needs no other player's data.

### 1.18 Daily-puzzle micro-sites: Quordle, Framed, Heardle-likes, 2048 **(from memory)**
- Overwhelmingly: **no account, no leaderboard, `localStorage` stats, and a share string.**
  The competitive layer is exported to group chats and Twitter rather than hosted.
- 2048's original open-source version keeps only a local best score; every hosted clone
  that added a leaderboard also added spam problems.
- **Lesson for TWB:** the share string is the cheapest, most playful, most viral
  "leaderboard" available, and it costs zero backend. Whatever else is built, Word Steps
  should have one.

### Cross-cutting summary of section 1

| Product | Board lives | Identity to appear | Ask happens | Playful device |
|---|---|---|---|---|
| Monkeytype | Own page | Account + 2h typed | Never interrupts | Themes |
| Human Benchmark | End card + page | Username (+country) | After result shown | Percentile histogram |
| Lichess Storm | Nowhere | — | Never | Combo bar |
| TypeRacer | Own page | Account | After a wasted guest race | Race track |
| GeoGuessr | Own page | Account (email) | Before play | Map reveal |
| Wordle/NYT | Private stats | Free account | End of daily | Emoji share grid |
| neal.fun | Rarely | None | Never | The toy itself |
| Sporcle | Per-quiz + results | Free account | After quiz | Friends' scores inline |
| JKLM.fun | In-room | Nickname | Before play, 1 field | Room codes |
| TETR.IO | Own page | Account, email optional | Stated up front | Rank letters D→X+ |
| Slither.io | In-game overlay | Nickname, non-unique | Before play, 1 field | Skins |
| Cool Math | Site-wide page | Auto-generated username | At account creation | Weekly reset |
| Arkadium | Per-game daily | Nickname; email separate | After game | Share score |
| itch.io | n/a | n/a | n/a | n/a |
| Duolingo | Nav tab | Account | n/a | Leagues, promotion zone |
| Arcade AAA | Attract-mode table | 3 characters | Only on a qualifying score | Entry screen as reward |
| Chess.com | Personal best | Free account | Soft daily limit | Rating delta |
| Daily micro-sites | Group chat | None | Never | Share string |

**The three clusters:**
1. **No identity** (neal.fun, Lichess, dailies) — safest, cheapest, zero conversion.
2. **Nickname-only** (Slither, JKLM, arcade, Arkadium's board) — one field, no PII,
   playful, immediately understood. *This is where a site like TWB belongs by default.*
3. **Account-gated** (Monkeytype, TypeRacer, GeoGuessr, TETR.IO, Cool Math, NYT) —
   only justified when there is cross-session progress worth protecting.

TWB has exactly one asset in cluster 3: the **Word Steps streak**. Everything else is
cluster 2.

---

## 2. The "submit your score" moment

### 2.1 Nickname-only vs name+email — pick per outcome, not per form
The shipped products split cleanly:

| Asked for | Who does it | What it buys you | Cost |
|---|---|---|---|
| Nothing | neal.fun, dailies, Lichess | Zero friction | No board |
| 3 initials | Arcade cabinets | A board, instantly | Nothing; not addressable |
| Nickname | Slither, JKLM, Arkadium board | A board with personality | Duplicate names, moderation |
| Nickname + email | Arkadium's optional opt-in | Board + a way to reach them | Consent obligations |
| Account | Monkeytype, TypeRacer, NYT | Cross-device continuity | Real drop-off |

The mistake to avoid is asking for email *in order to appear on the leaderboard*. Under
GDPR that is arguably invalid consent — "agreement stops being free when someone has to
accept marketing to get something the marketing has nothing to do with"
(https://wisepops.com/blog/email-popups-gdpr). Arkadium's split is the correct model:
**nickname posts your score; email is a separate, optional, clearly-labelled thing.**

### 2.2 The value exchange that actually works for email
Ranked by how well the exchange holds up for a site like TWB:

1. **"We'll tell you when someone beats it."** Specific, game-shaped, non-marketing,
   genuinely useful, and it creates a return visit — the strongest ask available.
   Requires: a per-row watcher and a transactional send. Low volume, high relevance.
2. **"Keep your streak if you change phones."** Wordle's proven pitch; only credible
   for Word Steps. Loss aversion beats aspiration in every casual-games example found.
3. **"Claim this spot"** — i.e. the email is what stops someone else typing your
   nickname. Framed as ownership, not as contact.
4. **"New game every month"** — plain newsletter. Weakest, but honest; keep it as a
   secondary unchecked checkbox, never the headline.

Avoid: "subscribe for tips", "join the community", and anything that reads as a mailing
list dressed as a game feature.

### 2.3 Progressive disclosure — initials first, email second
The pattern that fits both the arcade lineage and modern form research:

- **Step 1 (inline, in the end card):** three-to-twelve character name field +
  a single primary button. No email visible. Submitting *completes the job* — the score
  is on the board and the row highlights.
- **Step 2 (after success, same card, no new surface):** a quiet second line —
  "Want to know if someone beats 14 moves? [email] [Notify me]" — with an explicit
  "no thanks" that is a real, equally-sized target, not grey micro-text.
- Never show both fields at once on first submit. Two fields reads as a signup form;
  one field reads as part of the game.

### 2.4 Surface: inline end card > modal > separate page
- **Inline in the end card** is right for TWB. The end card already exists in all 8
  games, it is where the number and the "play again" button live, and it avoids the
  focus-trap, scroll-lock and back-button problems modals bring.
- **Modal** is justified only for the leaderboard *view* (a long list needs its own
  scroll container) and only if it is properly trapped, escapable, and returns focus.
- **Separate page** (`/leaderboard`) is worth having as a canonical destination for
  links and SEO, but must never be the only path — a player who finishes a game should
  not have to navigate to feel the result.
- Critical for TWB's "very stable" requirement: **the name field must occupy its space
  before it is needed**. Reserve the row's height in the end card layout from the start
  so nothing reflows when the field or the success row appears.

### 2.5 Validation and error states
- Validate on **submit**, not on keystroke; show errors on blur only after a first
  failed submit.
- Name: trim, collapse whitespace, cap length (3 for an arcade direction, 12–16 for a
  nickname direction), allow letters/digits/space and a small emoji set or none at all.
  Never enforce uniqueness — Slither.io doesn't, and "name taken" is the single most
  demoralising error in this flow.
- Email: accept anything with an `@` and a dot; do not regex-police. Show a
  "did you mean gmail.com?" style typo hint rather than a rejection.
- Network failure is the common case, not the edge case: on failure keep the score in
  `localStorage`, show "Saved locally — we'll post it next time", and retry silently on
  the next page load. Never lose the player's number because a request failed.
- Every error message names the fix, not the rule: "Names are 12 letters or fewer" not
  "Invalid input".

### 2.6 Remember identity so it is a one-time ask
- On first successful submit, write `{name, playerId}` to `localStorage` under one
  shared key across all 8 games (this is genuine platform infrastructure, so it belongs
  in shared code).
- Every subsequent end card then shows **"Posting as Nikhil · change"** with a one-tap
  primary "Post score" — zero typing from the second game onward. This is the single
  biggest friction reduction available and costs ~15 lines.
- Keep a client-generated `playerId` (crypto.randomUUID) separate from the name, so a
  rename does not orphan past scores and so "your rows" can be highlighted on the board.
- Treat `localStorage` as lossy: private windows, cleared data, other devices. The
  account path (§3) exists precisely to recover from that.

### 2.7 Non-record scores — do you still ask?
Three viable policies, in order of how well they fit TWB:

- **Always offer, never nag (recommended).** Show the post-score control on every end
  card, pre-filled once known, one tap. Rationale: with 8 games and low session depth,
  gating on "record only" would mean most players never see the feature exist.
- **Record-only prompt (arcade).** Maximum drama, and matches the AAA lineage — but on
  a solitaire-style game most players' first result is also their personal best, so the
  "record" signal degrades quickly unless it means *global* top-N.
- **Personal-best-only prompt.** Middle ground: prompt when you beat *your own* stored
  best. This is honest, works offline, and produces a natural cadence.

Whatever you choose, always show *where the score landed* ("#137 today") even when it
isn't a record — Human Benchmark's percentile line proves a non-record result can still
feel like an outcome.

### 2.8 Anti-spam, profanity, rate limiting — the minimum that is not theatre
- **Accept that client-side scores are unverifiable.** Lichess declined leaderboards for
  exactly this reason. Say "for fun" in the UI, and design so a fake score is boring
  rather than valuable (no prizes, weekly resets, per-game boards).
- **Profanity:** the 3-character cap is itself the original mitigation
  (https://arcadeblogger.com/2021/01/31/anatomy-of-arcade-high-score-tables/). For longer
  nicknames, a server-side denylist checked before insert is the standard cheap approach;
  keep it server-side so the list is not shipped in a 50 kB budget, and accept it will be
  imperfect. Offer a report link on the board rather than pretending the filter is complete.
- **Rate limiting:** per-IP and per-`playerId` insert limits in the Supabase RPC
  (e.g. 1 submit / 5s, 30 / hour), plus a plausibility clamp per game (a 15-puzzle
  solved in 4 moves is impossible — reject on the server, not the client).
- **Bot floor:** require a minimum elapsed play time and a same-session token issued when
  the game started. Cheap, catches scripts, invisible to humans.
- **Moderation escape hatch:** a `hidden` boolean column and a way for you to flip it.
  That plus a denylist is a complete moderation stack for a site this size.

### 2.9 Consent wording — the GDPR/CAN-SPAM minimum for a small indie site
- **Legal basis for a newsletter is consent**, which must be "freely given, specific,
  informed and unambiguous… by a clear affirmative action". Pre-ticked boxes and silence
  are worth nothing. (https://wisepops.com/blog/email-popups-gdpr,
  https://www.termsfeed.com/blog/gdpr-email-newsletters/)
- **Do not bundle.** Leaderboard placement must not be conditional on marketing consent.
- **Double opt-in is not required by GDPR**, but Germany requires it and it is treated as
  best practice for evidencing consent
  (https://securiti.ai/double-opt-in/, https://www.termsfeed.com/blog/gdpr-double-opt-in-email-marketing/).
  For TWB: **skip double opt-in for a purely transactional "notify me when beaten" email**
  (that is service, not marketing), and **use double opt-in for the newsletter checkbox**
  — it is one extra email and it permanently settles the evidence question.
- **CAN-SPAM** applies to the marketing mail: a working unsubscribe that a normal person
  can find and use, honoured within 10 business days, plus a valid physical postal address
  (a registered PO box or private mailbox counts) in the footer. Penalties are per-message.
  (https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- **Wording that works and stays playful** (each is one line, under the field):
  - *"We'll only email you if someone beats your score. Nothing else, ever."*
  - *"☐ Also tell me when a new game lands (about once a month)."* — unticked.
  - *"Your name goes on the board. Your email doesn't."* — this sentence alone resolves
    most of the trust objection, and it is a design constraint you should actually honour.
- Link a short plain-language privacy note from the end card; one page, no cookie banner
  needed if you keep to first-party storage and no third-party analytics.

---

## 3. Registration patterns for tiny sites

### 3.1 When registration is worth it at all
Only when there is **something to lose**. Every account-gated product in §1 protects a
continuity asset: a streak (NYT), a rating (chess.com, TETR.IO), a PB history
(Monkeytype), race records (TypeRacer). TWB's only such asset today is the Word Steps
streak — plus, once boards exist, "the name on row 4 is mine".

Verdict: **do not build registration first.** Build the soft account. Add registration
only as the recovery mechanism for the two things localStorage can lose.

### 3.2 The soft account (recommended default)
- `playerId` (UUID) + `name`, in `localStorage`, shared across all 8 games.
- Player sees it as "You're playing as **Nikhil**" — never as "account".
- Costs nothing, works offline, needs no email, and is fully GDPR-boring.
- Cool Math's auto-generated `AdjectiveAnimal123` names are worth stealing for the empty
  state: pre-fill the field with a suggested playful name so a tap-through is possible
  and nobody stares at a blank box.

### 3.3 Upgrading a soft account: magic link, no password
Magic links are the right fit for a site with no password infrastructure and one
low-value asset. Practical constraints from current guidance
(https://supertokens.com/blog/magiclinks,
https://www.baytechconsulting.com/blog/magic-links-ux-security-and-growth-impacts-for-saas-platforms-2025):
- Tokens should be **short-lived (10–15 min) and single-use**, invalidated on first use.
- **Cross-device is the main failure mode**: link requested on phone, opened on desktop.
  Mitigate with a 6-digit code shown alongside the link ("or type this code back in the
  tab you started in"), which also solves in-app-browser breakage.
- Always show a "check your inbox — we sent it to n@example.com · wrong address?" state,
  and handle the expired-link page with a one-tap resend rather than an error.
- Supabase already ships magic-link OTP, so this is configuration rather than code — but
  it adds an auth JS payload; measure it against the 50 kB budget before committing.

### 3.4 What the account page must minimally show
Keep it to one screen, no tabs, no settings sprawl:
1. **Your name**, editable inline, with a "this renames you everywhere" note.
2. **Your best per game** — 8 rows: game name, your best, your current rank, a link to
   that game's board. This is the entire reason the page exists.
3. **Streak** for Word Steps, prominently, with last-played date.
4. **Email state**: address, "notify me when beaten" toggle, newsletter toggle,
   "delete my data" link (a real one — it is a GDPR right and a two-line RPC).
5. Nothing else. No avatars, no bio, no friends, no settings you will not maintain.

---

## 4. Leaderboard presentation patterns

### 4.1 Top-10 vs "you + neighbours"
- A bare global top-10 is demotivating for everyone outside it, and the research on
  gamified leaderboards recommends **relative / segmented boards over absolute global
  ones** (https://pmc.ncbi.nlm.nih.gov/articles/PMC8097522/); Duolingo's ~30-person
  pool exists for the same reason (https://duolingo.deconstructoroffun.com/mechanics/leagues).
- **The shipped compromise, and the recommendation:** show **top 5, then an ellipsis
  row, then you ± 2**. Everyone sees an aspirational ceiling *and* a beatable target
  two rows above them. Sporcle's "your PB plus your friends' scores" is the same idea
  with a social pool instead of a rank pool.
- Highlight the player's own row unmistakably (accent background + a "you" chip), not
  just with bold text.

### 4.2 Time windows
- **Today / This week / All time** is the standard triple. Cool Math ships
  "This Week / Last Week / All Time" with the explicit line *"Weekly leaderboards reset
  each Sunday. Rankings are updated daily."* — stating the reset rule in the UI is what
  makes the board feel fair rather than arbitrary.
- Default to **Today** (or This week) for a new site: an all-time board on a young site
  is a wall of unbeatable numbers from the three people who played it most in week one.
  A weekly reset makes "every week feels winnable".
- Word Steps, being a daily, wants a fourth concept: **today's puzzle board**, which is
  intrinsically fair because everyone solved the same thing.

### 4.3 Ties and `lowerIsBetter` formatting
- **Ties:** rank by score, break by *earliest submission* (first to achieve it wins),
  and show equal ranks with the same number (1, 2, 2, 4) rather than inventing an order.
  On move-count games ties will be extremely common — a 15-puzzle optimum is a small
  integer — so the tiebreak must be defined before launch, and stated ("ties go to
  whoever got there first").
- **`lowerIsBetter` metrics** (moves, seconds, marbles left) need units in the cell and
  a direction cue in the header: "Moves ↓ fewer is better". Never render a raw number
  with no unit; a column of "14 / 16 / 17" is unreadable out of context.
- Format times as `1:04.2`, not `64.2s`. Format moves as `14 moves` in the you-row and
  bare `14` in dense rows.
- Per-game metric map for TWB: peg solitaire → marbles left (↓) then moves;
  bubble wrap → time to clear (↓); 15-puzzle → moves (↓) with time as tiebreak;
  memory flip → flips (↓); honeycomb → score (↑); untangle → moves (↓);
  word steps → steps (↓); doodle → n/a (no board — not every game needs one).

### 4.4 Empty, loading and failure states — the make-or-break for a 4 s budget
- **Empty board** is the most likely state for weeks after launch. Do what arcade
  cabinets did: **pre-seed the table** with playful placeholder rows (AAA/BBB/CCC in the
  arcade; for TWB, e.g. "— · be the first" rows with the target metric). Never render an
  empty box. Copy: *"Nobody's beaten this yet. Awkward."*
- **Loading:** reserve the exact final height and show skeleton rows, never a spinner
  that collapses the layout. Layout shift is the #1 source of "unstable" feel.
- **Timeout ≤ 4 s:** if the RPC has not answered, abandon it and render the *local*
  result with a quiet "Couldn't reach the board — your score is saved here". The end
  card must never be blocked by the network. Retry on next visit.
- **Never** let the leaderboard fetch delay the "Play again" button.

### 4.5 Per-game boards vs a cross-game "arcade points" board
- Per-game boards are the honest unit (metrics differ, skill differs) and are what
  players expect after finishing a specific game.
- A cross-game board solves a real problem for an 8-game site: **eight thin boards look
  deserted; one board looks alive.** Cool Math's site-wide "completed games" count is
  precisely this trick — a cheap, non-comparable currency that aggregates activity.
- Recommendation: **both, with different jobs.** Per-game board on the end card (the
  competitive one); a homepage "this week at Tap When Bored" board on a simple
  participation currency (games finished, or a point per personal best) — playful,
  unfalsifiable-in-any-meaningful-sense, and it makes the homepage feel inhabited.

### 4.6 Rank badges and playful-but-clear copy
- Medals for 1–3 are near-universal and instantly legible; beyond that, plain numbers.
  Letter tiers (TETR.IO's D→X+) only make sense with a real rating distribution.
- Percentile beats rank for a low-traffic site: "faster than 78% of players" is true and
  flattering at any traffic level, where "#412" is not. Human Benchmark's histogram is
  the proven form of this.
- Copy examples that stay clear:
  - *"14 moves. That's 3rd best today."*
  - *"You're 2 moves off the top spot."*
  - *"Personal best — beat your old 17."*
  - *"#4 today · #61 all time"*
  - Empty: *"First name on this board gets bragging rights."*
  - Avoid: unexplained emoji-only ranks, "legend/novice" tiers with no definition, and
    any copy that implies verification you don't do.

---

## 5. Playful-but-stable visual language — 10 principles

What reliably reads as **playful** across the products studied: rounded geometry and
generous radii, a single saturated accent against a calm ground, chunky friendly type,
short human copy, sticker-like badges, a small spring on *state change only*, and
celebration reserved for genuine records. What reads as **unstable**: layout shift,
animation that runs on every render, modals that trap or that can't be dismissed,
buttons that differ between games, and boards that appear and disappear.

1. **Reserve space before you fill it.** Every dynamic element in the end card —
   global best, your rank, the name field, the success row — gets its height at first
   paint. Nothing may push "Play again" down the screen. This single rule buys most of
   the perceived stability.
2. **One end-card component, eight games.** The same DOM shape, the same button order,
   the same field, the same copy slots; only the metric label and colour accent change.
   Consistency across games *is* the platform.
3. **Motion only on state change, never on arrival.** Animate the transition from
   "playing" to "finished", and the row highlight on submit. Do not animate the board
   loading, the list rows, or anything that happens on every page view.
4. **Springs, short and small.** 150–250 ms, small distances (4–12 px), scale changes
   ≤1.04. Anything longer feels laggy on a "tap when bored" session; anything bigger
   feels like the layout is broken.
5. **Confetti only at a real record.** Global #1 or a personal best — not on every
   completion. Celebration that fires every time stops meaning anything and starts
   feeling like a slot machine. Cap it, make it non-blocking, and never let it delay
   input.
6. **Sticker badges, flat and static.** Medals, "PB", "new", "#1 today" as small
   rounded chips with solid fills. Static chips read as playful; animated chips read as
   unstable. This is where the personality budget should go.
7. **Buttons never move, never restyle.** Primary/secondary pair in the same position
   in every game; the submit button changes *label* ("Post score" → "Posted ✓"), never
   size or place. A button that changes width on state change is the classic jump.
8. **Modals are for reading, not for asking.** The ask is inline. If a modal is used
   for the full board, it must be `role="dialog" aria-modal="true"`, focus-trapped,
   Escape-closable, and it must return focus to the trigger
   (https://testparty.ai/blog/modal-dialog-accessibility). Anything less is a trap.
9. **Playful copy, literal numbers.** Personality lives in the sentence around the
   number; the number itself is never cute. "Nobody's beaten this yet. Awkward." is fine
   above "Best: 2 marbles".
10. **Both themes, one personality.** Every accent, chip, medal and highlight must be
    defined in light and dark from the start. A leaderboard that only looks right in
    one theme is the most common polish failure on theme-switching sites.

---

## 6. Accessibility and mobile specifics for these flows

- **iOS input zoom.** Mobile Safari zooms into any focused input with `font-size` below
  16px, and the fix is simply to set the input to 16px or larger; suppressing it with
  `maximum-scale=1` / `user-scalable=no` breaks WCAG and must not be used.
  (https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/,
  https://defensivecss.dev/tip/input-zoom-safari/)
- **Keyboard shows, layout must not collapse.** On iOS the keyboard shrinks the visual
  viewport; the end card should scroll the field into view rather than reflow. Use
  `scrollIntoView({block:'center'})` on focus and avoid `100vh` on the card
  (`100dvh`/`svh` or plain block layout instead).
- **Safe areas.** Any bottom-anchored control (submit bar, sticky "Play again") needs
  `padding-bottom: env(safe-area-inset-bottom)` and the viewport meta
  `viewport-fit=cover`. Home-indicator overlap on iPhone is the most common mobile bug
  in end-card designs.
- **Autocomplete attributes** are a WCAG 2.1 AA requirement (1.3.5 Identify Input
  Purpose) for fields collecting the user's own information: `autocomplete="nickname"`
  on the name field, `autocomplete="email" inputmode="email"` on the email field, plus
  `type="email"`, `autocapitalize="off"` and `autocorrect="off"` for the nickname.
  (https://www.digitala11y.com/what-are-the-autocomplete-attributes-defined-in-1-3-5-input-purpose/)
- **Screen-reader announcement of rank.** Put an empty `aria-live="polite"` region in
  the end card **at page load** — a live region added or unhidden later may not be
  announced (https://wcag.dock.codes/documentation/wcag413/) — then write one plain
  sentence into it on result: *"Solved in 14 moves. Third best today."* Announce the
  submit outcome the same way: *"Score posted as Nikhil. You're 3rd."*
- **Focus management.** Inline flow: after a successful submit move focus to the success
  message (`tabindex="-1"`), not back to the top of the card. Modal flow: focus the
  first interactive element on open, trap, Escape closes, focus returns to the trigger.
- **Touch targets** ≥44×44 px for the submit button, the "no thanks" link, and every
  leaderboard tab. The "no thanks" affordance in particular must be a real button, not
  6px grey text — that is a dark pattern and it is also unusable with a thumb.
- **Reduced motion.** `@media (prefers-reduced-motion: reduce)` must disable confetti
  entirely (not just shorten it), remove the row spring, and keep only opacity fades.
  Confetti is the highest-risk element here — it should be gated on reduced-motion
  *and* be purely decorative with `aria-hidden="true"`.
- **Contrast in both themes** for the highlighted "you" row: the accent fill must keep
  4.5:1 against its text in light and dark. Do not signal "your row" with colour alone —
  add the "you" chip so it survives colour-blindness and greyscale.
- **Board is a table.** Use a real `<table>` with `<caption>` and `<th scope="col">` for
  the leaderboard; screen readers get row/column context for free, and it renders in
  fewer bytes than a div grid.
- **No-JS / slow-JS.** The score and the "play again" control must not depend on the
  leaderboard script. Load the board module after the end card paints.

---

## 7. Seeds for 4 distinct UX directions

These are **mutually exclusive**, not a menu of features to combine. Each takes a
different position on the central question the research surfaces: *how much identity is
this site allowed to ask for, and what does it give back?*

### Direction A — "Arcade Cabinet"
**Concept.** Lean all the way into the 45-year-old high-score table. Finishing a game
that qualifies flips the end card into a reward state: chunky pixel-adjacent lettering,
three character slots, a cycling A–Z picker you can tap or type, and a board that fills
the card. The board is pre-seeded with placeholder rows so it is never empty. Every game
looks like a different cabinet, but the entry ritual is identical. Nothing about it
reads as a form.

- **Leaderboard lives:** in the end card, full-bleed, plus a `/arcade` page with all 8
  cabinets' tables side by side.
- **Name+email ask:** initials only, and **only on a qualifying score** (top 10 today or
  a personal best). Email never appears at this moment. A separate quiet line under the
  board — "get a ping when your initials get knocked off" — is the only email surface.
- **Registration:** essentially none. `playerId` + initials in `localStorage`; magic
  link exists only on the `/arcade` page to reclaim your initials on a new device.
- **Playful because:** the initials ritual is the single most beloved reward state in
  games; the cap of 3 characters is inherently funny and gives a profanity floor for free.
- **Stable because:** three fixed-width slots cannot reflow; the reward state is a
  discrete screen with a fixed layout; there is no email field to expand the card.
- **Main risk:** three characters are not addressable and not memorable at scale —
  the board becomes a wall of `AJK`/`SAM`/`XXX` with no way to find yourself, and the
  email programme is starved because it lives off the main path. Also skews retro-male
  in a category whose audience is majority women 25–44
  (https://liftoff.ai/2025-casual-gaming-apps-report/).

### Direction B — "Sticker Book"
**Concept.** Warm, tactile, scrapbook-ish. Each of the 8 games has a sticker; finishing
earns you the sticker with your result written on it, and stickers collect on a personal
page and on the homepage. The leaderboard is presented as "the wall" — a grid of other
people's stickers with names on them, newest and best first. The emotional pitch is
*collecting*, not *ranking*, which makes the identity ask feel like signing your work
rather than entering a competition.

- **Leaderboard lives:** a homepage "wall" of recent + best results across all games
  (the cross-game participation board from §4.5), with each game's proper ranked table
  one tap deeper.
- **Name+email ask:** inline, after the first finish, framed as *"sign your sticker"* —
  a nickname field pre-filled with a friendly generated name (Cool Math's trick). Email
  appears only at the second step, framed as *"keep your sticker book if you switch
  phones"* (Wordle's loss-aversion pitch, which is the strongest converter found).
- **Registration:** soft account by default; magic-link upgrade sold as "save your
  book". Account page = the sticker book: 8 stickers, your best on each, streak, name.
- **Playful because:** collection is a stronger casual motivator than rank for the
  36–50 "asynchronous puzzle loop" segment; stickers are static SVG chips, so the
  playfulness costs nothing in motion.
- **Stable because:** everything is a fixed-size chip in a grid; no numbers move; the
  wall is decorative so a slow or failed fetch degrades to "your own stickers" gracefully.
- **Main risk:** the strongest reason to give an email is protecting the collection —
  which means the collection has to be worth protecting, so this direction only pays off
  if players return. It also risks reading as childish for the Wordle-ish audience, and
  8 bespoke sticker illustrations is real design work.

### Direction C — "Quiet Ledger" (NYT-editorial)
**Concept.** Almost no chrome. The end card states the result in one clean line, then a
single restrained sentence of context — *"14 moves. Better than 78% of players today."*
— a histogram or distribution bar, and nothing else. The board is a typographic table on
its own page. Personality comes entirely from copy and typography; there is no confetti,
no badge, no colour beyond one accent. This is the Human Benchmark / NYT position:
credibility as the product.

- **Leaderboard lives:** a dedicated `/leaderboard` page with per-game tables and
  Today/Week/All-time tabs; the end card shows only *your* placement line, never a list.
- **Name+email ask:** deliberately late and rare. The end card shows the percentile with
  no ask at all. A persistent, non-modal footer line — "Add your name to the table" —
  opens a single field. Email is offered once, on the account page, never on the end card.
- **Registration:** the fullest of the four. Magic link, an account page with your bests
  across all 8 games and the Word Steps streak. Justified because this direction's whole
  value is a trustworthy record.
- **Playful because:** dry wit in the copy, and the distribution bar — "you are here" is
  genuinely delightful and costs one extra aggregate from the RPC.
- **Stable because:** it is the least dynamic option by construction; nothing appears or
  animates that wasn't already in the layout.
- **Main risk:** it fails the brief's "playful" requirement unless the copy is very good,
  and it converts the least — most players will never see the identity ask at all. Also,
  claiming credibility invites scrutiny of scores you cannot actually verify (§2.8).

### Direction D — "Weekly Table" (Duolingo-league shaped)
**Concept.** One idea, applied identically to all 8 games: **this week's table**. Every
game's end card shows a compact 5-row window — top 3, then you ± 1 — with the reset
countdown ("resets Sunday"). The site's rhythm is weekly rather than all-time, so the
board is always beatable and always fresh. The homepage carries a combined "this week"
table. Playfulness is in the recurring event, not in decoration.

- **Leaderboard lives:** everywhere and small — a 5-row window in every end card, a
  fuller table per game one tap away, a combined table on the homepage.
- **Name+email ask:** inline on first finish (one nickname field, remembered forever
  after), and the email pitch is the strongest one available: *"we'll email you Sunday
  if you finish top 3"* — a genuinely wanted, low-volume, transactional message that
  doubles as a return trigger.
- **Registration:** soft account; magic link offered only when a player has a name on
  more than one board ("keep your name across games and devices").
- **Playful because:** the weekly reset makes "every week feels winnable"; promotion /
  "you're 2 moves off 3rd" copy writes itself; the countdown is a free bit of drama.
- **Stable because:** the window is always exactly 5 rows tall in every game, so the end
  card's height is constant whether the board is loading, empty, or full.
- **Main risk:** weekly tables need weekly traffic. On a low-traffic site the table is
  three rows of the same three people, which is worse than an all-time board because it
  advertises the emptiness every week. Mitigate with a "seeded par" row (the designer's
  own target score) so there is always something to beat. The literature also warns a
  minority find league mechanics stressful (https://arxiv.org/pdf/2203.16175).

### Choosing between them
- If the priority is **conversion to email**, D then B.
- If the priority is **not damaging the neal.fun-ish feel**, C then A.
- If the priority is **8 games feeling like one platform**, D (one component everywhere)
  or B (one collection everywhere).
- A and C are the two that will look most distinctive; B and D are the two most likely
  to produce repeat visits.

---

### Five personas

Grounded in the audience data for casual/browser puzzle games — 1.3 bn monthly casual
players skewing **women 25–44 (61%)**, browser puzzle play concentrated in the 25–34 and
35–50 bands during **workday leisure periods**, with 36–50 the fastest-growing band and
valuing "pause-friendly" asynchronous loops
(https://liftoff.ai/2025-casual-gaming-apps-report/,
https://www.businessofapps.com/data/mobile-game-demographics-data/,
https://dataintelo.com/report/browser-game-market).

1. **Priya, 34, product manager — desktop Chrome, 5 tabs open, 3-minute gaps between
   meetings.** Plays 15-puzzle and untangle to reset her head. Values: instant load, no
   sound, closable in one keystroke, and a number that tells her whether she's improving.
   Annoyed by: anything that must be dismissed before she can play again, and any hint
   that a colleague could see her name.

2. **Marcus, 41, warehouse shift supervisor — Android phone, 4G, gloves half the time,
   plays on breaks.** Bubble wrap and honeycomb. Values: big tap targets, works on a
   cracked screen, no login, resumes instantly. Annoyed by: tiny "no thanks" links,
   keyboard popping up unexpectedly, and layout that jumps when the board loads.

3. **Sandra, 58, retired teacher — iPad, at home, evenings, does the daily word puzzle
   religiously.** Word Steps is the whole site to her; she has a 40-day streak and cares
   about it more than any leaderboard. Values: large legible text, a streak that never
   breaks, and knowing her email won't be sold. Annoyed by: confetti and motion, small
   fonts, anything that looks like it's trying to sign her up.

4. **Dev, 19, CS student — laptop and phone interchangeably, found the site on Reddit,
   plays for 40 minutes in one sitting to top a board.** The one player who will actually
   try to break the leaderboard. Values: a real ranked table, all-time as well as weekly,
   knowing exactly how scoring works. Annoyed by: a board that is obviously spoofable,
   percentiles instead of ranks, and per-game boards that are empty.

5. **Aisha, 29, freelance designer — iPhone in bed, dark mode always, one game before
   sleep, never returns to the same game twice in a week.** Values: how it looks, the
   share string, dark theme that's actually dark. Annoyed by: bright flashes, a light
   modal over a dark page, and being asked for an email by a site she's used twice.

**What the personas jointly rule out:** any pre-play gate (Marcus, Priya), any modal
that must be dismissed to replay (Priya, Marcus), any motion-heavy celebration
(Sandra, Aisha), and any email ask that is required to see your result (all five).
**What they jointly support:** a name remembered after one typing, a per-game number
with context, a streak worth protecting, and a leaderboard that is honest about being
for fun.
