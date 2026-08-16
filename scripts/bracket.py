#!/usr/bin/env python3
"""Render a draw CSV as a printable A4 bracket sheet.

Lays the draw out as HTML at 1240x1754 CSS px (A4 at 150dpi) and screenshots it
with headless Chrome at 2x, giving a 2480x3508 PNG (A4 at 300dpi).

	python3 bracket.py schedules/data/carrom-singles.csv brackets/carrom-singles.png
	python3 bracket.py schedules/data/chess.csv out.png --day "Sun 16 Aug"

With --day only that day's matches are drawn, which is what the sheets in
brackets/ are: one page per category for the closing day. A side that comes out
of a match played on an earlier day is resolved through
schedules/data/results.csv and enters the sheet as a name; one that is still
undecided — an unplayed match, or a group placeholder nothing works out — keeps
its placeholder text and is greyed.
"""

import csv
import html
import subprocess
import sys
from pathlib import Path

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# --- page geometry, CSS px; rendered at 2x
W, H = 1240, 1754
ML, MR = 30, 30
NAME_X = 33.5                          # left edge of the entrant names
NAME_MIN, NAME_MAX = 280.0, 620.0      # width the name column may take
CHAMP_W = 190.0                        # room kept to the right of the last round
MIN_GAP = 150.0                        # a round's band, at its narrowest
ROW_TOP, ROW_BOTTOM = 180.75, 1668.75  # band the entrant lines are spread over
MAX_PITCH = 340.0                      # ... but never further apart than this
NAME_MIN_PT, NAME_MAX_PT = 18.0, 30.0  # names grow with the room a short draw leaves
LABEL_MAX_PT = 20.0                    # ... and so, up to a point, do match labels
RULE_Y, FOOT_Y = 110.75, 1714.75
LABEL_INSET = 5.75                     # match labels are right-aligned this far left of the connector

C_BG = '#faf8f3'
C_LINE = '#b5b0a0'
C_NAME = '#1a1a17'
C_ID = '#6b675c'
C_TIME = '#8a8578'
C_GREEN = '#1a6b4a'
C_TAN = '#a08b4a'
C_PEND = '#9c988c'                     # a side nobody has qualified for yet
C_RULE = '#3a3a33'

# Rounds left to right. Group matches all share a column; every other name is
# one column of its own.
RANK = {'Decider': 1, 'Round of 128': 2, 'Round of 64': 3, 'Round of 32': 4,
        'Round of 16': 5, 'Quarter-final': 6, 'Semi-final': 7, 'Final': 8}
PLURAL = {'Quarter-final': 'QUARTER-FINALS', 'Semi-final': 'SEMI-FINALS',
          'Decider': 'DECIDERS'}


def rank(round_name):
	if round_name.startswith('Group'):
		return 0
	# A decider is named 'Decider' on its own or 'Decider — Group B' where the group it
	# settles is worth naming, so it is matched on the prefix. Keep in step with
	# is_decider() in check_draw.py and roundClass() in schedules/schedules.js.
	return RANK['Decider'] if round_name.startswith('Decider') else RANK[round_name]


def phrase(round_name):
	"""The round as it reads mid-sentence: 'enters at group D decider', not the raw
	'decider — group d' that lowercasing the whole name gives."""
	if round_name.startswith('Decider') and '—' in round_name:
		group = round_name.split('—', 1)[1].strip()
		return f'{group[:-1].lower()}{group[-1:]} decider'
	return round_name.lower()


def heading(names):
	"""The label over a column. Every decider in it collapses into one entry: the groups they
	settle sharing a single DECIDERS — 'GROUP B / GROUP D DECIDERS' rather than the word once
	per name, which is what keeps the heading inside the narrow first band on the pool sheet.
	A column mixing named deciders with bare ones falls back to DECIDERS, since listing only
	the groups that happen to be named would read as if it covered them all."""
	deciders = [n for n in names if n.startswith('Decider')]
	groups = [n.split('—', 1)[1].strip() for n in deciders if '—' in n]
	rest = [PLURAL.get(n, n) for n in names if n not in deciders]
	if deciders:
		rest.insert(0, ' / '.join(groups) + (' DECIDERS' if len(groups) > 1 else ' DECIDER')
		            if len(groups) == len(deciders) else PLURAL['Decider'])
	return ' / '.join(rest).upper()


