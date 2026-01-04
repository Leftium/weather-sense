#!/usr/bin/env node

/**
 * Analyze precipitation rates by weather type using Open-Meteo Historical API
 *
 * Fetches 1 year of hourly data for Vancouver and compares precipitation amounts
 * across different weather codes (rain, snow, drizzle, etc.)
 */

const LOCATIONS = {
	vancouver: { lat: 49.2827, lon: -123.1207, name: 'Vancouver, BC' },
	minneapolis: { lat: 44.9778, lon: -93.265, name: 'Minneapolis, MN' },
};

// Default location, can be overridden via command line: node analyze-precip.js minneapolis
const locationKey = process.argv[2] || 'vancouver';
const LOCATION = LOCATIONS[locationKey] || LOCATIONS.vancouver;
const LOCATION_NAME = LOCATION.name;

// WMO weather codes grouped by precipitation type
const WMO_GROUPS = {
	'Clear/Cloudy': [0, 1, 2, 3],
	Fog: [45, 48],
	Drizzle: [51, 53, 55],
	Rain: [61, 63, 65],
	Showers: [80, 81, 82],
	'Freezing Drizzle': [56, 57],
	'Freezing Rain': [66, 67],
	'Snow Grains': [77],
	'Snow Showers': [85, 86],
	Snow: [71, 73, 75],
	Thunderstorm: [95, 96, 99],
};

// Reverse lookup: code -> group name
const CODE_TO_GROUP = {};
for (const [group, codes] of Object.entries(WMO_GROUPS)) {
	for (const code of codes) {
		CODE_TO_GROUP[code] = group;
	}
}

// WMO code descriptions
const WMO_DESCRIPTIONS = {
	0: 'Clear',
	1: 'Mostly Clear',
	2: 'Partly Cloudy',
	3: 'Overcast',
	45: 'Fog',
	48: 'Icy Fog',
	51: 'Light Drizzle',
	53: 'Drizzle',
	55: 'Heavy Drizzle',
	56: 'Light Freezing Drizzle',
	57: 'Freezing Drizzle',
	61: 'Light Rain',
	63: 'Rain',
	65: 'Heavy Rain',
	66: 'Light Freezing Rain',
	67: 'Freezing Rain',
	71: 'Light Snow',
	73: 'Snow',
	75: 'Heavy Snow',
	77: 'Snow Grains',
	80: 'Light Showers',
	81: 'Showers',
	82: 'Heavy Showers',
	85: 'Light Snow Showers',
	86: 'Snow Showers',
	95: 'Thunderstorm',
	96: 'Thunderstorm + Light Hail',
	99: 'Thunderstorm + Hail',
};

async function fetchHistoricalData(startDate, endDate) {
	const url = new URL('https://archive-api.open-meteo.com/v1/archive');
	url.searchParams.set('latitude', LOCATION.lat);
	url.searchParams.set('longitude', LOCATION.lon);
	url.searchParams.set('start_date', startDate);
	url.searchParams.set('end_date', endDate);
	url.searchParams.set('hourly', 'precipitation,rain,snowfall,weather_code');
	url.searchParams.set('daily', 'precipitation_sum,rain_sum,snowfall_sum,weather_code');
	url.searchParams.set('timezone', 'America/Vancouver');

	console.log(`Fetching: ${url}`);
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`API error: ${response.status} ${response.statusText}`);
	}

	return response.json();
}

function analyzeData(data) {
	const { hourly } = data;
	const { time, precipitation, rain, snowfall, weather_code } = hourly;

	// Stats per weather code
	const codeStats = {};
	// Stats per group
	const groupStats = {};

	for (let i = 0; i < time.length; i++) {
		const code = weather_code[i];
		const precip = precipitation[i] || 0;
		const rainAmount = rain[i] || 0;
		const snowAmount = snowfall[i] || 0; // in cm, convert to mm water equivalent
		const snowWaterEquiv = snowAmount / 0.7; // ~7cm snow = 10mm water

		const group = CODE_TO_GROUP[code] || 'Unknown';

		// Initialize code stats
		if (!codeStats[code]) {
			codeStats[code] = {
				code,
				description: WMO_DESCRIPTIONS[code] || `Code ${code}`,
				group,
				count: 0,
				precipSum: 0,
				precipValues: [],
				rainSum: 0,
				snowSum: 0,
			};
		}

		// Initialize group stats
		if (!groupStats[group]) {
			groupStats[group] = {
				group,
				count: 0,
				precipSum: 0,
				precipValues: [],
				precipNonZeroValues: [],
			};
		}

		// Accumulate
		codeStats[code].count++;
		codeStats[code].precipSum += precip;
		codeStats[code].precipValues.push(precip);
		codeStats[code].rainSum += rainAmount;
		codeStats[code].snowSum += snowAmount;

		groupStats[group].count++;
		groupStats[group].precipSum += precip;
		groupStats[group].precipValues.push(precip);
		if (precip > 0) {
			groupStats[group].precipNonZeroValues.push(precip);
		}
	}

	return { codeStats, groupStats, totalHours: time.length };
}

