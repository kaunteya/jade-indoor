// Paste your Apps Script Web App /exec URL here after deploying apps-script/Code.gs
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwXq4SDLwFQ47Ik5G7EnI6vkwpqQuEXF16f_b8WSx1AuEwhlltEo3UFMMGibIZ2WmdN5w/exec';

// gender: 'Male' | 'Female' | 'any' (open to both)
const GAMES = [
	{ id: 'badminton_singles_u14_male', game: 'Badminton', type: 'Singles', ageGroup: '8-13', min: 8, max: 13, gender: 'Male', price: 400 },
	{ id: 'badminton_singles_u14_female', game: 'Badminton', type: 'Singles', ageGroup: '8-13', min: 8, max: 13, gender: 'Female', price: 400 },
	{ id: 'badminton_doubles_u14_male', game: 'Badminton', type: 'Doubles', ageGroup: '8-13', min: 8, max: 13, gender: 'Male', price: 600 },
	{ id: 'badminton_doubles_u14_female', game: 'Badminton', type: 'Doubles', ageGroup: '8-13', min: 8, max: 13, gender: 'Female', price: 600 },
	{ id: 'badminton_singles_14_60_male', game: 'Badminton', type: 'Singles', ageGroup: '14-60', min: 14, max: 60, gender: 'Male', price: 400 },
	{ id: 'badminton_singles_14_60_female', game: 'Badminton', type: 'Singles', ageGroup: '14-60', min: 14, max: 60, gender: 'Female', price: 400 },
	{ id: 'badminton_doubles_14_60_male', game: 'Badminton', type: 'Doubles', ageGroup: '14-60', min: 14, max: 60, gender: 'Male', price: 600 },
	{ id: 'badminton_doubles_14_60_female', game: 'Badminton', type: 'Doubles', ageGroup: '14-60', min: 14, max: 60, gender: 'Female', price: 600 },
	{ id: 'badminton_doubles_60plus', game: 'Badminton', type: 'Doubles', ageGroup: '60+ (flexible)', min: 61, max: Infinity, gender: 'any', price: 600 },

	{ id: 'tt_singles_u14_male', game: 'Table Tennis', type: 'Singles', ageGroup: '8-13', min: 8, max: 13, gender: 'Male', price: 200 },
	{ id: 'tt_singles_u14_female', game: 'Table Tennis', type: 'Singles', ageGroup: '8-13', min: 8, max: 13, gender: 'Female', price: 200 },
	{ id: 'tt_doubles_u14', game: 'Table Tennis', type: 'Doubles', ageGroup: '8-13 (flexible)', min: 8, max: 13, gender: 'any', price: 300 },
	{ id: 'tt_singles_14_60_male', game: 'Table Tennis', type: 'Singles', ageGroup: '14-60', min: 14, max: 60, gender: 'Male', price: 200 },
	{ id: 'tt_singles_14_60_female', game: 'Table Tennis', type: 'Singles', ageGroup: '14-60', min: 14, max: 60, gender: 'Female', price: 200 },
	{ id: 'tt_doubles_14_60', game: 'Table Tennis', type: 'Doubles', ageGroup: '14-60 (flexible)', min: 14, max: 60, gender: 'any', price: 300 },
	{ id: 'tt_singles_60plus', game: 'Table Tennis', type: 'Singles', ageGroup: '60+ (flexible)', min: 61, max: Infinity, gender: 'any', price: 200 },

	{ id: 'carrom_singles', game: 'Carrom', type: 'Singles', ageGroup: '10 and above', min: 10, max: Infinity, gender: 'any', price: 200 },
	{ id: 'carrom_doubles', game: 'Carrom', type: 'Doubles', ageGroup: '10 and above', min: 10, max: Infinity, gender: 'any', price: 300 },

	{ id: 'chess', game: 'Chess', type: '', ageGroup: '8 and above', min: 8, max: Infinity, gender: 'any', price: 200 },

	{ id: 'pool_singles', game: '8-ball pool', type: 'Singles', ageGroup: '15 and above', min: 15, max: Infinity, gender: 'any', price: 200 },
];

const TALL_TOWERS = ['A', 'B', 'G', 'H']; // 21 floors; other towers have 20
const TWO_HOUSE_TOWERS = ['D', 'E'];
const towerSelect = document.getElementById('tower');
const houseNumberSelect = document.getElementById('house_number');