def read_results(csv_path):
	"""Match -> winning side, as spelled in the draw. Absent file is fine."""
	path = Path(csv_path).parent / 'results.csv'
	if not path.exists():
		return {}
	with open(path, encoding='utf-8') as fh:
		return {r['Match']: r['Winner'] for r in csv.DictReader(fh)}


def columns(by_id):
	"""Place each match in a column: at least as far right as its round, and
	always a column past whatever feeds it. Rounds that never feed themselves
	are then levelled up so all their matches line up — pool's chained deciders
	are the reason that has to be conditional."""
	ranks = sorted({rank(r['Round']) for r in by_id.values()})
	col = {m: ranks.index(rank(r['Round'])) for m, r in by_id.items()}

	def kids(mid):
		return [s[len('Winner '):] for s in sides(by_id[mid])
		        if s.startswith('Winner ') and s[len('Winner '):] in by_id]

	def settle():
		for _ in range(len(by_id) + 1):
			moved = False
			for mid in by_id:
				want = max([col[mid]] + [col[k] + 1 for k in kids(mid)])
				if want != col[mid]:
					col[mid], moved = want, True
			if not moved:
				return
		raise ValueError('cycle in the draw')

	settle()
	chained = {by_id[m]['Round'] for m in by_id
	           for k in kids(m) if by_id[k]['Round'] == by_id[m]['Round']}
	for name in {r['Round'] for r in by_id.values()} - chained:
		peak = max(col[m] for m, r in by_id.items() if r['Round'] == name)
		for m, r in by_id.items():
			if r['Round'] == name:
				col[m] = peak
	settle()
	return col


def sides(row):
	return (row['Side A'], row['Side B'])


