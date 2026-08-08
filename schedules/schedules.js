// Renders the draws in ../schedule/*.csv as one time-ordered schedule, filterable by day
// and sport. Everything on screen comes out of the CSVs themselves — the Category column
// carries 'Sport — Category', so the sport chips need no separate mapping. games.js is
// loaded only to order the sport chips the way the rest of the site orders them.
//
// A static page can't list a directory, so the files are named here. Adding a draw to
// schedule/ means adding its filename to this array — the same hand-sync the sheet columns
// in Code.gs need.
const SCHEDULE_FILES = [
	'badminton-singles-u14-male.csv',
	'badminton-singles-u14-female.csv',
	'badminton-doubles-u14-open.csv',
	'badminton-singles-14-59-male.csv',
	'badminton-singles-14-59-female.csv',
	'badminton-doubles-14-59-male.csv',
	'badminton-doubles-14-59-female.csv',
	'tt-singles-u14-male.csv',
	'tt-singles-14-59-male.csv',
	'tt-singles-14-59-female.csv',
	'tt-singles-60plus.csv',
	'tt-doubles-open.csv',
	'carrom-singles.csv',
	'carrom-doubles.csv',
	'chess.csv',
	'pool-singles.csv',
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ALL = 'All';

const dayList = document.getElementById('day-list');
const sportList = document.getElementById('sport-list');
const status = document.getElementById('status');
const results = document.getElementById('results');
const daysEl = document.getElementById('days');
const countEl = document.getElementById('count');

let matches = [];
let selectedDay = ALL;
let selectedSport = ALL;

// Minimal RFC4180 reader: match rows are plain, but a name with a comma in it would
// otherwise split a row into the wrong columns.
function parseCsv(text) {
	const rows = [];
	let row = [], cell = '', quoted = false;
	for (let i = 0; i < text.length; i++) {
		const character = text[i];
		if (quoted) {
			if (character === '"' && text[i + 1] === '"') { cell += '"'; i++; }
			else if (character === '"') quoted = false;
			else cell += character;
		} else if (character === '"') quoted = true;
		else if (character === ',') { row.push(cell); cell = ''; }
		else if (character === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
		else if (character !== '\r') cell += character;
	}
	if (cell || row.length) { row.push(cell); rows.push(row); }
	return rows.filter(cells => cells.some(cell => cell.trim()));
}

// One CSV -> match objects. The header names the columns, so a draw with an extra column
// (an added Date, say) still reads correctly.
function readDraw(text) {
	const rows = parseCsv(text);
	if (!rows.length) return [];
	const header = rows[0].map(name => name.trim());
	return rows.slice(1).map(cells => {
		const match = {};
		header.forEach((name, index) => { match[name] = (cells[index] || '').trim(); });
		// 'Badminton — Doubles · 14-59 & 60+ · Male' -> sport + category, em dash or hyphen
		const [sport, ...rest] = (match.Category || '').split(/\s+[—–-]\s+/);
		match.sport = rest.length ? sport.trim() : '';
		match.category = rest.length ? rest.join(' — ').trim() : (match.Category || '').trim();
		return match;
	});
}

// 'Fri 14 Aug' -> a sortable number, so the day chips and headings run in calendar order
// without the festival dates being written down here.
function dayKey(day) {
	const parts = /(\d{1,2})\s+([A-Za-z]{3})/.exec(day || '');
	if (!parts) return Number.MAX_SAFE_INTEGER;
	const month = MONTHS.findIndex(name => name.toLowerCase() === parts[2].toLowerCase());
	return (month < 0 ? 12 : month) * 100 + Number(parts[1]);
}

function timeKey(time) {
	const parts = /(\d{1,2}):(\d{2})/.exec(time || '');
	return parts ? Number(parts[1]) * 60 + Number(parts[2]) : Number.MAX_SAFE_INTEGER;
}

// Each chip row counts what you'd get if you picked it, with the *other* filter still
// applied — so a chip showing 0 is a dead end you can see before tapping it.
function matchesFor(day, sport) {
	return matches.filter(match =>
		(day === ALL || match.Day === day) && (sport === ALL || match.sport === sport));
}

function chip(value, label, count, selected) {
	return `<button type="button" class="chip" data-value="${escapeHtml(value)}" aria-pressed="${value === selected}">${escapeHtml(label)} <b>${count}</b></button>`;
}

function renderChips() {
	const days = [...new Set(matches.map(match => match.Day))].sort((a, b) => dayKey(a) - dayKey(b));
	dayList.innerHTML = [ALL, ...days]
		.map(day => chip(day, day, matchesFor(day, selectedSport).length, selectedDay)).join('');

	// GAMES order first, then anything a CSV names that GAMES doesn't
	const present = [...new Set(matches.map(match => match.sport).filter(Boolean))];
	const known = sportNames().filter(sport => present.includes(sport));
	const sports = [...known, ...present.filter(sport => !known.includes(sport))];
	sportList.innerHTML = [ALL, ...sports]
		.map(sport => chip(sport, sport, matchesFor(selectedDay, sport).length, selectedSport)).join('');
}

function renderMatches() {
	const shown = matchesFor(selectedDay, selectedSport);
	countEl.textContent = `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`;
	const days = [...new Set(shown.map(match => match.Day))].sort((a, b) => dayKey(a) - dayKey(b));
	daysEl.innerHTML = days.map(day => {
		const rows = shown.filter(match => match.Day === day)
			.sort((a, b) => timeKey(a.Start) - timeKey(b.Start) || a.Court.localeCompare(b.Court));
		return `
			<section class="day">
				<h2>${escapeHtml(day)}</h2>
				${rows.map(match => `
					<article class="match">
						<div class="when">
							<span class="start">${escapeHtml(match.Start)}</span>
							<span class="end">${escapeHtml(match.End)}</span>
						</div>
						<div class="what">
							<p class="meta">
								<span class="round">${escapeHtml(match.Round)}</span>
								<span class="court">${escapeHtml(match.Court)}</span>
							</p>
							<p class="sides">
								<span>${escapeHtml(match['Side A'])}</span>
								<span class="vs">v</span>
								<span>${escapeHtml(match['Side B'])}</span>
							</p>
							<p class="category">${escapeHtml([match.sport, match.category].filter(Boolean).join(' — '))}</p>
						</div>
					</article>
				`).join('')}
			</section>
		`;
	}).join('');
	results.hidden = false;
}

function render() {
	renderChips();
	renderMatches();
}

// Names come from the registration form and land in innerHTML.
function escapeHtml(value) {
	return String(value == null ? '' : value).replace(/[&<>"']/g, character =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

[[dayList, value => { selectedDay = value; }], [sportList, value => { selectedSport = value; }]]
	.forEach(([host, select]) => host.addEventListener('click', event => {
		const button = event.target.closest('.chip');
		if (!button) return;
		select(button.dataset.value);
		render();
	}));

// allSettled, not all: one missing or renamed CSV shouldn't blank the whole schedule.
Promise.allSettled(SCHEDULE_FILES.map(file =>
	fetch('../schedule/' + file).then(response => {
		if (!response.ok) throw new Error(file + ' (' + response.status + ')');
		return response.text();
	})
)).then(settled => {
	matches = settled.flatMap(result => result.status === 'fulfilled' ? readDraw(result.value) : []);
	const failed = settled.filter(result => result.status === 'rejected').length;
	if (!matches.length) {
		status.textContent = 'No matches scheduled yet.';
		return;
	}
	render();
	status.hidden = !failed;
	if (failed) {
		status.textContent = `${failed} of ${SCHEDULE_FILES.length} draws could not be loaded.`;
		status.className = 'status error';
	}
});
