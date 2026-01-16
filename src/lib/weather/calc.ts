/**
 * Pure calculation functions for weather data.
 *
 * This is the "Calculations" layer in Grokking Simplicity terms:
 * - Pure functions only (no state, no I/O)
 * - Transform data → data
 * - Trivially testable
 *
 * Used by:
 * - Shell: to build snapshots
 * - Components: for custom formatting (if needed)
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezonePlugin from 'dayjs/plugin/timezone';

import {
	startOf,
	celcius,
	MS_IN_MINUTE,
	MS_IN_SECOND,
	MS_IN_HOUR,
	DAY_START_HOUR,
} from '$lib/util';
import type { WeatherData } from './data.svelte';
import type {
	ForecastItem,
	AirQualityItem,
	HourlyForecast,
	DailyForecast,
	OmForecast,
	OmAirQuality,
	OwOneCallResponse,
	MinutelyPoint,
	Snapshot,
	DisplayBundle,
	TemperatureStats,
	IntervalItem,
} from './types';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

// =============================================================================
// TIME FORMATTING
// =============================================================================

/** Format time in a specific timezone */
export function formatTime(
	ms: number,
	timezone: string,
	abbreviation: string,
	format = 'h:mm A',
): string {
	return dayjs.tz(ms, timezone).format(format).replace('z', abbreviation);
}

/** Format time in timezone (replacement for NS.tzFormat) */
export function tzFormat(
	ms: number,
	timezone: string,
	abbreviation: string,
	format = 'ddd MMM D, h:mm:ss.SSSa z',
): string {
	return dayjs.tz(ms, timezone).format(format).replace('z', abbreviation);
}

// =============================================================================
// VALUE FORMATTING
// =============================================================================

/** Format temperature with unit conversion */
export function formatTemp(n: number | null | undefined, unit: 'F' | 'C', showUnit = true): string {
	if (n == null) return '--';
	const value = unit === 'C' ? celcius(n) : n;
	const rounded = Math.round(value ?? 0);
	return showUnit ? `${rounded}°${unit}` : `${rounded}°`;
}

/** Format percentage */
export function formatPercent(n: number | null | undefined): string {
	if (n == null) return '--';
	return `${Math.round(n)}%`;
}

/** Format precipitation amount */
export function formatPrecip(mm: number | null | undefined): string {
	if (mm == null) return '--';
	return `${mm.toFixed(1)}mm`;
}

/** Format AQI */
export function formatAqi(n: number | null | undefined): string {
	if (n == null) return '--';
	return String(Math.round(n));
}

// =============================================================================
// LOOKUP MAPS - Build Maps from raw API responses
// =============================================================================

/** Build forecast lookup map from raw Open-Meteo data */
export function buildForecastMap(
	omForecast: OmForecast | null,
	timezone: string,
	abbreviation: string,
): Map<number, ForecastItem> {
	const map = new Map<number, ForecastItem>();
	if (!omForecast?.hourly) return map;

	for (const item of omForecast.hourly) {
		map.set(item.ms, {
			msPretty: tzFormat(item.ms, timezone, abbreviation, 'MM-DD hh:mma z'),
			ms: item.ms,
			isDay: item.isDay ?? true,
			weatherCode: item.weatherCode ?? 0,
			temperature: item.temperature ?? 0,
			dewPoint: item.dewPoint ?? 0,
			humidity: item.relativeHumidity ?? 0,
			precipitationProbability: item.precipitationProbability ?? 0,
			precipitation: item.precipitation ?? 0,
		});
	}

	return map;
}

/** Build air quality lookup map from raw Open-Meteo data */
export function buildAirQualityMap(
	omAirQuality: OmAirQuality | null,
	timezone: string,
	abbreviation: string,
): Map<number, AirQualityItem> {
	const map = new Map<number, AirQualityItem>();
	if (!omAirQuality?.hourly) return map;

	for (const item of omAirQuality.hourly) {
		map.set(item.ms, {
			msPretty: tzFormat(item.ms, timezone, abbreviation, 'MM-DD hh:mma z'),
			ms: item.ms,
			aqiUs: item.aqiUs,
			aqiEurope: item.aqiEurope,
		});
	}

	return map;
}

// =============================================================================
// LOOKUPS - Get data at a point in time
// =============================================================================