def main(csv_path, out_png, day=None):
	with open(csv_path, encoding='utf-8') as fh:
		rows = [r for r in csv.DictReader(fh) if day is None or r['Day'] == day]
	if not rows:
		raise SystemExit(f'{csv_path}: nothing on {day}')
	results = read_results(csv_path)
	by_id = {r['Match']: r for r in rows}
	col = columns(by_id)
	ncol = max(col.values()) + 1

	# --- a side is either a match drawn on this sheet, or a line of text
	def child(val):
		mid = val[len('Winner '):] if val.startswith('Winner ') else None
		return mid if mid in by_id else None

	def leaf(val):
		"""(label, note, pending) for a side that is not drawn on this sheet."""
		if val.startswith('Winner ') and val[len('Winner '):] in results:
			ref = val[len('Winner '):]
			return results[ref], f'via {ref}', False
		if val.startswith(('Winner ', 'Runner-up ')):
			return val, '', True
		return val, '', False

	# Entrants top to bottom: a depth-first walk of each tree. Roots are the
	# matches nothing on the sheet feeds; the deepest one — the final — leads.
	fed = {c for r in rows for s in sides(r) if (c := child(s))}
	roots = sorted((m for m in by_id if m not in fed),
	               key=lambda m: (-col[m], m))
	order = []

	def dfs(mid):
		for val in sides(by_id[mid]):
			if (c := child(val)):
				dfs(c)
			else:
				order.append((val, mid))

	for root in roots:
		dfs(root)

	n = len(order)
	pitch = min(MAX_PITCH, (ROW_BOTTOM - ROW_TOP) / max(n - 1, 1))
	top = ROW_TOP + ((ROW_BOTTOM - ROW_TOP) - pitch * (n - 1)) / 2
	row_y = [top + i * pitch for i in range(n)]

	# Names take the room the draw leaves them: a page holding one final sets
	# them big, a 32-line chess sheet as small as they go. Helvetica runs a
	# shade over half an em per character on names like these, so the widest
	# name also caps the size — a clipped name would be worse than a small one.
	longest = max(len(leaf(val)[0]) for val, _ in order)
	room = min(NAME_MAX, W - MR - CHAMP_W - MIN_GAP * (ncol - 1))
	fits = (room - NAME_X - 14) / (longest * 0.545)
	name_size = min(NAME_MAX_PT, max(NAME_MIN_PT, pitch * 0.30), fits)
	note_size = max(13.0, name_size * 0.6)
	col0 = min(room, max(NAME_MIN, NAME_X + longest * name_size * 0.545 + 14))
	gap = (W - MR - CHAMP_W - col0) / max(ncol - 1, 1)
	col_x = [col0 + gap * i for i in range(ncol)]

	# The match label hangs under the upper arm, so it has the band for width
	# and whatever the row leaves above the next name for height. Rather than
	# squeeze it into one shape, write out the ways it could break — most lines
	# and shortest lines first — and take whichever reads largest here. A wide
	# row spells everything out over three lines; a 32-line chess sheet ends up
	# on one, keeping the start time and dropping the end (the footer carries
	# the slot length anyway).
	lw = max(120.0, min(gap - 12, 340.0))
	room_v = pitch - name_size - 13.5
	one_court = len({r['Court'] for r in rows}) == 1

	def variants(mid, r):
		span = f"{r['Start']}–{r['End']}" if day else \
		       f"{r['Day']} {r['Start']}–{r['End']}"
		start = r['Start'] if day else f"{r['Day']} {r['Start']}"
		if one_court:                  # the footer already names the one area
			return [[mid, span], [f'{mid} · {span}'], [f'{mid} · {start}']]
		court = r['Court']
		return [[mid, span, court], [mid, f'{span} · {court}'],
		        [f'{mid} · {span} · {court}'], [f'{mid} · {start} · {court}']]

	shapes = [variants(m, r) for m, r in by_id.items()]
	plan, label_size = 0, 0.0
	for k in range(len(shapes[0])):
		widest = max(len(s) for shape in shapes for s in shape[k])
		tall = len(shapes[0][k])
		size = min(LABEL_MAX_PT, (lw - 6) / (widest * 0.5),
		           (room_v + 8) / (tall * 1.32))
		if size > label_size + 0.01:
			plan, label_size = k, size
	label_size = max(9.0, label_size)
	# the id is what gets read out and written down, so it takes any height the
	# lines under it leave over — as long as its own line still fits the band,
	# which on a one-line plan means the whole label
	rest = (len(shapes[0][plan]) - 1) * label_size * 1.32
	head = max(len(shape[plan][0]) for shape in shapes)
	solo = ' · ' in shapes[0][plan][0]
	id_size = max(label_size, min(LABEL_MAX_PT, (room_v + 8 - rest) / 1.32,
	              (lw - 6) / (head * (0.5 if solo else 0.66))))

	ymid = {}

	def y_of(mid):
		"""A match sits midway between the two sides feeding it."""
		if mid not in ymid:
			ymid[mid] = sum(side_y(mid, s) for s in (0, 1)) / 2
		return ymid[mid]

	def side_y(mid, i):
		val = sides(by_id[mid])[i]
		return y_of(c) if (c := child(val)) else row_y[order.index((val, mid))]

	def x_start(val):
		"""Where a side's incoming horizontal begins — the left margin, or the
		connector of the match it comes out of."""
		return col_x[col[c]] if (c := child(val)) else ML

	out = []

	def div(style, text=''):
		out.append(f'<div style="{style}">{text}</div>')

	def snap(v):
		"""Land on a whole device pixel — the page is rendered at 2x, so halves
		are exact and anything finer leaves a seam where two rules meet."""
		return round(v * 2) / 2

	def hline(x1, x2, y, color=C_LINE, thick=1):
		x1, x2, y = snap(x1), snap(x2), snap(y)
		div(f'position:absolute;left:{x1:.1f}px;top:{y:.1f}px;width:{x2 - x1:.1f}px;'
		    f'height:{thick}px;background:{color}')

	def vline(x, y1, y2, color=C_LINE, thick=1):
		x, y1, y2 = snap(x), snap(y1), snap(y2)
		div(f'position:absolute;left:{x:.1f}px;top:{y1:.1f}px;width:{thick}px;'
		    f'height:{y2 - y1:.1f}px;background:{color}')

	def text(x, y, s, size, color, weight=400, italic=False, right=False,
	         width=340, ls=0, raw=False):
		left = x - width if right else x
		div(f'position:absolute;left:{left:.2f}px;top:{y:.2f}px;width:{width}px;'
		    f'text-align:{"right" if right else "left"};font-size:{size}px;'
		    f'color:{color};font-weight:{weight};letter-spacing:{ls}px;'
		    f'font-style:{"italic" if italic else "normal"};line-height:1;'
		    f'white-space:nowrap;overflow:hidden',
		    s if raw else html.escape(s))

	# --- the bracket itself: three sides of a box per match, opening to the left
	for mid, r in by_id.items():
		v = col_x[col[mid]]
		won = results.get(mid)
		ys = [side_y(mid, 0), side_y(mid, 1)]
		for i, val in enumerate(sides(r)):
			# arms run a pixel past the connector so the two corners close
			hit = won is not None and val == won
			hline(x_start(val), v + 1, ys[i], C_GREEN if hit else C_LINE,
			      1.5 if hit else 1)
		vline(v, min(ys), max(ys))
		# id, then time and area, right-aligned just inside the connector and
		# hanging under the upper arm — the space above it belongs to whatever
		# name or match feeds that arm
		yy = ys[0] + 7
		for i, line in enumerate(variants(mid, r)[plan]):
			size = id_size if i == 0 else label_size
			if i == 0 and line != mid:
				# a one-line label still says the id loudest
				line = f'<b>{mid}</b>{html.escape(line[len(mid):])}'
				text(v - LABEL_INSET, yy, line, size, C_TIME, right=True,
				     width=lw, raw=True)
			else:
				text(v - LABEL_INSET, yy, line, size,
				     C_ID if i == 0 else C_TIME, weight=700 if i == 0 else 400,
				     right=True, width=lw)
			yy += size * 1.32

	# --- entrants down the left edge; one that enters past the opening column
	# has either had a bye or come through an earlier day, and is called out
	for i, (val, mid) in enumerate(order):
		label, note, pending = leaf(val)
		y = row_y[i]
		late = col[mid] > 0
		# on a full draw a late entry is a bye and worth the emphasis; on a
		# single day's sheet nearly everyone enters late, so it means nothing
		bold = late and not pending and not day
		text(NAME_X, y - name_size - 4.5, label, name_size,
		     C_PEND if pending else C_NAME, weight=700 if bold else 400,
		     italic=pending, width=col0 - NAME_X - 8)
		if pending:
			# a group placeholder whose group is still being played here can at
			# least say when it will be known
			ends = [r['End'] for r in rows if val.endswith(r['Round'])]
			note = f'known after {max(ends)}' if ends else ''
		elif not note and late:
			note = ('enters at ' if day else 'bye → ') + phrase(by_id[mid]['Round'])
		if note:
			text(NAME_X + 0.5, y + 4, note, note_size, C_TAN, italic=True,
			     width=col0 - NAME_X - 8)

	# --- champion, drawn like an entrant row but in green
	fin = by_id[roots[0]]
	if fin['Round'] == 'Final':
		fy = y_of(roots[0])
		champ_x = col_x[col[roots[0]]] + 9.75
		hline(col_x[col[roots[0]]], W - MR + 0.5, fy, C_GREEN, 1.5)
		text(champ_x, fy - 23.31, 'CHAMPION', 21.0, C_GREEN, weight=700, ls=1.75)
		text(champ_x, fy + 12.38,
		     fin['End'] if day else f"{fin['Day']}, {fin['End']}", 15.5, C_TIME)

	# --- header and footer
	head = []

	def fixed(style, s):
		head.append(f'<div style="position:absolute;{style};line-height:1">'
		            f'{html.escape(s)}</div>')

	cat = rows[0]['Category']
	fixed(f'left:{ML}px;top:36.5px;font-size:34px;font-weight:700;letter-spacing:2.4px;'
	      f'color:{C_NAME}', cat.upper())
	tally = f"{len(by_id)} match" + ('' if len(by_id) == 1 else 'es')
	when = f"{day} 2026 · {tally}" if day else \
	       f"14–16 August 2026 · {n} entrants, {tally}"
	fixed(f'left:{ML}px;top:79.5px;font-size:18px;color:{C_TIME}',
	      f'Jade Indoor Sports Festival · {when}')
	head.append(f'<div style="position:absolute;left:{ML}px;top:{RULE_Y}px;'
	            f'width:{W - ML - MR}px;height:1px;background:{C_RULE}"></div>')
	# each round's label sits at the left edge of its band — the connector of
	# the round before it. A round spanning two columns is named once.
	seen, banners = set(), []
	for i in range(ncol):
		names = sorted({r['Round'] for m, r in by_id.items() if col[m] == i},
		               key=lambda n: (rank(n), n))
		label = heading([s for s in names if s not in seen])
		seen.update(names)
		if label:
			banners.append((ML + 0.5 if i == 0 else col_x[i - 1] + 0.75, label,
			                col0 - ML if i == 0 else gap))
	# one size for the whole row, set by whichever band is tightest — a header
	# in step with its neighbours reads better than each at its own maximum
	size = max(11.0, min([18.0] + [(band - 20) / (len(s) * 0.69)
	                               for _, s, band in banners]))
	for x, label, _ in banners:
		fixed(f'left:{x:.2f}px;top:{123.4:.2f}px;font-size:{size:.2f}px;'
		      f'font-weight:700;letter-spacing:{size * 0.06:.2f}px;'
		      f'color:{C_GREEN}', label)

	area = sorted({r['Court'] for r in rows})
	kind = area[0].split()[0]
	span = f"{area[0].split()[-1]}–{area[-1].split()[-1]}" if len(area) > 1 \
	       else area[0].split()[-1]
	mins = sorted({minutes(r) for r in rows})
	slot = f'{mins[0]}' if len(mins) == 1 else f'{mins[0]}–{mins[-1]}'
	first, last = min(rows, key=lambda r: r['Start']), max(rows, key=lambda r: r['End'])
	head.append(f'<div style="position:absolute;left:{ML}px;top:{FOOT_Y}px;'
	            f'width:{W - ML - MR}px;height:1px;background:{C_LINE}"></div>')
	foot = (f"{kind}{'s' if len(area) > 1 else ''} {span} · {slot}-minute slots · "
	        f"{first['Start']}–{last['End']}" if day else
	        f"{kind}s {span} · {slot}-minute slots · "
	        f"Final: {fin['Day']}, {fin['Start']}–{fin['End']}")
	fixed(f'left:{ML}px;top:{FOOT_Y + 10.5}px;font-size:15.5px;color:{C_TIME}', foot)
	head.append(f'<div style="position:absolute;left:{ML}px;top:{FOOT_Y + 10.5}px;'
	            f'width:{W - ML - MR}px;text-align:right;font-size:15.5px;'
	            f'color:{C_TIME};line-height:1">Winners advance to the right.</div>')

	doc = (f'<!doctype html><html><head><meta charset="utf-8"><style>'
	       f'*{{margin:0;padding:0;box-sizing:border-box}}'
	       f'html,body{{width:{W}px;height:{H}px;background:{C_BG};'
	       f"font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"
	       f'-webkit-font-smoothing:antialiased}}'
	       f'</style></head><body>{"".join(head)}{"".join(out)}</body></html>')

	out_png = str(Path(out_png).resolve())
	tmp = Path(out_png).with_suffix('.html')
	tmp.write_text(doc, encoding='utf-8')
	subprocess.run([
		CHROME, '--headless', '--disable-gpu', '--hide-scrollbars',
		f'--screenshot={out_png}', f'--window-size={W},{H}',
		'--force-device-scale-factor=2', tmp.as_uri(),
	], check=True, capture_output=True)
	tmp.unlink()
	print(f'{Path(out_png).name}: {len(by_id)} matches, {n} entry lines, '
	      f'{ncol} columns')


def minutes(row):
	def mm(s):
		h, m = s.split(':')
		return int(h) * 60 + int(m)
	return mm(row['End']) - mm(row['Start'])


if __name__ == '__main__':
	args = sys.argv[1:]
	day = None
	if '--day' in args:
		i = args.index('--day')
		day = args[i + 1]
		args = args[:i] + args[i + 2:]
	main(args[0], args[1], day)
