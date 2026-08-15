// Paste this into script.google.com, bound to the target Sheet, then deploy as a Web App.
// Deploy > New deployment > Web app > Execute as "Me", Access "Anyone".
// Access must be "Anyone", not "Anyone with Google account" — the latter requires
// the submitter to be logged in and can silently block accounts outside your org,
// which mode: 'no-cors' in app.js hides from the user (see app.js submit handler).

const SHEET_NAME = 'Sheet1'; // change to match your sheet tab name
const FIELDS = ['first_name', 'last_name', 'tower', 'house_number', 'whatsapp', 'dob', 'age', 'gender']; // change to match your form field names, in column order ('age' is derived from dob, not a form field)

// Age in whole years from a yyyy-mm-dd dob string, as of today. '' if dob is blank/invalid.
function ageFromDob(dobValue) {
	const dob = new Date(dobValue);
	if (isNaN(dob)) return '';
	const now = new Date();
	let age = now.getFullYear() - dob.getFullYear();
	if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
	return age;
}
const SCREENSHOT_FOLDER = 'Jade payment screenshots'; // Drive folder for payment proofs; created on first use

function screenshotFolder() {
	const it = DriveApp.getFoldersByName(SCREENSHOT_FOLDER);
	return it.hasNext() ? it.next() : DriveApp.createFolder(SCREENSHOT_FOLDER);
}
// One column per game/category entry, in the sheet's own column order — this list has to
// match the sheet, not games.js. The sheet predates every category merge since and still
// carries the original column per category, so GAME_ID_FOR folds each merged-away column
// onto the single id games.js now uses. Collapse the columns in the sheet and the folded
// entries here can become one apiece.
const GAME_FIELDS = [
	'badminton_singles_u14_male', 'badminton_singles_u14_female',
	'badminton_doubles_u14_male', 'badminton_doubles_u14_female',
	'badminton_singles_14_60_male', 'badminton_singles_14_60_female', 'badminton_doubles_14_60_male', 'badminton_doubles_14_60_female',
	'badminton_doubles_60plus', 'badminton_partner',
	'tt_singles_u14_male', 'tt_singles_u14_female', 'tt_doubles_u14',
	'tt_singles_14_60_male', 'tt_singles_14_60_female', 'tt_doubles_14_60', 'tt_singles_60plus', 'tt_partner',
	'carrom_singles', 'carrom_doubles', 'carrom_partner',
	'chess',
	'pool_singles',
];

// sheet column -> the games.js id it belongs to; anything absent maps to itself. These are
// the same merges scripts/draw.py makes when it builds the field for a category, so the
// entrant list and the draws name the same categories.
const GAME_ID_FOR = {
	badminton_doubles_u14_male: 'badminton_doubles_u14',
	badminton_doubles_u14_female: 'badminton_doubles_u14',
	badminton_doubles_60plus: 'badminton_doubles_14_60_male',
	tt_doubles_u14: 'tt_doubles_14_60',
};

function gameId(field) {
	return GAME_ID_FOR[field] || field;
}

