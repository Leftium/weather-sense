import _ from 'lodash-es';
import JSON5 from 'json5';
import Color from 'colorjs.io';

import { gg } from './gg';

import picoColors from '$lib/pico-color-palette.json';

export const SOLARIZED_RED = '#dc322f';
export const SOLARIZED_BLUE = '#268bd2';
export const SOLARIZED_CYAN = '#2aa198';
export const SOLARIZED_GREEN = '#859900';

export const MS_IN_SECOND = 1000;
export const MS_IN_MINUTE = 60 * MS_IN_SECOND;
export const MS_IN_HOUR = 60 * MS_IN_MINUTE;
export const MS_IN_DAY = 24 * MS_IN_HOUR;

export const colors = {
	humidity: '#9062CA',
	precipitationProbability: '#58FAF9',
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

const colorWhite = new Color('#fff');
const colorBlack = new Color('#000');

function makeWmo(
	picoColor: string,
	group: string,
	level: number,
	description: string,
	iconName: string,
) {
	const color = _.get(picoColors, picoColor) || _.get(picoColors, 'yellow.400');

	const icon = `/icons/airy/${iconName}@4x.png`;

	const colorBackground = new Color(color);

	const isDarkText =
		Math.abs(colorBackground.contrastAPCA(colorBlack)) >
		Math.abs(colorBackground.contrastAPCA(colorWhite));

	return {
		description,
		group,
		level,
		picoColor,
		color,
		isDarkText,
		width: 99, // Will be replaced with actual width of text in pixels.
		icon,
	};
}

export const WMO_CODES: Record<number, any> = {
	0: makeWmo('grey.50', 'clear', 1, 'Clear', 'clear'),

	1: makeWmo('grey.100', 'cloudy', 1, 'Mostly Clear', 'mostly-clear'),
	2: makeWmo('grey.200', 'cloudy', 2, 'Partly Cloudy', 'partly-cloudy'),
	3: makeWmo('grey.300', 'cloudy', 3, 'Overcast', 'overcast'),

	45: makeWmo('zinc.300', 'fog', 1, 'Fog', 'fog'),
	48: makeWmo('zinc.400', 'fog', 3, 'Icy Fog', 'rime-fog'),

	51: makeWmo('azure.150', 'drizzle', 1, 'L.Drizzle', 'light-drizzle'),
	53: makeWmo('azure.200', 'drizzle', 2, 'Drizzle', 'moderate-drizzle'),
	55: makeWmo('azure.250', 'drizzle', 3, 'H.Drizzle', 'dense-drizzle'),

	80: makeWmo('azure.300', 'showers', 1, 'L.Showers', 'light-rain'),
	81: makeWmo('azure.350', 'showers', 2, 'Showers', 'moderate-rain'),
	82: makeWmo('azure.450', 'showers', 3, 'H.Showers', 'heavy-rain'),

	61: makeWmo('azure.200', 'rain', 1, 'L.Rain', 'light-rain'),
	63: makeWmo('azure.300', 'rain', 2, 'Rain', 'moderate-rain'),
	65: makeWmo('azure.400', 'rain', 3, 'H.Rain', 'heavy-rain'),

	56: makeWmo('indigo.200', 'icy-drizzle', 1, 'L.Icy Drizzle', 'light-freezing-drizzle'),
	57: makeWmo('indigo.400', 'icy-drizzle', 3, 'Icy Drizzle', 'dense-freezing-drizzle'),

	66: makeWmo('violet.200', 'icy-rain', 1, 'L.Icy Rain', 'light-freezing-rain'),
	67: makeWmo('violet.400', 'icy-rain', 3, 'Icy Rain', 'heavy-freezing-rain'),

	71: makeWmo('fuchsia.200', 'snow', 1, 'L.Snow', 'slight-snowfall'),
	73: makeWmo('fuchsia.300', 'snow', 2, 'Snow', 'moderate-snowfall'),
	75: makeWmo('fuchsia.400', 'snow', 3, 'H.Snow', 'heavy-snowfall'),

	77: makeWmo('purple.200', 'snow-grains', 1, 'Snow Grains', 'snowflake'),

	85: makeWmo('purple.200', 'show-showers', 1, 'L.Snow Showers', 'slight-snowfall'),
	86: makeWmo('purple.400', 'show-showers', 3, 'Snow Showers', 'heavy-snowfall'),

	95: makeWmo('pink.600', 'thunderstorm', 1, 'Thunderstorm', 'thunderstorm'),

	96: makeWmo('pink.700', 'thunderstorm', 2, 'T-storm + L.Hail', 'thunderstorm-with-hail'),
	99: makeWmo('pink.800', 'thunderstorm', 3, 'T-storm + Hail', 'thunderstorm-with-hail'),
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
