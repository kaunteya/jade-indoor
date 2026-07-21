// Paste your Apps Script Web App /exec URL here after deploying apps-script/Code.gs
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwXq4SDLwFQ47Ik5G7EnI6vkwpqQuEXF16f_b8WSx1AuEwhlltEo3UFMMGibIZ2WmdN5w/exec';

// gender: 'Male' | 'Female' | 'any' (open to both)
const TT_CATEGORIES = [
	{ label: 'Singles (Boys Under 14)', min: 0, max: 13, gender: 'Male' },
	{ label: 'Singles (Girls Under 14)', min: 0, max: 13, gender: 'Female' },
	{ label: 'Doubles (Under 14, flexible)', min: 0, max: 13, gender: 'any' },
	{ label: 'Singles (Men 14-60)', min: 14, max: 60, gender: 'Male' },
	{ label: 'Singles (Women 14-60)', min: 14, max: 60, gender: 'Female' },
	{ label: 'Doubles (14-60, flexible)', min: 14, max: 60, gender: 'any' },
	{ label: 'Singles (60+, flexible)', min: 61, max: Infinity, gender: 'any' },
];
const BADMINTON_CATEGORIES = [
	{ label: 'Singles (Boys Under 14)', min: 0, max: 13, gender: 'Male' },
	{ label: 'Singles (Girls Under 14)', min: 0, max: 13, gender: 'Female' },
	{ label: 'Doubles (Boys Under 14)', min: 0, max: 13, gender: 'Male' },
	{ label: 'Doubles (Girls Under 14)', min: 0, max: 13, gender: 'Female' },
	{ label: 'Singles (Men 14-60)', min: 14, max: 60, gender: 'Male' },
	{ label: 'Singles (Women 14-60)', min: 14, max: 60, gender: 'Female' },
	{ label: 'Doubles (Men 14-60)', min: 14, max: 60, gender: 'Male' },
	{ label: 'Doubles (Women 14-60)', min: 14, max: 60, gender: 'Female' },
	{ label: 'Doubles (60+, flexible)', min: 61, max: Infinity, gender: 'any' },
];

const MAX_FLOOR = 20;
const TWO_HOUSE_TOWERS = ['D', 'E'];
const towerSelect = document.getElementById('tower');
const houseNumberSelect = document.getElementById('house_number');

function renderHouseNumbers() {
	const previousValue = houseNumberSelect.value;
	const unitsPerFloor = TWO_HOUSE_TOWERS.includes(towerSelect.value) ? 2 : 4;
	houseNumberSelect.innerHTML = '<option value="" disabled selected>Select…</option>';
	for (let floor = 0; floor <= MAX_FLOOR; floor++) {
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

const ageInput = document.getElementById('age');
const genderSelect = document.getElementById('gender');
const MIN_AGE_GAMES = [
	{ checkboxes: [...document.querySelectorAll('input[name="pool_category"]')], hint: document.getElementById('pool-hint'), minAge: 15 },
	{ checkboxes: [...document.querySelectorAll('input[name="carrom_category"]')], hint: document.getElementById('carrom-hint'), minAge: 10 },
];

function updateMinAgeGames() {
	const age = parseInt(ageInput.value, 10);
	for (const { checkboxes, hint, minAge } of MIN_AGE_GAMES) {
		const tooYoung = age < minAge;
		hint.hidden = !tooYoung;
		for (const checkbox of checkboxes) {
			checkbox.disabled = tooYoung;
			if (tooYoung) checkbox.checked = false;
			checkbox.closest('label').hidden = tooYoung;
		}
	}
}

function renderCategories(container, fieldName, categories, age, gender, prefix) {
	if (!age || !gender) {
		container.innerHTML = '';
		return;
	}
	const eligible = categories.filter(cat =>
		age >= cat.min && age <= cat.max && (cat.gender === 'any' || cat.gender === gender)
	);
	container.innerHTML = eligible.map(cat =>
		`<label><input type="checkbox" name="${fieldName}" value="${cat.label}" /> ${prefix} ${cat.label}</label>`
	).join('');
}

function updateCategories() {
	const age = parseInt(ageInput.value, 10);
	const gender = genderSelect.value;
	renderCategories(document.getElementById('tt-options'), 'tt_category', TT_CATEGORIES, age, gender, 'Table Tennis');
	renderCategories(document.getElementById('badminton-options'), 'badminton_category', BADMINTON_CATEGORIES, age, gender, 'Badminton');
	updateMinAgeGames();
}

ageInput.addEventListener('input', updateCategories);
genderSelect.addEventListener('change', updateCategories);
updateCategories();

const gameSections = document.getElementById('game-sections');
const preGameFields = ['name', 'email', 'tower', 'house_number', 'whatsapp', 'age', 'gender']
	.map(id => document.getElementById(id));

function updateGameSectionsVisibility() {
	gameSections.hidden = !preGameFields.every(field => field.checkValidity() && field.value.trim() !== '');
}

const form = document.getElementById('form');
const status = document.getElementById('status');

form.addEventListener('input', updateGameSectionsVisibility);
form.addEventListener('change', updateGameSectionsVisibility);
updateGameSectionsVisibility();

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	const button = form.querySelector('button');
	button.disabled = true;
	status.textContent = 'Submitting…';

	try {
		// no-cors: Apps Script's redirect response doesn't carry CORS headers,
		// which would otherwise make fetch throw even on a successful write.
		await fetch(SCRIPT_URL, {
			method: 'POST',
			mode: 'no-cors',
			body: new FormData(form),
		});
		status.textContent = 'Thanks! Your response was recorded.';
		form.reset();
		updateCategories();
	} catch (err) {
		status.textContent = 'Something went wrong. Please try again.';
	} finally {
		button.disabled = false;
	}
});
