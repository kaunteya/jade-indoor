// The draws in schedules/data/*.csv, shared by schedules/ (the whole timetable) and search/ (one
// participant's own slots). Not loaded by the registration form, which has no use for it.
//
// A static page can't list a directory, so the files are named here. Adding a draw to
// schedules/data/ means adding its filename to this array — the same hand-sync the sheet columns
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

// Byes sit beside the draws rather than in them: a bye has no time and no court, so as a
// match row it would be something every listing had to filter back out. Columns are
// Category,Round,Player — the round being the one the bye carries the player into, where
// the player does have a drawn match. Only search/ reads this: the timetable has their tie
// like any other, so the bye is worth saying only to the one person it explains.
const BYES_FILE = 'byes.csv';

// Results sit beside the draws for the same reason the byes do, and one more: the draws are
// written by scripts/draw.py, so anything recorded inside them is lost the next time it runs.
// A result belongs to a match rather than to a draw, so the columns are Match,Winner — the
// winner being the winning side's own label, spelled exactly as the draw spells it. Matching
// on the label rather than on 'A'/'B' keeps the file readable on its own, and means a winner
// that names neither side tags nobody instead of tagging the wrong person; check_draw.py
// catches that case so a typo doesn't just quietly show nothing.
const RESULTS_FILE = 'results.csv';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
		// 'Badminton — Doubles · 14-59 & 60+ · Male' -> sport + category, em dash or hyphen.
		// Chess has no category of its own, so its column is the bare sport name.
		const [sport, ...rest] = (match.Category || '').split(/\s+[—–-]\s+/);
		match.sport = sport.trim();
		match.category = rest.join(' — ').trim();
		return match;
	});
}

// 'Fri 14 Aug' -> a sortable number, so days run in calendar order without the festival
// dates being written down here.
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

// 'Doubles · 14-59 & 60+ · Male' -> { type: 'Doubles', rest: '14-59 & 60+ · Male' }, so the
// format can sit beside the sport badge and the age/gender stay in the footer. Chess has no
// category at all, and a category that opens with an age carries no type, so both come back
// with an empty type and the whole label as rest.
function splitCategory(category) {
	const [first, ...rest] = (category || '').split(' · ');
	return /^(singles|doubles)$/i.test(first || '')
		? { type: first, rest: rest.join(' · ') }
		: { type: '', rest: category || '' };
}

// Sports played on a single court/table/board name it pointlessly — '8-ball pool, Table 1'
// when there is only one table. Worked out from the draws rather than written down, so it
// follows the schedule if a sport gains an area.
function soloVenueSports(matches) {
	const venues = {};
	matches.forEach(match => {
		(venues[match.sport] = venues[match.sport] || new Set()).add(match.Court);
	});
	return new Set(Object.keys(venues).filter(sport => venues[sport].size === 1));
}

// readDraw keys rows by their header, so it reads byes.csv as happily as a draw — and
// splits its Category the same way, which is what lets a bye be grouped by sport. A
// missing file resolves to no byes rather than failing the page.
function loadByes(base) {
	return fetch(base + BYES_FILE)
		.then(response => response.ok ? response.text() : '')
		.then(readDraw)
		.catch(() => []);
}

// 'Winner TSAM01' stops being a placeholder the moment TSAM01 has a result — it is a name,
// just written somewhere else — so swap it for the name. That cascades on its own: the tie
// TSAM02 feeds resolves as soon as TSAM02 is recorded, and a bracket fills in round by round
// as the day is played. Shared because both pages show the same sides and must agree.
//
// Only a match id resolves. 'Winner Group A' waits on a whole group's standings, which nothing
// here works out: a group can finish level, as Group A of the pool did, and naming a qualifier
// the organisers have not settled would be worse than leaving the placeholder showing.
//
// scripts/check_draw.py resolves results the same way when it validates them. Those two are
// separate implementations of one rule and have to be kept in step by hand.
function resolveSide(value, wins) {
	const pending = /^winner\s+(\S+)$/i.exec(String(value || '').trim());
	return (pending && wins && wins.get(pending[1])) || value;
}

// Match id -> winning side label. Resolves to no results rather than failing when the file
// isn't there: until the first match is played there is nothing to read, and a schedule with
// no results yet is the normal state rather than an error.
function loadResults(base) {
	// This file changes all through the festival, so it must never come out of a cache — a
	// stale copy shows the wrong winner with nothing to say it is old. A timestamp rather
	// than a version, because bumping a version after every match is not a thing anyone
	// will do. loadDraws() below does the same, for the same reason.
	return fetch(`${base + RESULTS_FILE}?t=${Date.now()}`, { cache: 'no-store' })
		.then(response => response.ok ? response.text() : '')
		.then(text => new Map(parseCsv(text).slice(1)
			.map(cells => [(cells[0] || '').trim(), (cells[1] || '').trim()])
			.filter(([match, winner]) => match && winner)))
		.catch(() => new Map());
}

// allSettled, not all: one missing or renamed CSV shouldn't blank the whole page.
// Resolves to { matches, failed } so the caller can report a partial load.
function loadDraws(base) {
	// Timestamped and uncached like results.csv. The draws were meant to be fixed once
	// published, so a plain fetch was enough — but times do get moved mid-festival, and a
	// phone holding yesterday's copy sends someone to a court two hours late with nothing
	// on the page to say it is stale. The files are small and there are 16 of them.
	const bust = `?t=${Date.now()}`;
	return Promise.allSettled(SCHEDULE_FILES.map(file =>
		fetch(base + file + bust, { cache: 'no-store' }).then(response => {
			if (!response.ok) throw new Error(file + ' (' + response.status + ')');
			return response.text();
		})
	)).then(settled => ({
		matches: settled.flatMap(result => result.status === 'fulfilled' ? readDraw(result.value) : []),
		failed: settled.filter(result => result.status === 'rejected').length,
	}));
}
