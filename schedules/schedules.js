// Renders the draws in data/*.csv as one time-ordered schedule, filterable by day
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
// Match id -> winning side label, out of data/results.csv. Empty for a match not yet played.
// Not `results`, which is the section element the matches are rendered into.
let wins = new Map();
// Three states, not two: null is 'nothing picked yet' (the page opens there and asks), ALL
// is the 'All' chip — a real choice that filters on nothing — and anything else is the value
// to filter on. matchesFor() treats ALL and null alike; only the prompt tells them apart.
const ALL = '';
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

// 'Fri 14 Aug' -> '14 Aug'. The chip is short and sits next to a count, so the weekday is
// noise there; the day headings below still carry it. Anything not in that shape is left
// alone, since the chip has to keep matching the Day value it filters on.
function chipDay(day) {
	const parts = /^[A-Za-z]{3,}\s+(\d{1,2}\s+[A-Za-z]{3,}.*)$/.exec(day || '');
	return parts ? parts[1] : day;
}

// During the festival the day you want is almost always today, so the page opens on it and
// the day row is answered before you touch it. dayKey is year-blind — no CSV carries a year
// — which is exactly what lets a Day like 'Fri 14 Aug' be compared against the local clock;
// the cost is that the same date in another year would match too. Outside the festival
// nothing matches and selectedDay stays null, so the row asks, as it always did.
function todayInDraw(days) {
	const now = new Date();
	const today = now.getMonth() * 100 + now.getDate();
	return days.find(day => dayKey(day) === today) || null;
}

function renderChips() {
	const days = [...new Set(matches.map(match => match.Day))].sort((a, b) => dayKey(a) - dayKey(b));
	dayList.innerHTML = [chip(ALL, 'All', matchesFor(ALL, selectedSport).length, selectedDay)]
		.concat(days.map(day => chip(day, chipDay(day), matchesFor(day, selectedSport).length, selectedDay)))
		.join('');

	// GAMES order first, then anything a CSV names that GAMES doesn't
	const present = [...new Set(matches.map(match => match.sport).filter(Boolean))];
	const known = sportNames().filter(sport => present.includes(sport));
	const sports = [...known, ...present.filter(sport => !known.includes(sport))];
	sportList.innerHTML = [chip(ALL, 'All', matchesFor(selectedDay, ALL).length, selectedSport)]
		.concat(sports.map(sport => chip(sport, sport, matchesFor(selectedDay, sport).length, selectedSport)))
		.join('');
}

// Both rows have to be answered before any match is listed: 300 matches is too many to
// show by default, so the page asks for the missing half instead. 'All' is an answer —
// picking it on both rows is how you ask for the whole schedule on purpose.
function renderMatches() {
	results.hidden = false;
	if (selectedDay === null || selectedSport === null) {
		countEl.textContent = '';
		daysEl.innerHTML = `<p class="prompt">${
			selectedDay === null && selectedSport === null ? 'Pick a day and a sport to see the matches.'
				: selectedSport === null ? 'Now pick a sport.' : 'Now pick a day.'
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
					// pool prints neither: one table, and its category is just 'Singles'
					const court = solo.has(match.sport) ? '' : `<span class="court">${escapeHtml(match.Court)}</span>`;
					const category = format.rest ? `<span class="category">${escapeHtml(format.rest)}</span>` : '';
					return `
						<article class="match">
							<div class="when">
								<span class="start">${escapeHtml(match.Start)}</span>
								<span class="end">${escapeHtml(match.End)}</span>
							</div>
							<div class="what">
								<div class="head">
									<span class="which">
										<span class="code">${escapeHtml(match.Match)}</span>
										<span class="${roundClass(match.Round)}">${escapeHtml(match.Round)}</span>
									</span>
									<span class="tag">
										<span class="sport-badge">${escapeHtml(match.sport)}</span>
										${format.type ? `<span class="type">${escapeHtml(format.type)}</span>` : ''}
									</span>
								</div>
								<p class="sides">
									<span class="side">${formatSide(resolveSide(match['Side A'], wins), wins.get(match.Match))}</span>
									<span class="vs">v</span>
									<span class="side">${formatSide(resolveSide(match['Side B'], wins), wins.get(match.Match))}</span>
								</p>
								${court || category ? `<p class="foot">${court}${category}</p>` : ''}
							</div>
						</article>
					`;
				}).join('')}
			</section>
		`;
	}).join('');
	results.hidden = false;
}

