/**
 * Pure utility functions for weather data.
 *
 * These functions are extracted from ns-weather-data to enable:
 * - Testability: Pure functions with no NS dependency
 * - Reusability: Can be used anywhere, not just with NS
 * - Thin NS: NS only holds raw state, display logic lives here
 *
 * Usage patterns:
 * 1. Bundle (preferred): `const display = $derived(getDisplayBundle(ns))`
 * 2. Individual: `const temp = $derived(formatTemp(hourly?.temperature, ns.units.temperature))`
 * 3. Custom: Use lookups + formatting separately for custom display logic
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezonePlugin from 'dayjs/plugin/timezone';

import { startOf, celcius } from '$lib/util';
import type { NsWeatherData } from '$lib/ns-weather-data.svelte';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

// =============================================================================
// LOOKUPS - Get data at a point in time
// =============================================================================

type ForecastItem = {
	ms: number;
	msPretty?: string;
	isDay: boolean;
	temperature: number;
	weatherCode: number;
	humidity: number;
	dewPoint: number;
	precipitation: number;
	precipitationProbability: number;
};

type AirQualityItem = {
	ms: number;
	msPretty?: string;
	aqiUs: number;
	aqiEurope: number;
};

/** Get hourly forecast data at a specific time (snaps to hour boundary) */
export function getHourlyAt(
	dataForecast: Map<number, ForecastItem> | null | undefined,
	ms: number,
	timezone: string,
): ForecastItem | null {
	if (!dataForecast?.size) return null;
	const hourMs = startOf(ms, 'hour', timezone);
	return dataForecast.get(hourMs) ?? null;
}

/** Get air quality data at a specific time (snaps to hour boundary) */
export function getAirQualityAt(
	dataAirQuality: Map<number, AirQualityItem> | null | undefined,
	ms: number,
	timezone: string,
): AirQualityItem | null {
	if (!dataAirQuality?.size) return null;
	const hourMs = startOf(ms, 'hour', timezone);
	return dataAirQuality.get(hourMs) ?? null;
}

// =============================================================================
// FORMATTING - Convert values to display strings
// =============================================================================

/** Format temperature with unit conversion */
export function formatTemp(n: number | null | undefined, unit: 'F' | 'C', showUnit = true): string {
	if (n == null) return '--';
	const value = unit === 'C' ? celcius(n) : n;
	const rounded = Math.round(value ?? 0);
	return showUnit ? `${rounded}°${unit}` : `${rounded}°`;
}

/** Format time in a specific timezone */
export function formatTime(
	ms: number,
	timezone: string,
	abbreviation: string,
	format = 'h:mm A',
): string {
	return dayjs.tz(ms, timezone).format(format).replace('z', abbreviation);
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
// BUNDLE - Get all common display values at once (PREFERRED PATTERN)
// =============================================================================

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

	// Raw values (for components that need numbers)
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

/** Get all common display values in one call */
export function getDisplayBundle(ns: NsWeatherData): DisplayBundle {
	const hourly = getHourlyAt(ns.dataForecast, ns.ms, ns.timezone);
	const aq = getAirQualityAt(ns.dataAirQuality, ns.ms, ns.timezone);

	return {
		// Formatted strings
		temperature: formatTemp(hourly?.temperature, ns.units.temperature),
		humidity: formatPercent(hourly?.humidity),
		dewPoint: formatTemp(hourly?.dewPoint, ns.units.temperature),
		precipitation: formatPrecip(hourly?.precipitation),
		precipChance: formatPercent(hourly?.precipitationProbability),
		weatherCode: hourly?.weatherCode ?? null,
		isDay: hourly?.isDay ?? true,

		aqiUs: formatAqi(aq?.aqiUs),
		aqiEurope: formatAqi(aq?.aqiEurope),

		time: formatTime(ns.ms, ns.timezone, ns.timezoneAbbreviation, 'h:mm:ss A'),
		date: formatTime(ns.ms, ns.timezone, ns.timezoneAbbreviation, 'ddd MMM D'),
		location: ns.name ?? 'Loading...',

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
// DERIVED DATA - Compute derived values from raw data
// =============================================================================

export type TemperatureStats = {
	minTemperature: number;
	maxTemperature: number;
	temperatureRange: number;
	minTemperatureOnly: number;
};

/** Calculate temperature statistics for y-axis scaling */
export function getTemperatureStats(
	dataForecast: Map<number, ForecastItem> | null | undefined,
): TemperatureStats | null {
	if (!dataForecast?.size) return null;

	const entries = [...dataForecast.values()];
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

// =============================================================================
// INTERVALS - Time intervals combining hourly forecast and radar frames
// =============================================================================

const MS_IN_MINUTE = 60 * 1000;

export type IntervalItem = {
	ms: number;
	x2: number;
};

type HourlyItem = { ms: number };
type RadarFrame = { ms: number };

/**
 * Build time intervals from hourly forecast and radar frames.
 * Each interval spans from one timestamp to just before the next.
 */
export function getIntervals(
	hourly: HourlyItem[] | null | undefined,
	radarFrames: RadarFrame[] | null | undefined,
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