function doPost(e) {
	const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
	const row = FIELDS.map(field => field === 'age' ? ageFromDob(e.parameter.dob) : (e.parameter[field] || ''));
	row.push(new Date()); // date of registration, right after gender
	// Every game gets one numeric column: 0 = not entered, 1 = beginner, 2 = intermediate, 3 = expert.
	// The level arrives as the checkbox's own value (see app.js updateSkillLevels), so an unchecked
	// game sends no parameter at all. Each sport also has one '<sport>_partner' text column for the
	// doubles partner's name (app.js keys the input by sport prefix); a person only enters one doubles
	// category per sport, so one column per sport suffices.
	GAME_FIELDS.forEach(field => {
		if (field.endsWith('_partner')) { row.push(e.parameter[field] || ''); return; }
		const id = gameId(field);
		// A folded column (GAME_ID_FOR) takes the entry only when it is the half matching the
		// entrant's gender — that is the U14 doubles pair, where two sheet columns share one
		// form checkbox. A column folded away outright (60+ badminton doubles, U14 TT doubles)
		// matches no gender, so it stays 0 and the entry lands in the column it merged into.
		const split = id !== field && !field.endsWith('_' + String(e.parameter.gender || '').toLowerCase());
		row.push(split ? 0 : Number(e.parameter[id] || 0));
	});
	row.push(Number(e.parameter.total_amount || 0)); // total ₹ paid, summed client-side (app.js)
	const col = row.length + 1; // 1-based; the next pushed cell is the screenshot link column
	row.push(''); // screenshot link column — last column
	sheet.appendRow(row);

	// Payment screenshot arrives as a downscaled base64 JPEG (app.js resizeToDataUrl).
	// Store the file privately in Drive and surface it on the row as a clickable link
	// plus a floating thumbnail anchored a column further right so it doesn't cover the link.
	const ss = e.parameter.payment_screenshot;
	const lastRow = sheet.getLastRow();
	if (ss) {
		// no-cors in app.js discards the response, so any failure here would otherwise
		// be invisible — write the error into the cell instead of leaving it blank.
		try {
			const bytes = Utilities.base64Decode(ss.split(',')[1]);
			const blob = Utilities.newBlob(bytes, 'image/jpeg', (e.parameter.name || 'payment') + '.jpg');
			const file = screenshotFolder().createFile(blob); // private, owned by the deploying account
			sheet.getRange(lastRow, col).setFormula('=HYPERLINK("' + file.getUrl() + '","open")');
			const h = 60, scale = h / Number(e.parameter.screenshot_h || h);
			sheet.insertImage(blob, col + 1, lastRow)
				.setHeight(h).setWidth(Math.round(Number(e.parameter.screenshot_w || h) * scale));
			sheet.setRowHeight(lastRow, 64);
		} catch (err) {
			sheet.getRange(lastRow, col).setValue('ERR: ' + err);
		}
	}

	return ContentService
		.createTextOutput(JSON.stringify({ result: 'success' }))
		.setMimeType(ContentService.MimeType.JSON);
}

// GET on the same /exec URL feeds list/index.html: the entrants of every game category,
// cut down to the fields that page shows. Set LIST_KEY to require ?key=<secret> on the
// GET (the list page passes through its own ?key=), or leave it '' to keep the read open.
const LIST_KEY = '';

function doGet(e) {
	const params = (e && e.parameter) || {};
	const payload = (LIST_KEY && params.key !== LIST_KEY) ? { error: 'unauthorized' } : listEntrants();
	const json = JSON.stringify(payload);
	// A plain JSON response relies on the redirect Apps Script serves keeping its CORS
	// headers; callback= gives the page a JSONP path for when it doesn't (see list/list.js).
	return params.callback
		? ContentService.createTextOutput(params.callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT)
		: ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// { games: { <game id>: [ { name, house, age, gender, level, partner } ] } }, keyed by the
// same ids as GAME_FIELDS / app.js's GAMES array. Games nobody entered come back as [].
// Phone numbers and dates of birth are deliberately left out: no page shows them, and
// anything sent would be readable by anyone with the page open. gender is included for
// search/, which shows a participant's own details back to them; search/ treats it as
// optional, so an older deployment of this file leaves that one row out rather than break.
function listEntrants() {
	const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
	const values = sheet.getDataRange().getDisplayValues();
	// doPost appends bare rows, so any header/summary rows above the data were added by
	// hand and aren't a fixed count — find the header by its first cell instead.
	let firstDataRow = 0;
	for (let i = 0; i < Math.min(values.length, 10); i++) {
		if (String(values[i][0]).trim().toLowerCase() === 'first name') { firstDataRow = i + 1; break; }
	}
	const at = {};
	FIELDS.forEach((field, i) => { at[field] = i; });
	const gamesStart = FIELDS.length + 1; // + 1 for the registration-date column doPost pushes

	const games = {};
	GAME_FIELDS.forEach(field => { if (!field.endsWith('_partner')) games[gameId(field)] = []; });

	for (let r = firstDataRow; r < values.length; r++) {
		const row = values[r];
		const name = (String(row[at.first_name]).trim() + ' ' + String(row[at.last_name]).trim()).trim();
		if (!name) continue;
		GAME_FIELDS.forEach((field, i) => {
			const level = Number(row[gamesStart + i]);
			if (field.endsWith('_partner') || !level) return;
			// One partner column per sport (see the doPost note), keyed by the id's sport prefix.
			const partnerAt = GAME_FIELDS.indexOf(field.split('_')[0] + '_partner');
			games[gameId(field)].push({
				name: name,
				house: String(row[at.tower]).trim() + '-' + String(row[at.house_number]).trim(),
				age: String(row[at.age]).trim(),
				gender: String(row[at.gender]).trim(),
				level: level,
				partner: partnerAt === -1 ? '' : String(row[gamesStart + partnerAt]).trim(),
			});
		});
	}
	return { updated: new Date().toISOString(), games: games };
}