// No bye list here. A bye used to mean a player the schedule had nothing to say about, so
// naming them was the only way they appeared at all; now the round a bye carries them into
// is drawn, so their first match is a card above like everybody else's and the list would
// only say the same thing twice. search/ still tells a searcher why theirs starts a round
// in, which is the one thing the card leaves out.

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
	// A decider is a tie no group stage settled, played off outside the normal rounds — worth
	// picking out for the same reason, even though it sits at the shallow end of the draw. It
	// is 'Decider' on its own, or 'Decider — Group B' where the group it settles is named, so
	// the prefix is the test. Keep in step with is_decider() in scripts/check_draw.py.
	if (name.startsWith('decider')) return 'round is-decider';
	return 'round';
}

// A side is either real names ('Kaunteya Suryawanshi (C-163) / Ronak Shah (A-72)') or a
// placeholder for whoever gets there ('Winner BDAM03'). Escape first, then decorate the
// escaped string — the flat, the partner slash and the placeholder each step back from the
// names, which are the only part worth reading at a glance.
//
// What a placeholder points at gets the same chip the match cards wear, so 'Winner BDAM03'
// and the BDAM03 card read as the same thing and can be paired up by eye while scrolling.
//
// `won` is the match's winning side label, or undefined while the match is unplayed. It is
// compared against this side's whole label, so it tags the winner of a doubles pair as one
// side rather than trying to pick a player out of it. A placeholder never carries the tag:
// once a knockout tie is played the draw still says 'Winner PL01' here, so there is no name
// to hang it on until the result is written back into the draw itself.
function formatSide(value, won) {
	const text = escapeHtml(value);
	const pending = /^(winner|runner-up|loser)\s+(.+)$/i.exec(text);
	if (pending) return `<span class="pending">${pending[1]} <span class="code">${pending[2]}</span></span>`;
	if (/^(winner|runner-up|loser)\b/i.test(text)) return `<span class="pending">${text}</span>`;
	const name = text
		.replace(/\(([^()]*)\)/g, '<span class="flat">($1)</span>')
		.replace(/ \/ /g, '<span class="sep"> / </span>');
	return String(won || '').trim() === String(value || '').trim()
		? `${name} <span class="won">Winner</span>` : name;
}

// Names come from the registration form and land in innerHTML.
function escapeHtml(value) {
	return String(value == null ? '' : value).replace(/[&<>"']/g, character =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// Tapping the chip that's already on turns it off, back to nothing picked — including 'All',
// which drops the row to the prompt rather than leaving a selection that means the same thing.
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

// Anything thrown on the way in used to leave the page sitting on 'Loading schedule…' for
// ever, saying nothing — a browser holding a stale ../draws.js does exactly that, since the
// call below is then a ReferenceError before a single match is drawn. Say so on the status
// line instead: a page that admits it is broken is worth more than one that looks slow.
function reportFailure(error) {
	status.hidden = false;
	status.className = 'status error';
	status.textContent = `The schedule could not be loaded: ${(error && error.message) || error}. Try reloading.`;
}

// Results are loaded alongside the draws but never gate them: if results.csv is missing or
// unreadable the schedule still renders, just with nothing marked won.
try {
	Promise.all([loadDraws('data/'), loadResults('data/')]).then(([{ matches: loaded, failed }, played]) => {
		matches = loaded;
		wins = played;
		if (!matches.length) {
			status.textContent = 'No matches scheduled yet.';
			return;
		}
		selectedDay = todayInDraw([...new Set(matches.map(match => match.Day))]);
		render();
		status.hidden = !failed;
		if (failed) {
			status.textContent = `${failed} of ${SCHEDULE_FILES.length} draws could not be loaded.`;
			status.className = 'status error';
		}
	}).catch(reportFailure);
} catch (error) {
	reportFailure(error);
}
