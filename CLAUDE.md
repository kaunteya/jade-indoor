# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A small static site (Jade Indoor Sports Festival) with no build step and no dependencies — every page runs directly in the browser. Two files at the root are shared: `games.js` (the category list, loaded by every page) and `draws.js` (the `schedules/data/` file list and CSV reader, loaded by `schedules/` and `search/`). Each page otherwise owns its own HTML/CSS/JS:

- **`index.html` + `home.css`** — the landing page, three stacked destination cards (Participants list, Schedule, Search) above a plain "Registrations closed" line. There is no Registration card: entries have closed, so it was removed rather than shown inert — the page is still deployed at `/registration`, just unlinked. Re-enable it by adding an `<a class="home-card" href="registration/">` back to `.home-nav` and dropping the `.closed-note`.
- **`registration/`** (`index.html` + `style.css` + `app.js`, served at `/registration`) — the registration form. `app.js` POSTs it to a Google Apps Script Web App (`apps-script/Code.gs`), which appends a row to a Google Sheet.
- **`schedules/`** (served at `/schedules`) — the public schedule, built by fetching every draw in `schedules/data/` and merging them into one time-ordered list with Day and Sport filter chips. It needs no backend, but it does need a server: `fetch` of a sibling CSV fails under `file://`. A static page can't list a directory, so `SCHEDULE_FILES` in `../draws.js` names each CSV by hand — **adding a draw to `schedules/data/` means adding its filename there**. Everything else is read out of the files: the `Category` column is `Sport — Category`, which is what the sport chips group on, and day order is parsed from `Day` (`Fri 14 Aug`) rather than hardcoded.
- **`search/`** (served at `/search`) — find one participant by name and see everything they entered, plus the slots they have been given. It reads the same `doGet` payload as `list/` but inverts it: `listEntrants` is keyed by game category, so `buildPeople()` regroups it into one record per person, keyed by name + flat (which also folds together anyone who submitted the form twice). The input is an ARIA combobox — suggestions are a `role="listbox"` the input owns via `aria-controls`/`aria-activedescendant`, so focus stays in the field while arrowing through them. Fixtures come from `../draws.js`: the draws name a player as `First Last (T-nnn)`, which is exactly the label the entrant list yields, so `fixturesFor()` claims a slot by splitting each side on `/` and comparing labels outright. A slot counts when the person is named in it — either outright, or through a placeholder that `results.csv` has since resolved to their name, so a win carries them into the tie it feeds and names the opponent coming in from the other half. `Winner Group A` still belongs to nobody: it waits on standings nothing here works out. A fixture whose match has a recorded winner is styled down (`.fixture.is-done`) and carries a **Won**/**Lost** chip — the recorded winner is itself the proof the match was played, so there is no separate 'completed' flag to fall out of step with it.
- **`list/`** (served at `/list`) — a read-only page for organisers: a row of sport buttons (each with its total entries) driving a category dropdown over the entrant list, with sortable columns, showing each participant's name, flat and age. It GETs the same Web App URL (`doGet`/`listEntrants` in `Code.gs`).

Pages below the root reach the shared script and assets with `../` (`../games.js`, `../images/…`) — including inside `registration/style.css`, whose `url()`s and CSS masks point at `../images/`.

Script and stylesheet references carry a `?v=` query (`../draws.js?v=1`, `home.css?v=3`) and **the number must be bumped whenever the file it names changes**. Without it a browser will happily serve a cached `draws.js` alongside a fresh `schedules.js`, and since the page calls into the shared file the mismatch is not a degraded page but a dead one — that is precisely how the schedule got stuck on "Loading schedule…" once. `schedules/` now catches a thrown error and says so on the status line rather than sitting on the loading message, which makes the next such mismatch visible instead of silent.

## Running / testing

No build tools, package manager, or test suite. Serve the repo root with any static file server and open `/` — the pages resolve each other by directory (`/registration`, `/list`), so opening the HTML files straight off the filesystem works too, but only if you enter through the root `index.html`.

To test the submit path end-to-end, `apps-script/Code.gs` must be pasted into a Google Apps Script project bound to a target Sheet and deployed as a Web App (Deploy > New deployment > Web app, Execute as "Me", Access "Anyone with the link"). The deployed `/exec` URL then goes in `SCRIPT_URL` at the top of `games.js`.

## Architecture

The form is a single `<form>` broken into four `<section class="form-section">` blocks in `index.html`, each with its own heading and each toggled by JS via the `hidden` attribute (`.form-section` CSS just gives them consistent flex/gap layout and `display: none` when hidden):

1. **`#section-person-info`** ("Personal info") — name/DOB/gender/WhatsApp/tower/house fields. Has two sub-states inside it, `#user-info-fields` and `#user-info-summary`, toggled by the Next/Edit buttons (`showUserInfoSummary()` / the `editButton` handler in `app.js`) — the section itself stays visible throughout, only its inner content swaps.
2. **`#section-games`** ("Select the games") — the eligible-games table, rendered by `renderGamesTable()`; revealed once the person-info fields validate and Next is clicked.
3. **`#section-payment`** ("Payment") — UPI link, QR code, a required payment-screenshot file input, and the Submit button. Revealed by `updateTotalCost()` once the running total is above zero; the Submit button inside it stays disabled until a screenshot is picked. The image is downscaled client-side (`resizeToDataUrl()`) and sent as a base64 field; `Code.gs` decodes it, saves it privately to a Drive folder, and adds a link + floating thumbnail to the row.
4. **`#section-post-submission`** ("Submission successful") — shown only after a successful POST, via `showPostSubmissionSummary()`, which reuses `#user-info-summary-text`'s already-rendered HTML plus the checked game rows and total to build a read-only recap (meant to be screenshotted). The "Submit another form" button (`submitAnotherButton`) resets the form and swaps back to section 1.

The frontend and the Apps Script backend are two separate files with no shared module or build step connecting them — `apps-script/Code.gs` is deployed by pasting its contents into script.google.com, not by any script in this repo. Because of that, several things must be kept in sync by hand:

- **`FIELDS`** in `Code.gs` must match the plain form field `name`/`id` attributes in `index.html`, in the order columns should appear in the sheet.
- Doubles entries render a `<sport>_partner` name input under their checkbox (keyed by the game id's sport prefix, e.g. `badminton_partner`), giving one partner column per sport rather than per entry. `GAME_FIELDS` in `Code.gs` lists these `_partner` columns explicitly in their column position; any field ending in `_partner` is written as text, the rest as the numeric level. This relies on a person only ever entering one doubles category per sport (eligibility is age/gender-exclusive).
- **`GAME_FIELDS`** in `Code.gs` describes **the sheet's columns**, in the sheet's order — it is not simply a copy of the `id`s in `games.js`. The two drifted once already: merging the U14 badminton doubles categories in `games.js` and editing `GAME_FIELDS` to match silently shifted every later column by one, because the sheet still has a column per gender there. Where a sheet column no longer lines up with a `games.js` id, map it in `GAME_ID_FOR` rather than deleting the column entry. Each game/category checkbox is one numeric column in the sheet: `0` not entered, `1` beginner, `2` intermediate, `3` expert. The level is asked once per sport in `#skill-levels` (`updateSkillLevels()` in `app.js`) and pushed onto each checked checkbox's `value`, so the checkbox submits the number itself and the level `<select>`s deliberately have no `name` — they never reach `FormData`.

`games.js`'s `GAMES` array is the single source of truth (loaded by both `index.html` and `list/index.html`) for game eligibility: each entry has `min`/`max` age and `gender` ('Male' | 'Female' | 'any'). `renderGamesTable()` filters/greys rows based on the entered age and gender (`SHOW_DISABLED_GAMES` keeps a few sports visible-but-disabled even when the entrant isn't eligible, e.g. to show they exist). Checked boxes' `data-price` attributes are summed client-side for the running total in `#total-cost`; the same prices live in `GAMES` and are not otherwise validated server-side.

`renderHouseNumbers()` derives selectable house numbers from the chosen tower: towers in `TWO_HOUSE_TOWERS` get 2 units/floor, others get 4; towers in `TALL_TOWERS` have 21 floors, others have 20 — this is config data specific to the building, not a general pattern.

Form submission uses `mode: 'no-cors'` because Apps Script's redirect-based response doesn't carry CORS headers; this means `fetch` can't actually inspect success/failure and the code just assumes success once the request completes.

## Project-specific requirements

- Any HTML/CSS/JS added must work on mobile screens.
- All prices must be displayed in INR formatting with comma grouping (e.g. ₹1,00,000).

## Facility availability

How many matches of each sport can run at once — the cap for any scheduling or slot
allocation work:

| Sport | Playing areas |
| --- | --- |
| Badminton | 2 courts |
| Table Tennis | 1 table |
| Carrom | 3 boards |
| Chess | 6 boards |
| 8-ball pool | 1 table |

The festival runs over three days, and these are the only hours the facilities are open —
27 playable hours in total:

| Date | Slot |
| --- | --- |
| Fri 14 Aug 2026 | 7:00 pm – 11:00 pm (4h) |
| Sat 15 Aug 2026 | 12:00 pm – 11:00 pm (11h) |
| Sun 16 Aug 2026 | 9:00 am – 9:00 pm (12h) |

Fri and Sat were 10:00 pm; they were stretched an hour each to take load off Sunday. Sunday's
9:00 pm is hard — everything has to be over by then.

Sunday also has a **break from 1:00 pm to 1:30 pm** when nothing is played on any area. It is
a hole in the day rather than a shorter day — a match may finish exactly at 1:00 and the next
start exactly at 1:30, but nothing runs across it. `BREAKS` in `scripts/draw.py` keeps matches
out of it and `BREAKS` in `scripts/check_draw.py` asserts it; the two are duplicated on
purpose, so keep them in step.

## Scheduling rules

Draws are written as CSVs in `schedules/data/`, one file per category, with the columns
`Day,Start,End,Court,Category,Round,Match,Side A,Side B` — later rounds reference earlier
ones as `Winner <Match>`, and pool qualifiers as `Winner Group A` / `Runner-up Group B`,
rather than by name. `Category` is `Sport — Category` (`Badminton — Doubles · 14-59 & 60+ ·
Male`); the `schedules/` page splits on that dash to group by sport, so the prefix has to be
there. These CSVs are the one exception to the `*.csv` gitignore rule — they are the
published schedule, so they are tracked.

- `schedules/data/` holds **every category drawn out to its final** — 307 matches, 55 on Fri,
  124 on Sat and 128 on Sun (`check_draw.py` prints the split, so read it there rather than
  trusting this line). The opening rounds and group stages fill Fri and Sat; the later
  rounds are mostly Sunday, except in the sports crowded enough to spread back over the Fri
  and Sat evenings (see the `CROWDED` rule below). Every final is on Sunday.
  (`schedule/`, the superseded full draws, is gone from the working tree but still in git.)
- **Results live in `schedules/data/results.csv`, not in the draws** — `Match,Winner`, the
  winner being the winning side's own label spelled exactly as the draw spells it
  (`PL01,Saahil Sikri (F-132)`). Kept separate for the same reason `byes.csv` is: the draws
  are rewritten wholesale by `draw.py`, and a result recorded inside one would not survive it.
  `schedules/` tags that side **Winner** on the card; a winner matching neither side tags
  nobody, and `check_draw.py` fails on it so a typo can't pass as an unplayed match. It is not
  a draw, so both scripts skip it. Add a row per match as it is played.

  A recorded result also **resolves the placeholders that point at it**: `Winner TSAM01`
  renders as the name of whoever won TSAM01, so the bracket fills in round by round as the day
  is recorded, and the tie it feeds can then take a result of its own. `resolveSide()` lives in
  `draws.js` because `schedules/` and `search/` must agree on who is playing; `resolved()` in
  `check_draw.py` is a second implementation of that one rule — **keep the two in step by hand.**

  Only a match id resolves. A `Winner Group A` / `Runner-up Group B` placeholder waits on a whole
  group's standings, which nothing here works out: a group can finish level (Group A of the pool
  did, which is why `PL41` exists), so naming a qualifier the organisers have not settled would be
  worse than leaving the placeholder showing. When they *have* settled one, the way to record it is
  to **overwrite the placeholder with the name in the draw CSV** — there is no results.csv row that
  can do it. Two such edits are in the tree, both from Sunday's pool deciders (see `PL34`/`PL36`
  below); `Winner Group A` / `Runner-up Group A` in carrom doubles is still open, its Group A
  finishing on Sunday.
- The draw is generated, not written by hand: `scripts/draw.py` reads the sheet export
  `psl.csv`, builds the field for every category, and lays the matches out. Re-run it after a
  re-export rather than editing the CSVs, then `scripts/check_draw.py` to re-assert every
  rule below against what was written. Both are plain Python 3, no dependencies. `draw.py`
  writes nothing at all if any match will not fit, and prints what it could not place.
- **`brackets/` holds the printable sheets**, one A4 PNG per category (2480x3508, A4 at
  300dpi), rendered by `scripts/bracket.py` — it lays a draw out as HTML and screenshots it
  with headless Chrome, so Chrome is the only requirement. The set currently in the
  repository is **Sunday 16 August only**, the closing day, regenerated with:

  ```
  for f in schedules/data/*.csv; do b=$(basename "$f" .csv); case "$b" in byes|results) continue;; esac;
    python3 scripts/bracket.py "$f" "brackets/$b.png" --day "Sun 16 Aug"; done
  ```

  Without `--day` the same script draws the whole category, first round to final. With it,
  only that day's matches are drawn and a side coming out of an earlier day is resolved
  through `results.csv` (`via TSAM01` under the name); one that nothing has settled yet keeps
  its placeholder, greyed, and a group placeholder whose group is still being played that day
  says when it will be known. Nothing is hardcoded per category: columns come from each
  match's round and from what feeds it (pool's chained deciders take two columns of their
  own), and the type is sized to what the page has room for rather than fixed: names run
  30pt on a sheet holding one final and never below 18pt on the 32-line chess sheet
  (`NAME_MIN_PT`/`NAME_MAX_PT`). The match label then takes the band it is left with — the
  script writes out the ways it could break (id / time / court over three lines, down to
  one line, dropping the court where the sheet uses a single area and the end time on the
  tightest sheets, both of which the footer still carries) and renders whichever reads
  largest, up to `LABEL_MAX_PT`. Widths are estimated at roughly half an em per character,
  which is measured, not guessed: text is clipped rather than wrapped, so an estimate that
  runs low loses the end of a label. A day's matches that
  nothing else on the sheet feeds — carrom doubles still has two Group A matches on Sunday —
  are drawn as their own small trees below the main one.
- **`PL41` is the one hand-added match**, and the one deliberate exception to the two rules
  below. Group A of the pool left Anshul Goel and Sanjay Karmarkar tied on 2-1 for the
  runner-up spot that feeds `PL35`; being trio-mates in the partial round robin they never
  met, so there was no head-to-head to separate them and a decider was added at the
  organisers' request. It depends on results, so `draw.py` cannot produce it — **regenerating
  the draw from `psl.csv` will drop it, and it has to be re-added by hand.** It was placed at
  Sat 11:45–12:00, which is 15 minutes before the venue opens and leaves no turnaround before
  `PL13` at 12:00. `check_draw.py` therefore reports these two failures, which are expected
  rather than a regression:

  ```
  PL41: Sat 15 Aug 11:45-12:00 outside opening hours
  PL41/PL13 share Table 1 with <5 min between
  ```

  A decider's `Round` is `Decider`, or `Decider — Group B` where naming the group it settles
  is worth it — Sunday's four (`PL43`/`PL44` for group B, `PL45`/`PL46` for group D) are
  written that way, `PL41` and `PL42` are not. **The group name goes after the `Decider`
  prefix, never before it**: `is_decider()` in `check_draw.py`, `rank()` in `bracket.py` and
  `roundClass()` in `schedules/schedules.js` all match on that prefix, and a round starting
  `Group` is read as a group stage by both scripts. The three are duplicated by hand, so keep
  them in step.

  A decider chain settles more than the one spot it is named for. Both of Sunday's chains ran
  a three-way tie on 2-1 down to an order: the odd player out gets the bye and enters at the
  second match, so **its winner is the group winner and its loser the runner-up**, the first
  decider's loser placing third. That reading is convention, not something the CSVs state — it
  is why the runner-up can be filled in at all. Group B went Ruturaj Kurbetti / Sharan Wadhwa /
  Shraddha Dani, group D Gurbirsingh Sethi / Vivek Vichare / Vivek Pawar, so `PL34`'s
  `Runner-up Group B` was overwritten with Sharan Wadhwa and `PL36`'s `Runner-up Group D` with
  Vivek Vichare. Like `PL41`, **regenerating the draw drops both edits.**

  **Two failures is the current baseline; anything beyond these two is new.** A third,
  `BDAM06: 15 min, expected 30`, stood here until Sunday's badminton went to a flat 25 minutes
  (below) — at one length for every round `BDAM06` is no longer the odd one out, and re-laying
  the day moved it off the 09:20 collision that had made it awkward to fix in place.

- No more concurrent matches per sport than it has playing areas (see above), and no match
  scheduled outside the day's open hours, or across one of the day's breaks.
- Consecutive matches on the same court/table/board are a turnaround apart — 5 minutes, or
  the 3 that Sunday's table tennis runs on — and so are any two matches the same player is
  in. Nobody walks straight off one match onto the next.
- Under 14 categories finish by 8:00 pm, whichever day they land on.
- A player is never booked into two matches at once **where the draw names them**. Doubles
  partner names are resolved back to registrants, so cross-sport clashes between named
  players are caught.

  > **NOTE — this guarantee used to be stronger.** It once held for everyone who could still
  > *reach* a match, so the draw stayed valid whoever won. Drawing every round to the final
  > made that unachievable: a final carries its whole category as possible entrants, so two
  > finals whose fields overlap could never be concurrent, and with 16 finals in one evening
  > the tournament does not schedule at all. Under the current draw **187 pairs of
  > overlapping Sunday slots could want the same person**, across 76 people, if results fall
  > that way — most often two semi-finals, and Reyansh Agrawal (G-112) is in 33 of them.
  > Whoever runs the day should expect to reorder a handful of ties on the spot.
  > `check_draw.py` asserts the named-player rule only; it cannot assert the old one.

- Slot lengths, one per sport. **Every round after the first is shorter** in badminton and
  table tennis, which is the only reason the closing rounds fit into Sunday at all:

  | Sport | Opening round | Every round after |
  | --- | --- | --- |
  | Badminton | 30 min | 15 min |
  | Table Tennis | 15 min | 10 min (3-min turnaround) |
  | Chess | 50 min | 50 min |
  | Carrom | 50 min | 50 min |
  | 8-ball pool | 15 min | 15 min |

  Badminton's 59 remaining matches want 1027 minutes of court time against the 720 two courts
  hold, and table tennis's 49 want 975 — 43% and 35% over. At the shorter lengths they need
  585 and 634. Chess and carrom have slack on six and three areas, so they keep their length
  throughout. Table tennis was the critical path — all 49 of its later rounds on Sunday came to
  634 of the day's 720 minutes on one table, about 14 minutes of float — until spreading it
  back over Fri and Sat left 28 on Sunday and real slack.

- **Sunday's badminton is the exception to that table: 25 minutes for every round.** The
  organisers asked for longer ties on the closing day, and all 38 of Sunday's badminton matches
  are later rounds, so the opening/later split does not describe the day at all — it runs at one
  length throughout. The stretch costs 380 extra court-minutes, which two courts absorb: the
  badminton day runs 09:00–19:10 instead of 09:00–17:05, still inside the 21:00 hard stop, with
  every Under 14 tie done by 18:55.

  Like `PL41`, this is applied to the CSVs by hand and **regenerating the draw will drop it**.
  `draw.py` has no counterpart because it decides a match's day while placing it, so a slot
  length that depends on the day is circular there. `check_draw.py` knows it as `DAY_SLOT`,
  which overrides `SLOT`/`LATER_SLOT` for a given day and sport.

  8-ball pool runs short because it has one table and the most group matches to fit on it:
  33, needing 660 of the 780 minutes Fri and Sat hold. 20 minutes would need 825 and no
  longer fit.

- Most categories are **single elimination**. Four are **round robin**, because they are
  small enough to be worth a group stage: 8-ball pool, Carrom doubles, TT singles 60+, and
  TT doubles. Their opening "round" is the whole group stage.
- Group sizes default to four, the remainder split into threes rather than left as a rump
  group. 8-ball pool overrides that with `GROUP_SIZES['pool-singles'] = [6, 6, 6, 4]` in
  `scripts/draw.py`, chosen so all 22 entrants play **exactly three** group matches and four
  groups still feed an eight-player quarter-final.
- Three each is what a group of four plays anyway. A group of six would be five, so it plays
  a **partial** round robin instead (`group_fixtures`): the six split into two trios by seed
  — 1st/3rd/5th against 2nd/4th/6th — and everybody plays all three of the other trio. A
  trio therefore faces identical opposition, which keeps their records comparable when the
  top two are taken; the cost is that trio-mates never meet head to head.
- Every round-robin category carries a knockout tail: the **top two of each group** go into
  it (`qualifiers`). With an even number of groups they pair off group against group — A1 v
  B2, B1 v A2, group winners kept apart until the semis. An odd number leaves a group with
  nobody to pair with, so the qualifiers are seeded instead — winners in group order, then
  runners-up in reverse — which is what stops a group's own two meeting before the semi-final.
  TT doubles is the only odd one: three groups, six qualifiers, so it plays a play-in first.
- The opening round of a category is the play-in that leaves a **power-of-two field**, so
  every round after it is 16/8/4/2/1 matches. With N entrants and L the largest power of two
  ≤ N, the opening round is N − L matches and 2L − N entrants get a bye; when N is already a
  power of two there is no play-in and the opening round is the full N/2. Byes go to the top
  of the draw order, and the rest are paired highest against lowest.
- Every round after that is **mirror-paired** (`rounds_from`): seed p meets seed L+1-p, and
  the two halves that produces meet the same way in the round after. That is the recursive
  seeding a bracket is — the top two seeds cannot meet before the final — and it is one rule
  for knockouts and group tails alike. It is also what puts each bye in exactly one tie of the
  round it enters, against a `Winner <Match>` or against another bye. `byes.csv` still lists
  the byes; it is the reason their first match is a round in, not a substitute for it.
- Draw order is the declared skill level (expert, then intermediate, then beginner, ties
  alphabetical), so the byes fall to the strongest entrants. Round-robin groups are seeded
  the same way, snaked across the groups so each gets a spread.
- The later rounds are placed a round at a time, shallowest first, so nothing is drawn before
  the match it waits on. Fri and Sat sit on a **5-minute grid**; Sunday is placed to the
  minute, because on one table the rounding strands more than a whole tie's worth of the day.
- A sport whose later rounds would fill more than `CROWDED` (60%) of Sunday **spreads them
  back over the Fri and Sat evenings**, taking the earliest day each round can legally land
  on; the rest stay on Sunday. It works out at badminton (82% of Sunday) and table tennis
  (88%); chess, carrom and pool sit at 39%, 46% and 19% and stay put. Badminton's Sunday count
  goes 59 → 33 and table tennis's 49 → 28. The threshold is derived rather than a list of
  sport names, so a different entry list moves whichever sports the crowding has moved to.

  Letting *every* sport take the earliest day instead drained Sunday to 69 matches, empty
  until 15:25, against a Saturday running to 23:00 — the same imbalance the other way up. The
  point is to relieve the crowded sports, not to empty the day the finals are on.
- **Finals go as late as they will go**, which lands all 16 in the Sunday evening — except
  Under 14 finals, which have to be over by 8pm and so are placed in sequence with everything
  else. A match that ends more than `DRIFT` (2 hours) before the round it feeds is then pushed
  up against it, deepest first. Only that far: pushing everything as late as it would go spent
  all the slack before the first match rather than after the last, which is the wrong end of a
  day where an overrun eats into what follows.
