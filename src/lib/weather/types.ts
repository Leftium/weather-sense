/**
 * Types for weather data architecture.
 *
 * Organized by layer:
 * - Data types (state shape)
 * - Event types (shell communication)
 * - Snapshot types (what components receive)
 */

// Re-export shared types
export type { Coordinates, Radar, RadarFrame } from '$lib/types';

// =============================================================================
// DATA TYPES - Shape of state in data.svelte.ts
// =============================================================================

export type AirQuality = {
	ms: number;
	msPretty?: string;
	aqiUs: number;
	aqiEurope: number;
};

export type CurrentForecast = {
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

/** Raw Open-Meteo forecast response (stored in data layer) */
export type OmForecast = {
	current: CurrentForecast;
	hourly: HourlyForecast[];
	daily: DailyForecast[];
};

/** Raw Open-Meteo air quality response (stored in data layer) */
export type OmAirQuality = {
	current: AirQuality;
	hourly: AirQuality[];
};

/** Lookup map item for hourly forecast data */
export type ForecastItem = {
	msPretty?: string;
	ms: number;
	isDay: boolean;
	temperature: number;
	weatherCode: number;
	humidity: number;
	dewPoint: number;
	precipitation: number;
	precipitationProbability: number;
};

/** Lookup map item for air quality data */
export type AirQualityItem = {
	msPretty?: string;
	ms: number;
	aqiUs: number;
	aqiEurope: number;
};

/** Time interval for tracker positioning */
export type IntervalItem = {
	ms: number;
	x2: number;
};

/** Temperature statistics for y-axis scaling */
export type TemperatureStats = {
	minTemperature: number;
	maxTemperature: number;
	temperatureRange: number;
	minTemperatureOnly: number;
};

/** Unit settings */
export type Units = {
	temperature: 'C' | 'F';
};

// =============================================================================
// EVENT TYPES - Communication between shell and components
// =============================================================================

export type WeatherDataEvents = {
	// --- Command events (component → shell) ---
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

	weatherdata_requestedTrackingStart: { node: HTMLElement };

	weatherdata_requestedTrackingEnd: undefined;

	// --- Notification events (shell → component) ---

	/** Full snapshot of cold state (emitted on data change) */
	weatherdata_snapshot: Snapshot;

	/** Hot state update during scrubbing (15fps) */
	weatherdata_frameTick: { ms: number };

	/** Radar data updated */
	weatherdata_updatedRadar: { radar: Radar };

	/** Generic data update notification */
	weatherdata_updatedData: undefined;

	/** Tracking ended notification */
	weatherdata_trackingEnded: undefined;

	/** Play state changed */
	weatherdata_playStateChange: { playing: boolean };

	/** Tracking element changed */
	weatherdata_trackingChange: { element: HTMLElement | null };

	/** Time changed (non-frameTick updates) */
	weatherdata_timeChange: { ms: number };
};

// =============================================================================
// SNAPSHOT TYPE - Read-only data that components receive
// =============================================================================

import type { Coordinates, Radar } from '$lib/types';

/** Display values (formatted strings) */
export type DisplayBundle = {
	// Weather
	temperature: string;
	humidity: string;
	dewPoint: string;
	precipitation: string;
	precipChance: string;
	weatherCode: number | null;
	isDay: boolean;

	// Air quality
	aqiUs: string;
	aqiEurope: string;

	// Time/location
	time: string;
	date: string;
	location: string;

	// Raw values for components that need numbers
	raw: {
		temperature: number | null;
		humidity: number | null;
		dewPoint: number | null;
		precipitation: number | null;
		precipChance: number | null;
		aqiUs: number | null;
		aqiEurope: number | null;
	};
};

/** Complete snapshot sent to components via events */
export type Snapshot = DisplayBundle & {
	// Raw data for iteration
	daily: DailyForecast[];
	hourly: HourlyForecast[];
	radar: Radar;

	// Settings
	units: Units;
	timezone: string;
	timezoneAbbreviation: string;
	utcOffsetSeconds: number;

	// Location
	coords: Coordinates | null;
	name: string | null;
	source: string;

	// Current weather
	current: CurrentForecast | null;

	// Current time
	ms: number;

	// Raw forecast data for building lookup Maps
	omForecast: OmForecast | null;
	omAirQuality: OmAirQuality | null;
};

// =============================================================================
// CONSTANTS
// =============================================================================

export const PAST_DAYS = 2; // 0 to 92
export const FORECAST_DAYS = 10; // 0 to 16 for forecast; 0 to 7 for air-quality
