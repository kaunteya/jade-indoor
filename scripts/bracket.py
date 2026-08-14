#!/usr/bin/env python3
"""Render a knockout draw CSV as a printable A4 bracket sheet.

Lays the draw out as HTML at 1240x1754 CSS px (A4 at 150dpi) and screenshots it
with headless Chrome at 2x, giving a 2480x3508 PNG. Geometry is measured off the
existing sheets in brackets/ so a regenerated category matches the rest of the set.

    python3 bracket.py schedules/data/carrom-singles.csv brackets/carrom-singles.png
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
COL0, COL_GAP = 339.75, 170.0          # x of each round's vertical connector
ROUNDS = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final']
COL_X = {r: COL0 + COL_GAP * i for i, r in enumerate(ROUNDS)}
LABELS = ['ROUND OF 32', 'ROUND OF 16', 'QUARTER-FINALS', 'SEMI-FINALS', 'FINAL']
ROW_TOP, ROW_BOTTOM = 180.75, 1668.75  # y of the first and last entrant line
RULE_Y, FOOT_Y = 110.75, 1714.75
LABEL_INSET = 5.75                     # match labels are right-aligned this far left of the connector

C_BG = '#faf8f3'
C_LINE = '#b5b0a0'
C_NAME = '#1a1a17'
C_ID = '#6b675c'
C_TIME = '#8a8578'
C_GREEN = '#1a6b4a'
C_TAN = '#a08b4a'
C_RULE = '#3a3a33'

SLOT_MINUTES = {'Badminton': 30, 'Table Tennis': 15, 'Chess': 50, 'Carrom': 50,
                '8-ball pool': 15}


def build(rows):
	"""Index the draw by match id and find its final."""
	by_id = {r['Match']: r for r in rows}
	fed = {s[len('Winner '):] for r in rows for s in (r['Side A'], r['Side B'])
	       if s.startswith('Winner ')}
	(root,) = [m for m in by_id if m not in fed]
	return by_id, root


def main(csv_path, out_png):
	with open(csv_path, encoding='utf-8') as fh:
		rows = list(csv.DictReader(fh))
	by_id, root = build(rows)

	# Entrants top to bottom: a depth-first walk of the tree from the final.
	order = []

	def dfs(mid):
		for side in ('Side A', 'Side B'):
			val = by_id[mid][side]
			if val.startswith('Winner '):
				dfs(val[len('Winner '):])
			else:
				order.append((val, mid))

	dfs(root)

	n = len(order)
	pitch = (ROW_BOTTOM - ROW_TOP) / (n - 1)
	leaf_y = {name: ROW_TOP + i * pitch for i, (name, _) in enumerate(order)}

	ymid = {}

	def y_of(mid):
		"""A match sits midway between the two sides feeding it."""
		if mid not in ymid:
			ymid[mid] = sum(side_y(by_id[mid][s]) for s in ('Side A', 'Side B')) / 2
		return ymid[mid]

	def side_y(val):
		return y_of(val[len('Winner '):]) if val.startswith('Winner ') else leaf_y[val]

	def x_start(val):
		"""Where a side's incoming horizontal begins — the left margin, or the
		connector of the match it comes out of."""
		if val.startswith('Winner '):
			return COL_X[by_id[val[len('Winner '):]]['Round']]
		return ML

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
	         width=340, ls=0):
		left = x - width if right else x
		div(f'position:absolute;left:{left:.2f}px;top:{y:.2f}px;width:{width}px;'
		    f'text-align:{"right" if right else "left"};font-size:{size}px;'
		    f'color:{color};font-weight:{weight};letter-spacing:{ls}px;'
		    f'font-style:{"italic" if italic else "normal"};line-height:1',
		    html.escape(s))

	# --- the bracket itself: three sides of a box per match, opening to the left
	for mid, r in by_id.items():
		v = COL_X[r['Round']]
		a, b = r['Side A'], r['Side B']
		ya, yb = side_y(a), side_y(b)
		# arms run a pixel past the connector so the two corners close
		hline(x_start(a), v + 1, ya)
		hline(x_start(b), v + 1, yb)
		vline(v, ya, yb)
		# id and time, right-aligned just inside the connector, above the upper arm
		text(v - LABEL_INSET, ya - 30, mid, 10.0, C_ID, weight=700, right=True)
		text(v - LABEL_INSET, ya - 15, f"{r['Day']} {r['Start']}", 9.55, C_TIME, right=True)

	# --- entrants; a bye enters at a later round and is called out as such
	byes = {name for name, mid in order if by_id[mid]['Round'] != ROUNDS[0]}
	for name, mid in order:
		y = leaf_y[name]
		text(33.5, y - 18, name, 13.5, C_NAME, weight=700 if name in byes else 400)
		if name in byes:
			text(34, y + 4, f"bye → {by_id[mid]['Round']}", 10, C_TAN, italic=True)

	# --- champion, drawn like an entrant row but in green
	fy = y_of(root)
	fin = by_id[root]
	champ_x = COL_X['Final'] + 9.75
	hline(COL_X['Final'], W - MR + 0.5, fy, C_GREEN, 1.5)
	text(champ_x, fy - 23.31, 'CHAMPION', 15.7, C_GREEN, weight=700, ls=1.45)
	text(champ_x, fy + 12.38, f"{fin['Day']}, {fin['End']}", 11.9, C_TIME)

	# --- header and footer
	head = []

	def fixed(style, s):
		head.append(f'<div style="position:absolute;{style};line-height:1">'
		            f'{html.escape(s)}</div>')

	cat = rows[0]['Category']
	fixed(f'left:{ML}px;top:36.5px;font-size:32.2px;font-weight:700;letter-spacing:2.27px;'
	      f'color:{C_NAME}', cat.upper())
	fixed(f'left:{ML}px;top:79.5px;font-size:15px;color:{C_TIME}',
	      f'Jade Indoor Sports Festival · 14–16 August 2026 · '
	      f'{n} entrants, {len(by_id)} matches')
	head.append(f'<div style="position:absolute;left:{ML}px;top:{RULE_Y}px;'
	            f'width:{W - ML - MR}px;height:1px;background:{C_RULE}"></div>')
	for i, label in enumerate(LABELS):
		# each round's label sits at the left edge of its band — the connector of
		# the round before it
		x = ML + 0.5 if i == 0 else COL_X[ROUNDS[i - 1]] + 0.75
		fixed(f'left:{x:.2f}px;top:{123.4:.2f}px;font-size:12.3px;font-weight:700;'
		      f'letter-spacing:1.35px;color:{C_GREEN}', label)

	area = sorted({r['Court'] for r in rows})
	kind = area[0].split()[0]
	mins = SLOT_MINUTES[cat.split(' — ')[0]]
	head.append(f'<div style="position:absolute;left:{ML}px;top:{FOOT_Y}px;'
	            f'width:{W - ML - MR}px;height:1px;background:{C_LINE}"></div>')
	fixed(f'left:{ML}px;top:{FOOT_Y + 10.5}px;font-size:12.5px;color:{C_TIME}',
	      f"{kind}s {area[0].split()[-1]}–{area[-1].split()[-1]} · {mins}-minute slots · "
	      f"Final: {fin['Day']}, {fin['Start']}–{fin['End']}")
	head.append(f'<div style="position:absolute;left:{ML}px;top:{FOOT_Y + 10.5}px;'
	            f'width:{W - ML - MR}px;text-align:right;font-size:12.5px;'
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
	print(f'{out_png}: {n} entrants, {len(by_id)} matches')


if __name__ == '__main__':
	main(sys.argv[1], sys.argv[2])
