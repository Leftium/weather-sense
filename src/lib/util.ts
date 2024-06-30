import JSON5 from 'json5';
import Color from 'colorjs.io';

import { gg } from './gg';

export const SOLARIZED_RED = '#dc322f';
export const SOLARIZED_BLUE = '#268bd2';
export const SOLARIZED_CYAN = '#2aa198';
export const SOLARIZED_GREEN = '#859900';

export const MS_IN_SECOND = 1000;
export const MS_IN_MINUTE = 60 * MS_IN_SECOND;
export const MS_IN_HOUR = 60 * MS_IN_MINUTE;
export const MS_IN_DAY = 24 * MS_IN_HOUR;

export const colors = {
	humidity: SOLARIZED_GREEN,
	precipitationProbability: 'aqua',
	precipitation: SOLARIZED_BLUE,
	dewPoint: SOLARIZED_CYAN,
	temperature: 'black',
};

export function jsonPretty(json: any) {
	return JSON5.stringify(json, { space: 4, quote: '', replacer });
}

export function objectFromMap(value: any) {
	if (value instanceof Map) {
		return Array.from(value).reduce(
			(obj, [key, value]) => {
				// Prepend '_' to make numeric key valid unquoted object key:
				key = isNaN(Number(key)) ? '' : '_' + key;
				obj[key] = value;
				return obj;
			},
			{} as Record<any, any>,
		);
	} else {
		return value;
	}
}

// Based on: https://stackoverflow.com/questions/29085197/how-do-you-json-stringify-an-es6-map
export function replacer(_key: any, value: any) {
	if (value instanceof Map) {
		return objectFromMap(value);
	} else {
		return value;
	}
}

export function humanDistance(n: number | undefined) {
	if (!n) {
		return null;
	}
	let units = 'm';

	if (n >= 1000) {
		n = n / 1000;
		units = 'km';
	}
	return `${Math.floor(n)}${units}`;
}

export function lerp(v0: number, v1: number, t: number) {
	return (1 - t) * v0 + t * v1;
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
		width: 99,
		icon,
	};
}

export const WMO_CODES: Record<number, any> = {
	0: wmoInterpretation('#F1F1F1', 'Clear', 'clear'),

	1: wmoInterpretation('#E2E2E2', 'Mostly Clear', 'mostly-clear'),
	2: wmoInterpretation('#C6C6C6', 'Partly Cloudy', 'partly-cloudy'),
	3: wmoInterpretation('#ABABAB', 'Overcast', 'overcast'),

	45: wmoInterpretation('#A4ACBA', 'Fog', 'fog'),
	48: wmoInterpretation('#8891A4', 'Icy Fog', 'rime-fog'),

	51: wmoInterpretation('#3DECEB', 'L.Drizzle', 'light-drizzle'),
	53: wmoInterpretation('#0CCECE', 'Drizzle', 'moderate-drizzle'),
	55: wmoInterpretation('#0AB1B1', 'H.Drizzle', 'dense-drizzle'),

	80: wmoInterpretation('#9BCCFD', 'L.Showers', 'light-rain'),
	81: wmoInterpretation('#51B4FF', 'Showers', 'moderate-rain'),
	82: wmoInterpretation('#029AE8', 'H.Showers', 'heavy-rain'),

	61: wmoInterpretation('#BFC3FA', 'L.Rain', 'light-rain'),
	63: wmoInterpretation('#9CA7FA', 'Rain', 'moderate-rain'),
	65: wmoInterpretation('#748BF8', 'H.Rain', 'heavy-rain'),

	56: wmoInterpretation('#CAC1EE', 'L.Icy Drizzle', 'light-freezing-drizzle'),
	57: wmoInterpretation('#9486E1', 'Icy Drizzle', 'dense-freezing-drizzle'),

	66: wmoInterpretation('#D3BFE8', 'L.Icy Rain', 'light-freezing-rain'),
	67: wmoInterpretation('#A780D4', 'Icy Rain', 'heavy-freezing-rain'),

	71: wmoInterpretation('#F9B1D8', 'L.Snow', 'slight-snowfall'),
	73: wmoInterpretation('#F983C7', 'Snow', 'moderate-snowfall'),
	75: wmoInterpretation('#F748B7', 'H.Snow', 'heavy-snowfall'),

	77: wmoInterpretation('#E7B6EE', 'Snow Grains', 'snowflake'),

	85: wmoInterpretation('#E7B6EE', 'L.Snow Showers', 'slight-snowfall'),
	86: wmoInterpretation('#CD68E0', 'Snow Showers', 'heavy-snowfall'),

	95: wmoInterpretation('#B21E4F', 'Thunderstorm', 'thunderstorm'),

	96: wmoInterpretation('#88143B', 'T-storm + L.Hail', 'thunderstorm-with-hail'),
	99: wmoInterpretation('#5F0E28', 'T-storm + Hail', 'thunderstorm-with-hail'),
};

export function wmoCode(code: number | undefined) {
	if (code !== undefined) {
		return WMO_CODES[code];
	}
	return {
		description: '...',
		width: 99,
		icon: '',
	};
}

export function celcius(f: number | undefined) {
	if (typeof f !== 'number') {
		return undefined;
	}
	return (f - 32) * (5 / 9);
}

export function summarize(arrayOrObject: unknown[] | undefined | null) {
	if (arrayOrObject) {
		if (Array.isArray(arrayOrObject)) {
			const array = arrayOrObject;
			const length = arrayOrObject.length;

			const summary = [`length: ${length}`] as any[];
			if (length > 0) {
				summary.push(array[0]);
			}
			if (length > 1) {
				summary.push(array[1]);
			}
			if (length > 2) {
				summary.push('... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ...');
				summary.push(array[length - 1]);
			}
			if (length > 3) {
				summary.push(array[length - 2]);
			}

			return summary;
		} else if (typeof arrayOrObject === 'object' && arrayOrObject !== null) {
			const object = arrayOrObject;
			const keys = Object.keys(object);
			const numKeys = keys.length;
			const summary = {} as Record<any, any>;

			summary.numKeys = numKeys;

			if (numKeys > 1) {
				const key = keys[0];
				summary[key] = object[key];
			}
			if (numKeys > 1) {
				const key = keys[1];
				summary[key] = object[key];
			}
			if (numKeys > 2) {
				summary._ = '... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ... ...';
				const key = keys[numKeys - 1];
				summary[key] = object[key];
			}
			if (numKeys > 3) {
				const key = keys[numKeys - 2];
				summary[key] = object[key];
			}

			return summary;
		}
	}

	return arrayOrObject;
}
