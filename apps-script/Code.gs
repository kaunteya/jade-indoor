// Paste this into script.google.com, bound to the target Sheet, then deploy as a Web App.
// Deploy > New deployment > Web app > Execute as "Me", Access "Anyone".
// Access must be "Anyone", not "Anyone with Google account" — the latter requires
// the submitter to be logged in and can silently block accounts outside your org,
// which mode: 'no-cors' in app.js hides from the user (see app.js submit handler).

const SHEET_NAME = 'Sheet1'; // change to match your sheet tab name
const FIELDS = ['name', 'tower', 'house_number', 'whatsapp', 'dob', 'gender']; // change to match your form field names, in column order (utr_id is appended as the last column)
const SCREENSHOT_FOLDER = 'Jade payment screenshots'; // Drive folder for payment proofs; created on first use

function screenshotFolder() {
	const it = DriveApp.getFoldersByName(SCREENSHOT_FOLDER);
	return it.hasNext() ? it.next() : DriveApp.createFolder(SCREENSHOT_FOLDER);
}
// one checkbox field per game/category entry in app.js's GAMES array, in column order
const GAME_FIELDS = [
	'badminton_singles_u14_male', 'badminton_singles_u14_female', 'badminton_doubles_u14_male', 'badminton_doubles_u14_female',
	'badminton_singles_14_60_male', 'badminton_singles_14_60_female', 'badminton_doubles_14_60_male', 'badminton_doubles_14_60_female',
	'badminton_doubles_60plus', 'badminton_partner',
	'tt_singles_u14_male', 'tt_singles_u14_female', 'tt_doubles_u14',
	'tt_singles_14_60_male', 'tt_singles_14_60_female', 'tt_doubles_14_60', 'tt_singles_60plus', 'tt_partner',
	'carrom_singles', 'carrom_doubles', 'carrom_partner',
	'chess',
	'pool_singles',
];

function doPost(e) {
	const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
	const row = FIELDS.map(field => e.parameter[field] || '');
	// Every game gets one numeric column: 0 = not entered, 1 = beginner, 2 = intermediate, 3 = expert.
	// The level arrives as the checkbox's own value (see app.js updateSkillLevels), so an unchecked
	// game sends no parameter at all. Each sport also has one '<sport>_partner' text column for the
	// doubles partner's name (app.js keys the input by sport prefix); a person only enters one doubles
	// category per sport, so one column per sport suffices.
	GAME_FIELDS.forEach(field => {
		row.push(field.endsWith('_partner') ? (e.parameter[field] || '') : Number(e.parameter[field] || 0));
	});
	row.push(new Date());
	const col = row.length + 1; // 1-based; the next pushed cell is the screenshot link column
	row.push(''); // screenshot link column
	row.push(''); // spacer sitting under the floating thumbnail (image anchors here)
	row.push(e.parameter.utr_id || ''); // UPI/UTR id — last column
	sheet.appendRow(row);

	// Payment screenshot arrives as a downscaled base64 JPEG (app.js resizeToDataUrl).
	// Store the file privately in Drive and surface it on the row as a clickable link
	// plus a floating thumbnail anchored one column to the right for at-a-glance review.
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