function percentile(arr, p) {
	if (arr.length === 0) return 0;
	const sorted = [...arr].sort((a, b) => a - b);
	const index = (p / 100) * (sorted.length - 1);
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	if (lower === upper) return sorted[lower];
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function analyzeDailyData(data) {
	const { daily } = data;
	const { time, precipitation_sum, rain_sum, snowfall_sum, weather_code } = daily;

	const dailyStats = {
		all: [],
		rain: [], // Days with rain but no snow
		snow: [], // Days with snow
		mixed: [], // Days with both
	};

	for (let i = 0; i < time.length; i++) {
		const precip = precipitation_sum[i] || 0;
		const rain = rain_sum[i] || 0;
		const snow = snowfall_sum[i] || 0; // in cm

		if (precip > 0) {
			dailyStats.all.push(precip);

			if (snow > 0 && rain > 0) {
				dailyStats.mixed.push(precip);
			} else if (snow > 0) {
				dailyStats.snow.push(precip);
			} else {
				dailyStats.rain.push(precip);
			}
		}
	}

	return { dailyStats, totalDays: time.length };
}

function printReport(analysis, dailyAnalysis) {
	const { codeStats, groupStats, totalHours } = analysis;

	console.log('\n' + '='.repeat(80));
	console.log(`PRECIPITATION ANALYSIS BY WEATHER TYPE - ${LOCATION_NAME}, 1 Year`);
	console.log('='.repeat(80));
	console.log(`Total hours analyzed: ${totalHours.toLocaleString()}`);

	// Group summary
	console.log('\n' + '-'.repeat(80));
	console.log('SUMMARY BY WEATHER GROUP');
	console.log('-'.repeat(80));
	console.log('Group                  | Hours | % Time | Avg mm/hr | P50   | P80   | P95   | Max');
	console.log('-'.repeat(80));

	const groupOrder = [
		'Drizzle',
		'Showers',
		'Rain',
		'Freezing Drizzle',
		'Freezing Rain',
		'Snow Grains',
		'Snow Showers',
		'Snow',
		'Thunderstorm',
		'Fog',
		'Clear/Cloudy',
	];

	for (const groupName of groupOrder) {
		const stats = groupStats[groupName];
		if (!stats || stats.count === 0) continue;

		const pctTime = ((stats.count / totalHours) * 100).toFixed(1);
		const avgPrecip = (stats.precipSum / stats.count).toFixed(2);
		const nonZero = stats.precipNonZeroValues;
		const p50 = percentile(nonZero, 50).toFixed(2);
		const p80 = percentile(nonZero, 80).toFixed(2);
		const p95 = percentile(nonZero, 95).toFixed(2);
		const max = nonZero.length > 0 ? Math.max(...nonZero).toFixed(2) : '0.00';

		console.log(
			`${groupName.padEnd(22)} | ${String(stats.count).padStart(5)} | ${pctTime.padStart(5)}% | ${avgPrecip.padStart(9)} | ${p50.padStart(5)} | ${p80.padStart(5)} | ${p95.padStart(5)} | ${max.padStart(5)}`,
		);
	}

	// Detailed by code
	console.log('\n' + '-'.repeat(80));
	console.log('DETAILED BY WEATHER CODE (precipitation hours only)');
	console.log('-'.repeat(80));
	console.log('Code | Description          | Group          | Hours | Avg mm/hr | P80   | Max');
	console.log('-'.repeat(80));

	const precipCodes = Object.values(codeStats)
		.filter((s) => s.precipSum > 0)
		.sort((a, b) => b.precipSum - a.precipSum);

	for (const stats of precipCodes) {
		const nonZero = stats.precipValues.filter((v) => v > 0);
		if (nonZero.length === 0) continue;

		const avgPrecip = (stats.precipSum / nonZero.length).toFixed(2);
		const p80 = percentile(nonZero, 80).toFixed(2);
		const max = Math.max(...nonZero).toFixed(2);

		console.log(
			`${String(stats.code).padStart(4)} | ${stats.description.padEnd(20)} | ${stats.group.padEnd(14)} | ${String(nonZero.length).padStart(5)} | ${avgPrecip.padStart(9)} | ${p80.padStart(5)} | ${max.padStart(5)}`,
		);
	}

	// Key insight: compare rain vs snow scales
	console.log('\n' + '-'.repeat(80));
	console.log('KEY COMPARISON: Rain vs Snow Precipitation Rates');
	console.log('-'.repeat(80));

	const rainGroups = ['Drizzle', 'Showers', 'Rain'];
	const snowGroups = ['Snow', 'Snow Showers', 'Snow Grains'];

	let rainValues = [];
	let snowValues = [];

	for (const g of rainGroups) {
		if (groupStats[g]) rainValues.push(...groupStats[g].precipNonZeroValues);
	}
	for (const g of snowGroups) {
		if (groupStats[g]) snowValues.push(...groupStats[g].precipNonZeroValues);
	}

	if (rainValues.length > 0 && snowValues.length > 0) {
		console.log(`\nRain-type precipitation (${rainValues.length} hours with precip):`);
		console.log(`  P50: ${percentile(rainValues, 50).toFixed(2)} mm/hr`);
		console.log(`  P80: ${percentile(rainValues, 80).toFixed(2)} mm/hr`);
		console.log(`  P95: ${percentile(rainValues, 95).toFixed(2)} mm/hr`);
		console.log(`  Max: ${Math.max(...rainValues).toFixed(2)} mm/hr`);

		console.log(`\nSnow-type precipitation (${snowValues.length} hours with precip):`);
		console.log(`  P50: ${percentile(snowValues, 50).toFixed(2)} mm/hr`);
		console.log(`  P80: ${percentile(snowValues, 80).toFixed(2)} mm/hr`);
		console.log(`  P95: ${percentile(snowValues, 95).toFixed(2)} mm/hr`);
		console.log(`  Max: ${Math.max(...snowValues).toFixed(2)} mm/hr`);

		const rainP80 = percentile(rainValues, 80);
		const snowP80 = percentile(snowValues, 80);
		console.log(`\nRatio (snow P80 / rain P80): ${(snowP80 / rainP80).toFixed(2)}x`);
	}

	// Daily analysis
	if (dailyAnalysis) {
		const { dailyStats, totalDays } = dailyAnalysis;

		console.log('\n' + '='.repeat(80));
		console.log('DAILY PRECIPITATION TOTALS (mm/day)');
		console.log('='.repeat(80));
		console.log(`Total days: ${totalDays}, Days with precip: ${dailyStats.all.length}`);

		console.log('\n' + '-'.repeat(80));
		console.log('Type            | Days  | P50     | P80     | P95     | Max');
		console.log('-'.repeat(80));

		for (const [type, values] of Object.entries(dailyStats)) {
			if (values.length === 0) continue;
			const p50 = percentile(values, 50).toFixed(1);
			const p80 = percentile(values, 80).toFixed(1);
			const p95 = percentile(values, 95).toFixed(1);
			const max = Math.max(...values).toFixed(1);
			console.log(
				`${type.padEnd(15)} | ${String(values.length).padStart(5)} | ${p50.padStart(7)} | ${p80.padStart(7)} | ${p95.padStart(7)} | ${max.padStart(7)}`,
			);
		}

		console.log('\n' + '-'.repeat(80));
		console.log('Current LINEAR_MAX = 16 mm/day');
		if (dailyStats.all.length > 0) {
			const p80 = percentile(dailyStats.all, 80);
			console.log(`All precip P80 = ${p80.toFixed(1)} mm/day`);
		}
		if (dailyStats.snow.length > 0) {
			const snowP80 = percentile(dailyStats.snow, 80);
			console.log(`Snow-only P80 = ${snowP80.toFixed(1)} mm/day`);
		}
	}
}

async function main() {
	// Fetch last full year of data
	const endDate = new Date();
	endDate.setDate(endDate.getDate() - 6); // 5 day delay in historical data
	const startDate = new Date(endDate);
	startDate.setFullYear(startDate.getFullYear() - 1);

	const startStr = startDate.toISOString().split('T')[0];
	const endStr = endDate.toISOString().split('T')[0];

	console.log(`Analyzing precipitation data from ${startStr} to ${endStr}`);
	console.log(`Location: ${LOCATION_NAME} (${LOCATION.lat}, ${LOCATION.lon})\n`);

	try {
		const data = await fetchHistoricalData(startStr, endStr);
		const analysis = analyzeData(data);
		const dailyAnalysis = analyzeDailyData(data);
		printReport(analysis, dailyAnalysis);
	} catch (error) {
		console.error('Error:', error.message);
		process.exit(1);
	}
}

main();