/** Get hourly forecast data at a specific time (snaps to hour boundary) */
export function getHourlyAt(
	forecastMap: Map<number, ForecastItem>,
	ms: number,
	timezone: string,
): ForecastItem | null {
	if (!forecastMap.size) return null;
	const hourMs = startOf(ms, 'hour', timezone);
	return forecastMap.get(hourMs) ?? null;
}

/** Get air quality data at a specific time (snaps to hour boundary) */
export function getAirQualityAt(
	airQualityMap: Map<number, AirQualityItem>,
	ms: number,
	timezone: string,
): AirQualityItem | null {
	if (!airQualityMap.size) return null;
	const hourMs = startOf(ms, 'hour', timezone);
	return airQualityMap.get(hourMs) ?? null;
}

/** Get minutely precipitation at a specific time (finds containing minute) */
export function getMinutelyPrecipAt(dataMinutely: MinutelyPoint[], ms: number): number | null {
	if (!dataMinutely.length) return null;

	// Find the minute that contains the given ms
	for (let i = 0; i < dataMinutely.length; i++) {
		const current = dataMinutely[i];
		const next = dataMinutely[i + 1];

		// If there's a next point, check if ms falls in this minute's range
		if (next) {
			if (ms >= current.ms && ms < next.ms) {
				return current.precipitation;
			}
		} else {
			// Last point - check if within 1 minute of it
			if (ms >= current.ms && ms < current.ms + MS_IN_MINUTE) {
				return current.precipitation;
			}
		}
	}

	return null;
}

// =============================================================================
// DISPLAY BUNDLE - Formatted display values
// =============================================================================

/** Get all common display values in one call */
export function getDisplayBundle(
	data: WeatherData,
	forecastMap: Map<number, ForecastItem>,
	airQualityMap: Map<number, AirQualityItem>,
): DisplayBundle {
	const hourly = getHourlyAt(forecastMap, data.ms, data.timezone);
	const aq = getAirQualityAt(airQualityMap, data.ms, data.timezone);

	return {
		// Formatted strings
		temperature: formatTemp(hourly?.temperature, data.units.temperature),
		humidity: formatPercent(hourly?.humidity),
		dewPoint: formatTemp(hourly?.dewPoint, data.units.temperature),
		precipitation: formatPrecip(hourly?.precipitation),
		precipChance: formatPercent(hourly?.precipitationProbability),
		weatherCode: hourly?.weatherCode ?? null,
		isDay: hourly?.isDay ?? true,

		aqiUs: formatAqi(aq?.aqiUs),
		aqiEurope: formatAqi(aq?.aqiEurope),

		time: formatTime(data.ms, data.timezone, data.timezoneAbbreviation, 'h:mm:ss A'),
		date: formatTime(data.ms, data.timezone, data.timezoneAbbreviation, 'ddd MMM D'),
		location: data.name ?? 'Loading...',

		// Raw values for components that need numbers
		raw: {
			temperature: hourly?.temperature ?? null,
			humidity: hourly?.humidity ?? null,
			dewPoint: hourly?.dewPoint ?? null,
			precipitation: hourly?.precipitation ?? null,
			precipChance: hourly?.precipitationProbability ?? null,
			aqiUs: aq?.aqiUs ?? null,
			aqiEurope: aq?.aqiEurope ?? null,
		},
	};
}

// =============================================================================
// SNAPSHOT - Complete data for components
// =============================================================================

/** Build complete snapshot for event emission */
export function getSnapshot(data: WeatherData): Snapshot {
	const forecastMap = buildForecastMap(data.omForecast, data.timezone, data.timezoneAbbreviation);
	const airQualityMap = buildAirQualityMap(
		data.omAirQuality,
		data.timezone,
		data.timezoneAbbreviation,
	);
	const displayBundle = getDisplayBundle(data, forecastMap, airQualityMap);

	return {
		// Display values
		...displayBundle,

		// Raw data for iteration
		daily: data.omForecast?.daily ?? [],
		hourly: data.omForecast?.hourly ?? [],
		radar: data.radar,

		// Settings
		units: data.units,
		timezone: data.timezone,
		timezoneAbbreviation: data.timezoneAbbreviation,
		utcOffsetSeconds: data.utcOffsetSeconds,

		// Location
		coords: data.coords,
		name: data.name,
		source: data.source,

		// Current weather
		current: data.omForecast?.current ?? null,

		// Current time
		ms: data.ms,

		// Raw data for lookup Maps (store rebuilds these)
		omForecast: data.omForecast,
		omAirQuality: data.omAirQuality,

		// OpenWeather One Call data (optional, for minutely forecast)
		owOneCall: data.owOneCall,
		owError: data.owError,
	};
}

