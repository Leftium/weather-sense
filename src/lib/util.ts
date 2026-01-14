import { get } from 'lodash-es';
import JSON5 from 'json5';
import Color from 'colorjs.io';

import picoColors from '$lib/pico-color-palette.json';
import dayjs from 'dayjs';

/**
 * Debug logger that collects messages and stores them in window.debugLog
 * Usage:
 *   1. Create logger: const debug = createDebugLogger('MyComponent', shouldDebug);
 *   2. Log messages: debug.log('message here');
 *   3. Finish and store: debug.finish();
 *   4. In browser console: copy(debugLog)
 */
export function createDebugLogger(name: string, enabled: boolean) {
	const messages: string[] = [];
	return {
		log: (msg: string) => {
			if (enabled) messages.push(msg);
		},
		finish: () => {
			if (enabled && typeof window !== 'undefined') {
				(window as unknown as { debugLog: string }).debugLog = messages.join('\n');
				console.log(`[${name}] Debug stored in window.debugLog - run: copy(debugLog)`);
			}
		},
		get messages() {
			return messages;
		},
	};
}

export const SOLARIZED_BLUE = '#2244AA'; // was '#268bd2'

// Temperature colors (softer red/blue for hot/cold)
export const TEMP_COLOR_HOT = '#ff4444';
export const TEMP_COLOR_COLD = '#3366ff';

export const MS_IN_SECOND = 1000;
export const MS_IN_MINUTE = 60 * MS_IN_SECOND;
export const MS_IN_HOUR = 60 * MS_IN_MINUTE;
export const MS_IN_DAY = 24 * MS_IN_HOUR;

// Start "day" plots at 4 AM to capture full daylight cycle (earliest sunrise ~4:25 AM in most populated areas)
export const DAY_START_HOUR = 4;

export const colors = {
	humidity: '#20B2AA', // teal - was '#9062CA'
	precipitationProbability: '#99CCFF', // pale blue - was '#58FAF9'
	precipitation: SOLARIZED_BLUE,
	dewPoint: '#178B8B', // darker teal - was picoColors.blue[600]
	temperature: 'url(#gradient)', // picoColors.blue[950],
};

// Returns a color between blue (cold) and red (hot) based on temperature position in range
export function temperatureToColor(temp: number, minTemp: number, maxTemp: number): string {
	const range = maxTemp - minTemp;
	if (range === 0) return TEMP_COLOR_COLD;

	// Normalize to 0-1 range
	const t = Math.max(0, Math.min(1, (temp - minTemp) / range));

	// Interpolate from blue (cold) to red (hot) using colorjs.io
	const blue = new Color(TEMP_COLOR_COLD);
	const red = new Color(TEMP_COLOR_HOT);

	return blue.range(red, { space: 'oklch' })(t).toString({ format: 'hex' });
}

export function jsonPretty(json: unknown) {
	return JSON5.stringify(json, { space: 4, quote: '', replacer });
}

export function objectFromMap(value: unknown): unknown {
	if (value instanceof Map) {
		return Array.from(value).reduce(
			(obj, [key, val]) => {
				// Prepend '_' to make numeric key valid unquoted object key:
				const newKey = isNaN(Number(key)) ? String(key) : '_' + key;
				obj[newKey] = val;
				return obj;
			},
			{} as Record<string, unknown>,
		);
	} else {
		return value;
	}
}

