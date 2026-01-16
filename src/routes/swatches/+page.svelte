<script lang="ts">
	import { picoColors } from '$lib/util';

	// Current no-precip colors (sky blues) - these are fixed
	const noPrecipColors = [
		{ name: 'Clear (0)', color: '#6bb3e0', usage: 'Darkest sky' },
		{ name: 'Mostly Clear (1)', color: '#90c8e8', usage: 'Medium sky' },
		{ name: 'Partly Cloudy (2)', color: '#b0d8f0', usage: 'Light sky' },
		{ name: 'Overcast (3)', color: '#c8dce8', usage: 'Lightest sky' },
	];

	// Current rain colors that overlap
	const currentRainColors = [
		{ name: 'L.Drizzle', color: picoColors.azure[200], usage: 'azure.200' },
		{ name: 'Drizzle', color: picoColors.azure[300], usage: 'azure.300' },
		{ name: 'H.Drizzle', color: picoColors.azure[400], usage: 'azure.400' },
		{ name: 'L.Showers', color: picoColors.azure[250], usage: 'azure.250' },
		{ name: 'Showers', color: picoColors.azure[350], usage: 'azure.350' },
		{ name: 'H.Showers', color: picoColors.azure[450], usage: 'azure.450' },
		{ name: 'L.Rain', color: picoColors.blue[350], usage: 'blue.350' },
		{ name: 'Rain', color: picoColors.blue[450], usage: 'blue.450' },
		{ name: 'H.Rain', color: picoColors.blue[550], usage: 'blue.550' },
	];

	// Option A: Darker azure
	const optionA = [
		{ name: 'L.Drizzle', color: picoColors.azure[400], usage: 'azure.400' },
		{ name: 'Drizzle', color: picoColors.azure[500], usage: 'azure.500' },
		{ name: 'H.Drizzle', color: picoColors.azure[600], usage: 'azure.600' },
		{ name: 'L.Showers', color: picoColors.azure[450], usage: 'azure.450' },
		{ name: 'Showers', color: picoColors.azure[550], usage: 'azure.550' },
		{ name: 'H.Showers', color: picoColors.azure[650], usage: 'azure.650' },
		{ name: 'L.Rain', color: picoColors.blue[450], usage: 'blue.450' },
		{ name: 'Rain', color: picoColors.blue[550], usage: 'blue.550' },
		{ name: 'H.Rain', color: picoColors.blue[650], usage: 'blue.650' },
	];

	// Option B: Jade shifted (green-blue)
	const optionB = [
		{ name: 'L.Drizzle', color: picoColors.jade[400], usage: 'jade.400' },
		{ name: 'Drizzle', color: picoColors.jade[500], usage: 'jade.500' },
		{ name: 'H.Drizzle', color: picoColors.jade[600], usage: 'jade.600' },
		{ name: 'L.Showers', color: picoColors.jade[450], usage: 'jade.450' },
		{ name: 'Showers', color: picoColors.jade[550], usage: 'jade.550' },
		{ name: 'H.Showers', color: picoColors.jade[650], usage: 'jade.650' },
		{ name: 'L.Rain', color: picoColors.blue[450], usage: 'blue.450' },
		{ name: 'Rain', color: picoColors.blue[550], usage: 'blue.550' },
		{ name: 'H.Rain', color: picoColors.blue[650], usage: 'blue.650' },
	];

	// Option C: Cyan for drizzle/showers, keep blue for rain
	const optionC = [
		{ name: 'L.Drizzle', color: picoColors.cyan[400], usage: 'cyan.400' },
		{ name: 'Drizzle', color: picoColors.cyan[500], usage: 'cyan.500' },
		{ name: 'H.Drizzle', color: picoColors.cyan[600], usage: 'cyan.600' },
		{ name: 'L.Showers', color: picoColors.cyan[450], usage: 'cyan.450' },
		{ name: 'Showers', color: picoColors.cyan[550], usage: 'cyan.550' },
		{ name: 'H.Showers', color: picoColors.cyan[650], usage: 'cyan.650' },
		{ name: 'L.Rain', color: picoColors.blue[400], usage: 'blue.400' },
		{ name: 'Rain', color: picoColors.blue[500], usage: 'blue.500' },
		{ name: 'H.Rain', color: picoColors.blue[600], usage: 'blue.600' },
	];

	// Option D: Green for drizzle/showers, blue for rain (doppler style)
	const optionD = [
		{ name: 'L.Drizzle', color: picoColors.green[400], usage: 'green.400' },
		{ name: 'Drizzle', color: picoColors.green[500], usage: 'green.500' },
		{ name: 'H.Drizzle', color: picoColors.green[600], usage: 'green.600' },
		{ name: 'L.Showers', color: picoColors.green[450], usage: 'green.450' },
		{ name: 'Showers', color: picoColors.green[550], usage: 'green.550' },
		{ name: 'H.Showers', color: picoColors.green[650], usage: 'green.650' },
		{ name: 'L.Rain', color: picoColors.blue[400], usage: 'blue.400' },
		{ name: 'Rain', color: picoColors.blue[500], usage: 'blue.500' },
		{ name: 'H.Rain', color: picoColors.blue[600], usage: 'blue.600' },
	];

	// Option A2: Even darker azure
	const optionA2 = [
		{ name: 'L.Drizzle', color: picoColors.azure[500], usage: 'azure.500' },
		{ name: 'Drizzle', color: picoColors.azure[600], usage: 'azure.600' },
		{ name: 'H.Drizzle', color: picoColors.azure[700], usage: 'azure.700' },
		{ name: 'L.Showers', color: picoColors.azure[550], usage: 'azure.550' },
		{ name: 'Showers', color: picoColors.azure[650], usage: 'azure.650' },
		{ name: 'H.Showers', color: picoColors.azure[750], usage: 'azure.750' },
		{ name: 'L.Rain', color: picoColors.blue[550], usage: 'blue.550' },
		{ name: 'Rain', color: picoColors.blue[650], usage: 'blue.650' },
		{ name: 'H.Rain', color: picoColors.blue[750], usage: 'blue.750' },
	];

	// Option A3: Darkest azure
	const optionA3 = [
		{ name: 'L.Drizzle', color: picoColors.azure[600], usage: 'azure.600' },
		{ name: 'Drizzle', color: picoColors.azure[700], usage: 'azure.700' },
		{ name: 'H.Drizzle', color: picoColors.azure[800], usage: 'azure.800' },
		{ name: 'L.Showers', color: picoColors.azure[650], usage: 'azure.650' },
		{ name: 'Showers', color: picoColors.azure[750], usage: 'azure.750' },
		{ name: 'H.Showers', color: picoColors.azure[850], usage: 'azure.850' },
		{ name: 'L.Rain', color: picoColors.blue[650], usage: 'blue.650' },
		{ name: 'Rain', color: picoColors.blue[750], usage: 'blue.750' },
		{ name: 'H.Rain', color: picoColors.blue[850], usage: 'blue.850' },
	];

	// Precipitation bar color options (greenish-blue to contrast with WMO rain blues)
	const precipBarOptions = [
		{ name: 'Current (Solarized)', color: '#268bd2', usage: 'Original solarized blue' },
		{ name: 'Dark Navy', color: '#2244AA', usage: 'Previous dark navy' },
		{ name: 'Teal 500', color: picoColors.jade[500], usage: 'jade.500' },
		{ name: 'Teal 600', color: picoColors.jade[600], usage: 'jade.600' },
		{ name: 'Teal 700', color: picoColors.jade[700], usage: 'jade.700' },
		{ name: 'Cyan 600', color: picoColors.cyan[600], usage: 'cyan.600' },
		{ name: 'Cyan 700', color: picoColors.cyan[700], usage: 'cyan.700' },
		{ name: 'Green 600', color: picoColors.green[600], usage: 'green.600' },
		{ name: 'Green 700', color: picoColors.green[700], usage: 'green.700' },
		{ name: 'Jade 500', color: picoColors.jade[500], usage: 'jade.500 (teal-green)' },
		{ name: 'Jade 600', color: picoColors.jade[600], usage: 'jade.600' },
		{ name: '#0E7490', color: '#0E7490', usage: 'Tailwind cyan-700' },
		{ name: '#0F766E', color: '#0F766E', usage: 'Tailwind teal-700' },
		{ name: '#047857', color: '#047857', usage: 'Tailwind emerald-700' },
		{ name: '#15803D', color: '#15803D', usage: 'Tailwind green-700' },
	];

	// Cap color options for precip bars (current bar color is #78E8E8 soft cyan)
	const precipCapOptions = [
		{ name: 'Current', color: '#66AAFF', usage: 'Sky blue (current)' },
		{ name: 'Darker cyan', color: '#22D3EE', usage: 'Brighter cyan' },
		{ name: 'Teal', color: '#14B8A6', usage: 'Tailwind teal-500' },
		{ name: 'Cyan 400', color: picoColors.cyan[400], usage: 'cyan.400' },
		{ name: 'Cyan 500', color: picoColors.cyan[500], usage: 'cyan.500' },
		{ name: 'Azure 400', color: picoColors.azure[400], usage: 'azure.400' },
		{ name: 'Azure 500', color: picoColors.azure[500], usage: 'azure.500' },
		{ name: 'Blue 400', color: picoColors.blue[400], usage: 'blue.400' },
		{ name: 'Jade 400', color: picoColors.jade[400], usage: 'jade.400' },
		{ name: 'Indigo 400', color: picoColors.indigo[400], usage: 'indigo.400' },
		{ name: 'White', color: '#FFFFFF', usage: 'Pure white' },
		{ name: 'Light gray', color: '#E0E0E0', usage: 'Subtle cap' },
	];

	const rainOptions = [
		{ name: 'Current (overlaps with sky)', colors: currentRainColors },
		{ name: 'A: Darker azure (400-600)', colors: optionA },
		{ name: 'A2: Even darker azure (500-700)', colors: optionA2 },
		{ name: 'A3: Darkest azure (600-800)', colors: optionA3 },
		{ name: 'B: Jade shifted (green-blue)', colors: optionB },
		{ name: 'C: Cyan drizzle/showers, blue rain', colors: optionC },
		{ name: 'D: Green drizzle/showers, blue rain (doppler)', colors: optionD },
	];

	// Colors currently used in hourly plot:
	const usedColors = [
		{ name: 'Temperature Hot', color: '#ff4444', usage: 'Temp gradient hot end' },
		{ name: 'Temperature Cold', color: '#3366ff', usage: 'Temp gradient cold end' },
		{ name: 'Precipitation', color: '#2244AA', usage: 'Rain bars (dark navy)' },
		{ name: 'Precip Cap', color: '#66AAFF', usage: 'Rain bar cap (sky blue)' },
		{ name: 'Precip Probability', color: '#78E8E8', usage: 'Chance of rain area' },
		{ name: 'Humidity', color: '#20B2AA', usage: 'Humidity line (teal)' },
		{ name: 'Dew Point', color: '#178B8B', usage: 'Dew point line (dark teal)' },
	];

	// Current WMO colors
	const currentWmo = [
		{ name: 'Thunder', color: '#F472B6', usage: 'pink.350-550' },
		{ name: 'Snow', color: '#E879F9', usage: 'fuchsia.350-550' },
		{ name: 'Mixed', color: '#6A7AB8', usage: 'periwinkle' },
		{ name: 'Rain', color: '#22D3EE', usage: 'cyan.300-650' },
	];

	// ============================================================
	// LOCKED RAIN COLORS (for reference when designing snow/mixed)
	// ============================================================
	const lockedRainColors = [
		{ name: 'L.Drizzle', color: picoColors.azure[350], pico: 'azure.350' },
		{ name: 'Drizzle', color: picoColors.azure[450], pico: 'azure.450' },
		{ name: 'H.Drizzle', color: picoColors.azure[550], pico: 'azure.550' },
		{ name: 'L.Showers', color: picoColors.azure[400], pico: 'azure.400' },
		{ name: 'Showers', color: picoColors.azure[500], pico: 'azure.500' },
		{ name: 'H.Showers', color: picoColors.azure[600], pico: 'azure.600' },
		{ name: 'L.Rain', color: picoColors.blue[500], pico: 'blue.500' },
		{ name: 'Rain', color: picoColors.blue[600], pico: 'blue.600' },
		{ name: 'H.Rain', color: picoColors.blue[700], pico: 'blue.700' },
	];

	// ============================================================
	// SNOW COLOR OPTIONS (should be purple family, match rain darkness 350-700)
	// ============================================================
	const currentSnowColors = [
		{ name: 'Snow Grains', color: picoColors.purple[150], pico: 'purple.150' },
		{ name: 'L.Snow Showers', color: picoColors.purple[250], pico: 'purple.250' },
		{ name: 'Snow Showers', color: picoColors.purple[450], pico: 'purple.450' },
		{ name: 'L.Snow', color: picoColors.fuchsia[350], pico: 'fuchsia.350' },
		{ name: 'Snow', color: picoColors.fuchsia[450], pico: 'fuchsia.450' },
		{ name: 'H.Snow', color: picoColors.fuchsia[550], pico: 'fuchsia.550' },
	];

	// Snow Option A: Purple (cooler, more distinct from pink thunder)
	const snowOptionA = [
		{ name: 'Snow Grains', color: picoColors.purple[350], pico: 'purple.350' },
		{ name: 'L.Snow Showers', color: picoColors.purple[400], pico: 'purple.400' },
		{ name: 'Snow Showers', color: picoColors.purple[550], pico: 'purple.550' },
		{ name: 'L.Snow', color: picoColors.purple[450], pico: 'purple.450' },
		{ name: 'Snow', color: picoColors.purple[550], pico: 'purple.550' },
		{ name: 'H.Snow', color: picoColors.purple[650], pico: 'purple.650' },
	];

	// Snow Option B: Violet (blue-purple, bridges toward rain)
	const snowOptionB = [
		{ name: 'Snow Grains', color: picoColors.violet[350], pico: 'violet.350' },
		{ name: 'L.Snow Showers', color: picoColors.violet[400], pico: 'violet.400' },
		{ name: 'Snow Showers', color: picoColors.violet[550], pico: 'violet.550' },
		{ name: 'L.Snow', color: picoColors.violet[450], pico: 'violet.450' },
		{ name: 'Snow', color: picoColors.violet[550], pico: 'violet.550' },
		{ name: 'H.Snow', color: picoColors.violet[650], pico: 'violet.650' },
	];

	// Snow Option C: Fuchsia darkened (warmer purple, closer to current)
	const snowOptionC = [
		{ name: 'Snow Grains', color: picoColors.fuchsia[350], pico: 'fuchsia.350' },
		{ name: 'L.Snow Showers', color: picoColors.fuchsia[400], pico: 'fuchsia.400' },
		{ name: 'Snow Showers', color: picoColors.fuchsia[550], pico: 'fuchsia.550' },
		{ name: 'L.Snow', color: picoColors.fuchsia[450], pico: 'fuchsia.450' },
		{ name: 'Snow', color: picoColors.fuchsia[550], pico: 'fuchsia.550' },
		{ name: 'H.Snow', color: picoColors.fuchsia[650], pico: 'fuchsia.650' },
	];

	// Snow Option D: Dark Sky style purple
	const snowOptionD = [
		{ name: 'Snow Grains', color: '#b7b2db', pico: 'DS flurries' },
		{ name: 'L.Snow Showers', color: '#aba4db', pico: 'DS light snow' },
		{ name: 'Snow Showers', color: '#9590d0', pico: 'DS blend' },
		{ name: 'L.Snow', color: '#aba4db', pico: 'DS light snow' },
		{ name: 'Snow', color: '#8c82ce', pico: 'DS snow' },
		{ name: 'H.Snow', color: '#7a70c0', pico: 'DS darker' },
	];

	const snowOptions = [
		{ name: 'Current Snow', colors: currentSnowColors },
		{ name: 'A: Purple (350-650)', colors: snowOptionA },
		{ name: 'B: Violet (350-650)', colors: snowOptionB },
		{ name: 'C: Fuchsia darkened (350-650)', colors: snowOptionC },
		{ name: 'D: Dark Sky purple', colors: snowOptionD },
	];

	// ============================================================
	// MIXED/FREEZING COLOR OPTIONS (blend of rain blue + snow purple)
	// ============================================================
	const currentMixedColors = [
		{ name: 'L.Icy Drizzle', color: picoColors.indigo[350], pico: 'indigo.350' },
		{ name: 'Icy Drizzle', color: picoColors.indigo[550], pico: 'indigo.550' },
		{ name: 'L.Icy Rain', color: picoColors.violet[500], pico: 'violet.500' },
		{ name: 'Icy Rain', color: picoColors.violet[700], pico: 'violet.700' },
	];

	// Mixed Option A: Indigo throughout (blue-purple blend)
	const mixedOptionA = [
		{ name: 'L.Icy Drizzle', color: picoColors.indigo[400], pico: 'indigo.400' },
		{ name: 'Icy Drizzle', color: picoColors.indigo[550], pico: 'indigo.550' },
		{ name: 'L.Icy Rain', color: picoColors.indigo[500], pico: 'indigo.500' },
		{ name: 'Icy Rain', color: picoColors.indigo[650], pico: 'indigo.650' },
	];

	// Mixed Option B: Violet throughout (purple-leaning)
	const mixedOptionB = [
		{ name: 'L.Icy Drizzle', color: picoColors.violet[400], pico: 'violet.400' },
		{ name: 'Icy Drizzle', color: picoColors.violet[550], pico: 'violet.550' },
		{ name: 'L.Icy Rain', color: picoColors.violet[500], pico: 'violet.500' },
		{ name: 'Icy Rain', color: picoColors.violet[650], pico: 'violet.650' },
	];

	// Mixed Option C: Slate-purple (grayer, icy feel)
	const mixedOptionC = [
		{ name: 'L.Icy Drizzle', color: picoColors.slate[400], pico: 'slate.400' },
		{ name: 'Icy Drizzle', color: picoColors.slate[550], pico: 'slate.550' },
		{ name: 'L.Icy Rain', color: picoColors.slate[500], pico: 'slate.500' },
		{ name: 'Icy Rain', color: picoColors.slate[650], pico: 'slate.650' },
	];

	// Mixed Option D: Blue-violet gradient (rain→snow transition)
	const mixedOptionD = [
		{ name: 'L.Icy Drizzle', color: picoColors.blue[400], pico: 'blue.400' },
		{ name: 'Icy Drizzle', color: picoColors.indigo[500], pico: 'indigo.500' },
		{ name: 'L.Icy Rain', color: picoColors.indigo[550], pico: 'indigo.550' },
		{ name: 'Icy Rain', color: picoColors.violet[600], pico: 'violet.600' },
	];

	// Mixed Option E: Purple (same as snow but distinguishable)
	const mixedOptionE = [
		{ name: 'L.Icy Drizzle', color: picoColors.purple[400], pico: 'purple.400' },
		{ name: 'Icy Drizzle', color: picoColors.purple[550], pico: 'purple.550' },
		{ name: 'L.Icy Rain', color: picoColors.purple[500], pico: 'purple.500' },
		{ name: 'Icy Rain', color: picoColors.purple[650], pico: 'purple.650' },
	];

	const mixedOptions = [
		{ name: 'Current Mixed', colors: currentMixedColors },
		{ name: 'A: Indigo (400-650)', colors: mixedOptionA },
		{ name: 'B: Violet (400-650)', colors: mixedOptionB },
		{ name: 'C: Slate (grayer, icy)', colors: mixedOptionC },
		{ name: 'D: Blue→Violet gradient', colors: mixedOptionD },
		{ name: 'E: Purple (400-650)', colors: mixedOptionE },
	];

	// ============================================================
	// COMBINED PROGRESSIONS (Thunder → Snow → Mixed → Rain)
	// Rain is LOCKED at azure.500 (middle of the rain range)
	// ============================================================
	const lockedRain = picoColors.azure[500];
	const lockedThunder = picoColors.pink[450]; // keeping thunder consistent too

	const combinedOptions = [
		{
			name: 'Current',
			thunder: lockedThunder,
			snow: picoColors.fuchsia[450],
			mixed: picoColors.indigo[450],
			rain: lockedRain,
		},
		{
			name: 'P1: Purple snow, Indigo mixed',
			thunder: lockedThunder,
			snow: picoColors.purple[500],
			mixed: picoColors.indigo[500],
			rain: lockedRain,
		},
		{
			name: 'P2: Violet snow, Indigo mixed',
			thunder: lockedThunder,
			snow: picoColors.violet[500],
			mixed: picoColors.indigo[500],
			rain: lockedRain,
		},
		{
			name: 'P3: Purple snow, Violet mixed',
			thunder: lockedThunder,
			snow: picoColors.purple[500],
			mixed: picoColors.violet[550],
			rain: lockedRain,
		},
		{
			name: 'P4: Fuchsia snow, Violet mixed',
			thunder: lockedThunder,
			snow: picoColors.fuchsia[500],
			mixed: picoColors.violet[550],
			rain: lockedRain,
		},
		{
			name: 'P5: Violet snow, Blue-Violet mixed',
			thunder: lockedThunder,
			snow: picoColors.violet[500],
			mixed: picoColors.indigo[550],
			rain: lockedRain,
		},
		{
			name: 'DS: Dark Sky inspired',
			thunder: '#E23D68',
			snow: '#8c82ce',
			mixed: '#7C8BF5',
			rain: lockedRain,
		},
	];

	// Merry Timeline / Dark Sky colors (from examples + screenshot)
	const merryColors = [
		{ name: 'Clear', color: '#eeeef5', usage: 'Almost white' },
		{ name: 'Partly Cloudy', color: '#d5dae2', usage: 'Light gray' },
		{ name: 'Cloudy', color: '#b6bfcb', usage: 'Medium gray' },
		{ name: 'Fog', color: '#d5dae2', usage: 'Same as partly cloudy' },
		{ name: 'Thunderstorm', color: '#E23D68', usage: 'Red/Pink (warning)' },
		{ name: 'Drizzle', color: '#9fb6d6', usage: 'Light blue-gray' },
		{ name: 'Light Rain', color: '#80a5d6', usage: 'Medium blue' },
		{ name: 'Rain', color: '#5B8AC7', usage: 'Darker blue' },
		{ name: 'Flurries', color: '#b7b2db', usage: 'Light purple' },
		{ name: 'Light Snow', color: '#aba4db', usage: 'Medium purple' },
		{ name: 'Snow', color: '#8c82ce', usage: 'Darker purple' },
	];

	// Unused color families (not in plot or WMO):
	const unusedColors = [
		{ name: 'Green/Emerald', color: '#10B981', usage: 'Fresh, nature, radar-style' },
		{ name: 'Lime', color: '#84CC16', usage: 'Bright, energetic' },
		{ name: 'Yellow', color: '#EAB308', usage: 'Warning, sunshine' },
		{ name: 'Amber', color: '#F59E0B', usage: 'Warm warning' },
		{ name: 'Orange', color: '#F97316', usage: 'Alert, energy' },
		{ name: 'Red', color: '#EF4444', usage: 'Danger, severe' },
		{ name: 'Rose', color: '#F43F5E', usage: 'Softer warning' },
		{ name: 'Indigo', color: '#6366F1', usage: 'Deep blue-purple' },
		{ name: 'Violet', color: '#8B5CF6', usage: 'Purple family' },
	];

	const options = [
		// Green rain options (using unused color)
		{
			name: 'G1: Red thunder, Purple snow, Green rain',
			colors: [
				{ type: 'Thunder', color: '#EF4444' }, // red (danger)
				{ type: 'Snow', color: '#A855F7' }, // purple (cold)
				{ type: 'Mixed', color: '#6366F1' }, // indigo (purple→green transition)
				{ type: 'Rain', color: '#22C55E' }, // green (doppler style)
			],
		},
		{
			name: 'G2: Orange thunder, Violet snow, Emerald rain',
			colors: [
				{ type: 'Thunder', color: '#F97316' }, // orange (warning)
				{ type: 'Snow', color: '#8B5CF6' }, // violet
				{ type: 'Mixed', color: '#14B8A6' }, // teal (violet→green)
				{ type: 'Rain', color: '#10B981' }, // emerald
			],
		},
		{
			name: 'G3: Amber thunder, Indigo snow, Teal rain',
			colors: [
				{ type: 'Thunder', color: '#F59E0B' }, // amber (lightning)
				{ type: 'Snow', color: '#6366F1' }, // indigo
				{ type: 'Mixed', color: '#0D9488' }, // dark teal
				{ type: 'Rain', color: '#14B8A6' }, // teal
			],
		},
		{
			name: 'G4: Rose thunder, Blue snow, Lime rain',
			colors: [
				{ type: 'Thunder', color: '#F43F5E' }, // rose
				{ type: 'Snow', color: '#3B82F6' }, // blue
				{ type: 'Mixed', color: '#22D3EE' }, // cyan (blue→lime)
				{ type: 'Rain', color: '#84CC16' }, // lime
			],
		},
		// Keep cyan rain but change others
		{
			name: 'C1: Red thunder, Violet snow, Cyan rain',
			colors: [
				{ type: 'Thunder', color: '#EF4444' }, // red
				{ type: 'Snow', color: '#8B5CF6' }, // violet
				{ type: 'Mixed', color: '#818CF8' }, // violet-cyan blend
				{ type: 'Rain', color: '#06B6D4' }, // cyan
			],
		},
		{
			name: 'C2: Orange thunder, Indigo snow, Cyan rain',
			colors: [
				{ type: 'Thunder', color: '#F97316' }, // orange
				{ type: 'Snow', color: '#6366F1' }, // indigo
				{ type: 'Mixed', color: '#38BDF8' }, // sky (indigo→cyan)
				{ type: 'Rain', color: '#06B6D4' }, // cyan
			],
		},
		{
			name: 'C3: Amber thunder, Purple snow, Sky rain',
			colors: [
				{ type: 'Thunder', color: '#F59E0B' }, // amber
				{ type: 'Snow', color: '#A855F7' }, // purple
				{ type: 'Mixed', color: '#818CF8' }, // purple-sky blend
				{ type: 'Rain', color: '#38BDF8' }, // sky blue
			],
		},
		// Blue rain (closer to current precip bar color)
		{
			name: 'B1: Red thunder, Purple snow, Blue rain',
			colors: [
				{ type: 'Thunder', color: '#EF4444' }, // red
				{ type: 'Snow', color: '#A855F7' }, // purple
				{ type: 'Mixed', color: '#818CF8' }, // purple-blue blend
				{ type: 'Rain', color: '#3B82F6' }, // blue
			],
		},
		{
			name: 'B2: Orange thunder, Fuchsia snow, Indigo rain',
			colors: [
				{ type: 'Thunder', color: '#F97316' }, // orange
				{ type: 'Snow', color: '#D946EF' }, // fuchsia
				{ type: 'Mixed', color: '#A855F7' }, // fuchsia-indigo blend
				{ type: 'Rain', color: '#6366F1' }, // indigo
			],
		},
		// Natural progression from current thunder/snow
		{
			name: 'N1: Natural progression (pink→fuchsia→purple→blue)',
			colors: [
				{ type: 'Thunder', color: '#F472B6' }, // pink (keep)
				{ type: 'Snow', color: '#E879F9' }, // fuchsia (keep)
				{ type: 'Mixed', color: '#A855F7' }, // purple (next step)
				{ type: 'Rain', color: '#3B82F6' }, // blue (completes arc)
			],
		},
		{
			name: 'N2: Natural + indigo mixed',
			colors: [
				{ type: 'Thunder', color: '#F472B6' }, // pink (keep)
				{ type: 'Snow', color: '#E879F9' }, // fuchsia (keep)
				{ type: 'Mixed', color: '#818CF8' }, // indigo (further along)
				{ type: 'Rain', color: '#3B82F6' }, // blue
			],
		},
		{
			name: 'N3: Natural + violet snow',
			colors: [
				{ type: 'Thunder', color: '#F472B6' }, // pink (keep)
				{ type: 'Snow', color: '#A855F7' }, // purple (shift snow cooler)
				{ type: 'Mixed', color: '#818CF8' }, // indigo
				{ type: 'Rain', color: '#3B82F6' }, // blue
			],
		},
		// Dark Sky / Merry Timeline inspired
		{
			name: 'DS1: Dark Sky style (exact)',
			colors: [
				{ type: 'Thunder', color: '#E23D68' }, // red-pink
				{ type: 'Snow', color: '#8c82ce' }, // purple
				{ type: 'Mixed', color: '#9590d0' }, // purple-blue blend
				{ type: 'Rain', color: '#5B8AC7' }, // blue
			],
		},
		{
			name: 'DS2: Dark Sky + more saturated',
			colors: [
				{ type: 'Thunder', color: '#E63956' }, // more saturated red
				{ type: 'Snow', color: '#8B5CF6' }, // violet
				{ type: 'Mixed', color: '#7C8BF5' }, // violet-blue
				{ type: 'Rain', color: '#3B82F6' }, // blue
			],
		},
		{
			name: 'DS3: Dark Sky + green rain (unused)',
			colors: [
				{ type: 'Thunder', color: '#E23D68' }, // red-pink
				{ type: 'Snow', color: '#8c82ce' }, // purple
				{ type: 'Mixed', color: '#6B9B9B' }, // purple-green blend
				{ type: 'Rain', color: '#10B981' }, // emerald (unused color!)
			],
		},
		{
			name: 'DS4: Dark Sky + teal rain',
			colors: [
				{ type: 'Thunder', color: '#E23D68' }, // red-pink
				{ type: 'Snow', color: '#8c82ce' }, // purple
				{ type: 'Mixed', color: '#7B9BBB' }, // purple-teal blend
				{ type: 'Rain', color: '#14B8A6' }, // teal
			],
		},
		// Current for reference
		{
			name: 'Current WMO (for reference)',
			colors: [
				{ type: 'Thunder', color: '#F472B6' }, // pink
				{ type: 'Snow', color: '#E879F9' }, // fuchsia
				{ type: 'Mixed', color: '#6A7AB8' }, // periwinkle
				{ type: 'Rain', color: '#22D3EE' }, // cyan
			],
		},
	];