function renderHouseNumbers() {
	const previousValue = houseNumberSelect.value;
	const unitsPerFloor = TWO_HOUSE_TOWERS.includes(towerSelect.value) ? 2 : 4;
	const maxFloor = TALL_TOWERS.includes(towerSelect.value) ? 21 : 20;
	houseNumberSelect.innerHTML = '<option value="" disabled selected>Select…</option>';
	for (let floor = 0; floor <= maxFloor; floor++) {
		const group = document.createElement('optgroup');
		group.label = floor === 0 ? 'Podium floor' : `Floor ${floor}`;
		for (let unit = 1; unit <= unitsPerFloor; unit++) {
			const number = floor * 10 + unit;
			const option = document.createElement('option');
			option.value = number;
			option.textContent = number;
			group.appendChild(option);
		}
		houseNumberSelect.appendChild(group);
	}
	if (previousValue) houseNumberSelect.value = previousValue;
}
towerSelect.addEventListener('change', renderHouseNumbers);
renderHouseNumbers();

const whatsappInput = document.getElementById('whatsapp');
const whatsappCheck = document.getElementById('whatsapp-check');

// Loose E.164-style check: optional leading +, 7-15 digits, not starting with 0 — permissive enough for international numbers.
function isValidPhone(value) {
	const digits = value.replace(/[\s\-()]/g, '');
	return /^\+?[1-9]\d{6,14}$/.test(digits);
}

whatsappInput.addEventListener('input', () => {
	whatsappCheck.hidden = !isValidPhone(whatsappInput.value);
});

const dobInput = document.getElementById('dob');
const genderSelect = document.getElementById('gender');
const gamesTableBody = document.getElementById('games-table-body');

