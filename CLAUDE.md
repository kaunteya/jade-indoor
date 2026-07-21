# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single static registration form (Jade Indoor Sports Festival) with no build step and no dependencies. `index.html` + `style.css` + `app.js` run directly in the browser; `app.js` POSTs the form to a Google Apps Script Web App (`apps-script/Code.gs`), which appends a row to a Google Sheet.

## Running / testing

No build tools, package manager, or test suite. Open `index.html` directly in a browser (or serve the directory with any static file server) to work on the frontend.

To test the submit path end-to-end, `apps-script/Code.gs` must be pasted into a Google Apps Script project bound to a target Sheet and deployed as a Web App (Deploy > New deployment > Web app, Execute as "Me", Access "Anyone with the link"). The deployed `/exec` URL then goes in `SCRIPT_URL` at the top of `app.js`.

## Architecture

The frontend and the Apps Script backend are two separate files with no shared module or build step connecting them — `apps-script/Code.gs` is deployed by pasting its contents into script.google.com, not by any script in this repo. Because of that, several things must be kept in sync by hand:

- **`FIELDS`** in `Code.gs` must match the plain form field `name`/`id` attributes in `index.html`, in the order columns should appear in the sheet.
- **`GAME_FIELDS`** in `Code.gs` must match the `id`s in the `GAMES` array in `app.js`, in the same order — each game/category checkbox becomes one boolean column in the sheet (`!!e.parameter[field]`), rather than the old approach of one multi-value column per sport.

`app.js`'s `GAMES` array is the single source of truth for game eligibility: each entry has `min`/`max` age and `gender` ('Male' | 'Female' | 'any'). `renderGamesTable()` filters/greys rows based on the entered age and gender (`SHOW_DISABLED_GAMES` keeps a few sports visible-but-disabled even when the entrant isn't eligible, e.g. to show they exist). Checked boxes' `data-price` attributes are summed client-side for the running total in `#total-cost`; the same prices live in `GAMES` and are not otherwise validated server-side.

`renderHouseNumbers()` derives selectable house numbers from the chosen tower: towers in `TWO_HOUSE_TOWERS` get 2 units/floor, others get 4, across `MAX_FLOOR` floors — this is config data specific to the building, not a general pattern.

Form submission uses `mode: 'no-cors'` because Apps Script's redirect-based response doesn't carry CORS headers; this means `fetch` can't actually inspect success/failure and the code just assumes success once the request completes.

## Project-specific requirements

- Any HTML/CSS/JS added must work on mobile screens.
- All prices must be displayed in INR formatting with comma grouping (e.g. ₹1,00,000).