// =============================================================================
// DAILY DATA - Lookup by fromToday
// =============================================================================

/** Build daily lookup Map keyed by fromToday (-2, -1, 0, 1, 2, ...) */
export function buildDailyByFromTodayMap(
	daily: DailyForecast[] | null | undefined,
): Map<number, DailyForecast> {
	const map = new Map<number, DailyForecast>();
	if (!daily) return map;

	for (const day of daily) {
		map.set(day.fromToday, day);
	}

	return map;
}

// =============================================================================
// MINUTELY DATA - OpenWeather 60-min precipitation
// =============================================================================

/** Build processed minutely precipitation data from OpenWeather response */
export function buildMinutelyData(
	owOneCall: OwOneCallResponse | null,
	timezone: string,
	abbreviation: string,
): MinutelyPoint[] {
	if (!owOneCall?.minutely) return [];

	return owOneCall.minutely.map((item) => {
		const ms = item.dt * MS_IN_SECOND;
		return {
			ms,
			msPretty: tzFormat(ms, timezone, abbreviation, 'h:mm A'),
			precipitation: item.precipitation,
		};
	});
}

// =============================================================================
// DERIVED DATA - Statistics and intervals
// =============================================================================

/** Calculate temperature statistics for y-axis scaling */
export function getTemperatureStats(
	forecastMap: Map<number, ForecastItem> | null | undefined,
): TemperatureStats | null {
	if (!forecastMap?.size) return null;

	const entries = [...forecastMap.values()];
	const temps = entries.map((h) => h.temperature);
	const dewPoints = entries.map((h) => h.dewPoint);

	const minTemp = Math.min(...temps);
	const maxTemp = Math.max(...temps);
	const minDewPoint = Math.min(...dewPoints);

	return {
		minTemperature: Math.min(minTemp, minDewPoint),
		maxTemperature: maxTemp,
		temperatureRange: maxTemp - Math.min(minTemp, minDewPoint),
		minTemperatureOnly: minTemp,
	};
}

/**
 * Get hourly data for the plot's time window: 4am to 4am (24 hours from DAY_START_HOUR).
 */
function getHoursInPlotWindow(
	dayMs: number,
	hourly: HourlyForecast[] | null | undefined,
): HourlyForecast[] {
	if (!hourly?.length) return [];

	// Calculate the time window: 4am this day to 4am next day
	const startMs = dayMs + DAY_START_HOUR * MS_IN_HOUR;
	const endMs = startMs + 24 * MS_IN_HOUR;

	return hourly.filter((h) => h.ms >= startMs && h.ms < endMs);
}

/**
 * Calculate weighted average temperature for a day from hourly data.
 * Uses the plot's time window: 4am to 4am (24 hours from DAY_START_HOUR).
 *
 * @param dayMs - Start of the calendar day (midnight) in milliseconds
 * @param hourly - Hourly forecast data array
 * @returns Weighted average temperature, or null if no hourly data
 */
export function getWeightedAvgTemp(
	dayMs: number,
	hourly: HourlyForecast[] | null | undefined,
): number | null {
	const hoursInWindow = getHoursInPlotWindow(dayMs, hourly);
	if (hoursInWindow.length === 0) return null;

	// Simple average of temperatures in the window (each hour weighted equally)
	const sum = hoursInWindow.reduce((acc, h) => acc + h.temperature, 0);
	return sum / hoursInWindow.length;
}

/**
 * Calculate high temperature for a day from hourly data.
 * Uses the plot's time window: 4am to 4am (24 hours from DAY_START_HOUR).
 */
export function getPlotHighTemp(
	dayMs: number,
	hourly: HourlyForecast[] | null | undefined,
): number | null {
	const hoursInWindow = getHoursInPlotWindow(dayMs, hourly);
	if (hoursInWindow.length === 0) return null;

	return Math.max(...hoursInWindow.map((h) => h.temperature));
}

