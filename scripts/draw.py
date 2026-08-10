#!/usr/bin/env python3
"""Generate the full draw for every category into schedules/data/, opening round to final."""
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


def name_for(size):
	"""What a round of `size` entrants is called."""
	return ROUND_NAME.get(size, 'Round of %d' % size)


def slot_of(entry):
	"""A place in the draw an entrant fills outright."""
	return {'label': entry['label'], 'people': entry['people'], 'age': entry['age']}


def winner_slot(tie):
	"""A place nobody has filled yet, carrying everyone who could still fill it.

	That field is what `available` is checked against — somebody who cannot be in the building
	cannot be in any tie they might reach. It is deliberately *not* what clashes are checked
	against; see the person check in `fits`.
	"""
	return {'label': 'Winner ' + tie['id'], 'people': tie['who'], 'age': min(tie['ages'])}


def rounds_from(slots, prefix, number):
	"""Every round from a field down to its final, and who sat the opening one out.

	Seed p meets seed L+1-p, and the two halves that produces meet the same way in the round
	after — the recursive seeding a bracket is, which keeps the top two apart until the final.
	A field that is not a power of two plays a **play-in** first: the largest power of two L
	below N leaves N-L ties, 2L-N entrants at the top of the order get a bye, and the rest are
	paired highest against lowest. Every round after that is a full 16/8/4/2/1.
	"""
	rounds, byes = [], []
	while len(slots) > 1:
		n = len(slots)
		size = 1
		while size * 2 <= n:
			size *= 2
		if n == size:  # already a power of two: the whole field plays
			sitting, pairs, label = [], [(slots[i], slots[-1 - i]) for i in range(n // 2)], name_for(n)
		else:
			playing = n - size
			sitting, contenders = slots[:n - 2 * playing], slots[n - 2 * playing:]
			pairs, label = [(contenders[i], contenders[-1 - i]) for i in range(playing)], name_for(size * 2)
		ties = []
		for a, b in pairs:
			ties.append({'a': a['label'], 'b': b['label'], 'who': a['people'] | b['people'],
				'ages': (a['age'], b['age']), 'id': '%s%02d' % (prefix, number)})
			number += 1
		if not rounds:
			byes = sitting
		rounds.append((label, ties))
		slots = sitting + [winner_slot(tie) for tie in ties]
	return rounds, number, byes


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


def qualifiers(groups):
	"""The top two of each group, in the order the draw should take them.

	Nobody is named yet, so each slot carries every player in the group it comes out of.

	With an even number of groups the qualifiers pair off group against group — A1 v B2,
	B1 v A2, group winners kept apart until the semis — and this is the order `rounds_from`
	mirrors into exactly that. An odd number leaves a group with nobody to pair with, so the
	qualifiers are seeded instead: winners in group order, then runners-up in reverse, which
	is what stops a group's own two meeting before the semi-final.
	"""
	names = ['Group ' + chr(ord('A') + i) for i in range(len(groups))]
	reach = {name: set().union(*(e['people'] for e in g)) for name, g in zip(names, groups)}
	young = {name: min(e['age'] for e in g) for name, g in zip(names, groups)}

	def slot(kind, name):
		return {'label': kind + ' ' + name, 'people': reach[name], 'age': young[name]}

	if len(names) % 2:
		return ([slot('Winner', name) for name in names]
			+ [slot('Runner-up', name) for name in reversed(names)])
	order = [None] * (2 * len(names))
	for i in range(0, len(names), 2):
		one, two = names[i], names[i + 1]
		order[i], order[-1 - i] = slot('Winner', one), slot('Runner-up', two)
		order[i + 1], order[-2 - i] = slot('Winner', two), slot('Runner-up', one)
	return order


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
	# Four groups, then the top two of each into a quarter-final. See POOL_GROUPS below.
	('pool-singles', 'PL', ['Pool'], None, '8-ball pool — Singles', '8-ball pool', 'rr'),
]

GROUP_SIZES = {'pool-singles': [6, 6, 6, 4]}

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

# Everything after the opening round has to land on Sunday, and at the lengths above it does
# not go in: badminton's 59 remaining matches want 1027 minutes of court time against the 720
# two courts hold, and table tennis's 49 want 975. Shorter matches from the second round on
# are what buys the room — 585 and 634 minutes respectively. The two sports with slack
# (chess on six boards, carrom on three) keep their length throughout.
LATER_SLOT = {'Badminton': 15, 'Table Tennis': 10}
LATER_GAP = {'Table Tennis': 3}


def minutes_for(sport, depth):
	return LATER_SLOT.get(sport, SLOT[sport]) if depth else SLOT[sport]


def gap_for(sport, depth):
	return LATER_GAP.get(sport, GAP) if depth else GAP

def named_in(*sides):
	"""The players a tie actually names.

	'Winner CH07' names nobody: which of that match's field turns up is not known until it
	is played. Those are the ties whose clashes cannot be settled in advance — see the
	person check in `fits`.
	"""
	out = set()
	for side in sides:
		if not re.match(r'(?:Winner|Runner-up)\s', side):
			out |= {part.strip() for part in side.split('/') if part.strip()}
	return out


matches = []
byes = []
report = []
for file, prefix, columns, partner_column, category, sport, form in CATEGORIES:
	field = pairs(columns, partner_column) if partner_column else entrants(columns)
	if len(field) < 2:
		report.append('%-32s %2d entries — too few for a draw, skipped' % (file, len(field)))
		continue

	def add(round_name, ident, a_label, b_label, who, ages=(99, 99), depth=0):
		matches.append({
			'file': file, 'category': category, 'sport': sport, 'round': round_name,
			'id': ident, 'a': a_label, 'b': b_label, 'people': who, 'depth': depth,
			'named': named_in(a_label, b_label),
			# The 8pm cap is a property of the Under 14 categories, but the open TT
			# doubles draw carries under-14 pairs too, so age decides there.
			'u14': 'Under 14' in category or min(ages) < 14,
			'minutes': minutes_for(sport, depth), 'gap': gap_for(sport, depth),
		})

	def add_rounds(rounds, first_depth):
		"""A whole run of rounds, each a depth deeper than the one that feeds it."""
		for depth, (round_name, ties) in enumerate(rounds, first_depth):
			for tie in ties:
				add(round_name, tie['id'], tie['a'], tie['b'], tie['who'], tie['ages'], depth)

	if form == 'rr':
		groups = split_groups(field, GROUP_SIZES.get(file))
		games = round_robin(groups)
		for i, (a, b, group) in enumerate(games, 1):
			add(group, '%s%02d' % (prefix, i), a['label'], b['label'],
				a['people'] | b['people'], (a['age'], b['age']))
		played = collections.Counter()
		for a, b, _ in games:
			played[a['label']] += 1
			played[b['label']] += 1
		# The group stage is one round however many matches it is, so the knockout on top
		# of it starts a depth in, the same as the round after a knockout's opening one.
		rounds, _, _ = rounds_from(qualifiers(groups), prefix, len(games) + 1)
		add_rounds(rounds, 1)
		summary = 'groups of %s, %s matches each, then top two of each into the %s' % (
			'/'.join(str(len(g)) for g in groups),
			'/'.join(str(n) for n in sorted(set(played.values()))),
			rounds[0][0].lower())
	else:
		rounds, _, sat_out = rounds_from([slot_of(e) for e in seeded(field)], prefix, 1)
		add_rounds(rounds, 0)
		# A bye sits out the opening round, so the round after it — rounds[1] — is where
		# that player's festival starts, and byes.csv is what says so on their behalf.
		for entry in sat_out:
			byes.append((category, rounds[1][0] if len(rounds) > 1 else '', entry['label']))
		summary = rounds[0][0] + (', %d byes' % len(sat_out) if sat_out else '')
	mine = [m for m in matches if m['file'] == file]
	report.append('%-32s %2d entries -> %2d matches, %s to the %s (%s)'
		% (file, len(field), len(mine), mine[0]['round'].lower(), mine[-1]['round'].lower(), summary))

# --------------------------------------------------------------- the calendar
DAYS = [
	('Fri 14 Aug', 19 * 60, 23 * 60),
	('Sat 15 Aug', 12 * 60, 23 * 60),
	('Sun 16 Aug', 9 * 60, 21 * 60),  # everything has to be over by 9pm
]
DAY_ORDER = {name: i for i, (name, _, _) in enumerate(DAYS)}
U14_CUTOFF = 20 * 60

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


busy_venue = {}   # (day, sport, venue) -> [(start, end, gap)]
busy_person = {}  # (day, person) -> [(start, end, gap)]

BY_ID = {m['id']: m for m in matches}
GROUP_MATCHES = {}
for m in matches:
	if m['round'].startswith('Group'):
		GROUP_MATCHES.setdefault((m['category'], m['round']), []).append(m)


def feeders(match):
	"""The matches whose result this one is waiting on.

	A side reads 'Winner CH07' or 'Runner-up Group B'; the first names one match, the second
	the whole group, which is not settled until its last match is over.
	"""
	out = []
	for side in (match['a'], match['b']):
		hit = re.match(r'(?:Winner|Runner-up)\s+(.+)$', side)
		if not hit:
			continue
		out += GROUP_MATCHES.get((match['category'], hit.group(1))) or (
			[BY_ID[hit.group(1)]] if hit.group(1) in BY_ID else [])
	return out


def ready_on(match, day):
	"""The earliest this match could start on `day`: every feeder over, with a turnaround.

	None if the day is too early for it — a feeder still to be played that day or later, or one
	with no slot at all, since a round that did not fit cannot be waited on and everything
	behind it is out too rather than being drawn against a match that never runs.
	"""
	when = 0
	for feeder in feeders(match):
		if 'day' not in feeder or DAY_ORDER[feeder['day']] > DAY_ORDER[day]:
			return None
		if feeder['day'] == day:
			when = max(when, feeder['end'] + max(match['gap'], feeder['gap']))
	return when


def free(spans, start, end, gap):
	"""Clear of everything already booked, by whichever of the two turnarounds is longer."""
	return all(end + max(gap, other) <= s or start >= e + max(gap, other)
		for s, e, other in spans)


def take(match, day, start, venue):
	end = start + match['minutes']
	busy_venue[(day, match['sport'], venue)].append((start, end, match['gap']))
	for p in match['named']:
		busy_person.setdefault((day, p), []).append((start, end, match['gap']))
	match.update(day=day, start=start, end=end, venue=venue)


def release(match):
	"""Hand a match's slot back, so it can be tried somewhere else. Returns where it was."""
	was = (match['day'], match['start'], match['venue'])
	span = (match['start'], match['end'], match['gap'])
	busy_venue[(match['day'], match['sport'], match['venue'])].remove(span)
	for p in match['named']:
		busy_person[(match['day'], p)].remove(span)
	for key in ('day', 'start', 'end', 'venue'):
		del match[key]
	return was


def fits(match, day, start):
	end = start + match['minutes']
	# Availability is a hard edge — somebody who cannot be in the building cannot be in any
	# tie they might reach — so it is checked against the whole field. A clash is not: a tie
	# between two unplayed ties names nobody, and which of the two fields turns up is not
	# known until they are played, so only the players a tie actually names are held.
	if not all(available(p, day, start, end) for p in match['people']):
		return None
	if not all(free(busy_person.get((day, p), []), start, end, match['gap']) for p in match['named']):
		return None
	for venue in VENUES[match['sport']]:
		if free(busy_venue.setdefault((day, match['sport'], venue), []), start, end, match['gap']):
			return venue
	return None


def step(match, day):
	"""How finely a match may be slid along the day.

	Five minutes reads better on a timetable and is what Fri and Sat are laid out on — they
	have room to spare. Sunday does not: on one table the rounding strands a couple of minutes
	per match, which by the evening is a whole tie's worth.
	"""
	return 1 if day == SUNDAY and match['depth'] else 5


def window(match, day, open_at, close_at):
	ready = ready_on(match, day)
	if ready is None:
		return None
	return max(open_at, ready), min(close_at, U14_CUTOFF) if match['u14'] else close_at


def place(match, days):
	for day, open_at, close_at in days:
		span = window(match, day, open_at, close_at)
		if span is None:
			continue  # a feeder is still to be played that day; try a later one
		first, latest = span
		for start in range(first, latest - match['minutes'] + 1, step(match, day)):
			venue = fits(match, day, start)
			if venue:
				take(match, day, start, venue)
				return True
	return False


def place_late(match, day, deadline):
	"""As late as it will go, but finished by `deadline`. Finals want the evening."""
	open_at, close_at = next((o, c) for name, o, c in DAYS if name == day)
	span = window(match, day, open_at, min(close_at, deadline))
	if span is None:
		return False
	first, latest = span
	for start in range(latest - match['minutes'], first - 1, -step(match, day)):
		venue = fits(match, day, start)
		if venue:
			take(match, day, start, venue)
			return True
	return False


# Tightest sport first: the one-table sports have no slack, so they choose their slots
# before badminton and chess fill the shared players' evenings. Only the opening round counts,
# the one thing that has to be on Fri or Sat; weighing the later rounds in here would reorder
# the sports over a day none of it is played on. The window is the same for every sport, so
# only the numerator decides the order.
def pressure(sport):
	total = sum(m['minutes'] + m['gap'] for m in matches if m['sport'] == sport and not m['depth'])
	return total / len(VENUES[sport])


SUNDAY = DAYS[2][0]
order = sorted(set(m['sport'] for m in matches), key=pressure, reverse=True)


# How much of Sunday a sport's later rounds would fill if they all went there.
def sunday_load(sport):
	later = [m for m in matches if m['sport'] == sport and m['depth']]
	return (sum(m['minutes'] + m['gap'] for m in later)
		/ (len(VENUES[sport]) * (DAYS[2][2] - DAYS[2][1])))


# A sport that would fill more than this much of Sunday spreads its later rounds back over
# Fri and Sat, which the extended hours leave room in — badminton's courts had been idle from
# 19:30 on Sat, chess's boards from 15:30. It works out at badminton (82% of Sunday) and table
# tennis (88%); chess, carrom and pool are at 39%, 46% and 19% and stay put, because moving
# them only empties the day the finals are on. Deriving it rather than naming the two sports
# means a different entry list moves whichever sports the crowding has moved to.
CROWDED = 0.6
spread = {sport for sport in order if sunday_load(sport) > CROWDED}

# The opening round and the group stages fill Fri and Sat.
unplaced = []
for sport in order:
	for match in [m for m in matches if m['sport'] == sport and not m['depth']]:
		if not place(match, DAYS[:2]):
			unplaced.append(match)

for match in unplaced:  # Fri + Sat are full for this sport; spill onto Sunday
	if not place(match, DAYS):
		sys.exit('could not place ' + match['id'])

# Everything after them, a round at a time so no match is placed before the one it is waiting
# on. A crowded sport takes the earliest day its round can legally land on, which pulls it back
# onto the Fri and Sat evenings; the rest stay on Sunday, where they have room.
#
# Finals are the exception whatever the sport: held back to the end and placed as late as they
# will go on Sunday, so the festival closes with them rather than scattering them over three
# evenings. Under 14 finals cannot take an evening slot at all — they have to be over by 8pm —
# so they are placed in sequence with the rest, but still on Sunday.
finals = [m for m in matches if m['round'] == 'Final' and m['depth'] and not m['u14']]
short = []
for depth in sorted({m['depth'] for m in matches if m['depth']}):
	for sport in order:
		mine = [m for m in matches if m['depth'] == depth and m['sport'] == sport and m not in finals]
		for match in sorted(mine, key=lambda m: not m['u14']):  # the 8pm cap goes first
			everywhere = match['sport'] in spread and match['round'] != 'Final'
			if not place(match, DAYS if everywhere else DAYS[2:]):
				short.append(match)

for match in sorted(finals, key=lambda m: -m['minutes']):
	if not place_late(match, SUNDAY, DAYS[2][2]) and not place(match, DAYS[2:]):
		short.append(match)

# Placed from the front, a category's rounds can finish hours before the round they feed —
# pool's semi-finals at 10:40 against a final at 20:45, because pool has a table to itself and
# nothing to queue behind. So a match that ends more than DRIFT before the one waiting on it is
# pushed up against it, deepest first, and the chain carries back a round at a time.
#
# Only that far, though. Sunday is 88% full on the table tennis table, and pushing everything
# as late as it would go spent all of the slack before the first match instead of after the
# last — which is the wrong end of the day for it, since a match that overruns eats into what
# comes after. Anything already close enough to what it feeds stays where it was placed.
DRIFT = 2 * 60

fed_by = {}
for match in matches:
	for feeder in feeders(match):
		fed_by.setdefault(feeder['id'], []).append(match)

for match in sorted([m for m in matches if m['depth'] and m.get('day') == SUNDAY],
		key=lambda m: (-m['depth'], -m['start'])):
	waiting = [m for m in fed_by.get(match['id'], []) if m.get('day') == SUNDAY]
	deadline = min([m['start'] - max(match['gap'], m['gap']) for m in waiting] or [DAYS[2][2]])
	if deadline - match['end'] <= DRIFT:
		continue
	day, start, venue = release(match)
	if not place_late(match, SUNDAY, deadline):
		take(match, day, start, venue)

if short:
	print('%d matches will not fit by %s:' % (len(short), hhmm(DAYS[2][2])))
	for sport in order:
		mine = [m for m in short if m['sport'] == sport]
		if mine:
			print('  %-13s %s' % (sport, ', '.join('%s %s' % (m['id'], m['round']) for m in mine)))
	sys.exit('nothing written — the draw does not fit the days available')

# ------------------------------------------------------------------ the files
os.makedirs(OUT, exist_ok=True)
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
