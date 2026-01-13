/**
 * Nation State for weather data.
 *
 * The "Nation State" (NS) pattern creates a scope between local and global:
 * - Read-only outside: External code can only read values via getters
 * - Write via events: To modify state, emit a `weatherdata_requested*` event
 * - Centralized mutations: All writes happen inside the NS
 *
 * ## Event Naming Convention
 * - `weatherdata_requested*` = Command events (external → NS)
 * - `weatherdata_updated*` / `weatherdata_*Ended` = Notification events (NS → external)
 *
 * ## Hot vs Cold State
 *
 * HOT STATE (changes during scrubbing at 15fps - avoid in $derived/$effect):
 * - _hot.ms, _hot.rawMs, _hot.radarPlaying, _hot.trackedElement
 * - Use `weatherdata_frameTick` event or `rawMs` polling instead of reactive binding
 *
 * COLD STATE (changes on fetch/user action - safe for reactive binding):
 * - coords, timezone, units, hourly, daily, dataForecast, radar, etc.
 */

import { forEach } from 'lodash-es';

import { getEmitter } from '$lib/emitter';
import { gg } from '@leftium/gg';
import type { Coordinates, Radar } from '$lib/types';
import { MS_IN_MINUTE, MS_IN_SECOND, startOf } from './util';
import { browser } from '$app/environment';

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
		radar: Radar;
	};

	weatherdata_updatedData: undefined;

	weatherdata_requestedTrackingStart: { node: HTMLElement };

	weatherdata_requestedTrackingEnd: undefined;

	// Emitted at 15fps during tracking for synchronized tracker updates
	weatherdata_frameTick: { ms: number };

	// Emitted after tracking ends (notification for UI cleanup/animation)
	weatherdata_trackingEnded: undefined;
};

const DATEFORMAT_MASK = 'MM-DD hh:mma z';
const PAST_DAYS = 2; // 0 to 92
export const FORECAST_DAYS = 10; // 0 to 16 for forecast; 0 to 7 for air-quality;

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

	isDay: boolean;
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
	temperatureMax: number;
	temperatureMin: number;

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
	isDay: boolean;
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

/**
 * Hot state class - changes frequently during scrubbing (15fps).
 * Uses class fields with $state for fine-grained reactivity without proxy overhead.
 * WARNING: Avoid using these in $derived/$effect - use events or rawMs instead.
 */
class HotState {
	/** Reactive time for rendering */
	ms = $state(Date.now());
	/** Non-reactive for polling (avoids Svelte overhead) */
	rawMs = Date.now();
	/** Whether radar animation is playing */
	radarPlaying = $state(false);
	/** Currently tracked element (during scrubbing) */
	trackedElement = $state<HTMLElement | null>(null);
	/** RAF loop ID (internal) */
	frameRafId: number | null = null;
	/** Last frame timestamp (internal) */
	lastFrameTime = 0;
}

