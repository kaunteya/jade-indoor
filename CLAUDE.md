# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single static registration form (Jade Indoor Sports Festival) with no build step and no dependencies. `index.html` + `style.css` + `app.js` run directly in the browser; `app.js` POSTs the form to a Google Apps Script Web App (`apps-script/Code.gs`), which appends a row to a Google Sheet.

## Running / testing

No build tools, package manager, or test suite. Open `index.html` directly in a browser (or serve the directory with any static file server) to work on the frontend.

To test the submit path end-to-end, `apps-script/Code.gs` must be pasted into a Google Apps Script project bound to a target Sheet and deployed as a Web App (Deploy > New deployment > Web app, Execute as "Me", Access "Anyone with the link"). The deployed `/exec` URL then goes in `SCRIPT_URL` at the top of `app.js`.

## Architecture

The form is a single `<form>` broken into four `<section class="form-section">` blocks in `index.html`, each with its own heading and each toggled by JS via the `hidden` attribute (`.form-section` CSS just gives them consistent flex/gap layout and `display: none` when hidden):

1. **`#section-person-info`** ("Personal info") — name/DOB/gender/WhatsApp/tower/house fields. Has two sub-states inside it, `#user-info-fields` and `#user-info-summary`, toggled by the Next/Edit buttons (`showUserInfoSummary()` / the `editButton` handler in `app.js`) — the section itself stays visible throughout, only its inner content swaps.
2. **`#section-games`** ("Select the games") — the eligible-games table, rendered by `renderGamesTable()`; revealed once the person-info fields validate and Next is clicked.
3. **`#section-payment`** ("Payment") — UPI link, QR code, a required UTR/Transaction ID input, a required payment-screenshot file input, and the Submit button. Revealed by `updateTotalCost()` once the running total is above zero; the Submit button inside it stays disabled until both are filled in. The image is downscaled client-side (`resizeToDataUrl()`) and sent as a base64 field; `Code.gs` decodes it, saves it privately to a Drive folder, and adds a link + floating thumbnail to the row.
4. **`#section-post-submission`** ("Submission successful") — shown only after a successful POST, via `showPostSubmissionSummary()`, which reuses `#user-info-summary-text`'s already-rendered HTML plus the checked game rows and total to build a read-only recap (meant to be screenshotted). The "Submit another form" button (`submitAnotherButton`) resets the form and swaps back to section 1.

The frontend and the Apps Script backend are two separate files with no shared module or build step connecting them — `apps-script/Code.gs` is deployed by pasting its contents into script.google.com, not by any script in this repo. Because of that, several things must be kept in sync by hand:

- **`FIELDS`** in `Code.gs` must match the plain form field `name`/`id` attributes in `index.html`, in the order columns should appear in the sheet.
- Doubles entries render a `<sport>_partner` name input under their checkbox (keyed by the game id's sport prefix, e.g. `badminton_partner`), giving one partner column per sport rather than per entry. `GAME_FIELDS` in `Code.gs` lists these `_partner` columns explicitly in their column position; any field ending in `_partner` is written as text, the rest as the numeric level. This relies on a person only ever entering one doubles category per sport (eligibility is age/gender-exclusive).
- **`GAME_FIELDS`** in `Code.gs` must match the `id`s in the `GAMES` array in `app.js`, in the same order — each game/category checkbox becomes one numeric column in the sheet: `0` not entered, `1` beginner, `2` intermediate, `3` expert. The level is asked once per sport in `#skill-levels` (`updateSkillLevels()` in `app.js`) and pushed onto each checked checkbox's `value`, so the checkbox submits the number itself and the level `<select>`s deliberately have no `name` — they never reach `FormData`.

`app.js`'s `GAMES` array is the single source of truth for game eligibility: each entry has `min`/`max` age and `gender` ('Male' | 'Female' | 'any'). `renderGamesTable()` filters/greys rows based on the entered age and gender (`SHOW_DISABLED_GAMES` keeps a few sports visible-but-disabled even when the entrant isn't eligible, e.g. to show they exist). Checked boxes' `data-price` attributes are summed client-side for the running total in `#total-cost`; the same prices live in `GAMES` and are not otherwise validated server-side.

`renderHouseNumbers()` derives selectable house numbers from the chosen tower: towers in `TWO_HOUSE_TOWERS` get 2 units/floor, others get 4; towers in `TALL_TOWERS` have 21 floors, others have 20 — this is config data specific to the building, not a general pattern.

Form submission uses `mode: 'no-cors'` because Apps Script's redirect-based response doesn't carry CORS headers; this means `fetch` can't actually inspect success/failure and the code just assumes success once the request completes.

## Project-specific requirements

- Any HTML/CSS/JS added must work on mobile screens.
- All prices must be displayed in INR formatting with comma grouping (e.g. ₹1,00,000).