/**
 * Calculate low temperature for a day from hourly data.
 * Uses the plot's time window: 4am to 4am (24 hours from DAY_START_HOUR).
 */
export function getPlotLowTemp(
	dayMs: number,
	hourly: HourlyForecast[] | null | undefined,
): number | null {
	const hoursInWindow = getHoursInPlotWindow(dayMs, hourly);
	if (hoursInWindow.length === 0) return null;

	return Math.min(...hoursInWindow.map((h) => h.temperature));
}

/**
 * Build time intervals from hourly forecast and radar frames.
 * Each interval spans from one timestamp to just before the next.
 */
export function getIntervals(
	hourly: HourlyForecast[] | null | undefined,
	radarFrames: { ms: number }[] | null | undefined,
): IntervalItem[] {
	if (!hourly?.length) return [];

	const msSet = new Set<number>();

	// Add hourly timestamps
	for (const item of hourly) {
		msSet.add(item.ms);
	}

	// Add radar frame timestamps
	if (radarFrames?.length) {
		for (const frame of radarFrames) {
			msSet.add(frame.ms);
		}
		// Add end boundary for last radar frame (10 minutes after)
		const finalFrame = radarFrames.at(-1);
		if (finalFrame) {
			msSet.add(finalFrame.ms + 10 * MS_IN_MINUTE);
		}
	}

	// Sort and build intervals
	const sortedMs = [...msSet].sort((a, b) => a - b);
	const intervals: IntervalItem[] = [];

	for (let i = 0; i < sortedMs.length - 1; i++) {
		intervals.push({
			ms: sortedMs[i],
			x2: sortedMs[i + 1] - 1,
		});
	}

	return intervals;
}

// =============================================================================
// STORE-BASED DISPLAY BUNDLE
// =============================================================================

/**
 * Get display bundle from a store-like object (weatherStore or similar).
 * This is a convenience function that pulls values from getters.
 * Precipitation uses minutely data (if available) with hourly fallback.
 */
export function getDisplayBundleFromStore(store: {
	ms: number;
	timezone: string;
	timezoneAbbreviation: string;
	units: { temperature: 'C' | 'F' };
	name: string | null;
	dataForecast: Map<number, ForecastItem>;
	dataAirQuality: Map<number, AirQualityItem>;
	dataMinutely: MinutelyPoint[];
}): DisplayBundle {
	const hourly = getHourlyAt(store.dataForecast, store.ms, store.timezone);
	const aq = getAirQualityAt(store.dataAirQuality, store.ms, store.timezone);

	// Precipitation: prefer minutely (1-min resolution), fallback to hourly
	const minutelyPrecip = getMinutelyPrecipAt(store.dataMinutely, store.ms);
	const precipitation = minutelyPrecip ?? hourly?.precipitation ?? null;

	return {
		temperature: formatTemp(hourly?.temperature, store.units.temperature),
		humidity: formatPercent(hourly?.humidity),
		dewPoint: formatTemp(hourly?.dewPoint, store.units.temperature),
		precipitation: formatPrecip(precipitation),
		precipChance: formatPercent(hourly?.precipitationProbability),
		weatherCode: hourly?.weatherCode ?? null,
		isDay: hourly?.isDay ?? true,

		aqiUs: formatAqi(aq?.aqiUs),
		aqiEurope: formatAqi(aq?.aqiEurope),

		time: formatTime(store.ms, store.timezone, store.timezoneAbbreviation, 'h:mm:ss A'),
		date: formatTime(store.ms, store.timezone, store.timezoneAbbreviation, 'ddd MMM D'),
		location: store.name ?? 'Loading...',

		raw: {
			temperature: hourly?.temperature ?? null,
			humidity: hourly?.humidity ?? null,
			dewPoint: hourly?.dewPoint ?? null,
			precipitation,
			precipChance: hourly?.precipitationProbability ?? null,
			aqiUs: aq?.aqiUs ?? null,
			aqiEurope: aq?.aqiEurope ?? null,
		},
	};
}

// =============================================================================
// RE-EXPORTS for convenience
// =============================================================================

export type {
	DisplayBundle,
	TemperatureStats,
	IntervalItem,
	ForecastItem,
	AirQualityItem,
	MinutelyPoint,
};
