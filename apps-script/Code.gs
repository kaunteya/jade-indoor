// Paste this into script.google.com, bound to the target Sheet, then deploy as a Web App.
// Deploy > New deployment > Web app > Execute as "Me", Access "Anyone".
// Access must be "Anyone", not "Anyone with Google account" — the latter requires
// the submitter to be logged in and can silently block accounts outside your org,
// which mode: 'no-cors' in app.js hides from the user (see app.js submit handler).

const SHEET_NAME = 'Sheet1'; // change to match your sheet tab name
const FIELDS = ['name', 'tower', 'house_number', 'whatsapp', 'dob', 'gender', 'utr_id']; // change to match your form field names, in column order
// one checkbox field per game/category entry in app.js's GAMES array, in column order
const GAME_FIELDS = [
	'badminton_singles_u14_male', 'badminton_singles_u14_female', 'badminton_doubles_u14_male', 'badminton_doubles_u14_female',
	'badminton_singles_14_60_male', 'badminton_singles_14_60_female', 'badminton_doubles_14_60_male', 'badminton_doubles_14_60_female',
	'badminton_doubles_60plus',
	'tt_singles_u14_male', 'tt_singles_u14_female', 'tt_doubles_u14',
	'tt_singles_14_60_male', 'tt_singles_14_60_female', 'tt_doubles_14_60', 'tt_singles_60plus',
	'carrom_singles', 'carrom_doubles',
	'chess',
	'pool_singles',
];

function doPost(e) {
	const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
	const row = FIELDS.map(field => e.parameter[field] || '');
	// Singles columns hold a real boolean (Sheets renders TRUE/FALSE). Doubles columns hold the
	// partner's name instead — a non-empty name IS the "selected" signal, '' means not picked.
	// Doubles are detected by 'doubles' in the id rather than a second hand-synced list.
	GAME_FIELDS.forEach(field => row.push(
		field.indexOf('doubles') !== -1 ? (e.parameter[field] && e.parameter[field + '_partner'] || '') : !!e.parameter[field]
	));
	row.push(new Date());
	sheet.appendRow(row);

	return ContentService
		.createTextOutput(JSON.stringify({ result: 'success' }))
		.setMimeType(ContentService.MimeType.JSON);
}
