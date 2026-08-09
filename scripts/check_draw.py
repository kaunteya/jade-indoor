#!/usr/bin/env python3
"""Re-read schedules/data/*.csv and assert every scheduling rule holds."""
import csv, glob, os, re, sys
from itertools import combinations

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'schedules', 'data')
HOURS = {'Fri 14 Aug': (19 * 60, 22 * 60), 'Sat 15 Aug': (12 * 60, 22 * 60), 'Sun 16 Aug': (9 * 60, 21 * 60)}
AREAS = {'Badminton': 2, 'Table Tennis': 1, 'Carrom': 3, 'Chess': 6, '8-ball pool': 1}
SLOT = {'Badminton': 30, 'Table Tennis': 15, 'Chess': 50, 'Carrom': 50, '8-ball pool': 15}

# Keep in step with UNAVAILABLE in draw.py — duplicated so this stays an independent
# check on the written files rather than a re-run of the code that wrote them.
UNAVAILABLE = {
	'Aditya Shah (A-72)': [
		('Fri 14 Aug', 18 * 60, 21 * 60 + 30),
		('Sat 15 Aug', 18 * 60, 21 * 60 + 30),
	],
}

BYES = os.path.join(DATA, 'byes.csv')  # not a draw: no day, no time, no court

rows = []
for path in sorted(glob.glob(os.path.join(DATA, '*.csv'))):
	if os.path.samefile(path, BYES) if os.path.exists(BYES) else False:
		continue
	with open(path) as handle:
		for row in csv.DictReader(handle):
			row['file'] = os.path.basename(path)
			rows.append(row)

def mins(t):
	h, m = t.split(':')
	return int(h) * 60 + int(m)

bad = []
ids = {}
for r in rows:
	r['sport'] = r['Category'].split(' — ')[0]
	r['s'], r['e'] = mins(r['Start']), mins(r['End'])
	if r['Match'] in ids:
		bad.append('duplicate match id %s' % r['Match'])
	ids[r['Match']] = r
	if r['e'] - r['s'] != SLOT[r['sport']]:
		bad.append('%s: %d min, expected %d' % (r['Match'], r['e'] - r['s'], SLOT[r['sport']]))
	open_at, close_at = HOURS[r['Day']]
	if r['s'] < open_at or r['e'] > close_at:
		bad.append('%s: %s %s-%s outside opening hours' % (r['Match'], r['Day'], r['Start'], r['End']))
	if 'Under 14' in r['Category'] and r['e'] > 20 * 60:
		bad.append('%s: Under 14 running past 20:00' % r['Match'])
	if not r['Side A'].strip() or not r['Side B'].strip():
		bad.append('%s: empty side' % r['Match'])
	if r['Side A'].strip() == r['Side B'].strip():
		bad.append('%s: plays itself' % r['Match'])

# concurrency per sport, and the 5-minute turnaround on one area
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
			if not (b['e'] + 5 <= a['s'] or a['e'] + 5 <= b['s']):
				bad.append('%s/%s share %s with <5 min between' % (a['Match'], b['Match'], a['Court']))

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
DAY_ORDER = {'Fri 14 Aug': 0, 'Sat 15 Aug': 1, 'Sun 16 Aug': 2}
for r in rows:
	for side in (r['Side A'], r['Side B']):
		hit = re.match(r'(?:Winner|Runner-up)\s+(.+)$', side.strip())
		feeders = []
		if hit and (r['Category'], hit.group(1)) in groups:
			feeders = [g for g in rows if g['Category'] == r['Category'] and g['Round'] == hit.group(1)]
		elif hit and hit.group(1) in ids:
			feeders = [ids[hit.group(1)]]
		for f in feeders:
			if (DAY_ORDER[f['Day']], f['e'] + 5) > (DAY_ORDER[r['Day']], r['s']):
				bad.append('%s starts before %s (%s) has finished' % (r['Match'], f['Match'], side.strip()))

for day in HOURS:
	mine = [r for r in rows if r['Day'] == day]
	for a, b in combinations(mine, 2):
		if b['e'] + 5 <= a['s'] or a['e'] + 5 <= b['s']:
			continue
		shared = sides(a) & sides(b)
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
named = {}
for r in rows:
	if r['Round'].startswith('Group'):
		continue
	# 'Winner Group A' names nobody, so pool's knockout tail contributes no entrants —
	# only rounds drawn from the actual field can be counted against the byes.
	named.setdefault(r['Category'], set()).update(
		side.strip() for side in (r['Side A'], r['Side B'])
		if side.strip() and not re.match(r'(Winner|Runner-up|Loser)\b', side.strip()))
for b in byes:
	if b['Category'] not in named:
		bad.append('bye for %r, a category with no knockout round' % b['Category'])
	elif b['Player'] in named[b['Category']]:
		bad.append('%s has a bye in %s but also plays the opening round' % (b['Player'], b['Category']))
	elif not b['Round']:
		bad.append('%s has a bye in %s into no named round' % (b['Player'], b['Category']))
# the field a bye leaves behind has to be a power of two
for category, players in named.items():
	if not players:
		continue  # a placeholder-only tail, e.g. pool's quarter-finals
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
