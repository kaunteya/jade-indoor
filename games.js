// Paste your Apps Script Web App /exec URL here after deploying apps-script/Code.gs
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwXq4SDLwFQ47Ik5G7EnI6vkwpqQuEXF16f_b8WSx1AuEwhlltEo3UFMMGibIZ2WmdN5w/exec';

// gender: 'Male' | 'Female' | 'any' (open to both)
const GAMES = [
	{ id: 'badminton_singles_u14_male', game: 'Badminton', type: 'Singles', ageGroup: 'Under 14', min: 8, max: 13, gender: 'Male', price: 400 },
	{ id: 'badminton_singles_u14_female', game: 'Badminton', type: 'Singles', ageGroup: 'Under 14', min: 8, max: 13, gender: 'Female', price: 400 },
	{ id: 'badminton_doubles_u14', game: 'Badminton', type: 'Doubles', ageGroup: 'Under 14', min: 8, max: 13, gender: 'any', price: 600 },
	{ id: 'badminton_singles_14_60_male', game: 'Badminton', type: 'Singles', ageGroup: '14-59', min: 14, max: 59, gender: 'Male', price: 400 },
	{ id: 'badminton_singles_14_60_female', game: 'Badminton', type: 'Singles', ageGroup: '14-59', min: 14, max: 59, gender: 'Female', price: 400 },
	{ id: 'badminton_doubles_14_60_male', game: 'Badminton', type: 'Doubles', ageGroup: '14-59', min: 14, max: 59, gender: 'Male', price: 600 },
	{ id: 'badminton_doubles_14_60_female', game: 'Badminton', type: 'Doubles', ageGroup: '14-59', min: 14, max: 59, gender: 'Female', price: 600 },
	{ id: 'badminton_doubles_60plus', game: 'Badminton', type: 'Doubles', ageGroup: '60+ (flexible)', min: 60, max: Infinity, gender: 'any', price: 600 },

	{ id: 'tt_singles_u14_male', game: 'Table Tennis', type: 'Singles', ageGroup: 'Under 14', min: 8, max: 13, gender: 'Male', price: 200 },
	{ id: 'tt_singles_u14_female', game: 'Table Tennis', type: 'Singles', ageGroup: 'Under 14', min: 8, max: 13, gender: 'Female', price: 200 },
	{ id: 'tt_doubles_u14', game: 'Table Tennis', type: 'Doubles', ageGroup: 'Under 14 (flexible)', min: 8, max: 13, gender: 'any', price: 300 },
	{ id: 'tt_singles_14_60_male', game: 'Table Tennis', type: 'Singles', ageGroup: '14-59', min: 14, max: 59, gender: 'Male', price: 200 },
	{ id: 'tt_singles_14_60_female', game: 'Table Tennis', type: 'Singles', ageGroup: '14-59', min: 14, max: 59, gender: 'Female', price: 200 },
	{ id: 'tt_doubles_14_60', game: 'Table Tennis', type: 'Doubles', ageGroup: '14-59 (flexible)', min: 14, max: 59, gender: 'any', price: 300 },
	{ id: 'tt_singles_60plus', game: 'Table Tennis', type: 'Singles', ageGroup: '60+ (flexible)', min: 60, max: Infinity, gender: 'any', price: 200 },

	{ id: 'carrom_singles', game: 'Carrom', type: 'Singles', ageGroup: '10+', min: 10, max: Infinity, gender: 'any', price: 200 },
	{ id: 'carrom_doubles', game: 'Carrom', type: 'Doubles', ageGroup: '10+', min: 10, max: Infinity, gender: 'any', price: 300 },

	{ id: 'chess', game: 'Chess', type: '', ageGroup: '8+', min: 8, max: Infinity, gender: 'any', price: 200 },

	{ id: 'pool_singles', game: '8-ball pool', type: 'Singles', ageGroup: '15+', min: 15, max: Infinity, gender: 'any', price: 200 },
];


// Human-readable name for one game entry, e.g. 'Singles · Under 14 · Male'. A category open to
// both genders simply carries no gender, rather than being spelled out. Chess has neither a
// type nor an age split worth naming, so it comes back empty and callers fall back to the
// sport name on its own.
function categoryLabel(game) {
	if (game.game === 'Chess') return '';
	return [game.type, game.ageGroup, game.gender === 'any' ? '' : game.gender].filter(Boolean).join(' · ');
}

// Sport names in GAMES order, deduplicated.
function sportNames() {
	return [...new Set(GAMES.map(game => game.game))];
}
