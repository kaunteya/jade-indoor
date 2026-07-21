// Paste your Apps Script Web App /exec URL here after deploying apps-script/Code.gs
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwXq4SDLwFQ47Ik5G7EnI6vkwpqQuEXF16f_b8WSx1AuEwhlltEo3UFMMGibIZ2WmdN5w/exec';

// gender: 'Male' | 'Female' | 'any' (open to both)
const GAMES = [
	{ id: 'badminton_singles_u14_male', game: 'Badminton', type: 'Singles', ageGroup: 'Under 14', min: 0, max: 13, gender: 'Male', price: 400 },
	{ id: 'badminton_singles_u14_female', game: 'Badminton', type: 'Singles', ageGroup: 'Under 14', min: 0, max: 13, gender: 'Female', price: 400 },
	{ id: 'badminton_doubles_u14_male', game: 'Badminton', type: 'Doubles', ageGroup: 'Under 14', min: 0, max: 13, gender: 'Male', price: 600 },
	{ id: 'badminton_doubles_u14_female', game: 'Badminton', type: 'Doubles', ageGroup: 'Under 14', min: 0, max: 13, gender: 'Female', price: 600 },
	{ id: 'badminton_singles_14_60_male', game: 'Badminton', type: 'Singles', ageGroup: '14-60', min: 14, max: 60, gender: 'Male', price: 400 },
	{ id: 'badminton_singles_14_60_female', game: 'Badminton', type: 'Singles', ageGroup: '14-60', min: 14, max: 60, gender: 'Female', price: 400 },
	{ id: 'badminton_doubles_14_60_male', game: 'Badminton', type: 'Doubles', ageGroup: '14-60', min: 14, max: 60, gender: 'Male', price: 600 },
	{ id: 'badminton_doubles_14_60_female', game: 'Badminton', type: 'Doubles', ageGroup: '14-60', min: 14, max: 60, gender: 'Female', price: 600 },
	{ id: 'badminton_doubles_60plus', game: 'Badminton', type: 'Doubles', ageGroup: '60+ (flexible)', min: 61, max: Infinity, gender: 'any', price: 600 },

	{ id: 'tt_singles_u14_male', game: 'Table Tennis', type: 'Singles', ageGroup: 'Under 14', min: 0, max: 13, gender: 'Male', price: 200 },
	{ id: 'tt_singles_u14_female', game: 'Table Tennis', type: 'Singles', ageGroup: 'Under 14', min: 0, max: 13, gender: 'Female', price: 200 },
	{ id: 'tt_doubles_u14', game: 'Table Tennis', type: 'Doubles', ageGroup: 'Under 14 (flexible)', min: 0, max: 13, gender: 'any', price: 300 },
	{ id: 'tt_singles_14_60_male', game: 'Table Tennis', type: 'Singles', ageGroup: '14-60', min: 14, max: 60, gender: 'Male', price: 200 },
	{ id: 'tt_singles_14_60_female', game: 'Table Tennis', type: 'Singles', ageGroup: '14-60', min: 14, max: 60, gender: 'Female', price: 200 },
	{ id: 'tt_doubles_14_60', game: 'Table Tennis', type: 'Doubles', ageGroup: '14-60 (flexible)', min: 14, max: 60, gender: 'any', price: 300 },
	{ id: 'tt_singles_60plus', game: 'Table Tennis', type: 'Singles', ageGroup: '60+ (flexible)', min: 61, max: Infinity, gender: 'any', price: 200 },

	{ id: 'carrom_singles', game: 'Carrom', type: 'Singles', ageGroup: '10 and above', min: 10, max: Infinity, gender: 'any', price: 200 },
	{ id: 'carrom_doubles', game: 'Carrom', type: 'Doubles', ageGroup: '10 and above', min: 10, max: Infinity, gender: 'any', price: 300 },

	{ id: 'chess', game: 'Chess', type: '', ageGroup: 'All ages', min: 0, max: Infinity, gender: 'any', price: 200 },

	{ id: 'pool_singles', game: '8-ball pool', type: 'Singles', ageGroup: '15 and above', min: 15, max: Infinity, gender: 'any', price: 200 },
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
const gamesTableBody = document.getElementById('games-table-body');

function renderGamesTable() {
	const age = parseInt(ageInput.value, 10);
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

ageInput.addEventListener('input', renderGamesTable);
genderSelect.addEventListener('change', renderGamesTable);
renderGamesTable();

const gameSections = document.getElementById('game-sections');
const preGameFields = ['name', 'tower', 'house_number', 'whatsapp', 'age', 'gender']
	.map(id => document.getElementById(id));

function updateGameSectionsVisibility() {
	gameSections.hidden = !preGameFields.every(field => field.checkValidity() && field.value.trim() !== '');
}

const form = document.getElementById('form');
const status = document.getElementById('status');
const totalCost = document.getElementById('total-cost');

function updateTotalCost() {
	const total = [...form.querySelectorAll('input[type="checkbox"]:checked')]
		.reduce((sum, checkbox) => sum + Number(checkbox.dataset.price || 0), 0);
	totalCost.textContent = `Total: ₹${total}`;
}

form.addEventListener('input', updateGameSectionsVisibility);
form.addEventListener('change', updateGameSectionsVisibility);
form.addEventListener('change', updateTotalCost);
updateGameSectionsVisibility();
updateTotalCost();

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
		renderGamesTable();
		updateTotalCost();
	} catch (err) {
		status.textContent = 'Something went wrong. Please try again.';
	} finally {
		button.disabled = false;
	}
});
