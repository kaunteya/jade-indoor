#!/usr/bin/env python3
"""Generate the opening-round draws for every category into schedules/data/."""
import collections, csv, os, re, sys
from difflib import SequenceMatcher

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'schedules', 'data')

# ---------------------------------------------------------------- registrants
rows = list(csv.reader(open(os.path.join(ROOT, 'psl.csv'))))
HDR = [h.strip() for h in rows[1]]
IDX = {h: i for i, h in enumerate(HDR)}
PEOPLE = [r for r in rows[2:] if r and r[0].strip()]


def clean(s):
	return re.sub(r'\s+', ' ', (s or '').strip())


def label(r):
	return '%s %s (%s-%s)' % (clean(r[0]), clean(r[1]), clean(r[2]), clean(r[3]))


def age(r):
	try:
		return int(clean(r[IDX['Age']]))
	except ValueError:
		return 99


BY_NAME = {}
for r in PEOPLE:
	BY_NAME[clean(r[0] + ' ' + r[1]).lower()] = r


def resolve(name):
	"""A partner name -> the registrant row it means, or None if nobody matches."""
	key = clean(name).lower()
	if not key:
		return None
	if key in BY_NAME:
		return BY_NAME[key]
	# Partner names are typed by hand: 'Pramod Achutan (E42)', 'shubhada', 'Vihaan
	# Shailesh Patil'. Strip any bracketed flat, then match token by token, allowing
	# for a misspelling but insisting the first names agree — 'Vihaan Shailesh Patil'
	# is the son, not his father Shailesh Patil, and both are registered at G-52.
	key = clean(re.sub(r'\(.*?\)', '', key)).lower()
	if key in BY_NAME:
		return BY_NAME[key]
	tokens = key.split()
	hits = []
	for full, row in BY_NAME.items():
		other = full.split()
		if SequenceMatcher(None, tokens[0], other[0]).ratio() < 0.85:
			continue
		matched = sum(1 for t in tokens if any(SequenceMatcher(None, t, o).ratio() >= 0.85 for o in other))
		if matched == len(tokens) or matched == len(other):
			hits.append((matched, SequenceMatcher(None, key, full).ratio(), row))
	if not hits:
		return None
	hits.sort(key=lambda h: (-h[0], -h[1]))
	# A lone first name ('shubhada') only identifies somebody if nobody else answers to it.
	if len(hits) > 1 and (hits[0][0], hits[0][1]) == (hits[1][0], hits[1][1]):
		return None
	if len(tokens) == 1 and len(hits) > 1:
		return None
	return hits[0][2]


# ------------------------------------------------------------------ the field
# Skill level (1 beginner / 2 intermediate / 3 expert) doubles as the seeding order:
# the strongest entrants sit at the top of the draw and so collect the byes.
def entrants(columns):
	out = []
	for r in PEOPLE:
		level = max([int(r[IDX[c]]) for c in columns if r[IDX[c]].strip().isdigit()] or [0])
		if level:
			out.append({'label': label(r), 'people': {label(r)}, 'level': level, 'age': age(r)})
	return out


def pairs(columns, partner_column):
	out, seen = [], set()
	for r in PEOPLE:
		level = max([int(r[IDX[c]]) for c in columns if r[IDX[c]].strip().isdigit()] or [0])
		if not level:
			continue
		me = label(r)
		typed = clean(r[IDX[partner_column]])
		mate = resolve(typed)
		mate_label = label(mate) if mate is not None else typed
		key = frozenset([me, mate_label])
		if key in seen:
			continue
		seen.add(key)
		out.append({
			'label': me + ' / ' + mate_label if mate_label else me,
			'people': {me, mate_label} if mate_label else {me},
			'level': level,
			'age': min(age(r), age(mate) if mate is not None else 99),
		})
	return out


def seeded(field):
	return sorted(field, key=lambda e: (-e['level'], e['label'].lower()))


# ------------------------------------------------------------------ the draws
ROUND_NAME = {2: 'Final', 4: 'Semi-final', 8: 'Quarter-final'}


