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
	// Every game gets one numeric column: 0 = not entered, 1 = beginner, 2 = intermediate, 3 = expert.
	// The level arrives as the checkbox's own value (see app.js updateSkillLevels), so an unchecked
	// game sends no parameter at all. Doubles games add a second column right after, for the partner's
	// name; doubles are detected by 'doubles' in the id rather than a second hand-synced list, so a
	// doubles id missing that word would silently lose its partner column.
	GAME_FIELDS.forEach(field => {
		row.push(Number(e.parameter[field] || 0));
		if (field.indexOf('doubles') !== -1) row.push(e.parameter[field + '_partner'] || '');
	});
	row.push(new Date());
	sheet.appendRow(row);

	return ContentService
		.createTextOutput(JSON.stringify({ result: 'success' }))
		.setMimeType(ContentService.MimeType.JSON);
}
