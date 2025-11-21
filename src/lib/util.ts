import { get } from 'lodash-es';
import JSON5 from 'json5';
import Color from 'colorjs.io';

import { gg } from '@leftium/gg';

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
	dewPoint: picoColors.blue[600],
	temperature: 'url(#gradient)', // picoColors.blue[950],
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

const format = (num, width = 2) => `${Math.round(num)}`.padStart(width, '0');

export function prettyLch(color: Color) {
	const [L, C, H] = color.oklch;
	const A = color.alpha ?? 1;

	return `${format(H || 0, 3)}h ${format(L * 100)}l ${format(A * 100)}a`;
}

function makeAqiLabel(text: string, color: string, range: string = '', description: string = '') {
	const textColor = contrastTextColor(color);
	return { text, color, textColor, range, description };
}

// prettier-ignore
export const AQI_INDEX_US = [
	makeAqiLabel('Good',                           picoColors.green[150],     '0-50',
		`Air quality is considered satisfactory, and air pollution poses little or no risk.<br><br>
        It's a great day to be active outside.`,
	),
	makeAqiLabel('Moderate',                       picoColors.yellow[100],   '51-100',
		`Air quality is acceptable; however, for some pollutants there may be a moderate health concern
        for a very small number of people who are unusually sensitive to air pollution.<br><br>
        It's a good day to be active outside.`,
	),
	makeAqiLabel('Unhealthy for Sensitive Groups', picoColors.pumpkin[300], '101-150',
		`Members of sensitive groups may experience health effects. The general public is not likely to be affected.<br><br>
        It's OK to be active outside, but take more breaks and do less intense activities.`,
	),
	makeAqiLabel('Unhealthy',                      picoColors.red[450],     '151-200',
		`Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.<br><br>
        Reduce prolonged or heavy exertion. Take more breaks during all outdoor activities.`,
	),
	makeAqiLabel('Very Unhealthy',                 picoColors.purple[650],  '201-300',
		`Health alert: everyone may experience more serious health effects.<br><br>
        Avoid prolonged or heavy exertion. Consider moving activities indoors or rescheduling to a time when air quality is better.`,
	),
	makeAqiLabel('Hazardous',                      picoColors.pink[650],    '300-500',
		`Health warnings of emergency conditions. The entire population is more likely to be affected.<br><br>
        Avoid all physical activity outdoors.`,
	),
];

// prettier-ignore
export const AQI_INDEX_EUROPE = [
	makeAqiLabel('Good',           picoColors.cyan[150],     '0-20',
        `The air quality is good. Enjoy your usual outdoor activities.`
    ),
	makeAqiLabel('Fair',           picoColors.cyan[250],    '21-40',
        `Enjoy your usual outdoor activities.`
    ),
	makeAqiLabel('Moderate',       picoColors.yellow[150],  '41-60',
        `Enjoy your usual outdoor activities`
    ),
	makeAqiLabel('Poor',           picoColors.red[400],     '61-80',
        `Consider reducing intense activities outdoors, if you experience symptoms such as sore eyes, a cough or sore throat.`
    ),
	makeAqiLabel('Very Poor',      picoColors.purple[650],  '81-100',
        `Consider reducing intense activities outdoors, if you experience symptoms such as sore eyes, a cough or sore throat.`
    ),
	makeAqiLabel('Extremely Poor', picoColors.pink[650],   '100+',
        `Reduce physical activities outdoors.`
    ),
];

const NO_DATA_LABEL = makeAqiLabel('No Data', picoColors.grey[300]);

// Ranges from 0-50 (good), 51-100 (moderate), 101-150 (unhealthy for sensitive groups), 151-200 (unhealthy), 201-300 (very unhealthy) and 301-500 (hazardous).
export function aqiUsToLabel(aqi: number | null) {
	if (aqi === null) {
		return NO_DATA_LABEL;
	}
	const index = aqi > 300 ? 5 : aqi > 200 ? 4 : aqi > 151 ? 3 : aqi > 100 ? 2 : aqi > 50 ? 1 : 0;
	return AQI_INDEX_US[index];
}

