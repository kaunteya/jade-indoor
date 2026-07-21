// Paste this into script.google.com, bound to the target Sheet, then deploy as a Web App.
// Deploy > New deployment > Web app > Execute as "Me", Access "Anyone with the link".

const SHEET_NAME = 'Sheet1'; // change to match your sheet tab name
const FIELDS = ['name', 'email', 'tower', 'house_number', 'whatsapp', 'age', 'gender']; // change to match your form field names, in column order
const MULTI_FIELDS = ['games', 'tt_category', 'badminton_category']; // checkbox fields that can submit more than one value

function doPost(e) {
	const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
	const row = FIELDS.map(field => e.parameter[field] || '');
	MULTI_FIELDS.forEach(field => row.push((e.parameters[field] || []).join(', ')));
	row.push(new Date());
	sheet.appendRow(row);

	return ContentService
		.createTextOutput(JSON.stringify({ result: 'success' }))
		.setMimeType(ContentService.MimeType.JSON);
}
