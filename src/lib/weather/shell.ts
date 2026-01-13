/**
 * I/O orchestrator for weather data.
 *
 * This is the "Actions" layer in Grokking Simplicity terms:
 * - All I/O lives here (fetch, timers, events, DOM)
 * - Reads/writes the data layer
 * - Emits snapshots to components
 *
 * Components never import this directly - they receive snapshots via events.
 */

import { browser } from '$app/environment';
import { getEmitter } from '$lib/emitter';
import { gg } from '@leftium/gg';

import type { WeatherData } from './data.svelte';
import { getSnapshot, tzFormat } from './calc';
import type {
	WeatherDataEvents,
	HourlyForecast,
	DailyForecast,
	AirQuality,
	PAST_DAYS,
	FORECAST_DAYS,
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

const MS_IN_SECOND = 1000;
const MS_IN_MINUTE = 60 * MS_IN_SECOND;
const FRAME_INTERVAL = 1000 / 15; // 15fps
const DATEFORMAT_MASK = 'MM-DD hh:mma z';
const PAST_DAYS_VALUE = 2;
const FORECAST_DAYS_VALUE = 10;

// Key mappings for Open-Meteo API response parsing
const hourlyKeys: Record<string, string> = {
	weather_code: 'weatherCode',
	temperature_2m: 'temperature',
	relative_humidity_2m: 'relativeHumidity',
	dew_point_2m: 'dewPoint',
	precipitation_probability: 'precipitationProbability',
	precipitation: 'precipitation',
};

const dailyKeys: Record<string, string> = {
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

// =============================================================================
// SHELL INITIALIZATION
// =============================================================================

/**
 * Initialize the weather shell (I/O orchestrator).
 *
 * Call this once when the app starts. Returns a destroy function for cleanup.
 */
export function initWeatherShell(data: WeatherData) {
	if (!browser) {
		return { destroy: () => {} };
	}

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	// RAF tracking state
	let frameRafId: number | null = null;
	let lastFrameTime = 0;
	let resetRadarOnPlay = true;

	// =========================================================================
	// SNAPSHOT EMISSION
	// =========================================================================

	function emitSnapshot() {
		emit('weatherdata_snapshot', getSnapshot(data));
		// Also emit legacy event for components that haven't migrated yet
		emit('weatherdata_updatedData');
	}

	// =========================================================================
	// FETCH FUNCTIONS
	// =========================================================================

	async function fetchOpenMeteoForecast() {
		if (!data.coords) {
			gg('fetchOpenMeteoForecast: No coordinates available');
			return;
		}

		gg('fetchOpenMeteoForecast:start');
		console.time('fetchOpenMeteoForecast');

		const url =
			`https://api.open-meteo.com/v1/forecast` +
			`?latitude=${data.coords.latitude}&longitude=${data.coords.longitude}` +
			`&timeformat=unixtime&timezone=auto&past_days=${PAST_DAYS_VALUE}&forecast_days=${FORECAST_DAYS_VALUE}` +
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

		// Update timezone
		data.timezone = json.timezone;
		data.timezoneAbbreviation = json.timezone_abbreviation;
		data.utcOffsetSeconds = json.utc_offset_seconds;

		// Parse current
		const current = {
			msPretty: tzFormat(
				json.current.time * MS_IN_SECOND,
				data.timezone,
				data.timezoneAbbreviation,
				DATEFORMAT_MASK,
			),
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

		// Parse hourly
		const hourly = json.hourly.time
			.map((unixtime: number, index: number) => {
				const ms = unixtime * MS_IN_SECOND;
				const object: Partial<HourlyForecast> = {
					msPretty: tzFormat(ms, data.timezone, data.timezoneAbbreviation, DATEFORMAT_MASK),
					ms,
				};

				for (const [keyOpenMeteo, keyData] of Object.entries(hourlyKeys)) {
					const value = json.hourly[keyOpenMeteo]?.[index];
					const safeValue = typeof value === 'number' ? value : 0;
					(object as Record<string, number | string>)[keyData] = safeValue;
				}

				object.isDay = json.hourly.is_day?.[index] === 1;

				return object as HourlyForecast;
			})
			.filter((item: HourlyForecast) => item.weatherCode !== null);

		// Parse daily
		const daily = json.daily.time
			.map((unixtime: number, index: number) => {
				const ms = unixtime * MS_IN_SECOND;
				const compactDate =
					index === PAST_DAYS_VALUE
						? 'Today'
						: tzFormat(
								ms,
								data.timezone,
								data.timezoneAbbreviation,
								index < PAST_DAYS_VALUE - 7 || index > PAST_DAYS_VALUE + 7 ? 'MMM-DD' : 'dd-DD',
							);

				const sunrise = json.daily.sunrise[index] * MS_IN_SECOND;
				const sunset = json.daily.sunset[index] * MS_IN_SECOND;

				const object: Partial<DailyForecast> = {
					msPretty: tzFormat(ms, data.timezone, data.timezoneAbbreviation, DATEFORMAT_MASK),
					compactDate,
					ms,
					fromToday: index - PAST_DAYS_VALUE,
					sunrise,
					sunset,
				};

				for (const [openMeteoKey, newKey] of Object.entries(dailyKeys)) {
					(object as Record<string, unknown>)[newKey] = json.daily[openMeteoKey][index];
				}

				return object as DailyForecast;
			})
			.filter((item: DailyForecast) => item.weatherCode !== null);

		// Update data
		data.omForecast = { current, daily, hourly };

		console.timeEnd('fetchOpenMeteoForecast');
		gg('fetchOpenMeteoForecast', { current });

		// Update radar timestamps if available
		updateRadarTimestamps();

		// Emit snapshot
		emitSnapshot();
	}

	async function fetchOpenMeteoAirQuality() {
		if (!data.coords) {
			gg('fetchOpenMeteoAirQuality: No coordinates available');
			return;
		}

		gg('fetchOpenMeteoAirQuality:start');
		console.time('fetchOpenMeteoAirQuality');

		const url =
			`https://air-quality-api.open-meteo.com/v1/air-quality` +
			`?latitude=${data.coords.latitude}&longitude=${data.coords.longitude}` +
			`&timeformat=unixtime&timezone=auto&past_days=${PAST_DAYS_VALUE}&forecast_days=${Math.min(7, FORECAST_DAYS_VALUE)}` +
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

		// Update timezone (in case forecast hasn't loaded yet)
		data.timezone = json.timezone;
		data.timezoneAbbreviation = json.timezone_abbreviation;
		data.utcOffsetSeconds = json.utc_offset_seconds;

		// Parse current
		const current = {
			msPretty: tzFormat(
				json.current.time * MS_IN_SECOND,
				data.timezone,
				data.timezoneAbbreviation,
				DATEFORMAT_MASK,
			),
			ms: json.current.time * MS_IN_SECOND,
			aqiUs: json.current.us_aqi,
			aqiEurope: json.current.european_aqi,
		};

		// Parse hourly
		const hourly = json.hourly.time.map((unixtime: number, index: number) => {
			const ms = unixtime * MS_IN_SECOND;
			return {
				msPretty: tzFormat(ms, data.timezone, data.timezoneAbbreviation, DATEFORMAT_MASK),
				ms,
				aqiUs: json.hourly.us_aqi[index],
				aqiEurope: json.hourly.european_aqi[index],
			} as AirQuality;
		});

		// Update data
		data.omAirQuality = { current, hourly };

		console.timeEnd('fetchOpenMeteoAirQuality');
		gg('fetchOpenMeteoAirQuality', { current });

		// Update radar timestamps if available
		updateRadarTimestamps();

		// Emit snapshot
		emitSnapshot();
	}

	async function fetchRainviewerData() {
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
					msPretty: tzFormat(ms, data.timezone, data.timezoneAbbreviation),
					ms,
					path: frame.path,
				};
			});

		const msStart = frames[0]?.ms;
		const msLast = frames.at(-1)?.ms;
		const msEnd = msLast ? msLast + 10 * MS_IN_MINUTE : undefined;

		const generated = (rainviewerData.generated || 0) * MS_IN_SECOND;

		data.radar = {
			generatedPretty: tzFormat(generated, data.timezone, data.timezoneAbbreviation),
			generated,
			msStart,
			msEnd,
			host: rainviewerData.host || '',
			frames,
		};

		emit('weatherdata_updatedRadar', { radar: data.radar });
	}

	async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
		try {
			const resp = await fetch(`/api/geo/reverse?lat=${latitude}&lon=${longitude}`);
			if (resp.ok) {
				const json = await resp.json();
				const result = json?.[0];
				if (result?.name) {
					return `${result.name}, ${result.state || result.country}`;
				}
			}
		} catch (error) {
			console.error('Reverse geocoding error:', error);
		}
		return null;
	}

	function updateRadarTimestamps() {
		if (data.radar.generated) {
			data.radar = {
				...data.radar,
				generatedPretty: tzFormat(data.radar.generated, data.timezone, data.timezoneAbbreviation),
				frames: data.radar.frames.map((frame) => ({
					...frame,
					msPretty: tzFormat(frame.ms, data.timezone, data.timezoneAbbreviation),
				})),
			};
		}
	}

	// =========================================================================
	// RAF LOOP FOR TRACKING
	// =========================================================================

	function startFrameLoop() {
		if (frameRafId !== null) return;

		lastFrameTime = performance.now();

		function frameTick(now: number) {
			if (frameRafId === null) return;

			if (now - lastFrameTime >= FRAME_INTERVAL) {
				lastFrameTime = now;
				data.ms = data.rawMs;
				emit('weatherdata_frameTick', { ms: data.rawMs });
			}

			frameRafId = requestAnimationFrame(frameTick);
		}

		frameRafId = requestAnimationFrame(frameTick);
	}

	function stopFrameLoop() {
		if (frameRafId !== null) {
			cancelAnimationFrame(frameRafId);
			frameRafId = null;
		}
	}

	// =========================================================================
	// EVENT HANDLERS
	// =========================================================================

	on('weatherdata_requestedSetLocation', async (params) => {
		gg('weatherdata_requestedSetLocation', params);

		data.source = params.source;

		if (params.coords) {
			data.coords = {
				latitude: params.coords.latitude,
				longitude: params.coords.longitude,
				accuracy: params.coords.accuracy,
			};
		}

		if (params.name) {
			data.name = params.name;
		} else if (params.coords) {
			data.name = '...';
			const name = await reverseGeocode(params.coords.latitude, params.coords.longitude);
			if (name) {
				data.name = name;
			}
		}

		// Emit initial snapshot with location data (before fetch)
		// This ensures components have coords/name immediately
		emitSnapshot();

		// Fetch data in parallel
		await Promise.all([fetchOpenMeteoForecast(), fetchOpenMeteoAirQuality()]);
	});

	on('weatherdata_requestedSetTime', (params) => {
		// Always update non-reactive rawMs
		data.rawMs = params.ms;

		// Only update reactive ms when NOT tracking
		if (!data.trackedElement) {
			data.ms = params.ms;
		}

		// Check if past radar end
		const msMaxRadar = (data.radar.frames.at(-1)?.ms || 0) + 10 * MS_IN_MINUTE;
		if (data.rawMs > msMaxRadar) {
			data.radarPlaying = false;
			if (!data.trackedElement) {
				data.rawMs = Date.now();
				data.ms = Date.now();
				resetRadarOnPlay = true;
			}
		}
	});

	on('weatherdata_requestedTrackingStart', (params) => {
		data.trackedElement = params.node;
		startFrameLoop();
	});

	on('weatherdata_requestedTrackingEnd', () => {
		data.trackedElement = null;
		data.rawMs = Date.now();
		data.ms = Date.now();

		stopFrameLoop();

		emit('weatherdata_frameTick', { ms: data.rawMs });
		emit('weatherdata_trackingEnded');
	});

	on('weatherdata_requestedTogglePlay', () => {
		data.radarPlaying = !data.radarPlaying;

		if (resetRadarOnPlay && data.radar.frames?.length) {
			data.rawMs = data.radar.frames[0].ms;
			data.ms = data.radar.frames[0].ms;
		}
		resetRadarOnPlay = false;
	});

	on('weatherdata_requestedToggleUnits', (params) => {
		if (params.temperature) {
			if (
				typeof params.temperature === 'string' &&
				(params.temperature === 'C' || params.temperature === 'F')
			) {
				data.units = { ...data.units, temperature: params.temperature };
			} else {
				data.units = {
					...data.units,
					temperature: data.units.temperature === 'F' ? 'C' : 'F',
				};
			}
			emitSnapshot();
		}
	});

	on('weatherdata_requestedFetchRainviewerData', () => {
		fetchRainviewerData();
	});

	// =========================================================================
	// CLEANUP
	// =========================================================================

	return {
		destroy() {
			stopFrameLoop();
		},
	};
}
