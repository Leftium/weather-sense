/**
 * Reactive store for weather data.
 *
 * FULLY DECOUPLED: Components receive all state via events.
 * Store has NO direct imports from data layer.
 *
 * Architecture:
 * - Shell emits events when state changes
 * - Store subscribes to events and updates local $state
 * - Components read from store getters
 *
 * This ensures:
 * - Read-only outside (getters only)
 * - Write via events (no direct mutation)
 * - True decoupling (no weatherData import)
 */

import { getEmitter } from '$lib/emitter';
import type {
	WeatherDataEvents,
	Snapshot,
	ForecastItem,
	AirQualityItem,
	DailyForecast,
	MinutelyPoint,
	Radar,
} from './types';
import {
	buildForecastMap,
	buildAirQualityMap,
	buildMinutelyData,
	buildDailyByFromTodayMap,
	tzFormat,
} from './calc';

const { on } = getEmitter<WeatherDataEvents>(import.meta);

// =============================================================================
// COLD STATE (updated via snapshot events)
// =============================================================================

/** Current snapshot (null until first fetch) */
let snapshot = $state<Snapshot | null>(null);

/** Derived lookup Maps (rebuilt when snapshot changes) */
let dataForecast = $state<Map<number, ForecastItem>>(new Map());
let dataAirQuality = $state<Map<number, AirQualityItem>>(new Map());
let dataMinutely = $state<MinutelyPoint[]>([]);
let dailyByFromToday = $state<Map<number, DailyForecast>>(new Map());

// =============================================================================
// HOT STATE (updated via individual events at 15fps)
// =============================================================================

/** Current display time in ms */
let ms = $state(Date.now());

/** Non-reactive ms for polling (updated alongside ms) */
let rawMs = Date.now();

/** Radar data (updated frequently during playback) */
let radar = $state<Radar>({ generated: 0, host: '', frames: [] });

/** Whether radar animation is playing */
let radarPlaying = $state(false);

/** Currently tracked DOM element */
let trackedElement = $state<HTMLElement | null>(null);

// =============================================================================
// EVENT SUBSCRIPTIONS
// =============================================================================

on('weatherdata_snapshot', (data) => {
	snapshot = data;
	// Rebuild lookup Maps from snapshot's raw data
	if (data) {
		dataForecast = buildForecastMap(data.omForecast, data.timezone, data.timezoneAbbreviation);
		dataAirQuality = buildAirQualityMap(
			data.omAirQuality,
			data.timezone,
			data.timezoneAbbreviation,
		);
		dataMinutely = buildMinutelyData(data.owOneCall, data.timezone, data.timezoneAbbreviation);
		dailyByFromToday = buildDailyByFromTodayMap(data.daily);
	}
});

on('weatherdata_frameTick', (data) => {
	ms = data.ms;
	rawMs = data.ms;
});

on('weatherdata_updatedRadar', (data) => {
	radar = data.radar;
});

on('weatherdata_playStateChange', (data) => {
	radarPlaying = data.playing;
});

on('weatherdata_trackingChange', (data) => {
	trackedElement = data.element;
});

on('weatherdata_timeChange', (data) => {
	ms = data.ms;
	rawMs = data.ms;
});

// =============================================================================
// EXPORTED STORE (read-only getters)
// =============================================================================

export const weatherStore = {
	// --- Snapshot (cold state) ---
	get snapshot() {
		return snapshot;
	},

	// --- Hot state ---
	get ms() {
		return ms;
	},

	get rawMs() {
		return rawMs;
	},

	get radar() {
		return radar;
	},

	get radarPlaying() {
		return radarPlaying;
	},

	get trackedElement() {
		return trackedElement;
	},

	// --- Convenience getters from snapshot ---
	get daily() {
		return snapshot?.daily ?? [];
	},

	get hourly() {
		return snapshot?.hourly ?? [];
	},

	get units() {
		return snapshot?.units ?? { temperature: 'F' as const };
	},

	get timezone() {
		return snapshot?.timezone ?? 'UTC';
	},

	get timezoneAbbreviation() {
		return snapshot?.timezoneAbbreviation ?? 'UTC';
	},

	get utcOffsetSeconds() {
		return snapshot?.utcOffsetSeconds ?? 0;
	},

	get coords() {
		return snapshot?.coords ?? null;
	},

	get name() {
		return snapshot?.name ?? null;
	},

	get source() {
		return snapshot?.source ?? '???';
	},

	get current() {
		return snapshot?.current ?? null;
	},

	/** OpenWeather One Call data (optional, for minutely forecast) */
	get owOneCall() {
		return snapshot?.owOneCall ?? null;
	},

	/** Forecast lookup Map */
	get dataForecast() {
		return dataForecast;
	},

	/** Air quality lookup Map */
	get dataAirQuality() {
		return dataAirQuality;
	},

	/** Processed minutely precipitation data (from OpenWeather) */
	get dataMinutely() {
		return dataMinutely;
	},

	/** Daily lookup Map keyed by fromToday (-2, -1, 0, 1, 2, ...) */
	get dailyByFromToday() {
		return dailyByFromToday;
	},

	/** Format time in location's timezone */
	tzFormat(ms: number, format = 'ddd MMM D, h:mm:ss.SSSa z') {
		return tzFormat(
			ms,
			snapshot?.timezone ?? 'UTC',
			snapshot?.timezoneAbbreviation ?? 'UTC',
			format,
		);
	},
};

export type WeatherStore = typeof weatherStore;
