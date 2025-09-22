// Defines nation-state for weather data.

import { forEach, get, map, maxBy, minBy, uniq } from 'lodash-es';

import { getEmitter } from '$lib/emitter';
import { gg } from '$lib/gg';
import type { Coordinates, Radar } from '$lib/types';
import { MS_IN_MINUTE, MS_IN_SECOND, celcius, startOf } from './util';
import { browser, dev } from '$app/environment';

export type WeatherDataEvents = {
	weatherdata_requestedSetLocation: {
		source: string;
		coords?: Coordinates;
		name?: string;
	};

	weatherdata_requestedSetTime: {
		ms: number;
	};

	weatherdata_requestedToggleUnits: {
		temperature: boolean | string;
	};

	weatherdata_requestedTogglePlay: undefined;

	weatherdata_requestedFetchRainviewerData: undefined;

	weatherdata_updatedRadar: {
		nsWeatherData: NsWeatherData;
	};

	weatherdata_updatedData: undefined;

	weatherdata_requestedTrackingStart: { node: HTMLElement };

	weatherdata_requestedTrackingEnd: undefined;
};

const DATEFORMAT_MASK = 'MM-DD hh:mma z';
const PAST_DAYS = dev ? 2 : 2; // 0 to 92
const FORECAST_DAYS = 16; // 0 to 16 for forecast; 0 to 7 for air-quality;

const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

export type AirQuality = {
	ms: number;
	msPretty?: string;

	aqiUs: number;
	aqiEurope: number;
};

type CurrentForecast = {
	ms: number;
	msPretty: string;
	isDay: boolean;
	weatherCode: number;
	temperature: number;

	precipitation: number;
	rain: number;
	humidity: number;
	showers: number;
	snowfall: number;
};

export type HourlyForecast = {
	ms: number;
	msPretty: string;

	weatherCode: number;
	temperature: number;

	relativeHumidity: number;
	dewPoint: number;

	precipitationProbability: number;
	precipitation: number;
};

export type DailyForecast = {
	ms: number;
	msPretty: string;
	compactDate: string;
	fromToday: number;

	sunrise: number;
	sunset: number;

	isDay: boolean;
	weatherCode: number;
	temperature: number;

	precipitation: number;
	rain: number;
	humidity: number;
	showers: number;
	snowfall: number;
};

export type NsWeatherData = ReturnType<typeof makeNsWeatherData>;

type ForecastItem = {
	msPretty?: string;
	ms: number;

	// From omForecast:
	temperature: number;
	weatherCode: number;
	humidity: number;
	dewPoint: number;
	precipitation: number;
	precipitationProbability: number;

	// From omAirQuality:
	// aqiUs: number;
	// aqiEurope: number;

	// From OpenWeather:
	// TBD
};

type AirQualityItem = {
	msPretty?: string;
	ms: number;

	// From omAirQuality:
	aqiUs: number;
	aqiEurope: number;
};

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezonePlugin from 'dayjs/plugin/timezone';
import { tick, untrack } from 'svelte';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