def round_after(round_name):
	"""The round a bye carries somebody into: the one the opening round feeds."""
	if round_name in ('Quarter-final', 'Semi-final'):
		return 'Semi-final' if round_name == 'Quarter-final' else 'Final'
	size = re.match(r'Round of (\d+)$', round_name or '')
	return ROUND_NAME.get(int(size.group(1)) // 2, 'Round of %d' % (int(size.group(1)) // 2)) if size else ''


def knockout(field):
	"""The opening round: the play-in that leaves a power-of-two field."""
	field = seeded(field)
	n = len(field)
	if n < 2:
		return [], ''
	size = 1
	while size * 2 <= n:
		size *= 2
	playing = n - size  # matches in the opening round
	if playing == 0:
		playing, size = n // 2, n // 2
	bracket = size * 2
	contenders = field[n - 2 * playing:]  # the byes sit above them
	games = [(contenders[i], contenders[-1 - i]) for i in range(playing)]
	return games, ROUND_NAME.get(bracket, 'Round of %d' % bracket)


def split_groups(field, sizes=None, target=4):
	"""Seeded entrants snaked across the groups, so each gets a spread of the field."""
	field = seeded(field)
	n = len(field)
	if sizes:
		assert sum(sizes) == n, 'group sizes %r do not add up to %d entries' % (sizes, n)
		count = len(sizes)
	else:
		count = max(1, round(n / target)) if n > target else 1
		while count > 1 and n / count > target:
			count += 1
		sizes = None
	groups = [[] for _ in range(count)]
	room = list(sizes) if sizes else [n] * count
	for i, entry in enumerate(field):
		lap, pos = divmod(i, count)
		seat = pos if lap % 2 == 0 else count - 1 - pos
		for step in range(count):  # the snake's seat, or the next group with room in it
			g = (seat + step) % count
			if len(groups[g]) < room[g]:
				groups[g].append(entry)
				break
	return groups


def group_fixtures(group):
	"""Three matches a head, which a group of four gets from a plain round robin.

	A group of six would be five each, so it plays a partial one instead: the six split
	into two trios by seed (1st/3rd/5th against 2nd/4th/6th) and everybody plays all three
	of the other trio. A trio therefore faces identical opposition, which is what keeps
	their records comparable when the top two are taken.
	"""
	if len(group) == 6:
		return [(a, b) for a in group[0::2] for b in group[1::2]]
	return [(group[i], group[j]) for i in range(len(group)) for j in range(i + 1, len(group))]


def round_robin(groups):
	games = []
	for gi, group in enumerate(groups):
		name = 'Group ' + chr(ord('A') + gi)
		games += [(a, b, name) for a, b in group_fixtures(group)]
	return games


def bracket(groups, prefix, start_number):
	"""Winners and runners-up of each group into a QF/SF/Final tail.

	Nobody is named yet, so each tie carries the set of players who could still reach it —
	that is what keeps 'no player in two places' true whoever wins.
	"""
	names = ['Group ' + chr(ord('A') + i) for i in range(len(groups))]
	reach = {names[i]: set().union(*(e['people'] for e in g)) for i, g in enumerate(groups)}
	# A1 v B2, B1 v A2, C1 v D2, D1 v C2 — group winners kept apart until the semis.
	ties = []
	for i in range(0, len(names), 2):
		one, two = names[i], names[i + 1]
		ties.append(('Winner ' + one, 'Runner-up ' + two, reach[one] | reach[two]))
		ties.append(('Winner ' + two, 'Runner-up ' + one, reach[two] | reach[one]))
	rounds, number = [], start_number
	while len(ties) > 1:
		label = ROUND_NAME.get(len(ties) * 2, 'Round of %d' % (len(ties) * 2))
		drawn = []
		for a, b, who in ties:
			drawn.append({'a': a, 'b': b, 'who': who, 'id': '%s%02d' % (prefix, number)})
			number += 1
		rounds.append((label, drawn))
		# Halves of the draw meet in the next round: 1v3, 2v4 for four quarter-finals.
		half = len(drawn) // 2
		ties = [('Winner ' + drawn[i]['id'], 'Winner ' + drawn[i + half]['id'],
			drawn[i]['who'] | drawn[i + half]['who']) for i in range(half)]
	a, b, who = ties[0]
	rounds.append(('Final', [{'a': a, 'b': b, 'who': who, 'id': '%s%02d' % (prefix, number)}]))
	return rounds


# --------------------------------------------------------------- the category
# file, prefix, sheet columns, partner column (doubles only), category label, sport, format
CATEGORIES = [
	('badminton-singles-u14-male', 'BSJM', ['Bad Sin U14 M'], None,
		'Badminton — Singles · Under 14 · Male', 'Badminton', 'ko'),
	('badminton-singles-u14-female', 'BSJF', ['Bad Sin U14 F'], None,
		'Badminton — Singles · Under 14 · Female', 'Badminton', 'ko'),
	('badminton-doubles-u14-open', 'BDJO', ['Bad Dou U14 M', 'Bad Dou U14 F'], 'Bad partner',
		'Badminton — Doubles · Under 14', 'Badminton', 'ko'),
	('badminton-singles-14-59-male', 'BSAM', ['Bad Sin 14-60 M'], None,
		'Badminton — Singles · 14-59 · Male', 'Badminton', 'ko'),
	('badminton-singles-14-59-female', 'BSAF', ['Bad Sin 14-60 F'], None,
		'Badminton — Singles · 14-59 · Female', 'Badminton', 'ko'),
	('badminton-doubles-14-59-male', 'BDAM', ['Bad Dou 14-60 M', 'Bad Dou 60+'], 'Bad partner',
		'Badminton — Doubles · 14-59 & 60+ · Male', 'Badminton', 'ko'),
	('badminton-doubles-14-59-female', 'BDAF', ['Bad Dou 14-60 F'], 'Bad partner',
		'Badminton — Doubles · 14-59 · Female', 'Badminton', 'ko'),
	('tt-singles-u14-male', 'TSJM', ['TT Sin U14 M'], None,
		'Table Tennis — Singles · Under 14 · Male', 'Table Tennis', 'ko'),
	('tt-singles-14-59-male', 'TSAM', ['TT Sin 14-60 M'], None,
		'Table Tennis — Singles · 14-59 · Male', 'Table Tennis', 'ko'),
	('tt-singles-14-59-female', 'TSAF', ['TT Sin 14-60 F'], None,
		'Table Tennis — Singles · 14-59 · Female', 'Table Tennis', 'ko'),
	('tt-singles-60plus', 'TS60', ['TT Sin 60+'], None,
		'Table Tennis — Singles · 60+', 'Table Tennis', 'rr'),
	('tt-doubles-open', 'TDAO', ['TT Doubles 14-60', 'TT Dou U14'], 'TT partner',
		'Table Tennis — Doubles', 'Table Tennis', 'rr'),
	('carrom-singles', 'CRS', ['CRM Sin'], None,
		'Carrom — Singles · 10+', 'Carrom', 'ko'),
	('carrom-doubles', 'CRD', ['CRM Dou'], 'CRM partner',
		'Carrom — Doubles · 10+', 'Carrom', 'rr'),
	('chess', 'CH', ['Chess'], None, 'Chess', 'Chess', 'ko'),
	# The only category drawn all the way through: four groups, then the top two of each
	# into a quarter-final. See POOL_GROUPS and the 10-minute slot below.
	('pool-singles', 'PL', ['Pool'], None, '8-ball pool — Singles', '8-ball pool', 'rr+ko'),
]

POOL_GROUPS = [6, 6, 6, 4]

BYES_FILE = 'byes.csv'

VENUES = {
	'Badminton': ['Court 1', 'Court 2'],
	'Table Tennis': ['Table 1'],
	'Carrom': ['Board 1', 'Board 2', 'Board 3'],
	'Chess': ['Board 1', 'Board 2', 'Board 3', 'Board 4', 'Board 5', 'Board 6'],
	'8-ball pool': ['Table 1'],
}
# 8-ball pool runs short because it has one table and the most group matches on it: at
# three matches a head the group stage is 33, which needs 660 of the 780 minutes Fri and
# Sat hold at this length. 20 minutes would need 825 and no longer fit.
SLOT = {'Badminton': 30, 'Table Tennis': 15, 'Chess': 50, 'Carrom': 50, '8-ball pool': 15}
GAP = 5

matches = []
byes = []
report = []
for file, prefix, columns, partner_column, category, sport, form in CATEGORIES:
	field = pairs(columns, partner_column) if partner_column else entrants(columns)
	if len(field) < 2:
		report.append('%-32s %2d entries — too few for a draw, skipped' % (file, len(field)))
		continue

	def add(round_name, ident, a_label, b_label, who, ages=(99, 99), tail=False):
		matches.append({
			'file': file, 'category': category, 'sport': sport, 'round': round_name,
			'id': ident, 'a': a_label, 'b': b_label, 'people': who,
			# The 8pm cap is a property of the Under 14 categories, but the open TT
			# doubles draw carries under-14 pairs too, so age decides there.
			'u14': 'Under 14' in category or min(ages) < 14,
			'minutes': SLOT[sport], 'tail': tail,
		})

	if form.startswith('rr'):
		groups = split_groups(field, POOL_GROUPS if form == 'rr+ko' else None)
		games = round_robin(groups)
		for i, (a, b, group) in enumerate(games, 1):
			add(group, '%s%02d' % (prefix, i), a['label'], b['label'],
				a['people'] | b['people'], (a['age'], b['age']))
		played = collections.Counter()
		for a, b, _ in games:
			played[a['label']] += 1
			played[b['label']] += 1
		summary = 'groups of %s, %s matches each' % (
			'/'.join(str(len(g)) for g in groups),
			'/'.join(str(n) for n in sorted(set(played.values()))))
		if form == 'rr+ko':
			for round_name, drawn in bracket(groups, prefix, len(games) + 1):
				for tie in drawn:
					add(round_name, tie['id'], tie['a'], tie['b'], tie['who'], tail=True)
			summary += ', then top two of each into a quarter-final'
	else:
		games, round_name = knockout(field)
		for i, (a, b) in enumerate(games, 1):
			add(round_name, '%s%02d' % (prefix, i), a['label'], b['label'],
				a['people'] | b['people'], (a['age'], b['age']))
		playing = {id(side) for pair in games for side in pair}
		sat_out = [e for e in field if id(e) not in playing]
		for entry in sat_out:
			byes.append((category, round_after(round_name), entry['label']))
		summary = round_name + (', %d byes' % len(sat_out) if sat_out else '')
	report.append('%-32s %2d entries -> %2d matches (%s)'
		% (file, len(field), len([m for m in matches if m['file'] == file]), summary))

# --------------------------------------------------------------- the calendar
DAYS = [
	('Fri 14 Aug', 19 * 60, 22 * 60),
	('Sat 15 Aug', 12 * 60, 22 * 60),
	('Sun 16 Aug', 9 * 60, 21 * 60),  # kept clear for the later rounds
]
U14_CUTOFF = 20 * 60
REST = 30  # breathing space between one knockout round and the next

# Entrants who have told us they cannot make part of a day. Unlike the turnaround between
# two matches, these are hard edges — a match may finish exactly as the window opens.
UNAVAILABLE = {
	'Aditya Shah (A-72)': [
		('Fri 14 Aug', 18 * 60, 21 * 60 + 30),
		('Sat 15 Aug', 18 * 60, 21 * 60 + 30),
	],
}


def available(person, day, start, end):
	return all(end <= shut or start >= open_again
		for when, shut, open_again in UNAVAILABLE.get(person, []) if when == day)


def hhmm(minutes):
	return '%02d:%02d' % divmod(minutes, 60)


busy_venue = {}   # (day, sport, venue) -> [(start, end)]
busy_person = {}  # (day, person) -> [(start, end)]


def free(spans, start, end):
	return all(end + GAP <= s or start >= e + GAP for s, e in spans)


def take(match, day, start, venue):
	end = start + match['minutes']
	busy_venue[(day, match['sport'], venue)].append((start, end))
	for p in match['people']:
		busy_person.setdefault((day, p), []).append((start, end))
	match.update(day=day, start=start, end=end, venue=venue)


def fits(match, day, start):
	end = start + match['minutes']
	if not all(available(p, day, start, end) for p in match['people']):
		return None
	if not all(free(busy_person.get((day, p), []), start, end) for p in match['people']):
		return None
	for venue in VENUES[match['sport']]:
		if free(busy_venue.setdefault((day, match['sport'], venue), []), start, end):
			return venue
	return None


def place(match, days):
	for day, open_at, close_at in days:
		latest = min(close_at, U14_CUTOFF) if match['u14'] else close_at
		for start in range(open_at, latest - match['minutes'] + 1, 5):
			venue = fits(match, day, start)
			if venue:
				take(match, day, start, venue)
				return True
	return False


def place_late(match, day, deadline):
	"""As late as it will go, but finished by `deadline`. Finals want the evening."""
	open_at = next(o for name, o, _ in DAYS if name == day)
	for start in range(deadline - match['minutes'], open_at - 1, -5):
		venue = fits(match, day, start)
		if venue:
			take(match, day, start, venue)
			return True
	return False


# Tightest sport first: the one-table sports have no slack, so they choose their slots
# before badminton and chess fill the shared players' evenings.
def pressure(sport):
	total = sum(m['minutes'] + GAP for m in matches if m['sport'] == sport)
	return total / (len(VENUES[sport]) * (3 * 60 + 10 * 60))


# The knockout tail is placed first and from the back of Sunday, so the final takes the
# evening and each earlier round finishes a rest before the round it feeds.
SUNDAY = DAYS[2][0]
tail = [m for m in matches if m['tail']]
if tail:
	rounds = []
	for match in tail:  # already in QF -> SF -> Final order
		if not rounds or rounds[-1][0] != match['round']:
			rounds.append((match['round'], []))
		rounds[-1][1].append(match)
	deadline = DAYS[2][2]
	for _, drawn in reversed(rounds):
		for match in reversed(drawn):
			if not place_late(match, SUNDAY, deadline):
				sys.exit('could not place ' + match['id'])
			deadline = min(deadline, match['start'] - GAP)
		deadline = min(match['start'] for match in drawn) - REST

order = sorted(set(m['sport'] for m in matches), key=pressure, reverse=True)
unplaced = []
for sport in order:
	for match in [m for m in matches if m['sport'] == sport and not m['tail']]:
		if not place(match, DAYS[:2]):
			unplaced.append(match)

for match in unplaced:  # Fri + Sat are full for this sport; spill onto Sunday
	if not place(match, DAYS):
		sys.exit('could not place ' + match['id'])

# ------------------------------------------------------------------ the files
os.makedirs(OUT, exist_ok=True)
DAY_ORDER = {name: i for i, (name, _, _) in enumerate(DAYS)}
for file, _, _, _, _, _, _ in CATEGORIES:
	mine = [m for m in matches if m['file'] == file]
	if not mine:
		continue
	mine.sort(key=lambda m: (DAY_ORDER[m['day']], m['start'], m['venue']))
	with open(os.path.join(OUT, file + '.csv'), 'w', newline='') as handle:
		writer = csv.writer(handle)
		writer.writerow(['Day', 'Start', 'End', 'Court', 'Category', 'Round', 'Match', 'Side A', 'Side B'])
		for m in mine:
			writer.writerow([m['day'], hhmm(m['start']), hhmm(m['end']), m['venue'],
				m['category'], m['round'], m['id'], m['a'], m['b']])

# Byes are not matches — no time, no court — so they get their own file rather than rows
# the schedule would have to filter out of every listing.
with open(os.path.join(OUT, BYES_FILE), 'w', newline='') as handle:
	writer = csv.writer(handle)
	writer.writerow(['Category', 'Round', 'Player'])
	for row in sorted(byes, key=lambda b: (b[0], b[2].lower())):
		writer.writerow(row)

print('\n'.join(report))
print('%d byes' % len(byes))
print('\n%d matches' % len(matches))
for day, _, _ in DAYS:
	count = len([m for m in matches if m['day'] == day])
	if count:
		print('  %s: %d' % (day, count))
if unplaced:
	print('\nspilled past Sat 15 Aug: ' + ', '.join('%s (%s)' % (m['id'], m['day']) for m in unplaced))
