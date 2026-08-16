// The landing page's only script: it fills in the Schedule card's note with when the schedule
// was last updated, so a phone that has been sitting on the page since yesterday can be told
// apart from one showing today's draw. That note is the card's whole subheading — the date is
// what a visitor mid-festival wants from it — and the date itself is read off schedules/data/
// by loadLastUpdated() in draws.js rather than written here; see the note there on why.
//
// Everything else on this page is static markup. Until (or unless) the date arrives, the note
// stays hidden and the card shows its title alone.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 'Sun 16 Aug, 6:42 pm' — the same day and clock spelling the draws use, so the card and the
// schedule page read alike. MONTHS comes from draws.js.
function formatUpdated(date) {
	const hours = date.getHours();
	const clock = `${((hours + 11) % 12) + 1}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
	return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}, ${clock}`;
}

const updatedLine = document.getElementById('schedule-updated');
loadLastUpdated('schedules/data/').then(date => {
	if (!date) return;
	// the date carries the line, so it is the half that is bold; built as a node rather than
	// with innerHTML for no better reason than that nothing here needs innerHTML
	const stamp = document.createElement('strong');
	stamp.textContent = formatUpdated(date);
	updatedLine.textContent = 'Last updated on ';
	updatedLine.append(stamp);
	updatedLine.hidden = false;
});
