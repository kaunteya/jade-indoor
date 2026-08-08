// Reads the entrant list from the Apps Script doGet (see apps-script/Code.gs) and filters
// it by sport (a row of buttons) and then category (a dropdown, rebuilt per sport). GAMES
// comes from ../games.js, the same array the registration form uses, so the categories
// here can't drift from the form's.

const LEVEL_NAMES = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
const sportList = document.getElementById('sport-list');
const categorySelect = document.getElementById('category');
const status = document.getElementById('status');
const results = document.getElementById('results');
const tableBody = document.getElementById('table-body');
const countEl = document.getElementById('count');
const levelBreakdownEl = document.getElementById('level-breakdown');
const table = document.getElementById('table');
const sortBar = document.getElementById('sort-bar');

let entrants = {}; // game id -> [{ name, house, age, level, partner }]
let selectedSport = '';
let sort = { key: '', direction: 1 }; // key '' keeps the sheet's own order (order of registration)

// Apps Script answers a GET with a redirect that doesn't always keep its CORS headers,
// so fall back to JSONP (supported by the same doGet) when fetch can't read the response.
function loadEntrants(url) {
	return fetch(url).then(response => response.json()).catch(() => new Promise((resolve, reject) => {
		const callback = 'onEntrants' + Date.now();
		const script = document.createElement('script');
		window[callback] = data => { delete window[callback]; script.remove(); resolve(data); };
		script.onerror = () => { delete window[callback]; script.remove(); reject(new Error('Could not reach the sheet')); };
		script.src = url + '&callback=' + callback;
		document.body.appendChild(script);
	}));
}

// A row of buttons rather than a dropdown: there are only five sports, and laying them out
// leaves room for each one's total entries. Entries, not people — one person entering
// singles and doubles counts in both.
function renderSports() {
	sportList.innerHTML = sportNames().map(sport => {
		const total = GAMES
			.filter(game => game.game === sport)
			.reduce((sum, game) => sum + (entrants[game.id] || []).length, 0);
		return `<button type="button" class="sport" data-sport="${escapeHtml(sport)}" aria-pressed="${sport === selectedSport}">${escapeHtml(sport)} <b>${total}</b></button>`;
	}).join('');
}

// The count in each label says how big the draw is before you pick it; categories nobody
// entered stay disabled, since an empty table is a dead end. The first category anyone
// entered is selected outright so picking a sport is enough to see a list, and a sport
// with a single category (Chess, 8-ball pool) has nothing to choose — its dropdown shows
// the one category but is disabled.
// GAMES interleaves singles and doubles by age group; the dropdown lists every singles
// category first and the doubles after, keeping GAMES' order within each of the two groups.
function renderCategories() {
	const forSport = GAMES.filter(game => game.game === selectedSport);
	const games = [
		...forSport.filter(game => game.type !== 'Doubles'),
		...forSport.filter(game => game.type === 'Doubles'),
	];
	categorySelect.innerHTML = '';
	games.forEach(game => {
		const option = document.createElement('option');
		option.value = game.id;
		option.textContent = `${categoryLabel(game)} (${(entrants[game.id] || []).length})`;
		option.disabled = !(entrants[game.id] || []).length;
		categorySelect.appendChild(option);
	});
	const options = [...categorySelect.options];
	const first = options.find(option => !option.disabled) || options[0];
	categorySelect.disabled = games.length < 2;
	if (!first) {
		results.hidden = true;
		return;
	}
	first.selected = true;
	renderTable();
}

// '' leaves the rows as the sheet has them. Clicking the column that's already sorted
// flips the direction; switching column starts ascending again.
function setSort(key) {
	sort = key === sort.key ? { key: key, direction: -sort.direction } : { key: key, direction: 1 };
	renderTable();
}

function sortedRows(rows) {
	if (!sort.key) return rows;
	return [...rows].sort((a, b) => sort.direction * (sort.key === 'name'
		? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		: Number(a[sort.key]) - Number(b[sort.key])));
}

// Both sets of controls show which column is active and which way it runs.
function markSortControls() {
	table.querySelectorAll('th[data-sort]').forEach(header => {
		const active = header.dataset.sort === sort.key;
		header.setAttribute('aria-sort', active ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none');
		header.dataset.arrow = active && sort.key ? (sort.direction === 1 ? '▲' : '▼') : '';
	});
	sortBar.querySelectorAll('button').forEach(button => {
		const active = button.dataset.sort === sort.key;
		button.setAttribute('aria-pressed', active);
		button.dataset.arrow = active && sort.key ? (sort.direction === 1 ? '▲' : '▼') : '';
	});
}

function renderTable() {
	const game = GAMES.find(game => game.id === categorySelect.value);
	const rows = sortedRows(entrants[categorySelect.value] || []);
	const doubles = game.type === 'Doubles';
	table.classList.toggle('no-partner', !doubles);
	countEl.textContent = `${rows.length} ${rows.length === 1 ? 'participant' : 'participants'} —`;
	// The sport buttons and the category dropdown already name the category, so this line
	// carries the split by level instead of repeating it.
	levelBreakdownEl.textContent = Object.entries(LEVEL_NAMES)
		.map(([level, name]) => `${rows.filter(entrant => Number(entrant.level) === Number(level)).length} ${name}`)
		.join(' · ');
	markSortControls();
	tableBody.innerHTML = rows.map((entrant, index) => `
		<tr>
			<td class="num" data-label="#">${index + 1}</td>
			<td data-label="Name" data-num="${index + 1}">${escapeHtml(entrant.name)}</td>
			<td data-label="House">${escapeHtml(entrant.house)}</td>
			<td class="num" data-label="Age">${escapeHtml(entrant.age)}</td>
			<td data-label="Level">${LEVEL_NAMES[entrant.level] || ''}</td>
			<td class="partner-col" data-label="Partner">${escapeHtml(entrant.partner)}</td>
		</tr>
	`).join('');
	results.hidden = false;
}

// Names and partner names are free text typed by registrants and land in innerHTML.
function escapeHtml(value) {
	return String(value == null ? '' : value).replace(/[&<>"']/g, character =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

sportList.addEventListener('click', event => {
	const button = event.target.closest('.sport');
	if (!button || button.dataset.sport === selectedSport) return;
	selectedSport = button.dataset.sport;
	renderSports(); // repaint so the pressed state follows the selection
	renderCategories();
});
categorySelect.addEventListener('change', renderTable);
[table.tHead, sortBar].forEach(host => host.addEventListener('click', event => {
	const control = event.target.closest('[data-sort]');
	if (control) setSort(control.dataset.sort);
}));

// ?key= on this page is passed through to doGet, for when LIST_KEY is set in Code.gs.
const key = new URLSearchParams(location.search).get('key');
loadEntrants(SCRIPT_URL + '?list=1' + (key ? '&key=' + encodeURIComponent(key) : ''))
	.then(data => {
		if (data.error) throw new Error(data.error === 'unauthorized' ? 'This list needs an access key.' : data.error);
		entrants = data.games || {};
		// Open on the first sport (Badminton) rather than an empty page — GAMES' own order,
		// so this follows the form's sport order instead of naming one here.
		selectedSport = sportNames()[0] || '';
		renderSports();
		renderCategories();
		status.hidden = true;
	})
	.catch(error => {
		status.textContent = `Could not load the participant list. ${error.message}`;
		status.className = 'status error';
	});
