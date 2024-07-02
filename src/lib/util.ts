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

function wmoInterpretation(picoColor: string, description: string, iconName: string) {
	const color = _.get(picoColors, picoColor) || _.get(picoColors, 'yellow.400');

	const icon = `/icons/airy/${iconName}@4x.png`;

	const colorBackground = new Color(color);

	const isDarkText =
		Math.abs(colorBackground.contrastAPCA(colorBlack)) >
		Math.abs(colorBackground.contrastAPCA(colorWhite));

	return {
		description,
		picoColor,
		color,
		isDarkText,
		width: 99, // Will be replaced with actual width of text in pixels.
		icon,
	};
}

export const WMO_CODES: Record<number, any> = {
	0: wmoInterpretation('grey.50', 'Clear', 'clear'),

	1: wmoInterpretation('grey.100', 'Mostly Clear', 'mostly-clear'),
	2: wmoInterpretation('grey.200', 'Partly Cloudy', 'partly-cloudy'),
	3: wmoInterpretation('grey.300', 'Overcast', 'overcast'),

	45: wmoInterpretation('zinc.300', 'Fog', 'fog'),
	48: wmoInterpretation('zinc.400', 'Icy Fog', 'rime-fog'),

	51: wmoInterpretation('azure.150', 'L.Drizzle', 'light-drizzle'),
	53: wmoInterpretation('azure.200', 'Drizzle', 'moderate-drizzle'),
	55: wmoInterpretation('azure.250', 'H.Drizzle', 'dense-drizzle'),

	80: wmoInterpretation('azure.300', 'L.Showers', 'light-rain'),
	81: wmoInterpretation('azure.350', 'Showers', 'moderate-rain'),
	82: wmoInterpretation('azure.450', 'H.Showers', 'heavy-rain'),

	61: wmoInterpretation('azure.200', 'L.Rain', 'light-rain'),
	63: wmoInterpretation('azure.300', 'Rain', 'moderate-rain'),
	65: wmoInterpretation('azure.400', 'H.Rain', 'heavy-rain'),

	56: wmoInterpretation('indigo.200', 'L.Icy Drizzle', 'light-freezing-drizzle'),
	57: wmoInterpretation('indigo.400', 'Icy Drizzle', 'dense-freezing-drizzle'),

	66: wmoInterpretation('violet.200', 'L.Icy Rain', 'light-freezing-rain'),
	67: wmoInterpretation('violet.400', 'Icy Rain', 'heavy-freezing-rain'),

	71: wmoInterpretation('fuchsia.200', 'L.Snow', 'slight-snowfall'),
	73: wmoInterpretation('fuchsia.300', 'Snow', 'moderate-snowfall'),
	75: wmoInterpretation('fuchsia.400', 'H.Snow', 'heavy-snowfall'),

	77: wmoInterpretation('purple.200', 'Snow Grains', 'snowflake'),

	85: wmoInterpretation('purple.200', 'L.Snow Showers', 'slight-snowfall'),
	86: wmoInterpretation('purple.400', 'Snow Showers', 'heavy-snowfall'),

	95: wmoInterpretation('pink.600', 'Thunderstorm', 'thunderstorm'),

	96: wmoInterpretation('pink.700', 'T-storm + L.Hail', 'thunderstorm-with-hail'),
	99: wmoInterpretation('pink.800', 'T-storm + Hail', 'thunderstorm-with-hail'),
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