// Ranges from 0-20 (good), 20-40 (fair), 40-60 (moderate), 60-80 (poor), 80-100 (very poor) and exceeds 100 for extremely poor conditions.
export function aqiEuropeToLabel(aqi: number | null) {
	if (aqi === null) {
		return NO_DATA_LABEL;
	}
	const index = Math.min(Math.floor(aqi / 20), 5);
	return AQI_INDEX_EUROPE[index];
}

function makeWmo(wsCode: number, picoColor: string, description: string, iconName: string) {
	const groups = [
		'clear',
		'cloudy',
		'fog',
		'drizzle',
		'showers',
		'rain',
		'icy-drizzle',
		'icy-rain',
		'snow-grains',
		'snow-showers',
		'snow',
		'thunderstorm',
	];

	const group = groups[Math.floor(wsCode / 10) % 100];
	const level = wsCode % 10;
	const color = get(picoColors, picoColor) || get(picoColors, 'yellow.400');

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
		wsCode,
		group,
		level,
		picoColor,
		color,
		colorText,
		colorShadow,
		icon,
	};
}

// prettier-ignore
export const WMO_CODES: Record<number, any> = {
	0:  makeWmo(     2, 'slate.150',   'Clear',            'clear'),
	1:  makeWmo(   1_1, 'slate.250',   'Mostly Clear',     'mostly-clear'),
	2:  makeWmo(   1_2, 'slate.350',   'Partly Cloudy',    'partly-cloudy'),
    3:  makeWmo(   1_3, 'slate.450',   'Overcast',         'overcast'),

	45: makeWmo(1_02_1, 'grey.350',    'Fog',              'fog'),
    48: makeWmo(1_02_3, 'grey.550',    'Icy Fog',          'rime-fog'),

	51: makeWmo(2_03_1, 'azure.200',   'L.Drizzle',        'light-drizzle'),
	53: makeWmo(2_03_2, 'azure.300',   'Drizzle',          'moderate-drizzle'),
	55: makeWmo(2_03_3, 'azure.400',   'H.Drizzle',        'dense-drizzle'),
	80: makeWmo(2_04_1, 'azure.250',   'L.Showers',        'light-rain'),
	81: makeWmo(2_04_2, 'azure.350',   'Showers',          'moderate-rain'),
	82: makeWmo(2_04_3, 'azure.450',   'H.Showers',        'heavy-rain'),
	61: makeWmo(2_05_1, 'blue.350',    'L.Rain',           'light-rain'),
	63: makeWmo(2_05_2, 'blue.450',    'Rain',             'moderate-rain'),
    65: makeWmo(2_05_3, 'blue.550',    'H.Rain',           'heavy-rain'),

	56: makeWmo(3_06_1, 'indigo.200',  'L.Icy Drizzle',    'light-freezing-drizzle'),
	57: makeWmo(3_06_3, 'indigo.400',  'Icy Drizzle',      'dense-freezing-drizzle'),
	66: makeWmo(3_07_1, 'violet.350',  'L.Icy Rain',       'light-freezing-rain'),
    67: makeWmo(3_07_3, 'violet.550',  'Icy Rain',         'heavy-freezing-rain'),

	77: makeWmo(4_08_2, 'purple.150',  'Snow Grains',      'snowflake'),
	85: makeWmo(4_09_1, 'purple.250',  'L.Snow Showers',   'slight-snowfall'),
	86: makeWmo(4_09_3, 'purple.450',  'Snow Showers',     'heavy-snowfall'),
	71: makeWmo(4_10_1, 'fuchsia.350', 'L.Snow',           'slight-snowfall'),
	73: makeWmo(4_10_2, 'fuchsia.450', 'Snow',             'moderate-snowfall'),
    75: makeWmo(4_10_3, 'fuchsia.550', 'H.Snow',           'heavy-snowfall'),

	95: makeWmo(5_11_1, 'pink.350',    'Thunder Storm',    'thunderstorm'),
	96: makeWmo(5_11_2, 'pink.450',    'T-Storm + L.Hail', 'thunderstorm-with-hail',),
	99: makeWmo(5_11_3, 'pink.550',    'T-Storm + Hail',   'thunderstorm-with-hail'),
};

export function wmoCode(code: number | undefined) {
	if (code !== undefined && WMO_CODES[code] !== undefined) {
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
