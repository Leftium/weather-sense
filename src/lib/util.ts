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

function wmoInterpretation(color: string, description: string, icon: string) {
	icon = `/icons/airy/${icon}@4x.png`;
	return {
		description,
		color,
		icon
	};
}

export const WMO_CODES: Record<number, any> = {
	0: wmoInterpretation('#eeeef5', 'Clear', 'clear'),

	1: wmoInterpretation('#d5dae2', 'Mainly Clear', 'mostly-clear'),
	2: wmoInterpretation('#b6bfcb', 'Partly Cloudy', 'partly-cloudy'),
	3: wmoInterpretation('#878f9a', 'Overcast', 'overcast'),

	45: wmoInterpretation('#878f9a', 'Fog', 'fog'),
	48: wmoInterpretation('#878f9a', 'Icy Fog', 'rime-fog'),

	51: wmoInterpretation('#80a5d6', 'Light Drizzle', 'light-drizzle'),
	53: wmoInterpretation('#80a5d6', 'Moderate Drizzle', 'moderate-drizzle'),
	55: wmoInterpretation('#80a5d6', 'Heavy Drizzle', 'dense-drizzle'),

	56: wmoInterpretation('#0F0', 'Light Freezing Drizzle', 'light-freezing-drizzle'),
	57: wmoInterpretation('#0F0', 'Heavy Freezing Drizzle', 'dense-freezing-drizzle'),

	61: wmoInterpretation('#4a80c7', 'Slight Rain', 'light-rain'),
	63: wmoInterpretation('#4a80c7', 'Moderate Rain', 'moderate-rain'),
	65: wmoInterpretation('#4a80c7', 'Heavy Rain', 'heavy-rain'),

	66: wmoInterpretation('#0F0', 'Light Freezing Rain', 'light-freezing-rain'),
	67: wmoInterpretation('#0F0', 'Heavy Freezing Rain', 'heavy-freezing-rain'),

	71: wmoInterpretation('#aba4db', 'Slight Snow', 'slight-snowfall'),
	73: wmoInterpretation('#8c82ce', 'Moderate Snow', 'moderate-snowfall'),
	75: wmoInterpretation('#8c82ce', 'Heavy Snow', 'heavy-snowfall'),

	77: wmoInterpretation('#0F0', 'Snow Grains', 'snowflake'),

	80: wmoInterpretation('#0F0', 'Slight Rain Showers', 'light-rain'),
	81: wmoInterpretation('#0F0', 'Moderate Rain Showers', 'moderate-rain'),
	82: wmoInterpretation('#0F0', 'Heavy Rain Showers', 'heavy-rain'),

	85: wmoInterpretation('#0F0', 'Slight Snow Showers', 'slight-snowfall'),
	86: wmoInterpretation('#0F0', 'Heavy Snow Showers', 'heavy-snowfall'),

	95: wmoInterpretation('#0F0', 'Thunderstorm', 'thunderstorm'),

	96: wmoInterpretation('#0F0', 'Thunderstorm with Light Hail', 'thunderstorm-with-hail'),
	99: wmoInterpretation('#0F0', 'Thunderstorm with Heavy Hail', 'thunderstorm-with-hail')
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
