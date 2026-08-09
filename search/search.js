// Search for one participant by name and show everything they entered. The Apps Script
// doGet returns entrants keyed by game category (see apps-script/Code.gs listEntrants),
// so this page turns that inside out: one record per person, carrying every category they
// appear in. GAMES comes from ../games.js, the same array the registration form uses.

const LEVEL_NAMES = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
const MAX_SUGGESTIONS = 8;
const MIN_QUERY = 2;
// A phone's on-screen keyboard covers most of the result once a name is picked, so the
// field gives up focus there. On a pointer device it keeps focus, so a new query can be
// typed straight away — nothing is hidden by holding it.
const TOUCH_ONLY = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)');

const searchBox = document.getElementById('search-box');
const queryInput = document.getElementById('query');
const clearButton = document.getElementById('clear');
const suggestionList = document.getElementById('suggestions');
const status = document.getElementById('status');
const personPanel = document.getElementById('person');

let people = [];      // [{ name, house, age, gender, sortKey, haystack, entries: [...] }]
let matches = [];     // whatever the current query narrowed people down to
let activeIndex = -1; // highlighted suggestion, -1 when nothing is highlighted
let draws = null;     // every row of schedules/data/*.csv, or null while they are still loading
let shownPerson = null;

// Mirrors list/list.js: Apps Script answers a GET with a redirect that doesn't always keep
// its CORS headers, so fall back to JSONP (the same doGet supports callback=).
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

