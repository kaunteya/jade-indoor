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
	const age = calculateAge(dobInput.value);
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
			<td>${eligible ? `<input type="checkbox" name="${row.id}" data-price="${row.price}" />` : ''}</td>
			<td>${row.game}</td>
			<td>${row.type}</td>
			<td>${row.ageGroup}</td>
			<td>${row.price}</td>
		</tr>
	`).join('');
}

dobInput.addEventListener('input', renderGamesTable);
genderSelect.addEventListener('change', renderGamesTable);
renderGamesTable();

const personInfoSection = document.getElementById('section-person-info');
const gamesSection = document.getElementById('section-games');
const paymentSection = document.getElementById('section-payment');
const preGameFields = ['name', 'tower', 'house_number', 'whatsapp', 'dob', 'gender']
	.map(id => document.getElementById(id));

const userInfoFields = document.getElementById('user-info-fields');
const userInfoSummary = document.getElementById('user-info-summary');
const userInfoSummaryText = document.getElementById('user-info-summary-text');
const nextButton = document.getElementById('next-button');
const editButton = document.getElementById('edit-button');

function fieldLabel(field) {
	return document.querySelector(`label[for="${field.id}"]`).textContent;
}

function fieldSummary(field) {
	const value = field.id === 'dob'
		? `${new Date(field.value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} (${ageAsOfJuly31st(field.value)}yrs old)`
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

function showUserInfoSummary() {
	userInfoSummaryText.innerHTML = personInfoLines().join('<br>');
	userInfoFields.hidden = true;
	userInfoSummary.hidden = false;
	gamesSection.hidden = false;
	updateTotalCost();
}

nextButton.addEventListener('click', () => {
	const invalidField = preGameFields.find(field => !field.checkValidity());
	if (invalidField) {
		invalidField.reportValidity();
		return;
	}
	showUserInfoSummary();
});

editButton.addEventListener('click', () => {
	userInfoSummary.hidden = true;
	userInfoFields.hidden = false;
	gamesSection.hidden = true;
	paymentSection.hidden = true;
});

const form = document.getElementById('form');
const status = document.getElementById('status');
const totalAmount = document.getElementById('total-amount');
const upiId = 'vypar.172254121089@hdfcbank';
const upiLinkOther = document.getElementById('upi-link-other');
const utrInput = document.getElementById('utr_id');
const utrError = document.getElementById('utr-error');
const submitButton = form.querySelector('button[type="submit"]');

function updateUtrError() {
	utrError.hidden = utrInput.value.length === 0 || utrInput.value.length === 12;
}

utrInput.addEventListener('input', () => {
	utrInput.value = utrInput.value.replace(/\D/g, '').slice(0, 12);
	updateUtrError();
});

function formatINR(amount) {
	return amount.toLocaleString('en-IN');
}

function updateTotalCost() {
	const checked = [...form.querySelectorAll('input[type="checkbox"]:checked')];
	const total = checked.reduce((sum, checkbox) => sum + Number(checkbox.dataset.price || 0), 0);
	totalAmount.textContent = `₹${formatINR(total)}`;
	const upiParams = `pa=${upiId}&pn=Jade%20Indoor%20Sports%20Festival&am=${total}&cu=INR`;
	upiLinkOther.href = `upi://pay?${upiParams}`;
	paymentSection.hidden = total === 0;
	submitButton.hidden = checked.length === 0 || !utrInput.checkValidity();
}

form.addEventListener('change', updateTotalCost);
utrInput.addEventListener('input', updateTotalCost);
updateTotalCost();

const postSubmissionSection = document.getElementById('section-post-submission');
const postSubmissionInfo = document.getElementById('post-submission-info');
const postSubmissionGamesBody = document.getElementById('post-submission-games-body');
const postSubmissionTotal = document.getElementById('post-submission-total');
const submitAnotherButton = document.getElementById('submit-another-button');

function showPostSubmissionSummary() {
	postSubmissionInfo.innerHTML = personInfoLines().map(line => `<p>${line}</p>`).join('');
	postSubmissionGamesBody.innerHTML = [...form.querySelectorAll('input[type="checkbox"]:checked')].map(checkbox => {
		const cells = checkbox.closest('tr').querySelectorAll('td');
		return `
		<tr>
			<td>${cells[1].textContent}</td>
			<td>${cells[2].textContent}</td>
			<td>${cells[4].textContent}</td>
		</tr>
	`;
	}).join('');
	postSubmissionTotal.innerHTML = `Total paid: <span class="amount-pill">${totalAmount.textContent}</span>`;
	personInfoSection.hidden = true;
	gamesSection.hidden = true;
	paymentSection.hidden = true;
	postSubmissionSection.hidden = false;
}

submitAnotherButton.addEventListener('click', () => {
	form.reset();
	renderGamesTable();
	updateTotalCost();
	updateUtrError();
	whatsappCheck.hidden = true;
	status.textContent = '';
	status.className = '';
	postSubmissionSection.hidden = true;
	personInfoSection.hidden = false;
	userInfoFields.hidden = false;
	userInfoSummary.hidden = true;
	gamesSection.hidden = true;
});

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	submitButton.disabled = true;
	status.textContent = 'Submitting…';

	try {
		// no-cors: Apps Script's redirect response doesn't carry CORS headers,
		// which would otherwise make fetch throw even on a successful write.
		await fetch(SCRIPT_URL, {
			method: 'POST',
			mode: 'no-cors',
			body: new FormData(form),
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