export function makeNsWeatherData() {
	//gg('makeNsWeatherData');

	// ==========================================================================
	// HOT STATE - Changes frequently during scrubbing (15fps)
	// ==========================================================================
	const _hot = new HotState();
	const FRAME_INTERVAL = 1000 / 15; // 15fps

	// ==========================================================================
	// COLD STATE - Changes on fetch/user action (safe for reactive binding)
	// ==========================================================================

	// Location inputs
	let coords: Coordinates | null = $state(null);
	let name: string | null = $state(null);
	let source: string = $state('???');

	// Timezone
	let timezone = $state('Greenwich'); // GMT
	let timezoneAbbreviation = $state('GMT'); // GMT
	let utcOffsetSeconds = $state(0);

	// Radar (cold - frames change on fetch, not during playback)
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

	// temperatureStats moved to weather-utils.ts - use getTemperatureStats(ns.dataForecast)

	const dataAirQuality = $derived.by(() => {
		gg('dataAirQuality:derive');
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Map is recreated on each derivation
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
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Map is recreated on each derivation
		const newData: Map<number, ForecastItem> = new Map();
		if (!browser || !omForecast) {
			gg('dataForecast:empty');
			return newData;
		}

		//console.table(summarize($state.snapshot(hourly)));
		console.time('dataForecast');

		omForecast.hourly.forEach((item) => {
			const ms = item.ms;

			// Precipitation
			const precipitation = item.precipitation ?? 0;

			newData.set(ms, {
				msPretty: nsWeatherData.tzFormat(ms, DATEFORMAT_MASK),
				ms,

				isDay: item.isDay ?? true,
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

	// intervals moved to weather-utils.ts - use getIntervals(ns.hourly, ns.radar?.frames)

	const units = $state({
		temperature: 'F' as 'C' | 'F',
	});

	// const trackedElement: HTMLElement | null = $state(null); // TODO: implement tracking

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
		if (!coords) {
			gg('fetchOpenMeteoAirQuality: No coordinates available');
			return;
		}
		gg('fetchOpenMeteoAirQuality:start');
		console.time('fetchOpenMeteoAirQuality');
		const url =
			`https://air-quality-api.open-meteo.com/v1/air-quality` +
			`?latitude=${coords.latitude}&longitude=${coords.longitude}` +
			`&timeformat=unixtime&timezone=auto&past_days=${PAST_DAYS}&forecast_days=${Math.min(7, FORECAST_DAYS)}` +
			`&current=us_aqi,european_aqi` +
			`&hourly=us_aqi,european_aqi`;

		let json;
		try {
			const fetched = await fetch(url);
			if (!fetched.ok) {
				console.error(`fetchOpenMeteoAirQuality failed: ${fetched.status}`);
				return;
			}
			json = await fetched.json();
		} catch (error) {
			console.error('fetchOpenMeteoAirQuality error:', error);
			return;
		}

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
		if (!coords) {
			gg('fetchOpenMeteoForecast: No coordinates available');
			return;
		}
		gg('fetchOpenMeteoForecast:start');
		console.time('fetchOpenMeteoForecast');
		const url =
			`https://api.open-meteo.com/v1/forecast` +
			`?latitude=${coords.latitude}&longitude=${coords.longitude}` +
			`&timeformat=unixtime&timezone=auto&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}` +
			`&temperature_unit=fahrenheit` +
			`&current=temperature_2m,relative_humidity_2m,is_day,precipitation,rain,showers,snowfall,weather_code` +
			`&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,dew_point_2m,is_day` +
			`&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,precipitation_probability_max`;

		let json;
		try {
			const fetched = await fetch(url);
			if (!fetched.ok) {
				console.error(`fetchOpenMeteoForecast failed: ${fetched.status}`);
				return;
			}
			json = await fetched.json();
		} catch (error) {
			console.error('fetchOpenMeteoForecast error:', error);
			return;
		}

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
					// Ensure we always have a number, never null/undefined
					const safeValue = typeof value === 'number' ? value : 0;
					(object as Record<string, number | string>)[keyData] = safeValue;
				});

				// Handle is_day separately as boolean
				object.isDay = json.hourly.is_day?.[index] === 1;

				return object as HourlyForecast;
			})
			.filter((hourlyForecast: HourlyForecast) => {
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
			.filter((dailyForecast: DailyForecast) => {
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
			// Load all the available map frames from RainViewer API via proxy to avoid CORS
			let rainviewerData;
			try {
				const fetched = await fetch('/api/rainviewer/weather-maps');
				if (!fetched.ok) {
					console.error(`fetchRainviewerData failed: ${fetched.status}`);
					return;
				}
				rainviewerData = await fetched.json();
			} catch (error) {
				console.error('fetchRainviewerData error:', error);
				return;
			}

			const frames = (rainviewerData.radar?.past || [])
				.concat(rainviewerData.radar?.nowcast || [])
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

			const generated = (rainviewerData.generated || 0) * 1000;
			radar = {
				generatedPretty: nsWeatherData.tzFormat(generated),
				generated: generated,
				msStart,
				msEnd,
				host: rainviewerData.host || '',
				frames,
			};
			emit('weatherdata_updatedRadar', { radar: nsWeatherData.radar });
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
				try {
					const resp = await fetch(
						`/api/geo/reverse?lat=${params.coords.latitude}&lon=${params.coords.longitude}`,
					);
					if (resp.ok) {
						const json = await resp.json();
						const result = json?.[0];
						if (result?.name) {
							name = `${result.name}, ${result.state || result.country}`;
						}
					}
				} catch (error) {
					console.error('Reverse geocoding error:', error);
					// Keep name as '...' or previous value
				}
			}

			//gg({ name, coords, params });

			fetchOpenMeteoForecast();
			fetchOpenMeteoAirQuality();
		});

		on('weatherdata_requestedSetTime', function (params) {
			// gg('weatherdata_requestedSetTime', params);

			// Always update non-reactive rawMs (for polling components)
			_hot.rawMs = params.ms;

			// Only update reactive ms when NOT tracking (avoids Svelte overhead during scrub)
			if (!_hot.trackedElement) {
				_hot.ms = params.ms;
			}

			const msMaxRadar = (radar.frames.at(-1)?.ms || 0) + 10 * MS_IN_MINUTE;
			if (_hot.rawMs > msMaxRadar) {
				_hot.radarPlaying = false;
				if (!_hot.trackedElement) {
					_hot.rawMs = Date.now();
					_hot.ms = Date.now();
					resetRadarOnPlay = true;
				}
			}
		});

		on('weatherdata_requestedTrackingStart', function (params) {
			//gg('weatherdata_requestedTrackingStart');
			_hot.trackedElement = params.node;

			// Start RAF-based frame loop at 15fps for synchronized tracker rendering
			if (_hot.frameRafId === null) {
				_hot.lastFrameTime = performance.now();
				function frameTick(now: number) {
					if (_hot.frameRafId === null) return; // Stopped

					if (now - _hot.lastFrameTime >= FRAME_INTERVAL) {
						_hot.lastFrameTime = now;
						// Update reactive ms at 15fps (for sticky time display)
						_hot.ms = _hot.rawMs;
						emit('weatherdata_frameTick', { ms: _hot.rawMs });
					}

					_hot.frameRafId = requestAnimationFrame(frameTick);
				}
				_hot.frameRafId = requestAnimationFrame(frameTick);
			}
		});

		on('weatherdata_requestedTrackingEnd', function () {
			//gg('weatherdata_requestedTrackingEnd');
			_hot.trackedElement = null;
			_hot.rawMs = Date.now();
			_hot.ms = Date.now();

			// Stop frame loop
			if (_hot.frameRafId !== null) {
				cancelAnimationFrame(_hot.frameRafId);
				_hot.frameRafId = null;
			}

			// Emit final frame tick so animations can complete
			emit('weatherdata_frameTick', { ms: _hot.rawMs });

			// Notify listeners that tracking has ended (for UI cleanup/animation)
			emit('weatherdata_trackingEnded');
		});

		on('weatherdata_requestedTogglePlay', function () {
			_hot.radarPlaying = !_hot.radarPlaying;

			if (resetRadarOnPlay && radar.frames?.length) {
				_hot.rawMs = radar.frames[0].ms;
				_hot.ms = radar.frames[0].ms;
			}
			resetRadarOnPlay = false;
		});

		on('weatherdata_requestedToggleUnits', function (params) {
			if (params.temperature) {
				if (
					typeof params.temperature === 'string' &&
					(params.temperature === 'C' || params.temperature === 'F')
				) {
					units.temperature = params.temperature;
				} else {
					units.temperature = units.temperature === 'F' ? 'C' : 'F';
				}
			}
		});
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

		// --- Hot state (changes at 15fps during scrubbing) ---
		// WARNING: Avoid using these in $derived/$effect - use events or rawMs instead
		get ms() {
			return _hot.ms;
		},

		// Non-reactive ms for polling-based updates (trackers, etc.)
		get rawMs() {
			return _hot.rawMs;
		},

		get radarPlaying() {
			return _hot.radarPlaying;
		},

		get trackedElement() {
			return _hot.trackedElement;
		},

		// --- Cold state (safe for reactive binding) ---
		get radar() {
			return radar;
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

		// temperatureStats removed - use getTemperatureStats(ns.dataForecast) from weather-utils.ts

		get units() {
			return units;
		},

		// intervals removed - use getIntervals(ns.hourly, ns.radar?.frames) from weather-utils.ts

		// Display values moved to $lib/weather-utils.ts - use getDisplayBundle(ns) instead

		get timezone() {
			return timezone;
		},

		get timezoneAbbreviation() {
			return timezoneAbbreviation;
		},

		get utcOffsetSeconds() {
			return utcOffsetSeconds;
		},

		// utcOffsetMs removed - use utcOffsetSeconds * MS_IN_SECOND

		// format() method moved to $lib/weather-utils.ts - use formatTemp() instead

		tzFormat(ms: number, format = 'ddd MMM D, h:mm:ss.SSSa z') {
			return dayjs.tz(ms, timezone).format(format).replace('z', timezoneAbbreviation);
		},
	};

	return nsWeatherData;
}