export function makeNsWeatherData() {
	//gg('makeNsWeatherData');

	// Inputs:
	let coords: Coordinates | null = $state(null);
	let name: string | null = $state(null);
	let source: string = $state('???');

	// The time (in ms) for which to render weather data:
	let msTracker = $state(Date.now());

	// The timezone for this data.
	let timezone = $state('Greenwich'); // GMT
	let timezoneAbbreviation = $state('GMT'); // GMT
	let utcOffsetSeconds = $state(0);

	let radarPlaying = $state(false);
	let resetRadarOnPlay = $state(true);
	let radar: Radar = $state({ generated: 0, host: '', frames: [] });

	let omForecast: null | {
		current: CurrentForecast;
		hourly: HourlyForecast[];
		daily: DailyForecast[];
	} = $state(null);

	let omAirQuality: null | {
		current: AirQuality;
		hourly: AirQuality[];
	} = $state(null);

	const minTemperature = $derived.by(() => {
		return !omForecast
			? 0
			: Math.min(
					minBy(omForecast.hourly, 'temperature')?.temperature ?? Number.MAX_VALUE,
					minBy(omForecast.hourly, 'dewPoint')?.dewPoint ?? Number.MAX_VALUE,
				);
	});

	const maxTemperature = $derived.by(() => {
		return !omForecast
			? 0
			: (maxBy(omForecast.hourly, 'temperature')?.temperature ?? Number.MIN_VALUE);
	});

	const temperatureRange = $derived(maxTemperature - minTemperature);

	const temperatureStats = $derived({ minTemperature, maxTemperature, temperatureRange });

	const dataAirQuality = $derived.by(() => {
		gg('dataAirQuality:derive');
		const newData: Map<number, AirQualityItem> = new Map();
		if (!browser || !omAirQuality) {
			gg('dataAirQuality:empty');
			return newData;
		}

		//console.table(summarize($state.snapshot(hourly)));
		console.time('dataAirQuality');

		omAirQuality.hourly.forEach((item) => {
			const ms = item.ms;

			newData.set(ms, {
				msPretty: nsWeatherData.tzFormat(ms, DATEFORMAT_MASK),
				ms,

				aqiUs: item.aqiUs,
				aqiEurope: item.aqiEurope,
			});
		});
		console.timeEnd('dataAirQuality');

		untrack(() => {
			gg('dataAirQuality.size:', newData.size);
		});
		return newData;
	});

	const dataForecast = $derived.by(() => {
		gg('dataForecast:derive');
		const newData: Map<number, ForecastItem> = new Map();
		if (!browser || !omForecast) {
			gg('dataForecast:empty');
			return newData;
		}

		//console.table(summarize($state.snapshot(hourly)));
		console.time('dataForecast');

		omForecast.hourly.forEach((item) => {
			const ms = item.ms;
			const hour = dayjs.tz(ms, timezone).get('hour');

			// Fake precipitation in dev mode:
			const precipitation = false && dev ? (50 / 23) * hour : (item.precipitation ?? 0);

			newData.set(ms, {
				msPretty: nsWeatherData.tzFormat(ms, DATEFORMAT_MASK),
				ms,

				weatherCode: item.weatherCode ?? 0,

				temperature: item.temperature ?? 0,
				dewPoint: item.dewPoint ?? 0,

				humidity: item.relativeHumidity ?? 0,

				precipitationProbability: item.precipitationProbability ?? 0,
				precipitation,
			});
		});
		console.timeEnd('dataForecast');

		untrack(() => {
			gg('dataForecast.size:', newData.size);
		});
		return newData;
	});

	type IntervalItem = {
		msPretty?: string;
		x2Pretty?: string;
		ms: number;
		x2: number;
	};

	let intervals = $derived.by(() => {
		if (!browser || !omForecast) {
			return [];
		}

		const msIntervals: number[] = [];
		const intervals: IntervalItem[] = [];

		omForecast.hourly.forEach((item) => {
			msIntervals.push(item.ms);
		});

		radar.frames.forEach((item) => {
			msIntervals.push(item.ms);
		});

		const finalFrame = radar.frames.at(-1);
		if (finalFrame) {
			msIntervals.push(finalFrame.ms + 10 * MS_IN_MINUTE);
		}

		uniq(msIntervals)
			.sort()
			.forEach((ms, index, msIntervals) => {
				const x2 = msIntervals[index + 1] - 1;
				intervals.push({
					msPretty: nsWeatherData.tzFormat(ms),
					x2Pretty: nsWeatherData.tzFormat(x2),
					ms,
					x2,
				});
			});

		return intervals;
	});

	let units = $state({
		temperature: 'F',
	});

	let trackedElement: HTMLElement | null = $state(null);

	const unitsUsed: Record<string, keyof typeof units> = {
		temperature: 'temperature',
		temperatureMax: 'temperature',
		temperatureMin: 'temperature',
		displayTemperature: 'temperature',
		displayDewPoint: 'temperature',
	};

	const hourlyKeys = {
		weather_code: 'weatherCode',
		temperature_2m: 'temperature',
		relative_humidity_2m: 'relativeHumidity',
		dew_point_2m: 'dewPoint',
		precipitation_probability: 'precipitationProbability',
		precipitation: 'precipitation',
	};

	const dailyKeys = {
		weather_code: 'weatherCode',
		temperature_2m_max: 'temperatureMax',
		temperature_2m_min: 'temperatureMin',
		precipitation_sum: 'precipitation',
		rain_sum: 'rain',
		showers_sum: 'showers',
		snowfall_sum: 'snow',
		precipitation_hours: 'precipitationHours',
		precipitation_probability_max: 'precipitationProbabilityMax',
	};

	async function fetchOpenMeteoAirQuality() {
		gg('fetchOpenMeteoAirQuality:start');
		console.time('fetchOpenMeteoAirQuality');
		const url =
			`https://air-quality-api.open-meteo.com/v1/air-quality` +
			`?latitude=${coords?.latitude}&longitude=${coords?.longitude}` +
			`&timeformat=unixtime&timezone=auto&past_days=${PAST_DAYS}&forecast_days=${Math.min(7, FORECAST_DAYS)}` +
			`&current=us_aqi,european_aqi` +
			`&hourly=us_aqi,european_aqi`;

		const fetched = await fetch(url);
		const json = await fetched.json();

		timezone = json.timezone;
		timezoneAbbreviation = json.timezone_abbreviation;
		utcOffsetSeconds = json.utc_offset_seconds;

		const current = {
			msPretty: nsWeatherData.tzFormat(json.current.time * MS_IN_SECOND, DATEFORMAT_MASK),
			ms: json.current.time * MS_IN_SECOND,

			aqiUs: json.current.us_aqi,
			aqiEurope: json.current.european_aqi,
		};

		const hourly = json.hourly.time.map((unixtime: number, index: number) => {
			const ms = unixtime * MS_IN_SECOND;

			const aqiUs = json.hourly.us_aqi[index];

			const object: Partial<AirQuality> = {
				msPretty: nsWeatherData.tzFormat(ms, DATEFORMAT_MASK),
				ms,
				aqiUs,
				aqiEurope: json.hourly.european_aqi[index],
			};

			return object as HourlyForecast;
		});

		omAirQuality = {
			current,
			hourly,
		};

		console.timeEnd('fetchOpenMeteoAirQuality');

		emit('weatherdata_updatedData');
		gg('fetchOpenMeteoAirQuality', {
			current: $state.snapshot(omAirQuality.current),
			json: $state.snapshot(json),
		});

		// Ensure pretty timestamps are in correct timezone:
		await tick();
		if (radar.generated) {
			radar.generatedPretty = nsWeatherData.tzFormat(radar.generated);

			radar.frames = radar.frames.map((frame) => ({
				...frame,
				msPretty: nsWeatherData.tzFormat(frame.ms),
			}));
		}
	}

	async function fetchOpenMeteoForecast() {
		gg('fetchOpenMeteoForecast:start');
		console.time('fetchOpenMeteoForecast');
		const url =
			`https://api.open-meteo.com/v1/forecast` +
			`?latitude=${coords?.latitude}&longitude=${coords?.longitude}` +
			`&timeformat=unixtime&timezone=auto&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}` +
			`&temperature_unit=fahrenheit` +
			`&current=temperature_2m,relative_humidity_2m,is_day,precipitation,rain,showers,snowfall,weather_code` +
			`&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,dew_point_2m` +
			`&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,precipitation_probability_max`;

		const fetched = await fetch(url);
		const json = await fetched.json();

		timezone = json.timezone;
		timezoneAbbreviation = json.timezone_abbreviation;
		utcOffsetSeconds = json.utc_offset_seconds;

		const current = {
			msPretty: nsWeatherData.tzFormat(json.current.time * MS_IN_SECOND, DATEFORMAT_MASK),
			ms: json.current.time * MS_IN_SECOND,
			isDay: json.current.is_day === 1,
			weatherCode: json.current.weather_code,
			temperature: json.current.temperature_2m,

			precipitation: json.current.precipitation,
			rain: json.current.rain,
			humidity: json.current.relative_humidity_2m,
			showers: json.current.showers,
			snowfall: json.current.snowfall,
		};

		const hourly = json.hourly.time
			.map((unixtime: number, index: number) => {
				const ms = unixtime * MS_IN_SECOND;
				const object: Partial<HourlyForecast> = {
					msPretty: nsWeatherData.tzFormat(ms, DATEFORMAT_MASK),
					ms,
				};

				forEach(hourlyKeys, (keyData: string, keyOpenMeteo: string | number) => {
					const value = json.hourly[keyOpenMeteo]?.[index];
					object[keyData as keyof HourlyForecast] = value ?? 0;
				});

				return object as HourlyForecast;
			})
			.filter((hourlyForecast: HourlyForecast, index: number) => {
				return hourlyForecast.weatherCode !== null;
			});

		const daily = json.daily.time
			.map((unixtime: number, index: number) => {
				const ms = unixtime * MS_IN_SECOND;
				const compactDate =
					index === PAST_DAYS
						? 'Today'
						: nsWeatherData.tzFormat(
								ms,
								index < PAST_DAYS - 7 || index > PAST_DAYS + 7 ? 'MMM-DD' : 'dd-DD',
							);

				const sunrise = json.daily.sunrise[index] * MS_IN_SECOND;
				const sunset = json.daily.sunset[index] * MS_IN_SECOND;

				const object: Partial<DailyForecast> = {
					msPretty: nsWeatherData.tzFormat(ms, DATEFORMAT_MASK),
					compactDate,
					ms,
					fromToday: index - PAST_DAYS,
					sunrise,
					sunset,
				};

				forEach(dailyKeys, (newKey: string, openMeteoKey: string | number) => {
					object[newKey as keyof DailyForecast] = json.daily[openMeteoKey][index];
				});

				return object as DailyForecast;
			})
			.filter((dailyForecast: DailyForecast, index: number) => {
				return dailyForecast.weatherCode !== null;
			});

		omForecast = {
			current,
			daily,
			hourly,
		};

		console.timeEnd('fetchOpenMeteoForecast');

		emit('weatherdata_updatedData');
		gg('fetchOpenMeteoForecast', {
			current: $state.snapshot(omForecast.current),
			json: $state.snapshot(json),
		});

		// Ensure pretty timestamps are in correct timezone:
		await tick();
		if (radar.generated) {
			radar.generatedPretty = nsWeatherData.tzFormat(radar.generated);

			radar.frames = radar.frames.map((frame) => ({
				...frame,
				msPretty: nsWeatherData.tzFormat(frame.ms),
			}));
		}
	}

	if (browser) {
		on('weatherdata_requestedFetchRainviewerData', async function () {
			// Load all the available map frames from RainViewer API.
			const fetched = await fetch('https://api.rainviewer.com/public/weather-maps.json');
			const rainviewerData = await fetched.json();

			const frames = (rainviewerData.radar.past || [])
				.concat(rainviewerData.radar.nowcast || [])
				.map((frame: { time: number; path: string }) => {
					const ms = frame.time * MS_IN_SECOND;
					return {
						msPretty: nsWeatherData.tzFormat(ms),
						ms,
						path: frame.path,
					};
				});

			const msStart = frames[0]?.ms;
			const msLast = frames.at(-1)?.ms;
			const msEnd = msLast ? msLast + 10 * MS_IN_MINUTE : undefined;

			const generated = rainviewerData.generated * 1000;
			radar = {
				generatedPretty: nsWeatherData.tzFormat(generated),
				generated: generated,
				msStart,
				msEnd,
				host: rainviewerData.host,
				frames,
			};
			emit('weatherdata_updatedRadar', { nsWeatherData });
		});

		on('weatherdata_requestedSetLocation', async function (params) {
			gg('weatherdata_requestedSetLocation', params);

			source = params.source;

			if (params.coords) {
				coords = {
					latitude: params.coords.latitude,
					longitude: params.coords.longitude,
					accuracy: params.coords.accuracy,
				};
			} else if (params.name) {
				// coords = GEOCODE(params.name)
			}

			if (params.name) {
				name = params.name;
			} else if (params.coords) {
				name = '...';
				// name = REVERSE_GEOCODE(params.coords)
				const resp = await fetch(
					`/api/geo/reverse?lat=${params.coords.latitude}&lon=${params.coords.longitude}`,
				);
				const json = await resp.json();
				const result = json[0];

				name = `${result.name}, ${result.state || result.country}`;
			}

			//gg({ name, coords, params });

			fetchOpenMeteoForecast();
			fetchOpenMeteoAirQuality();
		});

		on('weatherdata_requestedSetTime', function (params) {
			// gg('weatherdata_requestedSetTime', params);

			msTracker = params.ms;

			const msMaxRadar = (radar.frames.at(-1)?.ms || 0) + 10 * MS_IN_MINUTE;
			if (msTracker > msMaxRadar) {
				radarPlaying = false;
				if (!trackedElement) {
					msTracker = Date.now();
					resetRadarOnPlay = true;
				}
			}
		});

		on('weatherdata_requestedTrackingStart', function (params) {
			//gg('weatherdata_requestedTrackingStart');
			trackedElement = params.node;
		});

		on('weatherdata_requestedTrackingEnd', function () {
			//gg('weatherdata_requestedTrackingEnd');
			trackedElement = null;
			msTracker = Date.now();
		});

		on('weatherdata_requestedTogglePlay', function () {
			radarPlaying = !radarPlaying;

			if (resetRadarOnPlay) {
				msTracker = radar.frames[0].ms;
			}
			resetRadarOnPlay = false;
		});

		on('weatherdata_requestedToggleUnits', function (params) {
			if (params.temperature) {
				if (typeof params.temperature === 'string' && ['C', 'F'].includes(params.temperature)) {
					units.temperature = params.temperature;
				} else {
					units.temperature = units.temperature === 'F' ? 'C' : 'F';
				}
			}
		});
	}

	function formatTemperature(n: number, { unit, showUnits }: { unit: string; showUnits: boolean }) {
		if (unit === 'F') {
			let formatted = `${Math.floor(n)}°`;
			if (showUnits) {
				formatted = formatted + 'F';
			}
			return formatted;
		}
		if (unit === 'C') {
			let formatted = `${celcius(n)?.toFixed(1)}°`;
			if (showUnits) {
				formatted = formatted + 'C';
			}
			return formatted;
		}
		return null;
	}

	const nsWeatherData = {
		get source() {
			return source;
		},

		get coords() {
			return coords;
		},

		get name() {
			return name;
		},

		get ms() {
			return msTracker;
		},

		get radar() {
			return radar;
		},

		get radarPlaying() {
			return radarPlaying;
		},

		get current() {
			return { ...omForecast?.current };
		},

		get hourly() {
			return omForecast?.hourly;
		},

		get daily() {
			return omForecast?.daily.toSpliced(-1, 1);
		},

		get dataAirQuality() {
			return dataAirQuality;
		},

		get dataForecast() {
			return dataForecast;
		},

		get temperatureStats() {
			return temperatureStats;
		},

		get units() {
			return units;
		},

		get intervals() {
			return intervals;
		},

		get trackedElement() {
			return trackedElement;
		},

		get displayTemperature() {
			return dataForecast.get(startOf(msTracker, 'hour', timezone))?.temperature;
		},

		get displayWeatherCode() {
			return dataForecast.get(startOf(msTracker, 'hour', timezone))?.weatherCode;
		},

		get displayHumidity() {
			return dataForecast.get(startOf(msTracker, 'hour', timezone))?.humidity;
		},

		get displayDewPoint() {
			return dataForecast.get(startOf(msTracker, 'hour', timezone))?.dewPoint;
		},

		get displayPrecipitation() {
			return dataForecast.get(startOf(msTracker, 'hour', timezone))?.precipitation.toFixed(1);
		},

		get displayPrecipitationProbability() {
			return dataForecast.get(startOf(msTracker, 'hour', timezone))?.precipitationProbability;
		},

		get displayAqiUs() {
			return dataAirQuality.get(startOf(msTracker, 'hour', timezone))?.aqiUs;
		},

		get displayAqiEurope() {
			return dataAirQuality.get(startOf(msTracker, 'hour', timezone))?.aqiEurope;
		},

		get timezone() {
			return timezone;
		},

		get timezoneAbbreviation() {
			return timezoneAbbreviation;
		},

		get utcOffsetSeconds() {
			return utcOffsetSeconds;
		},

		get utcOffsetMs() {
			return utcOffsetSeconds * MS_IN_SECOND;
		},

		// Converts units, rounds to appropriate digits, and adds units label.
		format(dataPath: string, showUnits = true) {
			const key = dataPath.replace(/.*\./, '') as keyof typeof unitsUsed;
			const unit = units[unitsUsed[key]];
			const n = get(nsWeatherData, dataPath);

			if (n === undefined) {
				return '...';
			}
			return formatTemperature(n, { unit, showUnits }) || `${n} unknown unit: ${unit}`;
		},

		tzFormat(ms: number, format = 'ddd MMM D, h:mm:ss.SSSa z') {
			return dayjs.tz(ms, timezone).format(format).replace('z', timezoneAbbreviation);
		},
	};

	return nsWeatherData;
}
