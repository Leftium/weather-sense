import dateFormat from 'dateformat';

export function tsToTime(ts: number, format = 'h:MMt') {
	const date = new Date(ts * 1000);
	return dateFormat(date, format);
}

export function humanDistance(n: number | undefined) {
	if (!n) {
		return '??m';
	}
	let units = 'm';

	if (n >= 1000) {
		n = n / 1000;
		units = 'km';
	}
	return `${Math.floor(n)}${units}`;
}

function wmoInterpretation(description: string, icon?: string) {
	return {
		description,
		icon
	};
}

export const WMO_CODES: Record<number, any> = {
	0: wmoInterpretation('Clear', 'airy/clear@4x.png'),

	1: wmoInterpretation('Mainly Clear', 'airy/mostly-clear@4x.png'),
	2: wmoInterpretation('Partly Cloudy', 'airy/partly-cloudy@4x.png'),
	3: wmoInterpretation('Overcast', 'airy/overcast@4x.png'),

	45: wmoInterpretation('Fog', 'airy/fog@4x.png'),
	48: wmoInterpretation('Icy Fog', 'airy/rime-fog@4x.png'),

	51: wmoInterpretation('Light Drizzle', 'airy/light-drizzle@4x.png'),
	53: wmoInterpretation('Moderate Drizzle', 'airy/moderate-drizzle@4x.png'),
	55: wmoInterpretation('Heavy Drizzle', 'airy/dense-drizzle@4x.png'),

	56: wmoInterpretation('Light Freezing Drizzle', 'airy/light-freezing-drizzle@4x.png'),
	57: wmoInterpretation('Heavy Freezing Drizzle', 'airy/dense-freezing-drizzle@4x.png'),

	61: wmoInterpretation('Slight Rain', 'airy/light-rain@4x.png'),
	63: wmoInterpretation('Moderate Rain', 'airy/moderate-rain@4x.png'),
	65: wmoInterpretation('Heavy Rain', 'airy/heavy-rain@4x.png'),

	66: wmoInterpretation('Light Freezing Rain', 'airy/light-freezing-rain@4x.png'),
	67: wmoInterpretation('Heavy Freezing Rain', 'airy/heavy-freezing-rain@4x.png'),

	71: wmoInterpretation('Slight Snow', 'airy/slight-snowfall@4x.png'),
	73: wmoInterpretation('Moderate Snow', 'airy/moderate-snowfall@4x.png'),
	75: wmoInterpretation('Heavy Snow', 'airy/heavy-snowfall@4x.png'),

	77: wmoInterpretation('Snow Grains', 'airy/snowflake@4x.png'),

	80: wmoInterpretation('Slight Rain Showers', 'airy/light-rain@4x.png'),
	81: wmoInterpretation('Moderate Rain Showers', 'airy/moderate-rain@4x.png'),
	82: wmoInterpretation('Heavy Rain Showers', 'airy/heavy-rain@4x.png'),

	85: wmoInterpretation('Slight Snow Showers', 'airy/slight-snowfall@4x.png'),
	86: wmoInterpretation('Heavy Snow Showers', 'airy/heavy-snowfall@4x.png'),

	95: wmoInterpretation('Thunderstorm', 'airy/thunderstorm@4x.png'),

	96: wmoInterpretation('Thunderstorm with Light Hail', 'airy/thunderstorm-with-hail@4x.png'),
	99: wmoInterpretation('Thunderstorm with Heavy Hail', 'airy/thunderstorm-with-hail@4x.png')
};

export function wmoCode(code: number | undefined) {
	if (code) {
		return WMO_CODES[code];
	}
	return {
		description: '...',
		icon: ''
	};
}
