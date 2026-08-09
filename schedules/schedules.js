// Renders the draws in ../schedule/*.csv as one time-ordered schedule, filterable by day
// and sport. Everything on screen comes out of the CSVs themselves — the Category column
// carries 'Sport — Category', so the sport chips need no separate mapping. games.js is
// loaded only to order the sport chips the way the rest of the site orders them; the file
// list and CSV reading live in ../draws.js, shared with search/.
const dayList = document.getElementById('day-list');
const sportList = document.getElementById('sport-list');
const status = document.getElementById('status');
const results = document.getElementById('results');
const daysEl = document.getElementById('days');
const countEl = document.getElementById('count');

let matches = [];
// null is 'no filter' — the page opens with neither row selected, showing the whole
// schedule, and tapping the selected chip again clears back to that.
let selectedDay = null;
let selectedSport = null;

// Each chip row counts what you'd get if you picked it, with the *other* filter still
// applied — so a chip showing 0 is a dead end you can see before tapping it.
function matchesFor(day, sport) {
	return matches.filter(match =>
		(!day || match.Day === day) && (!sport || match.sport === sport));
}

function chip(value, label, count, selected) {
	return `<button type="button" class="chip" data-value="${escapeHtml(value)}" aria-pressed="${value === selected}">${escapeHtml(label)} <b>(${count})</b></button>`;
}

function renderChips() {
	const days = [...new Set(matches.map(match => match.Day))].sort((a, b) => dayKey(a) - dayKey(b));
	dayList.innerHTML = days
		.map(day => chip(day, day, matchesFor(day, selectedSport).length, selectedDay)).join('');

	// GAMES order first, then anything a CSV names that GAMES doesn't
	const present = [...new Set(matches.map(match => match.sport).filter(Boolean))];
	const known = sportNames().filter(sport => present.includes(sport));
	const sports = [...known, ...present.filter(sport => !known.includes(sport))];
	sportList.innerHTML = sports
		.map(sport => chip(sport, sport, matchesFor(selectedDay, sport).length, selectedSport)).join('');
}

// Both chips have to be set before any match is listed: 328 matches is too many to be worth
// showing unfiltered, so the page asks for the missing half instead.
function renderMatches() {
	results.hidden = false;
	if (!selectedDay || !selectedSport) {
		countEl.textContent = '';
		daysEl.innerHTML = `<p class="prompt">${
			!selectedDay && !selectedSport ? 'Pick a day and a sport to see the matches.'
				: !selectedSport ? 'Now pick a sport.' : 'Now pick a day.'
		}</p>`;
		return;
	}
	const shown = matchesFor(selectedDay, selectedSport);
	const solo = soloVenueSports(matches);
	countEl.textContent = `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`;
	const days = [...new Set(shown.map(match => match.Day))].sort((a, b) => dayKey(a) - dayKey(b));
	daysEl.innerHTML = days.map(day => {
		const rows = shown.filter(match => match.Day === day)
			.sort((a, b) => timeKey(a.Start) - timeKey(b.Start) || a.Court.localeCompare(b.Court));
		return `
			<section class="day">
				<h2>${escapeHtml(day)}</h2>
				${rows.map(match => {
					const format = splitCategory(match.category);
					return `
						<article class="match">
							<div class="when">
								<span class="start">${escapeHtml(match.Start)}</span>
								<span class="end">${escapeHtml(match.End)}</span>
							</div>
							<div class="what">
								<div class="head">
									<span class="${roundClass(match.Round)}">${escapeHtml(match.Round)}</span>
									<span class="tag">
										<span class="sport-badge">${escapeHtml(match.sport)}</span>
										${format.type ? `<span class="type">${escapeHtml(format.type)}</span>` : ''}
									</span>
								</div>
								<p class="sides">
									<span class="side">${formatSide(match['Side A'])}</span>
									<span class="vs">v</span>
									<span class="side">${formatSide(match['Side B'])}</span>
								</p>
								<p class="foot">
									${solo.has(match.sport) ? '' : `<span class="court">${escapeHtml(match.Court)}</span>`}
									${format.rest ? `<span class="category">${escapeHtml(format.rest)}</span>` : ''}
								</p>
							</div>
						</article>
					`;
				}).join('')}
			</section>
		`;
	}).join('');
	results.hidden = false;
}

function render() {
	renderChips();
	renderMatches();
}

// The closing rounds are what people scan for, so they get their own colour rather than
// sitting in the same grey as 'Round of 64'.
function roundClass(round) {
	const name = (round || '').toLowerCase();
	if (name === 'final') return 'round is-final';
	if (name.startsWith('semi')) return 'round is-semi';
	if (name.startsWith('quarter')) return 'round is-quarter';
	return 'round';
}

// A side is either real names ('Kaunteya Suryawanshi (C-163) / Ronak Shah (A-72)') or a
// placeholder for whoever gets there ('Winner BDAM03'). Escape first, then decorate the
// escaped string — the flat, the partner slash and the placeholder each step back from the
// names, which are the only part worth reading at a glance.
function formatSide(value) {
	const text = escapeHtml(value);
	if (/^(winner|runner-up|loser)\b/i.test(text)) return `<span class="pending">${text}</span>`;
	return text
		.replace(/\(([^()]*)\)/g, '<span class="flat">($1)</span>')
		.replace(/ \/ /g, '<span class="sep"> / </span>');
}

// Names come from the registration form and land in innerHTML.
function escapeHtml(value) {
	return String(value == null ? '' : value).replace(/[&<>"']/g, character =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// Tapping the chip that's already on turns it off — with no 'All' chip, that toggle is the
// only way back to the unfiltered schedule.
[
	[dayList, value => { selectedDay = value === selectedDay ? null : value; }],
	[sportList, value => { selectedSport = value === selectedSport ? null : value; }],
]
	.forEach(([host, select]) => host.addEventListener('click', event => {
		const button = event.target.closest('.chip');
		if (!button) return;
		select(button.dataset.value);
		render();
	}));

loadDraws('../schedule/').then(({ matches: loaded, failed }) => {
	matches = loaded;
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