function calculateAge(dobValue, asOf = new Date()) {
	const dob = new Date(dobValue);
	if (isNaN(dob)) return null;
	let age = asOf.getFullYear() - dob.getFullYear();
	const hadBirthdayByAsOf = asOf.getMonth() > dob.getMonth() || (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
	if (!hadBirthdayByAsOf) age--;
	return age;
}

// Age-group eligibility is conventionally reckoned as on 31 July of the event year.
function ageAsOfJuly31st(dobValue) {
	return calculateAge(dobValue, new Date(new Date().getFullYear(), 6, 31));
}

function renderGamesTable() {
	const age = ageAsOfJuly31st(dobInput.value);
	const gender = genderSelect.value;
	if (!age || !gender) {
		gamesTableBody.innerHTML = '';
		return;
	}
	const SHOW_DISABLED_GAMES = ['Carrom', '8-ball pool'];
	gamesTableBody.innerHTML = GAMES
		.map(row => ({ row, eligible: age >= row.min && age <= row.max && (row.gender === 'any' || row.gender === gender) }))
		.filter(({ row, eligible }) => eligible || SHOW_DISABLED_GAMES.includes(row.game))
		.map(({ row, eligible }) => `
		<tr class="${eligible ? '' : 'ineligible'}">
			<td>${eligible ? `<input type="checkbox" name="${row.id}" data-price="${row.price}" data-sport="${row.game}" />` : ''}</td>
			<td>${row.game}</td>
			<td>${row.type} <span class="age-group">${row.ageGroup}</span></td>
			<td>${formatINR(row.price)}</td>
		</tr>
		${eligible && row.type === 'Doubles' ? `
		<tr class="partner-row" hidden>
			<td></td>
			<td colspan="3"><input name="${row.id.split('_')[0]}_partner" placeholder="Partner's name (required)" /></td>
		</tr>
		` : ''}
	`).join('');
}

// Doubles entries need a partner; the input rides in a row under its checkbox and
// is only required while that checkbox is checked (a required hidden input blocks submit).
function updatePartnerRows() {
	gamesTableBody.querySelectorAll('tr.partner-row').forEach(partnerRow => {
		const checked = partnerRow.previousElementSibling.querySelector('input[type="checkbox"]').checked;
		const partnerInput = partnerRow.querySelector('input');
		partnerRow.hidden = !checked;
		partnerInput.required = checked;
		if (!checked) partnerInput.value = ''; // else an unchecked game still submits a stale name
	});
}

// Self-rated level, asked once per sport even when several entries of that sport are checked.
// The number rides on the checkbox's own value, so a checked game submits '2' rather than 'on'
// and lands in that game's sheet column; the selects carry no name and never reach FormData.
const LEVELS = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
const skillLevelsBlock = document.getElementById('skill-levels');
const skillLevelsList = document.getElementById('skill-levels-list');
const skillLevelsNextButton = document.getElementById('skill-levels-next-button');
const skillLevels = {}; // sport -> level, kept across re-renders so unchecking a game doesn't lose the answer

function updateSkillLevels() {
	const rendered = [...skillLevelsList.querySelectorAll('select')];
	rendered.forEach(select => { skillLevels[select.dataset.sport] = select.value; });
	const checked = [...gamesTableBody.querySelectorAll('input[type="checkbox"]:checked')];
	const sports = [...new Set(checked.map(checkbox => checkbox.dataset.sport))];
	// Rebuild only when the sport list actually changes. Rewriting it on every input would detach
	// the <select> the user just touched, and the 'change' that follows its 'input' would then
	// never reach the form — leaving the total, submit button and payment section stale.
	if (sports.join() !== rendered.map(select => select.dataset.sport).join()) skillLevelsList.innerHTML = sports.map(sport => `
		<label class="level-row">
			<span>${sport}</span>
			<select data-sport="${sport}" required>
				<option value="" disabled ${skillLevels[sport] ? '' : 'selected'}>Select…</option>
				${Object.entries(LEVELS).map(([value, label]) => `<option value="${value}" ${skillLevels[sport] === value ? 'selected' : ''}>${label}</option>`).join('')}
			</select>
		</label>
	`).join('');
	checked.forEach(checkbox => { checkbox.value = skillLevels[checkbox.dataset.sport] || ''; });
	// Re-query rather than reuse `rendered`: it's stale whenever the list was just rebuilt above.
	skillLevelsNextButton.disabled = [...skillLevelsList.querySelectorAll('select')].some(select => !select.value);
}

const dobAgeNote = document.getElementById('dob-age');

function showAge() {
	const age = ageAsOfJuly31st(dobInput.value);
	dobAgeNote.textContent = age === null ? '' : `${age} years old`;
	dobAgeNote.hidden = age === null;
}

dobInput.addEventListener('input', () => { showAge(); renderGamesTable(); });
genderSelect.addEventListener('change', renderGamesTable);
renderGamesTable();

const startSection = document.getElementById('section-start');
const personInfoSection = document.getElementById('section-person-info');
const gamesSection = document.getElementById('section-games');
const paymentSection = document.getElementById('section-payment');
const preGameFields = ['name', 'tower', 'house_number', 'whatsapp', 'dob', 'gender']
	.map(id => document.getElementById(id));

function fieldLabel(field) {
	return document.querySelector(`label[for="${field.id}"]`).textContent;
}

function fieldSummary(field) {
	const value = field.id === 'dob'
		? `${new Date(field.value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} (${ageAsOfJuly31st(field.value)} years old)`
		: field.value;
	return `<strong>${fieldLabel(field)}:</strong> ${value}`;
}

function personInfoLines() {
	const [nameField, towerField, houseField, whatsappField, dobField, genderField] = preGameFields;
	return [
		fieldSummary(nameField),
		`<strong>House:</strong> ${towerField.value}-${houseField.value}`,
		fieldSummary(whatsappField),
		fieldSummary(dobField),
		fieldSummary(genderField),
	];
}

const form = document.getElementById('form');
const status = document.getElementById('status');
const totalAmount = document.getElementById('total-amount');
const upiId = document.getElementById('upi-id-text').textContent;
const copyUpiIdButton = document.getElementById('copy-upi-id');

// navigator.clipboard only exists in a secure context; the form is served over plain
// http on the LAN for phone testing, so fall back to the old execCommand path there.
function copyText(text) {
	if (navigator.clipboard) return navigator.clipboard.writeText(text);
	const el = document.createElement('textarea');
	el.value = text;
	document.body.appendChild(el);
	el.select();
	const ok = document.execCommand('copy');
	el.remove();
	return ok ? Promise.resolve() : Promise.reject();
}

copyUpiIdButton.addEventListener('click', async () => {
	try {
		await copyText(upiId);
		copyUpiIdButton.textContent = 'Copied';
	} catch {
		copyUpiIdButton.textContent = 'Copy failed';
	}
	setTimeout(() => { copyUpiIdButton.textContent = 'Copy'; }, 1500);
});
const screenshotInput = document.getElementById('payment_screenshot');
const screenshotField = document.getElementById('screenshot-field');
const screenshotName = document.getElementById('screenshot-name');
const utrInput = document.getElementById('utr_id');
const utrField = document.getElementById('utr-field');
const submitButton = form.querySelector('button[type="submit"]');
const gamesNextButton = document.getElementById('games-next-button');

function proofMethod() {
	return form.querySelector('input[name="proof_method"]:checked').value;
}

// Show the input for the chosen proof method and clear the other, so only the
// selected proof is submitted. utr_id keeps its name and always rides in FormData —
// cleared here it sends '' when a screenshot is used, keeping the sheet column aligned.
function updateProofMethod() {
	const useScreenshot = proofMethod() === 'screenshot';
	screenshotField.hidden = !useScreenshot;
	utrField.hidden = useScreenshot;
	if (useScreenshot) utrInput.value = '';
	else screenshotInput.value = '';
	// the input's own text is hidden in CSS (it reads "No file chosen" until picked)
	screenshotName.textContent = screenshotInput.files[0]?.name || '';
}

function formatINR(amount) {
	return `₹${amount.toLocaleString('en-IN')}`;
}

function updateTotalCost() {
	const checked = [...form.querySelectorAll('input[type="checkbox"]:checked')];
	const total = checked.reduce((sum, checkbox) => sum + Number(checkbox.dataset.price || 0), 0);
	totalAmount.textContent = formatINR(total);
	// Nothing picked, nothing to rate or pay for; a ticked doubles entry without its partner
	// named is incomplete too (updatePartnerRows keeps `required` in sync and runs first).
	const partnersNamed = [...gamesTableBody.querySelectorAll('.partner-row input')]
		.every(input => !input.required || input.value.trim());
	gamesNextButton.disabled = checked.length === 0 || !partnersNamed;
	const hasProof = proofMethod() === 'screenshot' ? !!screenshotInput.value : !!utrInput.value.trim();
	submitButton.disabled = !hasProof;
}

// Downscale a picked image to a small base64 JPEG so a multi-MB phone screenshot
// POSTs reliably over mobile and doesn't bloat Drive/the sheet. Returns the data
// URL plus the drawn dimensions so the server can size the row thumbnail without
// distortion. ponytail: 1080px / quality 0.7 is the ceiling — lift if proofs look too soft.
function resizeToDataUrl(file) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			// Cap width at 1080 and total pixels under Apps Script's 1M-pixel insertImage limit
			// (a tall portrait screenshot at 1080 wide blows past it), whichever is smaller.
			const scale = Math.min(1, 1080 / img.width, Math.sqrt(950000 / (img.width * img.height)));
			const w = Math.round(img.width * scale);
			const h = Math.round(img.height * scale);
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			canvas.getContext('2d').drawImage(img, 0, 0, w, h);
			URL.revokeObjectURL(img.src);
			resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.7), w, h });
		};
		img.onerror = reject;
		img.src = URL.createObjectURL(file);
	});
}

