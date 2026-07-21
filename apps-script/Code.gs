// Paste this into script.google.com, bound to the target Sheet, then deploy as a Web App.
// Deploy > New deployment > Web app > Execute as "Me", Access "Anyone with the link".

const SHEET_NAME = 'Sheet1'; // change to match your sheet tab name
const FIELDS = ['name', 'tower', 'house_number', 'whatsapp', 'age', 'gender']; // change to match your form field names, in column order
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
	GAME_FIELDS.forEach(field => row.push(!!e.parameter[field])); // real boolean -> Sheets renders TRUE/FALSE
	row.push(new Date());
	sheet.appendRow(row);

	return ContentService
		.createTextOutput(JSON.stringify({ result: 'success' }))
		.setMimeType(ContentService.MimeType.JSON);
}