// Based on: https://stackoverflow.com/questions/29085197/how-do-you-json-stringify-an-es6-map
export function replacer(_key: string, value: unknown): unknown {
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

// Cache for contrastTextColor results to avoid repeated Color.js operations
// Key format: `${color}|${shadow}|${color1}|${color2}`
const contrastTextColorCache = new Map<string, string>();
const CONTRAST_CACHE_MAX_SIZE = 500; // Limit cache size to prevent memory leaks

export function contrastTextColor(
	color: string | Color | null | undefined,
	shadow: boolean = false,
	color1: string | Color = colorWhite,
	color2: string | Color = colorBlack,
) {
	if (!color) {
		return 'red';
	}

	// Build cache key - use string representation for Color objects
	const c1Key = typeof color1 === 'string' ? color1 : color1.toString();
	const c2Key = typeof color2 === 'string' ? color2 : color2.toString();
	const cacheKey = `${color}|${shadow}|${c1Key}|${c2Key}`;

	// Check cache
	const cached = contrastTextColorCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	// Compute result
	const colorBackground = new Color(color);
	const colorA = new Color(color1);
	const colorB = new Color(color2);

	const needsDarkText =
		shadow ===
		Math.abs(colorBackground.contrastAPCA(colorA)) < Math.abs(colorBackground.contrastAPCA(colorB));

	const returnValue = needsDarkText ? colorA : colorB;
	const result = returnValue.toString({ format: 'hex' });

	// Store in cache (with size limit)
	if (contrastTextColorCache.size >= CONTRAST_CACHE_MAX_SIZE) {
		// Clear oldest entries (simple approach: clear half the cache)
		const keysToDelete = Array.from(contrastTextColorCache.keys()).slice(
			0,
			CONTRAST_CACHE_MAX_SIZE / 2,
		);
		keysToDelete.forEach((k) => contrastTextColorCache.delete(k));
	}
	contrastTextColorCache.set(cacheKey, result);

	return result;
}

// Default colors for text/shadow contrast (used throughout the app)
const CONTRAST_LIGHT = `rgba(248 248 255 / 80%)`;
const CONTRAST_DARK = `rgba(51 51 51 / 80%)`;

// Get both fillText and fillShadow colors for a given background
export function getContrastColors(fill: string): { fillText: string; fillShadow: string } {
	return {
		fillText: contrastTextColor(fill, false, CONTRAST_LIGHT, CONTRAST_DARK),
		fillShadow: contrastTextColor(fill, true, CONTRAST_LIGHT, CONTRAST_DARK),
	};
}

const format = (num: number, width = 2) => `${Math.round(num)}`.padStart(width, '0');

export function prettyLch(color: Color) {
	const [L, , H] = color.oklch;
	const A = color.alpha ?? 1;

	return `${format(H || 0, 3)}h ${format((L ?? 0) * 100)}l ${format(A * 100)}a`;
}

function makeAqiLabel(text: string, color: string, range: string = '', description: string = '') {
	const textColor = contrastTextColor(color);
	return { text, color, textColor, range, description };
}

// prettier-ignore
export const AQI_INDEX_US = [
	makeAqiLabel('Good',                           picoColors.green[200],     '0-50',
		`Air quality is considered satisfactory, and air pollution poses little or no risk.<br><br>
        It's a great day to be active outside.`,
	),
	makeAqiLabel('Moderate',                       picoColors.yellow[150],   '51-100',
		`Air quality is acceptable; however, for some pollutants there may be a moderate health concern
        for a very small number of people who are unusually sensitive to air pollution.<br><br>
        It's a good day to be active outside.`,
	),
	makeAqiLabel('Unhealthy for Sensitive Groups', picoColors.pumpkin[350], '101-150',
		`Members of sensitive groups may experience health effects. The general public is not likely to be affected.<br><br>
        It's OK to be active outside, but take more breaks and do less intense activities.`,
	),
	makeAqiLabel('Unhealthy',                      picoColors.red[400],     '151-200',
		`Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.<br><br>
        Reduce prolonged or heavy exertion. Take more breaks during all outdoor activities.`,
	),
	makeAqiLabel('Very Unhealthy',                 picoColors.purple[550],  '201-300',
		`Health alert: everyone may experience more serious health effects.<br><br>
        Avoid prolonged or heavy exertion. Consider moving activities indoors or rescheduling to a time when air quality is better.`,
	),
	makeAqiLabel('Hazardous',                      picoColors.pink[550],    '300-500',
		`Health warnings of emergency conditions. The entire population is more likely to be affected.<br><br>
        Avoid all physical activity outdoors.`,
	),
];

// prettier-ignore
export const AQI_INDEX_EUROPE = [
	makeAqiLabel('Good',           picoColors.cyan[200],     '0-20',
        `The air quality is good. Enjoy your usual outdoor activities.`
    ),
	makeAqiLabel('Fair',           picoColors.cyan[300],    '21-40',
        `Enjoy your usual outdoor activities.`
    ),
	makeAqiLabel('Moderate',       picoColors.yellow[200],  '41-60',
        `Enjoy your usual outdoor activities`
    ),
	makeAqiLabel('Poor',           picoColors.red[350],     '61-80',
        `Consider reducing intense activities outdoors, if you experience symptoms such as sore eyes, a cough or sore throat.`
    ),
	makeAqiLabel('Very Poor',      picoColors.purple[550],  '81-100',
        `Consider reducing intense activities outdoors, if you experience symptoms such as sore eyes, a cough or sore throat.`
    ),
	makeAqiLabel('Extremely Poor', picoColors.pink[550],   '100+',
        `Reduce physical activities outdoors.`
    ),
];

const NO_DATA_LABEL = makeAqiLabel('No Data', picoColors.grey[300]);
const NOT_AVAILABLE_LABEL = makeAqiLabel('Not Available', picoColors.slate[300]);

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

export function aqiNotAvailableLabel() {
	return NOT_AVAILABLE_LABEL;
}

// Each gradient is [top, mid, bottom] for CSS linear-gradient
// Sky gets lighter/whiter as clouds increase from clear → overcast
const cloudGradients = {
	clear: ['#6bb3e0', '#a8d8f0', '#f0f8ff'], // Deep blue top, light bottom
	mostlyClear: ['#90c8e8', '#b8e0f4', '#f4faff'], // Lighter/whiter than clear
	partlyCloudy: ['#b0d8f0', '#d0e8f8', '#f8fcff'], // Even lighter, more white
	overcast: ['#c8dce8', '#dce8f0', '#f0f4f8'], // Lightest, mostly white with hint of blue
	fog: ['#d0d0d0', '#e8e8e8', '#f8f8f8'], // Gray top, white bottom
	showers: ['#d8e4ec', '#98b0c0', '#7090a0'], // Between partlyCloudy and overcast (sun/cloud mix)
	rain: ['#c8d0d8', '#a8b0b8', '#889098'], // Match snow - cool gray
	snow: ['#c8d0d8', '#a8b0b8', '#889098'], // Cool gray (slightly lighter than rain)
	thunderstorm: ['#909098', '#606068', '#404048'], // Dark ominous
};

/**
 * Get sky gradient colors based on WMO weather code
 * @param wmoCode - WMO weather code (0-99)
 * @returns Array of 3 colors for gradient [light, mid, dark]
 */
export function getCloudGradient(wmoCode: number): string[] {
	// Clear sky
	if (wmoCode === 0) return cloudGradients.clear;

	// Mostly clear
	if (wmoCode === 1) return cloudGradients.mostlyClear;

	// Partly cloudy
	if (wmoCode === 2) return cloudGradients.partlyCloudy;

	// Overcast
	if (wmoCode === 3) return cloudGradients.overcast;

	// Fog
	if (wmoCode === 45 || wmoCode === 48) return cloudGradients.fog;

	// Thunderstorm (95-99)
	if (wmoCode >= 95) return cloudGradients.thunderstorm;

	// Snow (71-77, 85-86)
	if ((wmoCode >= 71 && wmoCode <= 77) || (wmoCode >= 85 && wmoCode <= 86)) {
		return cloudGradients.snow;
	}

	// Showers (80-82) - mixed sun/clouds
	if (wmoCode >= 80 && wmoCode <= 82) return cloudGradients.showers;

	// Rain, drizzle, freezing rain (51-67)
	if (wmoCode >= 51 && wmoCode <= 67) {
		return cloudGradients.rain;
	}

	// Default to clear
	return cloudGradients.clear;
}

/**
 * Get the middle color from the cloud gradient for a WMO weather code
 * Used for hourly plot backgrounds where gradients aren't practical
 * @param wmoCode - WMO weather code (0-99)
 * @returns Middle color from the gradient
 */
export function getCloudColor(wmoCode: number): string {
	return getCloudGradient(wmoCode)[1];
}

/**
 * Get CSS linear-gradient string for a cloud/sky WMO code.
 * @param wmoCode - WMO code (0-3 or 45/48)
 * @param angle - Gradient angle in degrees (default 315)
 * @returns CSS linear-gradient string
 */
export function getCloudGradientCSS(wmoCode: number, angle = 315): string {
	const colors = getCloudGradient(wmoCode);
	// Solid zones at ends (15% each) with smooth transition in middle
	// 315deg: bottom-right to top-left (dark at bottom-right, light at top-left)
	return `linear-gradient(${angle}deg, ${colors[0]} 0%, ${colors[0]} 15%, ${colors[1]} 50%, ${colors[2]} 85%, ${colors[2]} 100%)`;
}

/**
 * Get semi-transparent overlay gradient stops for WMO codes 1-3 (cloudy conditions)
 * Used when showSkyThroughWmo is active to overlay cloudiness on sky strip
 * Gradient is vertical: more transparent at top, more opaque toward horizon
 * Colors matched to diagonal strip from reference WMO code images
 * @param wmoCode - WMO weather code (0-3)
 * @returns Array of gradient stops [{offset, color}] or null if no overlay needed
 */
export function getWmoOverlayGradient(wmoCode: number): { offset: string; color: string }[] | null {
	// Code 0 (Clear): no overlay needed - pure sky
	if (wmoCode === 0) return null;

	// Code 1 (Mostly Clear): subtle haze, barely visible at top, light haze at horizon
	if (wmoCode === 1) {
		return [
			{ offset: '0%', color: 'rgba(255,255,255,0)' },
			{ offset: '40%', color: 'rgba(255,255,255,0.08)' },
			{ offset: '70%', color: 'rgba(255,255,255,0.18)' },
			{ offset: '100%', color: 'rgba(240,248,255,0.30)' }, // slight blue tint at horizon
		];
	}

	// Code 2 (Partly Cloudy): visible white clouds, more prominent toward horizon
	if (wmoCode === 2) {
		return [
			{ offset: '0%', color: 'rgba(255,255,255,0.12)' },
			{ offset: '30%', color: 'rgba(255,255,255,0.25)' },
			{ offset: '60%', color: 'rgba(255,255,255,0.45)' },
			{ offset: '100%', color: 'rgba(235,245,255,0.60)' }, // bluish-white at horizon
		];
	}

	// Code 3 (Overcast): desaturation layer - neutral gray to wash out blue
	// Mutes sky while preserving some character (dawn/dusk transitions visible)
	if (wmoCode === 3) {
		return [
			{ offset: '0%', color: 'rgba(160,160,170,0.55)' },
			{ offset: '50%', color: 'rgba(170,170,180,0.58)' },
			{ offset: '100%', color: 'rgba(180,180,190,0.60)' },
		];
	}

	// Codes 45, 48 (Fog, Icy Fog): light gray top fading to white at bottom
	if (wmoCode === 45 || wmoCode === 48) {
		return [
			{ offset: '0%', color: 'rgba(200,200,200,0.75)' }, // light gray at top
			{ offset: '50%', color: 'rgba(220,220,220,0.80)' },
			{ offset: '100%', color: 'rgba(245,245,245,0.85)' }, // near white at bottom
		];
	}

	// All precipitation codes: use same overcast desaturation overlay
	// This provides a consistent cloudy sky base for all precipitation types
	// Codes: 51-55 (drizzle), 56-57 (freezing drizzle), 61-65 (rain),
	//        66-67 (freezing rain), 71-77 (snow), 80-82 (showers),
	//        85-86 (snow showers), 95-99 (thunderstorm)
	if (wmoCode >= 51) {
		return [
			{ offset: '0%', color: 'rgba(160,160,170,0.55)' },
			{ offset: '50%', color: 'rgba(170,170,180,0.58)' },
			{ offset: '100%', color: 'rgba(180,180,190,0.60)' },
		];
	}

	// Other codes: no overlay (will use solid WMO gradients)
	return null;
}

function makeWmo(wsCode: number, colorInput: string, description: string, iconName: string) {
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

	// Support both Pico color strings (e.g., 'azure.300') and hex colors (e.g., '#4682B4')
	const isHex = colorInput.startsWith('#');
	const color = isHex ? colorInput : get(picoColors, colorInput) || get(picoColors, 'yellow.400');

	const icon = `/icons/airy/${iconName}@4x.png`;

	const colorBackground = new Color(color);

	const colorText = contrastTextColor(colorBackground);
	const colorShadow = contrastTextColor(
		colorBackground,
		true,
		`rgba(255 255 255 / 50%)`,
		`rgba(51 51 51 / 50%)`,
	);

	let gradient: string[];
	if (isHex) {
		// For hex colors, generate gradient by lightening/darkening
		const colorObj = new Color(color);
		const lightColor = colorObj.clone().set('lch.l', (l) => Math.min(95, l + 15));
		const darkColor = colorObj.clone().set('lch.l', (l) => Math.max(20, l - 15));
		gradient = [
			darkColor.toString({ format: 'hex' }),
			color,
			lightColor.toString({ format: 'hex' }),
		];
	} else {
		// For Pico colors, use the palette
		const [hue, valueStr] = colorInput.split('.');
		const value = parseInt(valueStr, 10);
		const lightValue = Math.max(50, value - 150);
		const darkValue = Math.min(950, value + 150);
		const gradientLight = get(picoColors, `${hue}.${lightValue}`) || color;
		const gradientDark = get(picoColors, `${hue}.${darkValue}`) || color;
		gradient = [gradientDark, color, gradientLight];
	}

	return {
		description,
		wsCode,
		group,
		level,
		picoColor: colorInput,
		color,
		colorText,
		colorShadow,
		gradient,
		icon,
	};
}

export type WmoCodeInfo = ReturnType<typeof makeWmo>;

// prettier-ignore
export const WMO_CODES: Record<number, WmoCodeInfo> = {
	0:  makeWmo(     2, 'slate.150',   'Clear',            'clear'),
	1:  makeWmo(   1_1, 'slate.250',   'Mostly Clear',     'mostly-clear'),
	2:  makeWmo(   1_2, 'slate.350',   'Partly Cloudy',    'partly-cloudy'),
    3:  makeWmo(   1_3, 'slate.450',   'Overcast',         'overcast'),

	45: makeWmo(1_02_1, 'zinc.350',    'Fog',              'fog'),
    48: makeWmo(1_02_3, 'zinc.550',    'Icy Fog',          'rime-fog'),

	51: makeWmo(2_03_1, 'cyan.300',    'L.Drizzle',        'light-drizzle'),
	53: makeWmo(2_03_2, 'cyan.400',    'Drizzle',          'moderate-drizzle'),
	55: makeWmo(2_03_3, 'cyan.500',    'H.Drizzle',        'dense-drizzle'),
	80: makeWmo(2_04_1, 'cyan.350',    'L.Showers',        'light-rain'),
	81: makeWmo(2_04_2, 'cyan.450',    'Showers',          'moderate-rain'),
	82: makeWmo(2_04_3, 'cyan.550',    'H.Showers',        'heavy-rain'),
	61: makeWmo(2_05_1, 'cyan.450',    'L.Rain',           'light-rain'),
	63: makeWmo(2_05_2, 'cyan.550',    'Rain',             'moderate-rain'),
    65: makeWmo(2_05_3, 'cyan.650',    'H.Rain',           'heavy-rain'),

	56: makeWmo(3_06_1, '#8090C0',     'L.Icy Drizzle',    'light-freezing-drizzle'),  // Periwinkle light
	57: makeWmo(3_06_3, '#6A7AB8',     'Icy Drizzle',      'dense-freezing-drizzle'),  // Periwinkle mid
	66: makeWmo(3_07_1, '#5A6AAD',     'L.Icy Rain',       'light-freezing-rain'),     // Periwinkle darker
    67: makeWmo(3_07_3, '#4A5A9D',     'Icy Rain',         'heavy-freezing-rain'),     // Periwinkle dark

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

// Override colors for no-precip (0-3) and fog (45, 48) with cloud gradient middle color
// This is done after WMO_CODES definition since getCloudColor depends on cloudGradients
const noPrecipCodes = [0, 1, 2, 3, 45, 48];
for (const code of noPrecipCodes) {
	if (WMO_CODES[code]) {
		const cloudColor = getCloudColor(code);
		WMO_CODES[code].color = cloudColor;
		WMO_CODES[code].colorText = contrastTextColor(cloudColor);
		WMO_CODES[code].colorShadow = contrastTextColor(
			cloudColor,
			true,
			`rgba(255 255 255 / 50%)`,
			`rgba(51 51 51 / 50%)`,
		);
	}
}

export function wmoCode(code: number | undefined) {
	if (code !== undefined && WMO_CODES[code] !== undefined) {
		return WMO_CODES[code];
	}
	return {
		description: '...',
		icon: '',
	};
}

// Cloud-cover based sky gradients for weather conditions

// Google Weather Icons v2 mapping
// Only "No Precipitation" codes (0-3) have day/night variants
// All precipitation codes use same icon for day/night
// prettier-ignore
export const GOOGLE_V2_ICONS: Record<number, { day: string; night: string }> = {
	0:  { day: 'sunny',                          night: 'clear_night' },
	1:  { day: 'mostly_sunny',                   night: 'mostly_clear_night' },
	2:  { day: 'partly_cloudy',                  night: 'partly_cloudy_night' },
	3:  { day: 'mostly_cloudy_day',              night: 'mostly_cloudy_night' },

	45: { day: 'haze_fog_dust_smoke',            night: 'haze_fog_dust_smoke' },
	48: { day: 'haze_fog_dust_smoke',            night: 'haze_fog_dust_smoke' },

	51: { day: 'drizzle',                        night: 'drizzle' },
	53: { day: 'drizzle',                        night: 'drizzle' },
	55: { day: 'drizzle',                        night: 'drizzle' },
	80: { day: 'showers_rain',                   night: 'showers_rain' },
	81: { day: 'showers_rain',                   night: 'showers_rain' },
	82: { day: 'heavy_rain',                     night: 'heavy_rain' },
	61: { day: 'showers_rain',                   night: 'showers_rain' },
	63: { day: 'showers_rain',                   night: 'showers_rain' },
	65: { day: 'heavy_rain',                     night: 'heavy_rain' },

	56: { day: 'sleet_hail',                     night: 'sleet_hail' },
	57: { day: 'sleet_hail',                     night: 'sleet_hail' },
	66: { day: 'wintry_mix_rain_snow',           night: 'wintry_mix_rain_snow' },
	67: { day: 'sleet_hail',                     night: 'sleet_hail' },

	77: { day: 'flurries',                       night: 'flurries' },
	85: { day: 'snow_showers_snow',              night: 'snow_showers_snow' },
	86: { day: 'heavy_snow',                     night: 'heavy_snow' },
	71: { day: 'flurries',                       night: 'flurries' },
	73: { day: 'snow_showers_snow',              night: 'snow_showers_snow' },
	75: { day: 'heavy_snow',                     night: 'heavy_snow' },

	95: { day: 'strong_tstorms',                 night: 'strong_tstorms' },
	96: { day: 'strong_tstorms',                 night: 'strong_tstorms' },
	99: { day: 'strong_tstorms',                 night: 'strong_tstorms' },
};

export function getGoogleV2Icon(code: number, isDay = true): string {
	const mapping = GOOGLE_V2_ICONS[code];
	if (!mapping) return '/icons/google-v2/sunny.png';
	const iconName = isDay ? mapping.day : mapping.night;
	return `/icons/google-v2/${iconName}.png`;
}

export function hasUniqueNightIcon(code: number): boolean {
	const mapping = GOOGLE_V2_ICONS[code];
	if (!mapping) return false;
	return mapping.day !== mapping.night;
}

// Google Weather Icons v1 mapping
// Most have no day/night variants, but some do (like showers with sun vs cloud)
// prettier-ignore
export const GOOGLE_V1_ICONS: Record<number, { day: string; night: string }> = {
	0:  { day: 'sunny',           night: 'sunny' },
	1:  { day: 'sunny_s_cloudy',  night: 'sunny_s_cloudy' },
	2:  { day: 'partly_cloudy',   night: 'partly_cloudy' },
	3:  { day: 'cloudy',          night: 'cloudy' },

	45: { day: 'cloudy',          night: 'cloudy' },
	48: { day: 'cloudy',          night: 'cloudy' },

	51: { day: 'rain_light',      night: 'rain_light' },
	53: { day: 'rain_light',      night: 'rain_light' },
	55: { day: 'rain_light',      night: 'rain_light' },
	80: { day: 'sunny_s_rain',    night: 'cloudy_s_rain' },
	81: { day: 'rain_s_sunny',    night: 'rain_s_cloudy' },
	82: { day: 'rain_s_sunny',    night: 'rain_s_cloudy' },
	61: { day: 'rain',            night: 'rain' },
	63: { day: 'rain_heavy',      night: 'rain_heavy' },
	65: { day: 'rain_heavy',      night: 'rain_heavy' },

	56: { day: 'snow_s_rain',     night: 'snow_s_rain' },
	57: { day: 'snow_s_rain',     night: 'snow_s_rain' },
	66: { day: 'rain_s_snow',     night: 'rain_s_snow' },
	67: { day: 'rain_s_snow',     night: 'rain_s_snow' },

	77: { day: 'snow_s_cloudy',   night: 'snow_s_cloudy' },
	85: { day: 'snow_s_cloudy',   night: 'snow_s_cloudy' },
	86: { day: 'snow_s_cloudy',   night: 'snow_s_cloudy' },
	71: { day: 'snow_light',      night: 'snow_light' },
	73: { day: 'snow',            night: 'snow' },
	75: { day: 'snow_heavy',      night: 'snow_heavy' },

	95: { day: 'thunderstorms',   night: 'thunderstorms' },
	96: { day: 'thunderstorms',   night: 'thunderstorms' },
	99: { day: 'thunderstorms',   night: 'thunderstorms' },
};

export function getGoogleV1Icon(code: number, isDay = true): string {
	const mapping = GOOGLE_V1_ICONS[code];
	if (!mapping) return '/icons/google-v1/sunny.png';
	const iconName = isDay ? mapping.day : mapping.night;
	return `/icons/google-v1/${iconName}.png`;
}

// Get the appropriate Google icon (v2 for clear/cloudy with day/night, v1 for precipitation)
export function getGoogleIcon(code: number, isDay = true): string {
	// Use v2 for codes with unique day/night variants (clear/cloudy: 0-3)
	if (hasUniqueNightIcon(code)) {
		return getGoogleV2Icon(code, isDay);
	}
	// Use v1 for precipitation codes
	return getGoogleV1Icon(code, isDay);
}

// Get weather icon based on icon set preference
// iconSet: 'airy' | 'google'
// isDay: true for day, false for night (only affects Google icons)
export function getWeatherIcon(code: number, iconSet: 'airy' | 'google', isDay = true): string {
	if (iconSet === 'airy') {
		return WMO_CODES[code]?.icon ?? WMO_CODES[0].icon;
	}
	return getGoogleIcon(code, isDay);
}

// Get the precipitation group for a WMO code (used for grouping similar weather types)
// Group 0 = clear/cloudy, 1 = fog, 2 = rain/drizzle, 3 = freezing rain, 4 = snow, 5 = thunderstorm
export function precipitationGroup(code: number): number {
	if (WMO_CODES[code]?.wsCode !== undefined) {
		return Math.floor(WMO_CODES[code].wsCode / 1000) % 10;
	}
	return -1;
}

// Get the most severe WMO code from grouped hourly data
// Replicates TimeLine's grouping logic: groups consecutive hours by precipitation type,
// picks the most severe code within each group (or most common for clear/cloudy),
// then returns the most severe among all group representatives
export function getGroupedWmoCode(
	hourlyData: { weatherCode: number }[],
	maxByFn: <T>(arr: T[], fn: (item: T) => number) => T | undefined,
): number | null {
	if (!hourlyData?.length) return null;

	function determineNextCode(prevCode: number | undefined, currCode: number) {
		if (prevCode !== undefined) {
			if (precipitationGroup(prevCode) === precipitationGroup(currCode)) {
				return WMO_CODES[prevCode].wsCode > WMO_CODES[currCode].wsCode ? prevCode : currCode;
			}
		}
		return currCode;
	}

	// Build grouped codes
	type GroupedCode = { weatherCode: number; counts: Record<number, number> };
	const groupedCodes = hourlyData.reduce((accumulator: GroupedCode[], current) => {
		const prevItem = accumulator.at(-1);
		const prevCode = prevItem?.weatherCode;
		const prevPrecipGroup =
			prevCode !== undefined
				? precipitationGroup(prevCode)
				: precipitationGroup(current.weatherCode);

		let nextCode = determineNextCode(prevCode, current.weatherCode);
		const counts =
			prevItem !== undefined && prevPrecipGroup === precipitationGroup(nextCode)
				? prevItem.counts
				: {};
		counts[current.weatherCode] = counts[current.weatherCode] || 0;

		// Count all hours (unlike TimeLine.svelte which has a 25th fencepost item to skip)
		counts[current.weatherCode] += 1;

		// For clear/cloudy group (0), pick most common code
		if (precipitationGroup(nextCode) === 0) {
			nextCode = Number(
				maxByFn(Object.keys(counts), (code) => counts[Number(code)] + Number(code) / 100),
			);
		}

		if (prevItem && prevPrecipGroup === precipitationGroup(nextCode)) {
			accumulator[accumulator.length - 1] = { weatherCode: nextCode, counts };
		} else {
			accumulator.push({ weatherCode: nextCode, counts });
		}
		return accumulator;
	}, [] as GroupedCode[]);

	// Second pass: merge short gaps into surrounding precipitation segments
	// A gap is merged if:
	// 1. Its duration is <= MAX_GAP_HOURS hours, AND
	// 2. Its precipitation group is less severe than BOTH surrounding segments
	// NOTE: Similar logic exists in TimeLine.svelte for hourly display
	const MAX_GAP_HOURS = 1;

	// Need at least 3 segments to have a gap between two others
	if (groupedCodes.length >= 3) {
		for (let i = groupedCodes.length - 2; i >= 1; i--) {
			const gap = groupedCodes[i];
			const prev = groupedCodes[i - 1];
			const next = groupedCodes[i + 1];

			// Safety check - skip if any segment is undefined
			if (!gap || !prev || !next) continue;

			// Count hours in gap by summing counts
			const gapHours = Object.values(gap.counts).reduce((sum, n) => sum + n, 0);
			const gapGroup = precipitationGroup(gap.weatherCode);
			const prevGroup = precipitationGroup(prev.weatherCode);
			const nextGroup = precipitationGroup(next.weatherCode);

			// Merge if gap is short and less severe than both neighbors
			if (gapHours <= MAX_GAP_HOURS && gapGroup < prevGroup && gapGroup < nextGroup) {
				// Use the more severe weather code from surrounding segments
				const mergedCode =
					WMO_CODES[prev.weatherCode].wsCode > WMO_CODES[next.weatherCode].wsCode
						? prev.weatherCode
						: next.weatherCode;

				// Merge prev + gap + next into prev
				groupedCodes[i - 1] = {
					weatherCode: mergedCode,
					counts: { ...prev.counts, ...gap.counts, ...next.counts },
				};

				// Remove gap and next (they're now merged into prev)
				groupedCodes.splice(i, 2);
			}
		}
	}

	// Pick the most severe from the group representatives
	const mostSevereGroup = maxByFn(
		groupedCodes,
		(g) => (wmoCode(g.weatherCode) as WmoCodeInfo).wsCode ?? 0,
	);
	return mostSevereGroup?.weatherCode ?? null;
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

// Format temperature with unit conversion
// tempUnit: 'C' for Celsius, 'F' for Fahrenheit
export function formatTemp(temp: number, tempUnit: 'C' | 'F'): string {
	if (tempUnit === 'C') {
		return `${Math.round(celcius(temp) ?? 0)}°`;
	}
	return `${Math.round(temp)}°`;
}

// Get representative WMO code for a day's hourly data
// When groupIcons=true: uses grouped logic (most severe group representative)
// When groupIcons=false: returns the fallback code (typically from daily data)
export function getDayWmoCode(
	dayMs: number,
	fallbackCode: number,
	hourlyData: { ms: number; weatherCode: number }[] | undefined,
	groupIcons: boolean,
	maxByFn: <T>(arr: T[], fn: (item: T) => number) => T | undefined,
): number {
	if (!groupIcons) {
		return fallbackCode;
	}

	const dayStart = dayMs + DAY_START_HOUR * MS_IN_HOUR;
	const dayEnd = dayStart + 24 * MS_IN_HOUR;
	const hourlyInRange = hourlyData?.filter((h) => h.ms >= dayStart && h.ms < dayEnd);

	return getGroupedWmoCode(hourlyInRange ?? [], maxByFn) ?? fallbackCode;
}

export function summarize(arrayOrObject: unknown) {
	if (arrayOrObject) {
		if (Array.isArray(arrayOrObject)) {
			const array = arrayOrObject;
			const length = arrayOrObject.length;

			const summary: (string | unknown)[] = [`length: ${length}`];
			if (length > 0) {
				summary.push(array[0]);
			}
			if (length > 1) {
				summary.push(array[1]);
			}
			if (length > 4) {
				const skipped = length - 4;
				summary.push(`... (${skipped} skipped) ...`);
			}
			if (length > 3) {
				summary.push(array[length - 2]);
			}
			if (length > 2) {
				summary.push(array[length - 1]);
			}

			return summary;
		} else if (typeof arrayOrObject === 'object' && arrayOrObject !== null) {
			const object = arrayOrObject as Record<string, unknown>;
			const keys = Object.keys(object);
			const numKeys = keys.length;
			const summary: Record<string, unknown> = {};

			summary.numKeys = numKeys;

			if (numKeys > 1) {
				const key = keys[0];
				summary[key] = object[key];
			}
			if (numKeys > 1) {
				const key = keys[1];
				summary[key] = object[key];
			}
			if (numKeys > 4) {
				const skipped = numKeys - 4;
				summary._ = `... (${skipped} skipped) ...`;
			}
			if (numKeys > 3) {
				const key = keys[numKeys - 2];
				summary[key] = object[key];
			}
			if (numKeys > 2) {
				const key = keys[numKeys - 1];
				summary[key] = object[key];
			}

			return summary;
		}
	}

	return arrayOrObject;
}

// Sky gradient using sun altitude for smooth palette interpolation
import { getSunAltitude } from './horizon';
export { getSunAltitude };

// Bright color palettes for each phase (3 stops for gradient)
// Sky color palettes for different times of day
// Format for night/day: [top, middle, bottom] - all 3 used for both sky strip and sticky bg
// Format: [top, middle, bottom] for sticky bg gradient
// Sky strip for dawn/dusk uses [extended] and [bottom] (2-tone, no white/purple)
export const skyPalettes = {
	night: ['#000c26', '#0a2a5c', '#042388'], // dark blue top → mid blue → deep blue at horizon
	dawn: ['#fff0e6', '#ffd93d', '#ff6633'], // warm white top → golden → vivid orange (sky strip uses orange/golden)
	day: ['#f0f8ff', '#a8d8f0', '#6bb3e0'], // white top → light blue → blue at horizon
	dusk: ['#7455b8', '#ff6b6b', '#ffc400'], // purple top → coral → amber (sky strip uses amber top, coral bottom)
};

// Get sky strip palette for dawn/dusk (2-tone with calculated middle, omits white/purple at [0])
// Night/day return unchanged (all 3 colors used)
export function getSkyStripPalette(palette: string[], isDawnOrDusk: boolean): string[] {
	if (!isDawnOrDusk) return palette;
	// Dawn/dusk: use [1] and [2], with darker color at bottom
	const c1 = new Color(palette[1]);
	const c2 = new Color(palette[2]);
	// Compare luminance - lower luminance = darker
	const lum1 = c1.oklch.l ?? 0;
	const lum2 = c2.oklch.l ?? 0;
	// Lighter on top, darker on bottom
	const top = lum1 > lum2 ? palette[1] : palette[2];
	const bottom = lum1 > lum2 ? palette[2] : palette[1];
	const cTop = new Color(top);
	const cBottom = new Color(bottom);
	const middle = cTop.mix(cBottom, 0.5, { space: 'srgb' }).toString({ format: 'hex' });
	return [top, middle, bottom];
}

// ============================================================================
// FAST RGB FUNCTIONS - No Color.js, for hot render paths
// ============================================================================

// Parse hex color to RGB array (handles both 3 and 6 digit hex)
function hexToRgb(hex: string): [number, number, number] {
	let h = hex.startsWith('#') ? hex.slice(1) : hex;
	// Expand 3-digit shorthand (e.g., "f63" -> "ff6633")
	if (h.length === 3) {
		h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	}
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Convert RGB array to hex string (with validation)
function rgbToHex(r: number, g: number, b: number): string {
	// Clamp and handle NaN
	const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(isNaN(n) ? 0 : n)));
	return (
		'#' +
		clamp(r).toString(16).padStart(2, '0') +
		clamp(g).toString(16).padStart(2, '0') +
		clamp(b).toString(16).padStart(2, '0')
	);
}

// Fast RGB lerp between two hex colors (no Color.js)
function fastMixRgb(hex1: string, hex2: string, t: number): string {
	const [r1, g1, b1] = hexToRgb(hex1);
	const [r2, g2, b2] = hexToRgb(hex2);
	// Clamp t to valid range (rgbToHex handles RGB clamping)
	const clampedT = Math.max(0, Math.min(1, t));
	return rgbToHex(r1 + (r2 - r1) * clampedT, g1 + (g2 - g1) * clampedT, b1 + (b2 - b1) * clampedT);
}

// Fast lerp between two palettes (arrays of hex colors)
function fastLerpPalette(palette1: string[], palette2: string[], t: number): string[] {
	return palette1.map((c1, i) => fastMixRgb(c1, palette2[i], t));
}

// Export for direct color animation (skip dawn/dusk)
export { fastLerpPalette as lerpPaletteFast };

// ============================================================================
// PRE-COMPUTED SKY COLOR CACHE
// Eliminates Color.js from render loop by pre-computing all altitude steps
// ============================================================================

const ALTITUDE_STEP = 0.5; // degrees
const ALTITUDE_MIN = -18;
const ALTITUDE_MAX = 6;

// Cache structure: altitude -> palette (for each phase transition)
// Dawn: night(-18) -> dawn(-6) -> day(+6)
// Dusk: day(+6) -> dusk(-6) -> night(-18)
type SkyCache = {
	// Morning: interpolated palettes from night through dawn to day
	dawn: Map<number, string[]>;
	dawnStrip: Map<number, string[]>; // For sky strip (2-tone dawn)
	// Evening: interpolated palettes from day through dusk to night
	dusk: Map<number, string[]>;
	duskStrip: Map<number, string[]>; // For sky strip (2-tone dusk)
};

let skyColorCache: SkyCache | null = null;

// Build the cache using Color.js (called once at startup)
function buildSkyColorCache(): SkyCache {
	const cache: SkyCache = {
		dawn: new Map(),
		dawnStrip: new Map(),
		dusk: new Map(),
		duskStrip: new Map(),
	};

	// Pre-compute palettes for dawn/dusk strips (2-tone versions)
	const dawnPaletteFull = skyPalettes.dawn;
	const duskPaletteFull = skyPalettes.dusk;
	const dawnPaletteStrip = getSkyStripPalette(skyPalettes.dawn, true);
	const duskPaletteStrip = getSkyStripPalette(skyPalettes.dusk, true);

	for (let alt = ALTITUDE_MIN; alt <= ALTITUDE_MAX; alt += ALTITUDE_STEP) {
		// Round to avoid floating point issues as map key
		const key = Math.round(alt * 10) / 10;

		if (alt <= -6) {
			// Twilight zone: night -> dawn/dusk (-18 to -6)
			// Map -18° to -6° => t: 0 to 1
			const t = (alt + 18) / 12;
			cache.dawn.set(key, interpolatePalettes(skyPalettes.night, dawnPaletteFull, t));
			cache.dawnStrip.set(key, interpolatePalettes(skyPalettes.night, dawnPaletteStrip, t));
			cache.dusk.set(key, interpolatePalettes(skyPalettes.night, duskPaletteFull, t));
			cache.duskStrip.set(key, interpolatePalettes(skyPalettes.night, duskPaletteStrip, t));
		} else {
			// Golden hour: dawn/dusk -> day (-6 to +6)
			// Map -6° to 6° => t: 0 to 1
			const t = (alt + 6) / 12;
			cache.dawn.set(key, interpolatePalettes(dawnPaletteFull, skyPalettes.day, t));
			cache.dawnStrip.set(key, interpolatePalettes(dawnPaletteStrip, skyPalettes.day, t));
			cache.dusk.set(key, interpolatePalettes(duskPaletteFull, skyPalettes.day, t));
			cache.duskStrip.set(key, interpolatePalettes(duskPaletteStrip, skyPalettes.day, t));
		}
	}

	return cache;
}

// Get or create the cache
function getSkyColorCache(): SkyCache {
	if (!skyColorCache) {
		skyColorCache = buildSkyColorCache();
	}
	return skyColorCache;
}

// Fast sky color lookup using pre-computed cache + RGB lerp
function getSkyColorsCached(altitude: number, isMorning: boolean, forSkyStrip: boolean): string[] {
	// Handle edge cases
	if (altitude <= ALTITUDE_MIN) {
		return skyPalettes.night;
	}
	if (altitude >= ALTITUDE_MAX) {
		return skyPalettes.day;
	}

	const cache = getSkyColorCache();
	const cacheMap = isMorning
		? forSkyStrip
			? cache.dawnStrip
			: cache.dawn
		: forSkyStrip
			? cache.duskStrip
			: cache.dusk;

	// Find the two cached altitudes to interpolate between
	const lowerAlt = Math.floor(altitude / ALTITUDE_STEP) * ALTITUDE_STEP;
	const upperAlt = lowerAlt + ALTITUDE_STEP;

	// Round keys to avoid floating point issues
	const lowerKey = Math.round(lowerAlt * 10) / 10;
	const upperKey = Math.round(upperAlt * 10) / 10;

	const lowerPalette = cacheMap.get(lowerKey);
	const upperPalette = cacheMap.get(upperKey);

	if (!lowerPalette || !upperPalette) {
		// Fallback if cache miss - use closest available or static palette
		if (lowerPalette) return lowerPalette;
		if (upperPalette) return upperPalette;
		return altitude < 0 ? skyPalettes.night : skyPalettes.day;
	}

	// Fast RGB interpolation between cached values
	const t = (altitude - lowerAlt) / ALTITUDE_STEP;
	return fastLerpPalette(lowerPalette, upperPalette, t);
}

// Interpolate between two color palettes using colorjs.io
// TEMP: Pass colorSpace parameter to compare srgb vs srgb-linear between days
function interpolatePalettes(
	palette1: string[],
	palette2: string[],
	t: number,
	colorSpace = 'srgb',
): string[] {
	// Clamp t to 0-1
	const clampedT = Math.max(0, Math.min(1, t));
	return palette1.map((color1, i) => {
		const c1 = new Color(color1);
		const c2 = new Color(palette2[i]);
		const mixed = c1.mix(c2, clampedT, { space: colorSpace });
		return mixed.toString({ format: 'hex' });
	});
}

// Mix two colors by a factor (0 = color1, 1 = color2)
// Uses fast RGB interpolation for performance in hot render paths
export function mixColors(color1: string, color2: string, factor: number): string {
	return fastMixRgb(color1, color2, factor);
}

// Get max color delta between two color arrays
// Uses fast RGB Euclidean distance (normalized to ~0-1 range like deltaEOK)
export function colorsDelta(colors1: string[], colors2: string[]): number {
	let maxDelta = 0;
	for (let i = 0; i < colors1.length; i++) {
		const [r1, g1, b1] = hexToRgb(colors1[i]);
		const [r2, g2, b2] = hexToRgb(colors2[i]);
		// Euclidean distance in RGB, normalized to 0-1 range (max distance is sqrt(3*255^2) ≈ 441)
		const dist = Math.sqrt((r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2) / 441;
		maxDelta = Math.max(maxDelta, dist);
	}
	return maxDelta;
}

// Convert radians to degrees
function radToDeg(rad: number): number {
	return (rad * 180) / Math.PI;
}

// Internal function to get sky colors with option for sky strip (2-tone dawn/dusk) or full palette
// Uses pre-computed cache + fast RGB interpolation for performance
function getSkyColorsInternal(
	ms: number,
	sunrise: number,
	sunset: number,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_colorSpace: string = 'srgb-linear', // Kept for API compatibility, but cache uses srgb
	forSkyStrip = false,
): string[] {
	const altitudeRad = getSunAltitude(ms, sunrise, sunset);
	const altitude = radToDeg(altitudeRad);

	// Handle cross-midnight case for solar noon calculation
	// When sunrise > sunset (cross-timezone viewing), normalize times
	const normalizedSunrise = sunrise;
	let normalizedSunset = sunset;
	let normalizedMs = ms;

	if (sunrise > sunset) {
		const DAY_MS = 24 * 60 * 60 * 1000;
		// Shift sunset forward by 24h so sunrise < sunset
		normalizedSunset = sunset + DAY_MS;
		// If ms is before the original sunset, also shift it
		if (ms < sunset || ms >= sunrise) {
			// ms is in the "night" portion or after sunrise
			if (ms < sunset) {
				normalizedMs = ms + DAY_MS;
			}
			// ms >= sunrise stays as-is since sunrise < normalizedSunset now
		} else {
			// ms is between sunset and sunrise (daytime in this weird frame)
			normalizedMs = ms + DAY_MS;
		}
	}

	const solarNoon = (normalizedSunrise + normalizedSunset) / 2;
	const isMorning = normalizedMs < solarNoon;

	// Use fast cached lookup + RGB lerp instead of Color.js
	return getSkyColorsCached(altitude, isMorning, forSkyStrip);
}

// Get sky colors for sky strip (dawn/dusk use 2-tone palette without white/purple)
export function getSkyColors(
	ms: number,
	sunrise: number,
	sunset: number,
	colorSpace = 'srgb-linear',
): string[] {
	return getSkyColorsInternal(ms, sunrise, sunset, colorSpace, true);
}

// Get sky colors for sticky bg (full 3-color palette including white/purple)
export function getSkyColorsFullPalette(
	ms: number,
	sunrise: number,
	sunset: number,
	colorSpace = 'srgb-linear',
): string[] {
	return getSkyColorsInternal(ms, sunrise, sunset, colorSpace, false);
}