// Both events, one handler: 'change' alone missed edits that only fire 'input' (typing a date of
// birth, some browsers' checkbox behaviour), and running everything together keeps the partner
// rows, level selects and total from ever disagreeing about what's currently ticked.
['input', 'change'].forEach(type => form.addEventListener(type, () => {
	updatePartnerRows();
	updateSkillLevels();
	updateProofMethod();
	updateTotalCost();
}));
updateProofMethod();
updateTotalCost();

const postSubmissionSection = document.getElementById('section-post-submission');
const postSubmissionInfo = document.getElementById('post-submission-info');
const postSubmissionGamesBody = document.getElementById('post-submission-games-body');
const postSubmissionTotal = document.getElementById('post-submission-total');
const submitAnotherButton = document.getElementById('submit-another-button');
const paymentPreviewInfo = document.getElementById('payment-preview-info');
const paymentPreviewGames = document.getElementById('payment-preview-games');
const paymentPreviewTotal = document.getElementById('payment-preview-total');
const payCalloutAmount = document.getElementById('pay-callout-amount');

// One row per ticked game, read back off the game's own table row so the wording always
// matches what the user saw when picking. Same markup for the payment preview and the
// final receipt — both tables carry the identical Game/Category/Partner/Level/Price columns.
function gameRowsHtml() {
	return [...gamesTableBody.querySelectorAll('input[type="checkbox"]:checked')].map(checkbox => {
		const gameRow = checkbox.closest('tr');
		const cells = gameRow.querySelectorAll('td');
		const nextRow = gameRow.nextElementSibling;
		const partner = nextRow?.classList.contains('partner-row') ? nextRow.querySelector('input').value : '';
		return `
		<tr>
			<td>${cells[1].textContent}</td>
			<td>${cells[2].textContent.trim()}</td>
			<td>${partner || '—'}</td>
			<td>${LEVELS[checkbox.value] || '—'}</td>
			<td>${cells[3].textContent}</td>
		</tr>
	`;
	}).join('');
}