</script>

<div class="container">
	<h1>WMO Weather Code Color Options</h1>
	<p class="subtitle">Thunder → Snow → Mixed → Rain</p>

	<div class="section">
		<h2>Precip Bar Cap Color Options</h2>
		<p class="note">Current bar color: #78E8E8 (soft cyan). Cap should contrast/complement.</p>
		<div class="swatches wrap">
			{#each precipCapOptions as { name, color, usage } (name)}
				<div class="swatch-group">
					<div class="swatch" style="background: {color}"></div>
					<div class="label">{name}</div>
					<div class="hex">{color}</div>
					<div class="usage">{usage}</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="section">
		<h2>Precipitation Bar Color Options (greenish-blue)</h2>
		<p class="note">Need contrast with WMO rain blues (azure/blue family)</p>
		<div class="swatches wrap">
			{#each precipBarOptions as { name, color, usage } (name)}
				<div class="swatch-group">
					<div class="swatch" style="background: {color}"></div>
					<div class="label">{name}</div>
					<div class="hex">{color}</div>
					<div class="usage">{usage}</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="section">
		<h2>No-Precip Colors (Sky) - Fixed Reference</h2>
		<div class="swatches">
			{#each noPrecipColors as { name, color, usage } (name)}
				<div class="swatch-group">
					<div class="swatch" style="background: {color}"></div>
					<div class="label">{name}</div>
					<div class="hex">{color}</div>
					<div class="usage">{usage}</div>
				</div>
			{/each}
		</div>
	</div>

	<h2 class="proposals-header">Rain Color Options (to avoid overlap with sky)</h2>

	{#each rainOptions as option (option.name)}
		<div class="option">
			<h3>{option.name}</h3>
			<div class="comparison-row">
				<div class="sky-reference">
					{#each noPrecipColors as { color } (color)}
						<div class="mini-swatch" style="background: {color}"></div>
					{/each}
					<span class="ref-label">Sky →</span>
				</div>
				<div class="swatches compact">
					{#each option.colors as { name, color, usage } (name)}
						<div class="swatch-group">
							<div class="swatch" style="background: {color}"></div>
							<div class="label">{name}</div>
							<div class="hex">{usage}</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/each}

	<h2 class="proposals-header">Other Color References</h2>

	<div class="section">
		<h2>Colors Currently Used in Hourly Plot</h2>
		<div class="swatches">
			{#each usedColors as { name, color, usage } (name)}
				<div class="swatch-group">
					<div class="swatch" style="background: {color}"></div>
					<div class="label">{name}</div>
					<div class="hex">{color}</div>
					<div class="usage">{usage}</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="section">
		<h2>Current WMO Colors</h2>
		<div class="swatches">
			{#each currentWmo as { name, color, usage } (name)}
				<div class="swatch-group">
					<div class="swatch" style="background: {color}"></div>
					<div class="label">{name}</div>
					<div class="hex">{color}</div>
					<div class="usage">{usage}</div>
				</div>
			{/each}
		</div>
		<div
			class="gradient"
			style="background: linear-gradient(to right, {currentWmo.map((c) => c.color).join(', ')})"
		></div>
	</div>

	<h2 class="proposals-header">Snow & Mixed Color Options</h2>
	<p class="note">
		Rain colors are locked. Snow should be purple family, Mixed should blend rain+snow.
	</p>

	<div class="section">
		<h2>Locked Rain Colors (Reference)</h2>
		<div class="swatches wrap">
			{#each lockedRainColors as { name, color, pico } (name)}
				<div class="swatch-group">
					<div class="swatch" style="background: {color}"></div>
					<div class="label">{name}</div>
					<div class="hex">{color}</div>
					<div class="usage">{pico}</div>
				</div>
			{/each}
		</div>
	</div>

	<h3>Snow Color Options</h3>
	{#each snowOptions as option (option.name)}
		<div class="option">
			<h3>{option.name}</h3>
			<div class="swatches wrap">
				{#each option.colors as { name, color, pico } (name)}
					<div class="swatch-group">
						<div class="swatch" style="background: {color}"></div>
						<div class="label">{name}</div>
						<div class="hex">{color}</div>
						<div class="usage">{pico}</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}

	<h3>Mixed/Freezing Color Options</h3>
	{#each mixedOptions as option (option.name)}
		<div class="option">
			<h3>{option.name}</h3>
			<div class="swatches wrap">
				{#each option.colors as { name, color, pico } (name)}
					<div class="swatch-group">
						<div class="swatch" style="background: {color}"></div>
						<div class="label">{name}</div>
						<div class="hex">{color}</div>
						<div class="usage">{pico}</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}

	<h3>Combined Progressions (Thunder → Snow → Mixed → Rain)</h3>
	{#each combinedOptions as option (option.name)}
		<div class="option">
			<h3>{option.name}</h3>
			<div class="swatches">
				<div class="swatch-group">
					<div class="swatch" style="background: {option.thunder}"></div>
					<div class="label">Thunder</div>
					<div class="hex">{option.thunder}</div>
				</div>
				<div class="swatch-group">
					<div class="swatch" style="background: {option.snow}"></div>
					<div class="label">Snow</div>
					<div class="hex">{option.snow}</div>
				</div>
				<div class="swatch-group">
					<div class="swatch" style="background: {option.mixed}"></div>
					<div class="label">Mixed</div>
					<div class="hex">{option.mixed}</div>
				</div>
				<div class="swatch-group">
					<div class="swatch" style="background: {option.rain}"></div>
					<div class="label">Rain</div>
					<div class="hex">{option.rain}</div>
				</div>
			</div>
			<div
				class="gradient"
				style="background: linear-gradient(to right, {option.thunder}, {option.snow}, {option.mixed}, {option.rain})"
			></div>
		</div>
	{/each}

	<div class="section">
		<h2>Merry Timeline / Dark Sky Colors</h2>
		<div class="swatches wrap">
			{#each merryColors as { name, color, usage } (name)}
				<div class="swatch-group">
					<div class="swatch" style="background: {color}"></div>
					<div class="label">{name}</div>
					<div class="hex">{color}</div>
					<div class="usage">{usage}</div>
				</div>
			{/each}
		</div>
		<div
			class="gradient"
			style="background: linear-gradient(to right, #E23D68, #8c82ce, #9590d0, #5B8AC7)"
		></div>
		<p class="note">
			Progression: Red/Pink (thunder) → Purple (snow) → Blue (rain). Mixed would be purple-blue
			blend.
		</p>
	</div>

	<div class="section">
		<h2>Unused Color Families (Available)</h2>
		<div class="swatches wrap">
			{#each unusedColors as { name, color, usage } (name)}
				<div class="swatch-group">
					<div class="swatch" style="background: {color}"></div>
					<div class="label">{name}</div>
					<div class="hex">{color}</div>
					<div class="usage">{usage}</div>
				</div>
			{/each}
		</div>
	</div>

	<h2 class="proposals-header">Thunder/Snow/Mixed/Rain Progression Options</h2>

	{#each options as option (option.name)}
		<div class="option">
			<h2>{option.name}</h2>
			<div class="swatches">
				{#each option.colors as { type, color } (type)}
					<div class="swatch-group">
						<div class="swatch" style="background: {color}"></div>
						<div class="label">{type}</div>
						<div class="hex">{color}</div>
					</div>
				{/each}
			</div>
			<!-- Show as continuous gradient -->
			<div
				class="gradient"
				style="background: linear-gradient(to right, {option.colors
					.map((c) => c.color)
					.join(', ')})"
			></div>
		</div>
	{/each}
</div>

<style>
	.container {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}

	h1 {
		margin-bottom: 0.25rem;
	}

	.subtitle {
		color: #666;
		margin-bottom: 2rem;
	}

	.option {
		margin-bottom: 2.5rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid #e5e5e5;
	}

	h2 {
		font-size: 1.1rem;
		margin-bottom: 1rem;
		color: #333;
	}

	.swatches {
		display: flex;
		gap: 1.5rem;
	}

	.swatch-group {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.swatch {
		width: 80px;
		height: 60px;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.label {
		font-weight: 600;
		font-size: 0.9rem;
		margin-top: 0.5rem;
	}

	.hex {
		font-size: 0.75rem;
		color: #666;
		font-family: monospace;
	}

	.usage {
		font-size: 0.7rem;
		color: #888;
		text-align: center;
		max-width: 80px;
	}

	.section {
		margin-bottom: 2rem;
		padding: 1rem;
		background: #f9f9f9;
		border-radius: 8px;
	}

	.section h2 {
		margin-top: 0;
	}

	.swatches.wrap {
		flex-wrap: wrap;
	}

	.proposals-header {
		margin-top: 2rem;
		margin-bottom: 1rem;
		padding-top: 1rem;
		border-top: 2px solid #333;
	}

	.note {
		font-size: 0.85rem;
		color: #666;
		margin-top: 0.5rem;
		font-style: italic;
	}

	.comparison-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.sky-reference {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.mini-swatch {
		width: 30px;
		height: 20px;
		border-radius: 3px;
	}

	.ref-label {
		font-size: 0.7rem;
		color: #666;
		margin-top: 0.25rem;
	}

	.swatches.compact {
		gap: 0.5rem;
	}

	.swatches.compact .swatch {
		width: 50px;
		height: 40px;
	}

	.swatches.compact .label {
		font-size: 0.7rem;
	}

	.swatches.compact .hex {
		font-size: 0.65rem;
	}

	h3 {
		font-size: 1rem;
		margin-bottom: 0.5rem;
		color: #444;
	}

	.gradient {
		margin-top: 1rem;
		height: 24px;
		border-radius: 4px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}
</style>
