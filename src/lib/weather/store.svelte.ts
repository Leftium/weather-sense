/**
 * Reactive store for weather snapshots.
 *
 * Components use this to receive read-only snapshots via events.
 * This decouples components from the data layer.
 *
 * Usage:
 * ```svelte
 * <script>
 *   import { weatherStore } from '$lib/weather';
 *   const { snapshot, frameMs } = weatherStore;
 * </script>
 *
 * {#if snapshot}
 *   <p>{snapshot.temperature}</p>
 * {/if}
 * ```
 */

import { getEmitter } from '$lib/emitter';
import type { WeatherDataEvents, Snapshot, ForecastItem, AirQualityItem } from './types';
import { weatherData } from './data.svelte';
import { buildForecastMap, buildAirQualityMap, tzFormat } from './calc';

const { on } = getEmitter<WeatherDataEvents>(import.meta);

/** Current snapshot (cold state) */
let snapshot = $state<Snapshot | null>(null);

/** Current frame time (hot state, updates at 15fps during scrubbing) */
let frameMs = $state(Date.now());

/** Derived lookup Maps (rebuilt when snapshot changes) */
let dataForecast = $state<Map<number, ForecastItem>>(new Map());
let dataAirQuality = $state<Map<number, AirQualityItem>>(new Map());

// Subscribe to events
on('weatherdata_snapshot', (data) => {
	snapshot = data;
	// Rebuild lookup Maps from snapshot data
	if (data) {
		dataForecast = buildForecastMap(
			weatherData.omForecast,
			data.timezone,
			data.timezoneAbbreviation,
		);
		dataAirQuality = buildAirQualityMap(
			weatherData.omAirQuality,
			data.timezone,
			data.timezoneAbbreviation,
		);
	}
});

on('weatherdata_frameTick', (data) => {
	frameMs = data.ms;
});

/**
 * Weather store - reactive snapshot receiver.
 *
 * Components read from this instead of importing data directly.
 *
 * Hot state is read directly from weatherData for reactivity.
 */
export const weatherStore = {
	/** Full snapshot of weather data (null until first fetch) */
	get snapshot() {
		return snapshot;
	},

	/** Current display time in ms (updates at 15fps during scrubbing) */
	get frameMs() {
		return frameMs;
	},

	// --- Hot state (direct from data layer for reactivity) ---

	/** Whether radar animation is playing */
	get radarPlaying() {
		return weatherData.radarPlaying;
	},

	/** Currently tracked DOM element */
	get trackedElement() {
		return weatherData.trackedElement;
	},

	/** Non-reactive ms for polling */
	get rawMs() {
		return weatherData.rawMs;
	},

	// --- Compatibility getters (for migration from old NS) ---
	// These mirror the old nsWeatherData shape

	get ms() {
		return weatherData.ms;
	},

	get daily() {
		return snapshot?.daily ?? [];
	},

	get hourly() {
		return snapshot?.hourly ?? [];
	},

	get radar() {
		return weatherData.radar;
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

	get coords() {
		return snapshot?.coords ?? null;
	},

	get name() {
		return snapshot?.name ?? null;
	},

	/** Forecast lookup Map (for getHourlyAt, getTemperatureStats, etc.) */
	get dataForecast() {
		return dataForecast;
	},

	/** Air quality lookup Map */
	get dataAirQuality() {
		return dataAirQuality;
	},

	/** UTC offset in seconds */
	get utcOffsetSeconds() {
		return weatherData.utcOffsetSeconds;
	},

	/** Source of location data */
	get source() {
		return weatherData.source;
	},

	/** Current weather (from omForecast.current) */
	get current() {
		return weatherData.omForecast?.current ?? null;
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

/** Type for weatherStore (compatible with old NsWeatherData interface) */
export type WeatherStore = typeof weatherStore;