// Recap on the payment step: what you're about to pay for, before you pay.
function renderPaymentPreview() {
	paymentPreviewInfo.innerHTML = personInfoLines().join('<br>');
	paymentPreviewGames.innerHTML = gameRowsHtml();
	paymentPreviewTotal.textContent = totalAmount.textContent;
	payCalloutAmount.textContent = totalAmount.textContent;
}

function showPostSubmissionSummary() {
	postSubmissionInfo.innerHTML = personInfoLines().map(line => `<p>${line}</p>`).join('');
	postSubmissionGamesBody.innerHTML = gameRowsHtml();
	postSubmissionTotal.textContent = totalAmount.textContent;
	showStep(STEPS.length - 1);
}

// One view at a time. Every section's visibility runs through showStep() — nothing else
// touches .hidden on a section, so the wizard can't end up showing two steps at once.
const STEPS = [startSection, personInfoSection, gamesSection, skillLevelsBlock, paymentSection, postSubmissionSection];
let step = 0;

function showStep(index) {
	step = index;
	STEPS.forEach((section, i) => { section.hidden = i !== index; });
	// Branding is the landing screen's job; later steps get the vertical space instead.
	document.querySelectorAll('.first-view-only').forEach(element => { element.hidden = index !== 0; });
	document.body.classList.toggle('past-first-view', index !== 0);
	if (STEPS[index] === paymentSection) renderPaymentPreview();
	window.scrollTo(0, 0);
}

// Browser constraint validation is the whole check: everything that must be answered is
// marked required in the markup, and partner names become required only while their game
// is ticked (see updatePartnerRows), so a hidden partner row never blocks Next.
function currentStepIsValid() {
	const invalidField = [...STEPS[step].querySelectorAll('input, select')].find(field => !field.checkValidity());
	if (invalidField) invalidField.reportValidity();
	return !invalidField;
}

document.querySelectorAll('.next-step').forEach(button =>
	button.addEventListener('click', () => { if (currentStepIsValid()) showStep(step + 1); }));
document.querySelectorAll('.back-step').forEach(button =>
	button.addEventListener('click', () => showStep(step - 1)));

document.getElementById('download-pdf-button').addEventListener('click', () => window.print());

submitAnotherButton.addEventListener('click', () => {
	form.reset();
	Object.keys(skillLevels).forEach(sport => delete skillLevels[sport]);
	renderGamesTable();
	showAge();
	updateSkillLevels();
	updateProofMethod();
	updateTotalCost();
	whatsappCheck.hidden = true;
	status.textContent = '';
	status.className = '';
	showStep(0);
});

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (STEPS[step] !== paymentSection) return; // Enter in a text field implicitly submits; ignore it mid-wizard
	submitButton.disabled = true;
	status.textContent = 'Submitting…';

	try {
		const body = new FormData(form);
		if (proofMethod() === 'screenshot' && screenshotInput.files[0]) {
			const { dataUrl, w, h } = await resizeToDataUrl(screenshotInput.files[0]);
			body.append('payment_screenshot', dataUrl);
			body.append('screenshot_w', w);
			body.append('screenshot_h', h);
		}
		// no-cors: Apps Script's redirect response doesn't carry CORS headers,
		// which would otherwise make fetch throw even on a successful write.
		await fetch(SCRIPT_URL, {
			method: 'POST',
			mode: 'no-cors',
			body,
		});
		status.textContent = '';
		status.className = '';
		showPostSubmissionSummary();
	} catch (err) {
		status.textContent = 'Something went wrong. Please try again.';
		status.className = 'error';
	} finally {
		submitButton.disabled = false;
	}
});
