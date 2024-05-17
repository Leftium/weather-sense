import dateFormat from 'dateformat';

import Color from 'colorjs.io';

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

const colorWhite = new Color('#fff');
const colorBlack = new Color('#000');

function wmoInterpretation(color: string, description: string, icon: string) {
	color = color || '#9E9200';
	icon = `/icons/airy/${icon}@4x.png`;

	const colorBackground = new Color(color);

	const isDarkText =
		Math.abs(colorBackground.contrastAPCA(colorBlack)) >
		Math.abs(colorBackground.contrastAPCA(colorWhite));

	return {
		description,
		color,
		isDarkText,
		icon
	};
}

export const WMO_CODES: Record<number, any> = {
	0: wmoInterpretation('#F1F1F1', 'Clear', 'clear'),

	1: wmoInterpretation('#E2E2E2', 'Mostly Clear', 'mostly-clear'),
	2: wmoInterpretation('#C6C6C6', 'Partly Cloudy', 'partly-cloudy'),
	3: wmoInterpretation('#ABABAB', 'Overcast', 'overcast'),

	45: wmoInterpretation('#A4ACBA', 'Fog', 'fog'),
	48: wmoInterpretation('#8891A4', 'Icy Fog', 'rime-fog'),

	51: wmoInterpretation('#3DECEB', 'Lt Drizzle', 'light-drizzle'),
	53: wmoInterpretation('#0CCECE', 'Drizzle', 'moderate-drizzle'),
	55: wmoInterpretation('#0AB1B1', 'Hv Drizzle', 'dense-drizzle'),

	80: wmoInterpretation('#9BCCFD', 'Lt Showers', 'light-rain'),
	81: wmoInterpretation('#51B4FF', 'Showers', 'moderate-rain'),
	82: wmoInterpretation('#029AE8', 'Hv Showers', 'heavy-rain'),

	61: wmoInterpretation('#BFC3FA', 'Lt Rain', 'light-rain'),
	63: wmoInterpretation('#9CA7FA', 'Rain', 'moderate-rain'),
	65: wmoInterpretation('#748BF8', 'Hv Rain', 'heavy-rain'),

	56: wmoInterpretation('#CAC1EE', 'Lt Icy Drizzle', 'light-freezing-drizzle'),
	57: wmoInterpretation('#9486E1', 'Icy Drizzle', 'dense-freezing-drizzle'),

	66: wmoInterpretation('#D3BFE8', 'Lt Icy Rain', 'light-freezing-rain'),
	67: wmoInterpretation('#A780D4', 'Icy Rain', 'heavy-freezing-rain'),

	71: wmoInterpretation('#F9B1D8', 'Lt Snow', 'slight-snowfall'),
	73: wmoInterpretation('#F983C7', 'Snow', 'moderate-snowfall'),
	75: wmoInterpretation('#F748B7', 'Hv Snow', 'heavy-snowfall'),

	77: wmoInterpretation('#E7B6EE', 'Snow Grains', 'snowflake'),

	85: wmoInterpretation('#E7B6EE', 'Lt Snow Showers', 'slight-snowfall'),
	86: wmoInterpretation('#CD68E0', 'Snow Showers', 'heavy-snowfall'),

	95: wmoInterpretation('#B21E4F', 'Thunderstorm', 'thunderstorm'),

	96: wmoInterpretation('#88143B', 'T-storm w/ Lt Hail', 'thunderstorm-with-hail'),
	99: wmoInterpretation('#5F0E28', 'T-storm w/ Hail', 'thunderstorm-with-hail')
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
