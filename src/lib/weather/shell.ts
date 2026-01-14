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

import { browser, dev } from '$app/environment';
import { getEmitter } from '$lib/emitter';
import { MS_IN_SECOND, MS_IN_MINUTE } from '$lib/util';
import { gg } from '@leftium/gg';

import type { WeatherData } from './data.svelte';
import { getSnapshot, tzFormat } from './calc';
import type {
	WeatherDataEvents,
	HourlyForecast,
	DailyForecast,
	AirQuality,
	OwOneCallResponse,
} from './types';
import { PAST_DAYS, FORECAST_DAYS } from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

const FRAME_INTERVAL = 1000 / 15; // 15fps
const DATEFORMAT_MASK = 'MM-DD hh:mma z';

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

	// Idle minute-aligned timer state
	let idleTimeoutId: ReturnType<typeof setTimeout> | null = null;

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
					index === PAST_DAYS
						? 'Today'
						: tzFormat(
								ms,
								data.timezone,
								data.timezoneAbbreviation,
								index < PAST_DAYS - 7 || index > PAST_DAYS + 7 ? 'MMM-DD' : 'dd-DD',
							);

				const sunrise = json.daily.sunrise[index] * MS_IN_SECOND;
				const sunset = json.daily.sunset[index] * MS_IN_SECOND;

				const object: Partial<DailyForecast> = {
					msPretty: tzFormat(ms, data.timezone, data.timezoneAbbreviation, DATEFORMAT_MASK),
					compactDate,
					ms,
					fromToday: index - PAST_DAYS,
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

	async function fetchOpenWeatherOneCall() {
		if (!data.coords) {
			gg('fetchOpenWeatherOneCall: No coordinates available');
			return;
		}

		gg('fetchOpenWeatherOneCall:start');
		console.time('fetchOpenWeatherOneCall');

		try {
			const url =
				`/api/openweather/onecall` + `?lat=${data.coords.latitude}&lon=${data.coords.longitude}`;

			const fetched = await fetch(url);
			const json: OwOneCallResponse = await fetched.json();

			if (!json.available) {
				gg('fetchOpenWeatherOneCall: API not available', { error: json.error });
				data.owOneCall = null;
				return;
			}

			data.owOneCall = json;

			gg('fetchOpenWeatherOneCall', {
				minutelyCount: json.minutely?.length ?? 0,
				hourlyCount: json.hourly?.length ?? 0,
				dailyCount: json.daily?.length ?? 0,
				hasAlerts: (json.alerts?.length ?? 0) > 0,
			});

			// Emit snapshot so store/components receive the data
			emitSnapshot();
		} catch (error) {
			console.error('fetchOpenWeatherOneCall error:', error);
			data.owOneCall = null;
		}

		console.timeEnd('fetchOpenWeatherOneCall');
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
	// UNIFIED RAF LOOP (tracking + radar playback)
	// =========================================================================

	// Radar playback timing constants
	const RADAR_TIME_STEP = 40 * MS_IN_SECOND; // Advance 40 seconds per frame
	const RADAR_FRAME_INTERVAL = 20; // ~50fps for smooth radar animation

	function startFrameLoop() {
		if (frameRafId !== null) return;

		// Stop idle timer when frame loop starts
		stopIdleTimer();

		lastFrameTime = performance.now();

		function frameTick(now: number) {
			if (frameRafId === null) return;

			const elapsed = now - lastFrameTime;

			// Radar playback: advance time when playing (higher framerate for smooth animation)
			if (data.radarPlaying && elapsed >= RADAR_FRAME_INTERVAL) {
				const newMs = data.rawMs + RADAR_TIME_STEP;
				data.rawMs = newMs;
				data.ms = newMs;
				emit('weatherdata_frameTick', { ms: newMs });
				emit('weatherdata_timeChange', { ms: newMs });

				// Check if past radar end
				const msMaxRadar = (data.radar.frames.at(-1)?.ms || 0) + 10 * MS_IN_MINUTE;
				if (newMs > msMaxRadar) {
					data.radarPlaying = false;
					emit('weatherdata_playStateChange', { playing: false });
					data.rawMs = Date.now();
					data.ms = Date.now();
					resetRadarOnPlay = true;
					emit('weatherdata_timeChange', { ms: Date.now() });
					emit('weatherdata_frameTick', { ms: Date.now() });
				}

				lastFrameTime = now;
			}
			// Tracking: emit frame tick at 15fps
			else if (data.trackedElement && elapsed >= FRAME_INTERVAL) {
				lastFrameTime = now;
				data.ms = data.rawMs;
				emit('weatherdata_frameTick', { ms: data.rawMs });
			}

			// Continue loop if tracking or playing
			if (data.trackedElement || data.radarPlaying) {
				frameRafId = requestAnimationFrame(frameTick);
			} else {
				frameRafId = null;
				// Switch to idle timer when frame loop stops
				startIdleTimer();
			}
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
	// IDLE MINUTE-ALIGNED TIMER
	// Updates tracker to current time once per minute when not tracking/playing
	// =========================================================================

	function startIdleTimer() {
		if (idleTimeoutId !== null) return; // Already running

		// Update every 4 seconds for tracker movement on minutely plot
		const IDLE_INTERVAL = 4 * MS_IN_SECOND;
		function scheduleNextTick() {
			const now = Date.now();
			const msUntilNextTick = IDLE_INTERVAL - (now % IDLE_INTERVAL) + 50; // Align to :00/:02/:04...

			idleTimeoutId = setTimeout(() => {
				idleTimeoutId = null; // Clear before potential reschedule

				// Only update if still idle (not tracking or playing)
				if (!data.trackedElement && !data.radarPlaying) {
					const currentMs = Date.now();
					data.rawMs = currentMs;
					data.ms = currentMs;
					emit('weatherdata_frameTick', { ms: currentMs });

					// Schedule next tick
					scheduleNextTick();
				}
			}, msUntilNextTick);
		}

		scheduleNextTick();
	}

	function stopIdleTimer() {
		if (idleTimeoutId !== null) {
			clearTimeout(idleTimeoutId);
			idleTimeoutId = null;
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
		// Open-Meteo is required, OpenWeather is optional (for minutely forecast, dev only)
		await Promise.all([
			fetchOpenMeteoForecast(),
			fetchOpenMeteoAirQuality(),
			...(dev ? [fetchOpenWeatherOneCall()] : []),
		]);
	});

	on('weatherdata_requestedSetTime', (params) => {
		// Always update non-reactive rawMs
		data.rawMs = params.ms;

		// Only update reactive ms when NOT tracking
		if (!data.trackedElement) {
			data.ms = params.ms;
			emit('weatherdata_timeChange', { ms: params.ms });
			// Also emit frameTick so TimeLine trackers update during radar playback
			emit('weatherdata_frameTick', { ms: params.ms });
		}

		// Check if past radar end
		const msMaxRadar = (data.radar.frames.at(-1)?.ms || 0) + 10 * MS_IN_MINUTE;
		if (data.rawMs > msMaxRadar) {
			data.radarPlaying = false;
			emit('weatherdata_playStateChange', { playing: false });
			if (!data.trackedElement) {
				data.rawMs = Date.now();
				data.ms = Date.now();
				resetRadarOnPlay = true;
				emit('weatherdata_timeChange', { ms: Date.now() });
				emit('weatherdata_frameTick', { ms: Date.now() });
			}
		}
	});

	on('weatherdata_requestedTrackingStart', (params) => {
		data.trackedElement = params.node;
		emit('weatherdata_trackingChange', { element: params.node });
		startFrameLoop();
	});

	on('weatherdata_requestedTrackingEnd', () => {
		data.trackedElement = null;
		data.rawMs = Date.now();
		data.ms = Date.now();

		// Don't stop frame loop if radar is still playing
		if (!data.radarPlaying) {
			stopFrameLoop();
			startIdleTimer(); // Resume idle updates
		}

		emit('weatherdata_trackingChange', { element: null });
		emit('weatherdata_frameTick', { ms: data.rawMs });
		emit('weatherdata_trackingEnded');
	});

	on('weatherdata_requestedTogglePlay', () => {
		data.radarPlaying = !data.radarPlaying;
		emit('weatherdata_playStateChange', { playing: data.radarPlaying });

		if (data.radarPlaying) {
			// Reset to first frame if needed
			if (resetRadarOnPlay && data.radar.frames?.length) {
				data.rawMs = data.radar.frames[0].ms;
				data.ms = data.radar.frames[0].ms;
				emit('weatherdata_timeChange', { ms: data.ms });
			}
			resetRadarOnPlay = false;
			// Start unified frame loop for radar playback
			startFrameLoop();
		}
		// Loop will auto-stop when radarPlaying becomes false (see frameTick)
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
	// INITIALIZATION
	// =========================================================================

	// Start idle timer immediately so tracker updates each minute
	startIdleTimer();

	// =========================================================================
	// CLEANUP
	// =========================================================================

	return {
		destroy() {
			stopFrameLoop();
			stopIdleTimer();
		},
	};
}
