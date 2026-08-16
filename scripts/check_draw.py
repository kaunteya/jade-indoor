#!/usr/bin/env python3
"""Re-read schedules/data/*.csv and assert every scheduling rule holds."""
import collections, csv, glob, os, re, sys
from itertools import combinations

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'schedules', 'data')
HOURS = {'Fri 14 Aug': (19 * 60, 23 * 60), 'Sat 15 Aug': (12 * 60, 23 * 60), 'Sun 16 Aug': (9 * 60, 21 * 60)}
AREAS = {'Badminton': 2, 'Table Tennis': 1, 'Carrom': 3, 'Chess': 6, '8-ball pool': 1}
SLOT = {'Badminton': 30, 'Table Tennis': 15, 'Chess': 50, 'Carrom': 50, '8-ball pool': 15}
# Every round after the first is shorter in the two sports that could not otherwise finish
# by Sunday evening. Keep in step with LATER_SLOT / LATER_GAP in draw.py.
LATER_SLOT = {'Badminton': 15, 'Table Tennis': 10}
GAP = 5
LATER_GAP = {'Table Tennis': 3}

# A day where one sport runs to its own length whatever the round. Sunday's badminton was
# lengthened to 25 minutes on the organisers' call, so the opening/later split does not apply
# to it — a flat length, which is why BDAM06 is no longer the odd one out. This has no
# counterpart in draw.py: that decides a match's day while placing it, so a slot length that
# depends on the day is circular there. It is applied to the CSVs by hand; see CLAUDE.md.
DAY_SLOT = {('Sun 16 Aug', 'Badminton'): 25}

# Hours in the middle of a day when nothing is played — a hole in the day, not a shorter day,
# so a match may finish exactly as one starts and start exactly as it ends. Keep in step with
# BREAKS in draw.py.
BREAKS = {'Sun 16 Aug': [(13 * 60, 13 * 60 + 30)]}

# Keep in step with UNAVAILABLE in draw.py — duplicated so this stays an independent
# check on the written files rather than a re-run of the code that wrote them.
UNAVAILABLE = {
	'Aditya Shah (A-72)': [
		('Fri 14 Aug', 18 * 60, 21 * 60 + 30),
		('Sat 15 Aug', 18 * 60, 21 * 60 + 30),
	],
}

BYES = os.path.join(DATA, 'byes.csv')  # not a draw: no day, no time, no court
RESULTS = os.path.join(DATA, 'results.csv')  # not a draw either: Match,Winner, written as played

rows = []
for path in sorted(glob.glob(os.path.join(DATA, '*.csv'))):
	if os.path.basename(path) in ('byes.csv', 'results.csv'):
		continue
	with open(path) as handle:
		for row in csv.DictReader(handle):
			row['file'] = os.path.basename(path)
			rows.append(row)

def mins(t):
	h, m = t.split(':')
	return int(h) * 60 + int(m)

bad = []

# Every round but the category's opening one is a later round, and later rounds are the short
# ones. A round is judged as a whole: two byes meeting name each other outright, but they are
# still in the round their category's opening one feeds.
#
# This is read off the draw's shape rather than off the placeholders, because placeholders do
# not survive the weekend: 'Winner BDAM06' becomes a name the moment BDAM06's result is filled
# in, and a round whose sides had all been filled in used to stop counting as later — which
# silently swapped its expected slot length and turnaround for the opening round's. That is
# what put TDAO13/TDAO14 and the TT doubles round shape into this report.
DAY_ORDER = {'Fri 14 Aug': 0, 'Sat 15 Aug': 1, 'Sun 16 Aug': 2}
LATER = set()
for category in {r['Category'] for r in rows}:
	mine = [r for r in rows if r['Category'] == category]
	names = {r['Round'] for r in mine}
	# A group stage is the opening round entire, however many groups it runs; otherwise the
	# opening round is whichever round starts first. A Decider is a hand-added tiebreak that
	# sits beside the bracket, so it is never the opening one.
	if any(n.startswith('Group') for n in names):
		opening = {n for n in names if n.startswith('Group')}
	else:
		opening = {min((n for n in names if n != 'Decider'),
			key=lambda n: min((DAY_ORDER[r['Day']], mins(r['Start'])) for r in mine if r['Round'] == n))}
	LATER |= {(category, n) for n in names - opening}


