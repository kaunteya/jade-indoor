// Paste your Apps Script Web App /exec URL here after deploying apps-script/Code.gs
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwXq4SDLwFQ47Ik5G7EnI6vkwpqQuEXF16f_b8WSx1AuEwhlltEo3UFMMGibIZ2WmdN5w/exec';

// gender: 'Male' | 'Female' | 'any' (open to both)
const TT_CATEGORIES = [
	{ label: 'Under 14 boys singles', min: 0, max: 13, gender: 'Male' },
	{ label: 'Under 14 girls singles', min: 0, max: 13, gender: 'Female' },
	{ label: 'Under 14 doubles (flexible)', min: 0, max: 13, gender: 'any' },
	{ label: "14-60 Men's singles", min: 14, max: 60, gender: 'Male' },
	{ label: "14-60 Women's singles", min: 14, max: 60, gender: 'Female' },
	{ label: '14-60 doubles (flexible)', min: 14, max: 60, gender: 'any' },
	{ label: '60+ singles (flexible)', min: 61, max: Infinity, gender: 'any' },
];
const BADMINTON_CATEGORIES = [
	{ label: 'Under 14 boys singles', min: 0, max: 13, gender: 'Male' },
	{ label: 'Under 14 girls singles', min: 0, max: 13, gender: 'Female' },
	{ label: 'Under 14 boys doubles', min: 0, max: 13, gender: 'Male' },
	{ label: 'Under 14 girls doubles', min: 0, max: 13, gender: 'Female' },
	{ label: "14-60 Men's singles", min: 14, max: 60, gender: 'Male' },
	{ label: "14-60 Women's singles", min: 14, max: 60, gender: 'Female' },
	{ label: "14-60 Men's doubles", min: 14, max: 60, gender: 'Male' },
	{ label: "14-60 Women's doubles", min: 14, max: 60, gender: 'Female' },
	{ label: 'Senior citizens doubles (flexible)', min: 61, max: Infinity, gender: 'any' },
];

const MAX_FLOOR = 20;
const TWO_HOUSE_TOWERS = ['D', 'E'];
const towerSelect = document.getElementById('tower');
const houseNumberSelect = document.getElementById('house_number');

function renderHouseNumbers() {
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
}
towerSelect.addEventListener('change', renderHouseNumbers);
renderHouseNumbers();

const ageInput = document.getElementById('age');
const genderSelect = document.getElementById('gender');

function renderCategories(container, fieldName, categories, age, gender) {
	if (!age || !gender) {
		container.innerHTML = '<p class="hint">Enter age and gender above to see eligible categories.</p>';
		return;
	}
	const eligible = categories.filter(cat =>
		age >= cat.min && age <= cat.max && (cat.gender === 'any' || cat.gender === gender)
	);
	container.innerHTML = eligible.map(cat =>
		`<label><input type="checkbox" name="${fieldName}" value="${cat.label}" /> ${cat.label}</label>`
	).join('') || '<p class="hint">No categories available for this age/gender.</p>';
}

function updateCategories() {
	const age = parseInt(ageInput.value, 10);
	const gender = genderSelect.value;
	renderCategories(document.getElementById('tt-options'), 'tt_category', TT_CATEGORIES, age, gender);
	renderCategories(document.getElementById('badminton-options'), 'badminton_category', BADMINTON_CATEGORIES, age, gender);
}

ageInput.addEventListener('input', updateCategories);
genderSelect.addEventListener('change', updateCategories);
updateCategories();

const form = document.getElementById('form');
const status = document.getElementById('status');

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
