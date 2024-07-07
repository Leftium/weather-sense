import _ from 'lodash-es';
import JSON5 from 'json5';
import Color from 'colorjs.io';

import { gg } from './gg';

import picoColors from '$lib/pico-color-palette.json';
import dayjs from 'dayjs';

export const SOLARIZED_RED = '#dc322f';
export const SOLARIZED_BLUE = '#268bd2';
export const SOLARIZED_CYAN = '#2aa198';
export const SOLARIZED_GREEN = '#859900';

export const MS_IN_SECOND = 1000;
export const MS_IN_MINUTE = 60 * MS_IN_SECOND;
export const MS_IN_HOUR = 60 * MS_IN_MINUTE;
export const MS_IN_DAY = 24 * MS_IN_HOUR;

export const MS_IN_10_MINUTES = 10 * MS_IN_MINUTE;

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

function makeAqiLabel(text: string, color: string) {
	return { text, color };
}

export const AQI_INDEX_US = [
	makeAqiLabel('Good', 'hsl(115, 58%, 65%)'),
	makeAqiLabel('Moderate', 'hsl(46, 87%, 56%)'),
	makeAqiLabel('Unhealthy for Sensitive Groups', 'hsl(29, 90%, 55%)'),
	makeAqiLabel('Unhealthy', 'hsl(352, 83%, 55%)'),
	makeAqiLabel('Very unhealthy', 'rgb(203, 36, 176)'),
	makeAqiLabel('Hazardous', 'rgb(100, 30, 155)'),
];

export const AQI_INDEX_EUROPE = [
	makeAqiLabel('Good', 'hsl(188, 76%, 71%)'),
	makeAqiLabel('Fair', 'rgb(123, 218, 114)'),
	makeAqiLabel('Moderate', 'rgb(240, 196, 45)'),
	makeAqiLabel('Poor', 'rgb(236, 44, 69)'),
	makeAqiLabel('Very Poor', 'rgb(150, 2, 50)'),
	makeAqiLabel('Extremely Poor', 'rgb(81, 39, 113)'),
];

// Ranges from 0-50 (good), 51-100 (moderate), 101-150 (unhealthy for sensitive groups), 151-200 (unhealthy), 201-300 (very unhealthy) and 301-500 (hazardous).
export function aqiUsToLabel(aqi: number) {
	const index = aqi > 300 ? 5 : aqi > 200 ? 4 : aqi > 151 ? 3 : aqi > 100 ? 2 : aqi > 50 ? 1 : 0;
	return AQI_INDEX_US[index];
}

// Ranges from 0-20 (good), 20-40 (fair), 40-60 (moderate), 60-80 (poor), 80-100 (very poor) and exceeds 100 for extremely poor conditions.
export function aqiEuropeToLabel(aqi: number) {
	const index = Math.min(Math.floor(aqi / 20), 5);
	return AQI_INDEX_EUROPE[index];
}

const colorWhite = new Color('white');
const colorBlack = new Color('#333');

export function contrastTextColor(
	color: any,
	shadow: boolean = false,
	color1: string | Color = colorWhite,
	color2: string | Color = colorBlack,
) {
	if (!color) {
		return 'red';
	}

	const colorBackground = new Color(color);
	const colorA = new Color(color1);
	const colorB = new Color(color2);

	const needsDarkText =
		shadow ===
		Math.abs(colorBackground.contrastAPCA(colorA)) < Math.abs(colorBackground.contrastAPCA(colorB));

	const returnValue = needsDarkText ? colorA : colorB;
	return returnValue.toString({ format: 'hex' });
}

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

	const colorText = contrastTextColor(colorBackground);
	const colorShadow = contrastTextColor(
		colorBackground,
		true,
		`rgba(255 255 255 / 50%)`,
		`rgba(51 51 51 / 50%)`,
	);

	return {
		description,
		group,
		level,
		picoColor,
		color,
		colorText,
		colorShadow,
		icon,
	};
}

export const WMO_CODES: Record<number, any> = {
	0: makeWmo('slate.150', 'clear', 2, 'Clear', 'clear'),
	1: makeWmo('slate.250', 'cloudy', 1, 'Mostly Clear', 'mostly-clear'),
	2: makeWmo('slate.350', 'cloudy', 2, 'Partly Cloudy', 'partly-cloudy'),
	3: makeWmo('slate.450', 'cloudy', 3, 'Overcast', 'overcast'),

	45: makeWmo('grey.350', 'fog', 1, 'Fog', 'fog'),
	48: makeWmo('grey.550', 'fog', 3, 'Icy Fog', 'rime-fog'),

	51: makeWmo('azure.200', 'drizzle', 1, 'L.Drizzle', 'light-drizzle'),
	53: makeWmo('azure.300', 'drizzle', 2, 'Drizzle', 'moderate-drizzle'),
	55: makeWmo('azure.400', 'drizzle', 3, 'H.Drizzle', 'dense-drizzle'),

	80: makeWmo('azure.250', 'showers', 1, 'L.Showers', 'light-rain'),
	81: makeWmo('azure.350', 'showers', 2, 'Showers', 'moderate-rain'),
	82: makeWmo('azure.450', 'showers', 3, 'H.Showers', 'heavy-rain'),

	61: makeWmo('blue.350', 'rain', 1, 'L.Rain', 'light-rain'),
	63: makeWmo('blue.450', 'rain', 2, 'Rain', 'moderate-rain'),
	65: makeWmo('blue.550', 'rain', 3, 'H.Rain', 'heavy-rain'),

	56: makeWmo('indigo.200', 'icy-drizzle', 1, 'L.Icy Drizzle', 'light-freezing-drizzle'),
	57: makeWmo('indigo.400', 'icy-drizzle', 3, 'Icy Drizzle', 'dense-freezing-drizzle'),

	66: makeWmo('violet.350', 'icy-rain', 1, 'L.Icy Rain', 'light-freezing-rain'),
	67: makeWmo('violet.550', 'icy-rain', 3, 'Icy Rain', 'heavy-freezing-rain'),

	77: makeWmo('purple.150', 'snow-grains', 2, 'Snow Grains', 'snowflake'),

	85: makeWmo('purple.250', 'snow-showers', 1, 'L.Snow Showers', 'slight-snowfall'),
	86: makeWmo('purple.450', 'snow-showers', 3, 'Snow Showers', 'heavy-snowfall'),

	71: makeWmo('fuchsia.350', 'snow', 1, 'L.Snow', 'slight-snowfall'),
	73: makeWmo('fuchsia.450', 'snow', 2, 'Snow', 'moderate-snowfall'),
	75: makeWmo('fuchsia.550', 'snow', 3, 'H.Snow', 'heavy-snowfall'),

	95: makeWmo('pink.350', 'thunderstorm', 1, 'Thunder Storm', 'thunderstorm'),
	96: makeWmo('pink.450', 'thunderstorm', 2, 'T-Storm + L.Hail', 'thunderstorm-with-hail'),
	99: makeWmo('pink.550', 'thunderstorm', 3, 'T-Storm + Hail', 'thunderstorm-with-hail'),
};

export function wmoCode(code: number | undefined) {
	if (code !== undefined) {
		return WMO_CODES[code];
	}
	return {
		description: '...',
		icon: '',
	};
}

export function startOf(ms: number, unit: number | dayjs.OpUnitType, timezone?: string) {
	if (typeof unit === 'number') {
		return Math.floor(ms / unit) * unit;
	}
	return +dayjs.tz(ms, timezone).startOf(unit);
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