def slot_of(r):
	if (r['Day'], r['sport']) in DAY_SLOT:
		return DAY_SLOT[(r['Day'], r['sport'])]
	return LATER_SLOT.get(r['sport'], SLOT[r['sport']]) if r['later'] else SLOT[r['sport']]


def gap_of(r):
	return LATER_GAP.get(r['sport'], GAP) if r['later'] else GAP


ids = {}
for r in rows:
	r['sport'] = r['Category'].split(' — ')[0]
	r['later'] = (r['Category'], r['Round']) in LATER
	r['s'], r['e'] = mins(r['Start']), mins(r['End'])
	if r['Match'] in ids:
		bad.append('duplicate match id %s' % r['Match'])
	ids[r['Match']] = r
	if r['e'] - r['s'] != slot_of(r):
		bad.append('%s: %d min, expected %d' % (r['Match'], r['e'] - r['s'], slot_of(r)))
	open_at, close_at = HOURS[r['Day']]
	if r['s'] < open_at or r['e'] > close_at:
		bad.append('%s: %s %s-%s outside opening hours' % (r['Match'], r['Day'], r['Start'], r['End']))
	for shut, open_again in BREAKS.get(r['Day'], []):
		if r['s'] < open_again and r['e'] > shut:
			bad.append('%s: %s %s-%s runs across the %02d:%02d-%02d:%02d break'
				% (r['Match'], r['Day'], r['Start'], r['End'],
					shut // 60, shut % 60, open_again // 60, open_again % 60))
	if 'Under 14' in r['Category'] and r['e'] > 20 * 60:
		bad.append('%s: Under 14 running past 20:00' % r['Match'])
	if not r['Side A'].strip() or not r['Side B'].strip():
		bad.append('%s: empty side' % r['Match'])
	if r['Side A'].strip() == r['Side B'].strip():
		bad.append('%s: plays itself' % r['Match'])

# results.csv is joined to the draw on the winning side's own label, which is what keeps it
# readable on its own — but it also means a typo tags nobody on the page rather than failing
# loudly. Assert every result names a match that exists and one of that match's two sides.
if os.path.exists(RESULTS):
	with open(RESULTS) as handle:
		played = {r['Match'].strip(): r['Winner'].strip() for r in csv.DictReader(handle)}

	# 'Winner TSAM01' is the name of whoever won TSAM01, so a later round can be validated as
	# soon as the round it waits on is recorded. Read the whole file before resolving anything,
	# so the order rows are written in doesn't matter. Keep in step with resolveSide() in
	# schedules/schedules.js, which does this to decide what the card shows.
	# 'Winner Group A' has a space and so never resolves — a group's standings are not worked
	# out here, and a group can finish level.
	def resolved(side):
		pending = re.match(r'^Winner\s+(\S+)$', side.strip())
		return played.get(pending.group(1), side.strip()) if pending else side.strip()

	for match, winner in played.items():
		if match not in ids:
			bad.append('result for unknown match %s' % match)
			continue
		sides = (resolved(ids[match]['Side A']), resolved(ids[match]['Side B']))
		if winner not in sides:
			bad.append('%s: winner %r is neither side (%s v %s)' % ((match, winner) + sides))

# concurrency per sport, and the turnaround on one area — whichever of the two matches wants
# the longer one, since a short later-round tie can land beside a long opening-round one
for sport in AREAS:
	for day in HOURS:
		mine = [r for r in rows if r['sport'] == sport and r['Day'] == day]
		for t in range(*HOURS[day]):
			live = [r for r in mine if r['s'] <= t < r['e']]
			if len(live) > AREAS[sport]:
				bad.append('%s %s %02d:%02d: %d concurrent, %d areas'
					% (sport, day, t // 60, t % 60, len(live), AREAS[sport]))
				break
		for a, b in combinations(mine, 2):
			if a['Court'] != b['Court']:
				continue
			gap = max(gap_of(a), gap_of(b))
			if not (b['e'] + gap <= a['s'] or a['e'] + gap <= b['s']):
				bad.append('%s/%s share %s with <%d min between'
					% (a['Match'], b['Match'], a['Court'], gap))

# 'Winner Group A' / 'Winner PL51' name nobody yet, so resolve them to every player who
# could still turn up for that slot — the draw has to hold whoever wins.
groups = {}
for r in rows:
	if r['Round'].startswith('Group'):
		key = (r['Category'], r['Round'])
		for side in (r['Side A'], r['Side B']):
			groups.setdefault(key, set()).update(p.strip() for p in side.split('/') if p.strip())

def reachable(r, side, seen=()):
	name = side.strip()
	hit = re.match(r'(?:Winner|Runner-up)\s+(.+)$', name)
	if not hit:
		return {p.strip() for p in name.split('/') if p.strip()}
	source = hit.group(1)
	if (r['Category'], source) in groups:
		return set(groups[(r['Category'], source)])
	feeder = ids.get(source)
	if feeder is None or source in seen:
		bad.append('%s: refers to %r, which is not a match or group here' % (r['Match'], source))
		return set()
	return (reachable(feeder, feeder['Side A'], tuple(seen) + (source,))
		| reachable(feeder, feeder['Side B'], tuple(seen) + (source,)))

def sides(r):
	return reachable(r, r['Side A']) | reachable(r, r['Side B'])

# a feeder has to be over, with a turnaround, before the match it feeds starts
for r in rows:
	for side in (r['Side A'], r['Side B']):
		hit = re.match(r'(?:Winner|Runner-up)\s+(.+)$', side.strip())
		feeders = []
		if hit and (r['Category'], hit.group(1)) in groups:
			feeders = [g for g in rows if g['Category'] == r['Category'] and g['Round'] == hit.group(1)]
		elif hit and hit.group(1) in ids:
			feeders = [ids[hit.group(1)]]
		for f in feeders:
			gap = max(gap_of(r), gap_of(f))
			if (DAY_ORDER[f['Day']], f['e'] + gap) > (DAY_ORDER[r['Day']], r['s']):
				bad.append('%s starts before %s (%s) has finished' % (r['Match'], f['Match'], side.strip()))

# Nobody is in two places at once. This holds for every player a tie *names* — a 'Winner CH07'
# side names nobody, and which of that match's field turns up is not settled until it has been
# played, so those clashes cannot be drawn out in advance. Cross-category collisions between
# two undecided slots are the organiser's to resolve on the day; see NOTE in CLAUDE.md.
def named(r):
	out = set()
	for side in (r['Side A'], r['Side B']):
		if not re.match(r'(Winner|Runner-up)\b', side.strip()):
			out |= {p.strip() for p in side.split('/') if p.strip()}
	return out

for day in HOURS:
	mine = [r for r in rows if r['Day'] == day]
	for a, b in combinations(mine, 2):
		gap = max(gap_of(a), gap_of(b))
		if b['e'] + gap <= a['s'] or a['e'] + gap <= b['s']:
			continue
		shared = named(a) & named(b)
		if shared:
			bad.append('%s/%s overlap for %s' % (a['Match'], b['Match'], ', '.join(sorted(shared))))

# every entrant named in a draw is somebody the entry list knows, or a named partner
for r in rows:
	for person in sides(r):
		for when, shut, open_again in UNAVAILABLE.get(person, []):
			if r['Day'] == when and r['s'] < open_again and r['e'] > shut:
				bad.append('%s: %s is unavailable %02d:%02d-%02d:%02d on %s'
					% (r['Match'], person, shut // 60, shut % 60,
						open_again // 60, open_again % 60, when))

# byes.csv: everyone who entered a knockout category but is not in its opening round, and
# nobody else. Checked against the sheet, not against the generator's own working.
byes = list(csv.DictReader(open(BYES))) if os.path.exists(BYES) else []

# The opening round is the one round drawn straight from the field: every other round takes
# at least one side from somewhere else here, so LATER names them all. That is the round the
# byes are byes from.
opening = [r for r in rows if not r['Round'].startswith('Group') and not r['later']]
entered = {}
for r in opening:
	entered.setdefault(r['Category'], set()).update(
		side.strip() for side in (r['Side A'], r['Side B']) if side.strip())

for b in byes:
	if b['Category'] not in entered:
		bad.append('bye for %r, a category with no knockout round' % b['Category'])
	elif b['Player'] in entered[b['Category']]:
		bad.append('%s has a bye in %s but also plays the opening round' % (b['Player'], b['Category']))
	elif not b['Round']:
		bad.append('%s has a bye in %s into no named round' % (b['Player'], b['Category']))

# A bye is only useful if it lands somewhere: the round it carries a player into has to name
# them, in one tie and no more, or they still have no idea when they play. That round is now
# drawn in full, so the ties a bye is not in are the winner-against-winner ones beside them.
for category in {b['Category'] for b in byes}:
	entering = {b['Player'] for b in byes if b['Category'] == category}
	rounds = {b['Round'] for b in byes if b['Category'] == category}
	if len(rounds) > 1:
		bad.append('%s: byes into more than one round, %s' % (category, ', '.join(sorted(rounds))))
		continue
	round_name = rounds.pop()
	ties = [r for r in rows if r['Category'] == category and r['Round'] == round_name]
	if not ties:
		bad.append('%s: %d byes into a %s that is not drawn' % (category, len(entering), round_name))
		continue
	seats = [side.strip() for tie in ties for side in (tie['Side A'], tie['Side B'])]
	for player in sorted(entering):
		if seats.count(player) != 1:
			bad.append('%s has a bye in %s but %d ties in the %s'
				% (player, category, seats.count(player), round_name))

# Every category is drawn out to a champion. Work out the field the opening round leaves —
# its ties plus its byes, or the top two of each group — and the rounds after it are then
# fixed: halving to a single final, behind a play-in where that field is not a power of two.
for category in sorted({r['Category'] for r in rows}):
	mine = [r for r in rows if r['Category'] == category]
	groups_here = {r['Round'] for r in mine if r['Round'].startswith('Group')}
	if groups_here:
		field = 2 * len(groups_here)
	else:
		field = (len([r for r in mine if not r['later']])
			+ len([b for b in byes if b['Category'] == category]))
	want = []
	size = 1
	while size * 2 <= field:
		size *= 2
	if size != field:
		want.append(field - size)  # the play-in that trims it to a power of two
		field = size
	while field > 1:
		field //= 2
		want.append(field)
	# A Decider is a hand-added tiebreak for a group that finished level — it settles who the
	# group's qualifiers are, so it sits beside the bracket rather than in it and has no place
	# in the halving. Its count is whatever the tie needed, which is why it is skipped here.
	when = {}
	for r in mine:
		if r['later'] and r['Round'] != 'Decider':
			when[r['Round']] = min(when.get(r['Round'], (9, 9999)), (DAY_ORDER[r['Day']], r['s']))
	got = [sum(1 for r in mine if r['Round'] == name) for name in sorted(when, key=when.get)]
	if got != want:
		bad.append('%s: rounds of %s after the opening one, expected %s'
			% (category, '/'.join(map(str, got)) or 'none', '/'.join(map(str, want))))

# the field a bye leaves behind has to be a power of two
for category, players in entered.items():
	sat_out = [b for b in byes if b['Category'] == category]
	field = len(players) + len(sat_out)
	survivors = len(players) // 2 + len(sat_out)
	if survivors & (survivors - 1):
		bad.append('%s: %d entrants, %d byes -> %d into the next round, not a power of two'
			% (category, field, len(sat_out), survivors))

print('%d matches across %d files, %d byes' % (len(rows), len(set(r['file'] for r in rows)), len(byes)))
for day in HOURS:
	n = [r for r in rows if r['Day'] == day]
	if n:
		print('  %-11s %3d matches, last ends %s' % (day, len(n), max(r['End'] for r in n)))
if bad:
	print('\n%d PROBLEMS' % len(bad))
	for line in bad[:40]:
		print('  ' + line)
	sys.exit(1)
print('\nall rules hold')
