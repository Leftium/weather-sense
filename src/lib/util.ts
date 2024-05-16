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

function wmoInterpretation(color: string, description: string, icon?: string) {
	return {
		description,
		color,
		icon
	};
}

export const WMO_CODES: Record<number, any> = {
	0: wmoInterpretation('#eeeef5', 'Clear', 'airy/clear@4x.png'),

	1: wmoInterpretation('#d5dae2', 'Mainly Clear', 'airy/mostly-clear@4x.png'),
	2: wmoInterpretation('#b6bfcb', 'Partly Cloudy', 'airy/partly-cloudy@4x.png'),
	3: wmoInterpretation('#878f9a', 'Overcast', 'airy/overcast@4x.png'),

	45: wmoInterpretation('#878f9a', 'Fog', 'airy/fog@4x.png'),
	48: wmoInterpretation('#878f9a', 'Icy Fog', 'airy/rime-fog@4x.png'),

	51: wmoInterpretation('#80a5d6', 'Light Drizzle', 'airy/light-drizzle@4x.png'),
	53: wmoInterpretation('#80a5d6', 'Moderate Drizzle', 'airy/moderate-drizzle@4x.png'),
	55: wmoInterpretation('#80a5d6', 'Heavy Drizzle', 'airy/dense-drizzle@4x.png'),

	56: wmoInterpretation('#0F0', 'Light Freezing Drizzle', 'airy/light-freezing-drizzle@4x.png'),
	57: wmoInterpretation('#0F0', 'Heavy Freezing Drizzle', 'airy/dense-freezing-drizzle@4x.png'),

	61: wmoInterpretation('#4a80c7', 'Slight Rain', 'airy/light-rain@4x.png'),
	63: wmoInterpretation('#4a80c7', 'Moderate Rain', 'airy/moderate-rain@4x.png'),
	65: wmoInterpretation('#4a80c7', 'Heavy Rain', 'airy/heavy-rain@4x.png'),

	66: wmoInterpretation('#0F0', 'Light Freezing Rain', 'airy/light-freezing-rain@4x.png'),
	67: wmoInterpretation('#0F0', 'Heavy Freezing Rain', 'airy/heavy-freezing-rain@4x.png'),

	71: wmoInterpretation('#aba4db', 'Slight Snow', 'airy/slight-snowfall@4x.png'),
	73: wmoInterpretation('#8c82ce', 'Moderate Snow', 'airy/moderate-snowfall@4x.png'),
	75: wmoInterpretation('#8c82ce', 'Heavy Snow', 'airy/heavy-snowfall@4x.png'),

	77: wmoInterpretation('#0F0', 'Snow Grains', 'airy/snowflake@4x.png'),

	80: wmoInterpretation('#0F0', 'Slight Rain Showers', 'airy/light-rain@4x.png'),
	81: wmoInterpretation('#0F0', 'Moderate Rain Showers', 'airy/moderate-rain@4x.png'),
	82: wmoInterpretation('#0F0', 'Heavy Rain Showers', 'airy/heavy-rain@4x.png'),

	85: wmoInterpretation('#0F0', 'Slight Snow Showers', 'airy/slight-snowfall@4x.png'),
	86: wmoInterpretation('#0F0', 'Heavy Snow Showers', 'airy/heavy-snowfall@4x.png'),

	95: wmoInterpretation('#0F0', 'Thunderstorm', 'airy/thunderstorm@4x.png'),

	96: wmoInterpretation(
		'#0F0',
		'Thunderstorm with Light Hail',
		'airy/thunderstorm-with-hail@4x.png'
	),
	99: wmoInterpretation(
		'#0F0',
		'Thunderstorm with Heavy Hail',
		'airy/thunderstorm-with-hail@4x.png'
	)
};

export function wmoCode(code: number | undefined) {
	if (code !== undefined) {
		return WMO_CODES[code];
	}
	return {
		description: '...',
		icon: ''
	};
}

export function celcius(f: number | undefined) {
	if (typeof f !== 'number') {
		return undefined;
	}
	return (f - 32) * (5 / 9);
}

export function compactDate(time?: number) {
	const ms = time ? time * 1000 : +new Date();
	return dateFormat(ms, 'ddd-dd').replace(/^(..)./, '$1');
}