// One person can hold several entries, and the sheet keys nothing by id, so identity here
// is name + flat. That also folds together anyone who submitted the form twice: the same
// category arriving twice for one person is kept once.
function buildPeople(games) {
	const byKey = new Map();
	GAMES.forEach(game => {
		(games[game.id] || []).forEach(entrant => {
			const name = String(entrant.name || '').trim();
			if (!name) return;
			const house = String(entrant.house || '').trim();
			const key = name.toLowerCase() + '|' + house.toLowerCase();
			if (!byKey.has(key)) {
				byKey.set(key, {
					name: name,
					house: house,
					age: String(entrant.age || '').trim(),
					// gender is only present on newer deployments of Code.gs; the panel
					// simply leaves the row out when it isn't there
					gender: String(entrant.gender || '').trim(),
					entries: [],
				});
			}
			const person = byKey.get(key);
			if (person.entries.some(entry => entry.game.id === game.id)) return;
			person.entries.push({
				game: game,
				level: Number(entrant.level) || 0,
				partner: String(entrant.partner || '').trim(),
			});
		});
	});

	return [...byKey.values()]
		.map(person => Object.assign(person, {
			// matched against, so accents and case can't hide a name from its own search
			haystack: normalise(person.name),
			sortKey: person.name.toLocaleLowerCase(),
		}))
		.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function normalise(value) {
	return String(value == null ? '' : value)
		.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
		.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Ranked so the most obvious reading of a query comes first: a name that starts with what
// was typed, then a name whose later words start with it ("dani" finds Surendra Dani),
// then anything merely containing it. Ties keep the alphabetical order people arrived in.
function search(rawQuery) {
	const query = normalise(rawQuery);
	if (query.length < MIN_QUERY) return [];
	return people
		.map(person => {
			const at = person.haystack.indexOf(query);
			if (at === -1) return null;
			const wordStart = at === 0 || person.haystack[at - 1] === ' ';
			return { person: person, rank: at === 0 ? 0 : (wordStart ? 1 : 2) };
		})
		.filter(Boolean)
		.sort((a, b) => a.rank - b.rank)
		.slice(0, MAX_SUGGESTIONS)
		.map(hit => hit.person);
}

function renderSuggestions() {
	if (!matches.length) {
		closeSuggestions();
		return;
	}
	const query = normalise(queryInput.value);
	suggestionList.innerHTML = matches.map((person, index) => `
		<li id="suggestion-${index}" class="suggestion" role="option" aria-selected="${index === activeIndex}" data-index="${index}">
			<span class="suggestion-name">${highlight(person.name, query)}</span>
			<span class="suggestion-meta">${escapeHtml(person.house)} · ${person.entries.length} ${person.entries.length === 1 ? 'entry' : 'entries'}</span>
		</li>
	`).join('');
	suggestionList.hidden = false;
	queryInput.setAttribute('aria-expanded', 'true');
	setActive(activeIndex);
}

// The matched run is marked in the suggestion so it's obvious why a name came back. Built
// from escaped pieces — the name itself is free text typed by a registrant.
function highlight(name, query) {
	const at = normalise(name).indexOf(query);
	if (!query || at === -1) return escapeHtml(name);
	return escapeHtml(name.slice(0, at))
		+ '<mark>' + escapeHtml(name.slice(at, at + query.length)) + '</mark>'
		+ escapeHtml(name.slice(at + query.length));
}

function setActive(index) {
	activeIndex = index;
	[...suggestionList.children].forEach((item, i) => {
		const active = i === index;
		item.setAttribute('aria-selected', String(active));
		item.classList.toggle('is-active', active);
		if (active) item.scrollIntoView({ block: 'nearest' });
	});
	queryInput.setAttribute('aria-activedescendant', index < 0 ? '' : 'suggestion-' + index);
}

function closeSuggestions() {
	suggestionList.hidden = true;
	suggestionList.innerHTML = '';
	activeIndex = -1;
	queryInput.setAttribute('aria-expanded', 'false');
	queryInput.setAttribute('aria-activedescendant', '');
}

function selectPerson(person) {
	queryInput.value = person.name;
	clearButton.hidden = false;
	closeSuggestions();
	if (TOUCH_ONLY && TOUCH_ONLY.matches) queryInput.blur();
	shownPerson = person;
	renderPerson(person);
}

// The draws name a player as 'First Last (T-nnn)', and a doubles side joins two of those
// with ' / '. That label is exactly what the entrant list gives us, so a slot is claimed by
// splitting each side and comparing labels — no name matching beyond an exact compare.
function playerLabel(person) {
	return normalise(person.house ? `${person.name} (${person.house})` : person.name);
}

function sideHas(side, label) {
	return String(side || '').split('/').some(part => normalise(part) === label);
}

// Only slots the person is actually named in. Later knockout rounds read 'Winner BSJM04'
// or 'Winner Group A', so they belong to nobody yet and are deliberately left out.
function fixturesFor(person) {
	if (!draws) return [];
	const label = playerLabel(person);
	return draws
		.filter(match => sideHas(match['Side A'], label) || sideHas(match['Side B'], label))
		.map(match => Object.assign({}, match, {
			opponent: sideHas(match['Side A'], label) ? match['Side B'] : match['Side A'],
		}))
		.sort((a, b) => dayKey(a.Day) - dayKey(b.Day) || timeKey(a.Start) - timeKey(b.Start));
}

// Categories whose opening round is drawn but does not name this person: they were seeded
// high enough to sit it out. Saying so matters — 40 of the 176 entrants hold a bye, and an
// empty fixture list otherwise reads as the page having lost them.
function byesFor(person) {
	if (!draws) return [];
	const label = playerLabel(person);
	return person.entries.map(entry => {
		const drawn = draws.filter(match => match.Category === DRAW_CATEGORY[entry.game.id]);
		if (!drawn.length) return null;  // nothing drawn for the category at all
		if (drawn.some(match => sideHas(match['Side A'], label) || sideHas(match['Side B'], label))) return null;
		const rounds = [...new Set(drawn.map(match => match.Round))];
		// A group stage seats everybody, so somebody missing from one is not on a bye —
		// far more likely their partner entered the team under a name we could not match.
		if (rounds.some(round => /^Group\b/.test(round))) return null;
		return { game: entry.game, round: roundAfter(rounds[0]) };
	}).filter(Boolean);
}

function renderByes(byes) {
	if (!byes.length) return '';
	return `
		<div class="byes">
			${byes.map(bye => `
				<p class="bye">
					<span class="bye-badge">Bye</span>
					<span class="bye-text">
						<b>${escapeHtml(bye.game.game)}</b>${categoryLabel(bye.game)
							? ' ' + escapeHtml(categoryLabel(bye.game)) : ''}
						— straight through to the ${escapeHtml(bye.round || 'next round')}, which is not drawn yet.
					</span>
				</p>
			`).join('')}
		</div>
	`;
}

function renderFixtures(person) {
	const host = document.getElementById('fixtures');
	if (!host) return;
	if (!draws) {
		host.innerHTML = '<h3 class="sport-name">Match schedule</h3><p class="empty">Loading fixtures…</p>';
		return;
	}
	const fixtures = fixturesFor(person);
	const byes = renderByes(byesFor(person));
	if (!fixtures.length) {
		host.innerHTML = '<h3 class="sport-name">Match schedule</h3>'
			+ (byes || '<p class="empty">No slots assigned yet.</p>');
		return;
	}
	const days = [...new Set(fixtures.map(fixture => fixture.Day))];
	const solo = soloVenueSports(draws);
	host.innerHTML = `
		<h3 class="sport-name">Match schedule</h3>
		${days.map(day => `
			<div class="fixture-day">
				<h4 class="fixture-date">${escapeHtml(day)}</h4>
				${fixtures.filter(fixture => fixture.Day === day).map(fixture => {
					// same shape as a card on the schedule page: round on the left, sport and
					// format stacked on the right, then who they play, then court and category
					const { type, rest } = splitCategory(fixture.category);
					// pool prints neither: one table, and its category is just 'Singles'
					const court = solo.has(fixture.sport) ? '' : `<span class="court">${escapeHtml(fixture.Court)}</span>`;
					const category = rest ? `<span class="category">${escapeHtml(rest)}</span>` : '';
					return `
					<div class="fixture">
						<span class="fixture-time">${escapeHtml(fixture.Start)}<small>${escapeHtml(fixture.End)}</small></span>
						<div class="fixture-body">
							<div class="fixture-head">
								<span class="round">${escapeHtml(fixture.Round)}</span>
								<span class="tag">
									<span class="sport-badge">${escapeHtml(fixture.sport)}</span>
									${type ? `<span class="type">${escapeHtml(type)}</span>` : ''}
								</span>
							</div>
							<p class="fixture-versus">v ${escapeHtml(fixture.opponent)}</p>
							${court || category ? `<p class="fixture-foot">${court}${category}</p>` : ''}
						</div>
					</div>
				`;
				}).join('')}
			</div>
		`).join('')}
		${byes}
	`;
}

// Entries are grouped under their sport so someone in four categories reads as a few
// headed blocks rather than one flat list. GAMES' order drives both the sports and the
// categories within them, so this page can't drift from the form's ordering.
function renderPerson(person) {
	const total = person.entries.reduce((sum, entry) => sum + entry.game.price, 0);
	const sports = sportNames()
		.map(sport => ({ sport: sport, entries: person.entries.filter(entry => entry.game.game === sport) }))
		.filter(group => group.entries.length);

	const facts = [
		['House', person.house],
		['Age', person.age],
		['Gender', person.gender],
	].filter(([, value]) => value);

	personPanel.innerHTML = `
		<h2 class="person-name">${escapeHtml(person.name)}</h2>
		<dl class="person-facts">
			${facts.map(([label, value]) => `
				<div class="fact">
					<dt>${label}</dt>
					<dd>${escapeHtml(value)}</dd>
				</div>
			`).join('')}
		</dl>
		<p class="person-summary">
			Entered <b>${person.entries.length}</b> ${person.entries.length === 1 ? 'category' : 'categories'}
			· total <b>${formatINR(total)}</b>
		</p>
		${sports.map(group => `
			<section class="sport-block">
				<h3 class="sport-name">${escapeHtml(group.sport)}</h3>
				<ul class="entry-list">
					${group.entries.map(entry => `
						<li class="entry">
							${categoryLabel(entry.game)
								? `<span class="entry-category">${escapeHtml(categoryLabel(entry.game))}</span>` : ''}
							<span class="entry-detail">
								${entry.level ? `<span class="chip level-${entry.level}">${LEVEL_NAMES[entry.level]}</span>` : ''}
								${entry.game.type === 'Doubles' && entry.partner
									? `<span class="entry-partner">with ${escapeHtml(entry.partner)}</span>` : ''}
							</span>
						</li>
					`).join('')}
				</ul>
			</section>
		`).join('')}
		<section id="fixtures" class="sport-block fixtures"></section>
	`;
	renderFixtures(person);
	personPanel.hidden = false;
}

function showNoMatch(rawQuery) {
	personPanel.innerHTML = `<p class="empty">No participant matches “${escapeHtml(rawQuery.trim())}”.</p>`;
	personPanel.hidden = false;
}

// Same grouping as the registration form's running total (registration/app.js formatINR).
function formatINR(amount) {
	return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

// Names and partner names are free text typed by registrants and land in innerHTML.
function escapeHtml(value) {
	return String(value == null ? '' : value).replace(/[&<>"']/g, character =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function refreshSuggestions() {
	clearButton.hidden = !queryInput.value;
	personPanel.hidden = true;
	matches = search(queryInput.value);
	activeIndex = matches.length ? 0 : -1;
	renderSuggestions();
}

queryInput.addEventListener('input', refreshSuggestions);

queryInput.addEventListener('keydown', event => {
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		if (suggestionList.hidden) {
			matches = search(queryInput.value);
			if (matches.length) { activeIndex = 0; renderSuggestions(); }
			event.preventDefault();
			return;
		}
		const step = event.key === 'ArrowDown' ? 1 : -1;
		setActive((activeIndex + step + matches.length) % matches.length);
		event.preventDefault();
	} else if (event.key === 'Enter') {
		if (!suggestionList.hidden && activeIndex >= 0) {
			selectPerson(matches[activeIndex]);
		} else if (queryInput.value.trim()) {
			// Enter without touching the list takes the single obvious match, or says so
			const hits = search(queryInput.value);
			if (hits.length === 1) selectPerson(hits[0]);
			else if (!hits.length) { closeSuggestions(); showNoMatch(queryInput.value); }
		}
		event.preventDefault();
	} else if (event.key === 'Escape') {
		closeSuggestions();
	}
});

// mousedown rather than click: the input's blur would otherwise close the list before the
// click landed on it.
suggestionList.addEventListener('mousedown', event => {
	const item = event.target.closest('.suggestion');
	if (!item) return;
	event.preventDefault();
	selectPerson(matches[Number(item.dataset.index)]);
});

queryInput.addEventListener('blur', closeSuggestions);
queryInput.addEventListener('focus', () => {
	if (queryInput.value.trim().length >= MIN_QUERY && personPanel.hidden) {
		matches = search(queryInput.value);
		activeIndex = matches.length ? 0 : -1;
		renderSuggestions();
	}
});

clearButton.addEventListener('click', () => {
	queryInput.value = '';
	clearButton.hidden = true;
	personPanel.hidden = true;
	closeSuggestions();
	queryInput.focus();
});

// The draws are static files, so they load in parallel with the entrant list rather than
// waiting for a selection. If someone is already on screen when they arrive, repaint.
loadDraws('../schedules/data/')
	.then(({ matches: loaded }) => { draws = loaded; })
	.catch(() => { draws = []; })
	.then(() => { if (shownPerson) renderFixtures(shownPerson); });

// ?key= on this page is passed through to doGet, for when LIST_KEY is set in Code.gs.
const key = new URLSearchParams(location.search).get('key');
loadEntrants(SCRIPT_URL + '?list=1' + (key ? '&key=' + encodeURIComponent(key) : ''))
	.then(data => {
		if (data.error) throw new Error(data.error === 'unauthorized' ? 'This page needs an access key.' : data.error);
		people = buildPeople(data.games || {});
		status.hidden = true;
		// the box is hidden until here, so this is the first moment it can take focus
		searchBox.hidden = false;
		queryInput.focus();
		// a soft reload can restore a value into the field before this runs
		if (queryInput.value.trim()) refreshSuggestions();
	})
	.catch(error => {
		status.textContent = `Could not load the participant list. ${error.message}`;
		status.className = 'status error';
	});
