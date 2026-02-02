/**
 * Pure state container for weather data.
 *
 * This is the "Data" layer in Grokking Simplicity terms:
 * - Only $state declarations
 * - No I/O (no fetch, no timers, no events)
 * - Shell reads/writes this, components receive snapshots
 */

import type { Coordinates, Radar } from '$lib/types';
import type { OmForecast, OmAirQuality, OwOneCallResponse, Units } from './types';

/**
 * WeatherData - Pure state container
 *
 * All fields are reactive ($state).
 * Shell mutates this directly.
 * Components never import this - they receive snapshots via events.
 */
class WeatherData {
	// =========================================================================
	// HOT STATE - Changes at 15fps during scrubbing
	// =========================================================================

	/** Current display time (reactive) */
	ms = $state(Date.now());

	/** Non-reactive time for polling (avoids Svelte overhead during scrub) */
	rawMs = Date.now();

	/** Whether radar animation is playing */
	radarPlaying = $state(false);

	/** Currently tracked DOM element (during scrubbing) */
	trackedElement = $state<HTMLElement | null>(null);

	// =========================================================================
	// COLD STATE - Location
	// =========================================================================

	/** Geographic coordinates */
	coords = $state<Coordinates | null>(null);

	/** Location name (city, region) */
	name = $state<string | null>(null);

	/** ISO-3166-1 alpha2 country code (e.g., 'US', 'GB') */
	countryCode = $state<string | null>(null);

	/** Source of location (gps, search, default) */
	source = $state('???');

	// =========================================================================
	// COLD STATE - Timezone
	// =========================================================================

	/** IANA timezone name (e.g., 'America/New_York') */
	timezone = $state('UTC');

	/** Timezone abbreviation (e.g., 'EST') */
	timezoneAbbreviation = $state('UTC');

	/** UTC offset in seconds */
	utcOffsetSeconds = $state(0);

	// =========================================================================
	// COLD STATE - Raw API responses
	// =========================================================================

	/** Open-Meteo forecast data */
	omForecast = $state<OmForecast | null>(null);

	/** Open-Meteo air quality data */
	omAirQuality = $state<OmAirQuality | null>(null);

	/** OpenWeather One Call API data (optional, for minutely forecast) */
	owOneCall = $state<OwOneCallResponse | null>(null);

	/** OpenWeather API error message (if fetch failed) */
	owError = $state<string | null>(null);

	/** Rainviewer radar data */
	radar = $state<Radar>({ generated: 0, host: '', frames: [] });

	// =========================================================================
	// COLD STATE - Settings
	// =========================================================================

	/** Display units */
	units = $state<Units>({ temperature: 'F' });
}

/** Singleton instance - shell mutates, calc reads */
export const weatherData = new WeatherData();

/** Type export for shell and calc layers */
export type { WeatherData };
