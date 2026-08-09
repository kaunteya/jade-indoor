# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A small static site (Jade Indoor Sports Festival) with no build step and no dependencies — every page runs directly in the browser. Two files at the root are shared: `games.js` (the category list, loaded by every page) and `draws.js` (the `schedules/data/` file list and CSV reader, loaded by `schedules/` and `search/`). Each page otherwise owns its own HTML/CSS/JS:

- **`index.html` + `home.css`** — the landing page, four stacked destination cards (Registration, Participants list, Schedule, Search). Only live cards are links: an inert card is a `<span class="home-card is-disabled">` instead of an `<a href>`, so nothing clickable leads nowhere. Registration is currently inert because entries have closed (the page is still deployed at `/registration`, just unlinked); Schedule and Search because they have no page yet. Re-enable one by turning its `<span>` back into an `<a href>`.
- **`registration/`** (`index.html` + `style.css` + `app.js`, served at `/registration`) — the registration form. `app.js` POSTs it to a Google Apps Script Web App (`apps-script/Code.gs`), which appends a row to a Google Sheet.
- **`schedules/`** (served at `/schedules`) — the public schedule, built by fetching every draw in `schedules/data/` and merging them into one time-ordered list with Day and Sport filter chips. It needs no backend, but it does need a server: `fetch` of a sibling CSV fails under `file://`. A static page can't list a directory, so `SCHEDULE_FILES` in `../draws.js` names each CSV by hand — **adding a draw to `schedules/data/` means adding its filename there**. Everything else is read out of the files: the `Category` column is `Sport — Category`, which is what the sport chips group on, and day order is parsed from `Day` (`Fri 14 Aug`) rather than hardcoded.
- **`search/`** (served at `/search`) — find one participant by name and see everything they entered, plus the slots they have been given. It reads the same `doGet` payload as `list/` but inverts it: `listEntrants` is keyed by game category, so `buildPeople()` regroups it into one record per person, keyed by name + flat (which also folds together anyone who submitted the form twice). The input is an ARIA combobox — suggestions are a `role="listbox"` the input owns via `aria-controls`/`aria-activedescendant`, so focus stays in the field while arrowing through them. Fixtures come from `../draws.js`: the draws name a player as `First Last (T-nnn)`, which is exactly the label the entrant list yields, so `fixturesFor()` claims a slot by splitting each side on `/` and comparing labels outright. Only slots a person is *named* in count — later knockout rounds read `Winner BSJM04` or `Winner Group A` and belong to nobody yet.
- **`list/`** (served at `/list`) — a read-only page for organisers: a row of sport buttons (each with its total entries) driving a category dropdown over the entrant list, with sortable columns, showing each participant's name, flat and age. It GETs the same Web App URL (`doGet`/`listEntrants` in `Code.gs`).

Pages below the root reach the shared script and assets with `../` (`../games.js`, `../images/…`) — including inside `registration/style.css`, whose `url()`s and CSS masks point at `../images/`.

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
25 playable hours in total:

| Date | Slot |
| --- | --- |
| Fri 14 Aug 2026 | 7:00 pm – 10:00 pm (3h) |
| Sat 15 Aug 2026 | 12:00 pm – 10:00 pm (10h) |
| Sun 16 Aug 2026 | 9:00 am – 9:00 pm (12h) |

## Scheduling rules

Draws are written as CSVs in `schedules/data/`, one file per category, with the columns
`Day,Start,End,Court,Category,Round,Match,Side A,Side B` — later rounds reference earlier
ones as `Winner <Match>`, and pool qualifiers as `Winner Group A` / `Runner-up Group B`,
rather than by name. `Category` is `Sport — Category` (`Badminton — Doubles · 14-59 & 60+ ·
Male`); the `schedules/` page splits on that dash to group by sport, so the prefix has to be
there. These CSVs are the one exception to the `*.csv` gitignore rule — they are the
published schedule, so they are tracked.

- `schedules/data/` holds the **opening round** of every category — one round each, no later
  rounds drawn yet — plus 8-ball pool's knockout tail, the one category drawn all the way to
  its final. The opening rounds fill Fri and Sat; Sunday is left clear for the rest.
  (`schedule/`, the superseded full draws, is gone from the working tree but still in git.)
- The opening round is generated, not written by hand: `scripts/draw.py` reads the sheet
  export `psl.csv`, builds the field for every category, and lays the matches out. Re-run it
  after a re-export rather than editing the CSVs, then `scripts/check_draw.py` to re-assert
  every rule below against what was written. Both are plain Python 3, no dependencies.
- No more concurrent matches per sport than it has playing areas (see above), and no match
  scheduled outside the day's open hours.
- Consecutive matches on the same court/table/board are 5 minutes apart, and so are any two
  matches the same player is in — nobody walks straight off one match onto the next.
- Under 14 categories finish by 8:00 pm, whichever day they land on.
- A player is never booked into two matches at once. This holds for everyone who could
  still reach a match, not just confirmed entrants, so the draw stays valid whoever wins.
  Doubles partner names are resolved back to registrants so cross-sport clashes are caught.
- Slot lengths, one per sport — every match of a sport occupies exactly this much of a
  playing area:

  | Sport | Slot |
  | --- | --- |
  | Badminton | 30 min |
  | Table Tennis | 15 min |
  | Chess | 50 min |
  | Carrom | 50 min |
  | 8-ball pool | 15 min |

  8-ball pool runs short because it has one table and the most group matches to fit on it:
  33, needing 660 of the 780 minutes Fri and Sat hold. 20 minutes would need 825 and no
  longer fit.

- Most categories are **single elimination**. Four are **round robin**, because they are
  small enough to be worth a group stage: 8-ball pool, Carrom doubles, TT singles 60+, and
  TT doubles. Their opening "round" is the whole group stage.
- Group sizes default to four, the remainder split into threes rather than left as a rump
  group. 8-ball pool overrides that with `POOL_GROUPS = [6, 6, 6, 4]` in `scripts/draw.py`,
  chosen so all 22 entrants play **exactly three** group matches and four groups still feed
  an eight-player quarter-final.
- Three each is what a group of four plays anyway. A group of six would be five, so it plays
  a **partial** round robin instead (`group_fixtures`): the six split into two trios by seed
  — 1st/3rd/5th against 2nd/4th/6th — and everybody plays all three of the other trio. A
  trio therefore faces identical opposition, which keeps their records comparable when the
  top two are taken; the cost is that trio-mates never meet head to head.
- 8-ball pool is also the only category with its later rounds drawn: the top two of each
  group go into a quarter-final (A1 v B2, B1 v A2, C1 v D2, D1 v C2 — group winners kept
  apart until the semis), then semis, then the final. Those seven ties name nobody yet, so
  the clash check resolves each back to every player who could still reach it.
- The opening round of a category is the play-in that leaves a **power-of-two field**, so
  every round after it is 16/8/4/2/1 matches. With N entrants and L the largest power of two
  ≤ N, the opening round is N − L matches and 2L − N entrants get a bye; when N is already a
  power of two there is no play-in and the opening round is the full N/2. Byes go to the top
  of the draw order, and the rest are paired highest against lowest.
- Draw order is the declared skill level (expert, then intermediate, then beginner, ties
  alphabetical), so the byes fall to the strongest entrants. Round-robin groups are seeded
  the same way, snaked across the groups so each gets a spread.
- Finals are placed first and as late as possible, so they land in a Sunday evening block.
