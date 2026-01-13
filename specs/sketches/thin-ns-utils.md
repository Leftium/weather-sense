# Sketch: Thin NS + Pure Utils Architecture

This file demonstrates the proposed refactoring:

- NS reduced to ~12 raw state getters (from ~40)
- Pure utility functions for lookups, formatting, derived values
- Components compose utils with raw state

---

## Part 1: Thin NS (ns-weather-data.svelte.ts)

```typescript
import { getEmitter } from '$lib/emitter';
import type { Coordinates, Radar } from '$lib/types';

// Types for the raw data structures
type HourlyData = Map<number, ForecastItem>;
type AirQualityData = Map<number, AirQualityItem>;

type ForecastItem = {
	ms: number;
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
	aqiUs: number;
	aqiEurope: number;
};

type DailyForecast = {
	ms: number;
	compactDate: string;
	fromToday: number;
	sunrise: number;
	sunset: number;
	weatherCode: number;
	temperatureMax: number;
	temperatureMin: number;
	precipitation: number;
};

// Event types (unchanged from current)
type WeatherDataEvents = {
	weatherdata_requestedSetLocation: { source: string; coords?: Coordinates; name?: string };
	weatherdata_requestedSetTime: { ms: number };
	weatherdata_requestedToggleUnits: { temperature: boolean | string };
	weatherdata_requestedTogglePlay: undefined;
	weatherdata_requestedTrackingStart: { node: HTMLElement };
	weatherdata_requestedTrackingEnd: undefined;
	// ... other events
};

export function makeNsWeatherData() {
	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	// -------------------------------------------------------------------------
	// HOT STATE (changes at 15fps during scrubbing)
	// -------------------------------------------------------------------------
	let ms = $state(Date.now());
	let rawMs = Date.now(); // Non-reactive for polling
	let radarPlaying = $state(false);
	let trackedElement = $state<HTMLElement | null>(null);

	// -------------------------------------------------------------------------
	// COLD STATE (changes on fetch/user action)
	// -------------------------------------------------------------------------
	let coords = $state<Coordinates | null>(null);
	let name = $state<string | null>(null);
	let source = $state('???');

	let timezone = $state('UTC');
	let timezoneAbbreviation = $state('UTC');
	let utcOffsetSeconds = $state(0);

	let units = $state({ temperature: 'F' as 'C' | 'F' });

	let hourlyData = $state<HourlyData>(new Map());
	let airQualityData = $state<AirQualityData>(new Map());
	let dailyData = $state<DailyForecast[]>([]);
	let radar = $state<Radar>({ generated: 0, host: '', frames: [] });

	let providerStatus = $state<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({
		om: 'idle',
		omAir: 'idle',
	});

	// -------------------------------------------------------------------------
	// EVENT HANDLERS (internal - mutations happen here)
	// -------------------------------------------------------------------------
	on('weatherdata_requestedSetTime', ({ ms: newMs }) => {
		rawMs = newMs;
		if (!trackedElement) {
			ms = newMs;
		}
	});

	on('weatherdata_requestedSetLocation', async (params) => {
		source = params.source;
		if (params.coords) coords = params.coords;
		if (params.name) name = params.name;

		providerStatus = { ...providerStatus, om: 'loading', omAir: 'loading' };

		// Fetch logic...
	});

	on('weatherdata_requestedToggleUnits', (params) => {
		if (params.temperature === 'C' || params.temperature === 'F') {
			units = { ...units, temperature: params.temperature };
		} else if (params.temperature) {
			units = { ...units, temperature: units.temperature === 'F' ? 'C' : 'F' };
		}
	});

	// ... other handlers

	// -------------------------------------------------------------------------
	// PUBLIC API - RAW STATE ONLY (~12 getters)
	// -------------------------------------------------------------------------
	return {
		// Hot state
		get ms() {
			return ms;
		},
		get rawMs() {
			return rawMs;
		},
		get radarPlaying() {
			return radarPlaying;
		},
		get trackedElement() {
			return trackedElement;
		},

		// Location
		get coords() {
			return coords;
		},
		get name() {
			return name;
		},
		get source() {
			return source;
		},

		// Timezone
		get timezone() {
			return timezone;
		},
		get timezoneAbbreviation() {
			return timezoneAbbreviation;
		},
		get utcOffsetSeconds() {
			return utcOffsetSeconds;
		},

		// Settings
		get units() {
			return units;
		},

		// Data (raw)
		get hourlyData() {
			return hourlyData;
		},
		get airQualityData() {
			return airQualityData;
		},
		get dailyData() {
			return dailyData;
		},
		get radar() {
			return radar;
		},

		// Status
		get providerStatus() {
			return providerStatus;
		},
	};
}

export type NsWeatherData = ReturnType<typeof makeNsWeatherData>;
```

---

## Part 2: Pure Utils (lib/weather-utils.ts)

```typescript
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { startOf, celcius } from '$lib/util';

dayjs.extend(timezone);

// -----------------------------------------------------------------------------
// LOOKUPS - Get data at a point in time
// -----------------------------------------------------------------------------

/** Get hourly forecast data at a specific time */
export function getHourlyAt(
	hourlyData: HourlyData | null | undefined,
	ms: number,
	tz: string,
): ForecastItem | null {
	if (!hourlyData?.size) return null;
	const hourMs = startOf(ms, 'hour', tz);
	return hourlyData.get(hourMs) ?? null;
}

/** Get air quality data at a specific time */
export function getAirQualityAt(
	airQualityData: AirQualityData | null | undefined,
	ms: number,
	tz: string,
): AirQualityItem | null {
	if (!airQualityData?.size) return null;
	const hourMs = startOf(ms, 'hour', tz);
	return airQualityData.get(hourMs) ?? null;
}

/** Get daily forecast for a specific day */
export function getDailyAt(
	dailyData: DailyForecast[] | null | undefined,
	ms: number,
	tz: string,
): DailyForecast | null {
	if (!dailyData?.length) return null;
	const dayMs = startOf(ms, 'day', tz);
	return dailyData.find((d) => d.ms === dayMs) ?? null;
}

/** Get radar frame closest to a specific time */
export function getRadarFrameAt(
	radar: Radar | null | undefined,
	ms: number,
): { ms: number; path: string } | null {
	if (!radar?.frames?.length) return null;
	return radar.frames.reduce((closest, frame) =>
		Math.abs(frame.ms - ms) < Math.abs(closest.ms - ms) ? frame : closest,
	);
}

// -----------------------------------------------------------------------------
// FORMATTING - Convert values to display strings
// -----------------------------------------------------------------------------

/** Format temperature with unit conversion */
export function formatTemp(n: number | null | undefined, unit: 'F' | 'C'): string {
	if (n == null) return '--';
	const value = unit === 'C' ? celcius(n) : n;
	return `${Math.round(value ?? 0)}°${unit}`;
}

/** Format time in a specific timezone */
export function formatTime(ms: number, tz: string, tzAbbr: string, format = 'h:mm A'): string {
	return dayjs.tz(ms, tz).format(format).replace('z', tzAbbr);
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

/** Format AQI with label */
export function formatAqi(n: number | null | undefined): string {
	if (n == null) return '--';
	return String(Math.round(n));
}

// -----------------------------------------------------------------------------
// COMBINED DISPLAY HELPERS - Lookup + Format in one call
// -----------------------------------------------------------------------------

/** Get formatted temperature at current time */
export function getDisplayTemp(ns: NsWeatherData): string {
	const hourly = getHourlyAt(ns.hourlyData, ns.ms, ns.timezone);
	return formatTemp(hourly?.temperature, ns.units.temperature);
}

/** Get formatted humidity at current time */
export function getDisplayHumidity(ns: NsWeatherData): string {
	const hourly = getHourlyAt(ns.hourlyData, ns.ms, ns.timezone);
	return formatPercent(hourly?.humidity);
}

/** Get formatted dew point at current time */
export function getDisplayDewPoint(ns: NsWeatherData): string {
	const hourly = getHourlyAt(ns.hourlyData, ns.ms, ns.timezone);
	return formatTemp(hourly?.dewPoint, ns.units.temperature);
}

/** Get formatted precipitation at current time */
export function getDisplayPrecip(ns: NsWeatherData): string {
	const hourly = getHourlyAt(ns.hourlyData, ns.ms, ns.timezone);
	return formatPrecip(hourly?.precipitation);
}

/** Get formatted precipitation probability at current time */
export function getDisplayPrecipChance(ns: NsWeatherData): string {
	const hourly = getHourlyAt(ns.hourlyData, ns.ms, ns.timezone);
	return formatPercent(hourly?.precipitationProbability);
}

/** Get weather code at current time */
export function getDisplayWeatherCode(ns: NsWeatherData): number | null {
	const hourly = getHourlyAt(ns.hourlyData, ns.ms, ns.timezone);
	return hourly?.weatherCode ?? null;
}

/** Get isDay at current time */
export function getDisplayIsDay(ns: NsWeatherData): boolean {
	const hourly = getHourlyAt(ns.hourlyData, ns.ms, ns.timezone);
	return hourly?.isDay ?? true;
}

/** Get formatted AQI (US) at current time */
export function getDisplayAqiUs(ns: NsWeatherData): string {
	const aq = getAirQualityAt(ns.airQualityData, ns.ms, ns.timezone);
	return formatAqi(aq?.aqiUs);
}

/** Get formatted AQI (Europe) at current time */
export function getDisplayAqiEurope(ns: NsWeatherData): string {
	const aq = getAirQualityAt(ns.airQualityData, ns.ms, ns.timezone);
	return formatAqi(aq?.aqiEurope);
}

/** Get formatted current time */
export function getDisplayTime(ns: NsWeatherData, format = 'h:mm:ss A'): string {
	return formatTime(ns.ms, ns.timezone, ns.timezoneAbbreviation, format);
}

// -----------------------------------------------------------------------------
// BUNDLE - Get all common display values at once
// -----------------------------------------------------------------------------

export type DisplayBundle = {
	temperature: string;
	humidity: string;
	dewPoint: string;
	precipitation: string;
	precipChance: string;
	weatherCode: number | null;
	isDay: boolean;
	aqiUs: string;
	aqiEurope: string;
	time: string;
	date: string;
	location: string;
};

/** Get all common display values in one call */
export function getDisplayBundle(ns: NsWeatherData): DisplayBundle {
	const hourly = getHourlyAt(ns.hourlyData, ns.ms, ns.timezone);
	const aq = getAirQualityAt(ns.airQualityData, ns.ms, ns.timezone);

	return {
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
	};
}

// -----------------------------------------------------------------------------
// DERIVED DATA - Compute derived values from raw data
// -----------------------------------------------------------------------------

export type TemperatureStats = {
	min: number;
	max: number;
	range: number;
	minTempOnly: number; // Excluding dew point
};

/** Calculate temperature statistics for y-axis scaling */
export function getTemperatureStats(hourlyData: HourlyData | null): TemperatureStats | null {
	if (!hourlyData?.size) return null;

	const entries = [...hourlyData.values()];
	const temps = entries.map((h) => h.temperature);
	const dewPoints = entries.map((h) => h.dewPoint);

	const minTemp = Math.min(...temps);
	const maxTemp = Math.max(...temps);
	const minDewPoint = Math.min(...dewPoints);

	return {
		min: Math.min(minTemp, minDewPoint),
		max: maxTemp,
		range: maxTemp - Math.min(minTemp, minDewPoint),
		minTempOnly: minTemp,
	};
}

export type IntervalItem = {
	ms: number;
	msEnd: number;
	msPretty?: string;
};

/** Build intervals from hourly data and radar frames */
export function buildIntervals(
	hourlyData: HourlyData | null,
	radar: Radar | null,
	tz: string,
	tzAbbr: string,
): IntervalItem[] {
	const msSet = new Set<number>();

	// Add hourly timestamps
	if (hourlyData) {
		for (const ms of hourlyData.keys()) {
			msSet.add(ms);
		}
	}

	// Add radar frame timestamps
	if (radar?.frames) {
		for (const frame of radar.frames) {
			msSet.add(frame.ms);
		}
		// Add end of last radar frame
		const lastFrame = radar.frames.at(-1);
		if (lastFrame) {
			msSet.add(lastFrame.ms + 10 * 60 * 1000);
		}
	}

	// Build intervals
	const sorted = [...msSet].sort((a, b) => a - b);
	return sorted.map((ms, i) => ({
		ms,
		msEnd: sorted[i + 1] ? sorted[i + 1] - 1 : ms,
		msPretty: formatTime(ms, tz, tzAbbr),
	}));
}
```

---

## Part 3: Component Usage Examples

### Example 1: Simple component using individual utils

```svelte
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getDisplayTemp, getDisplayTime, getDisplayHumidity } from '$lib/weather-utils';

	const ns = getNsWeatherData();

	const temp = $derived(getDisplayTemp(ns));
	const time = $derived(getDisplayTime(ns));
	const humidity = $derived(getDisplayHumidity(ns));
</script>

<div class="current-weather">
	<h1>{ns.name ?? 'Loading...'}</h1>
	<p class="temp">{temp}</p>
	<p class="time">{time}</p>
	<p>Humidity: {humidity}</p>
</div>
```

### Example 2: Component using bundle for many values

```svelte
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getDisplayBundle } from '$lib/weather-utils';

	const ns = getNsWeatherData();
	const display = $derived(getDisplayBundle(ns));
</script>

<div class="weather-card">
	<h1>{display.location}</h1>
	<p class="temp">{display.temperature}</p>
	<p class="time">{display.time} - {display.date}</p>
	<div class="details">
		<span>Humidity: {display.humidity}</span>
		<span>Dew Point: {display.dewPoint}</span>
		<span>Precip: {display.precipChance}</span>
		<span>AQI: {display.aqiUs}</span>
	</div>
</div>
```

### Example 3: Component that needs raw values (Timeline)

```svelte
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getEmitter } from '$lib/emitter';
	import { buildIntervals, getDisplayTime } from '$lib/weather-utils';

	const ns = getNsWeatherData();
	const { emit } = getEmitter('weatherdata');

	// Raw ms for positioning
	const currentMs = $derived(ns.ms);

	// Derived intervals
	const intervals = $derived(
		buildIntervals(ns.hourlyData, ns.radar, ns.timezone, ns.timezoneAbbreviation),
	);

	// Formatted time for display
	const timeLabel = $derived(getDisplayTime(ns));

	function handleScrub(newMs: number) {
		emit('weatherdata_requestedSetTime', { ms: newMs });
	}
</script>

<div class="timeline">
	<span class="time-label">{timeLabel}</span>
	<Scrubber value={currentMs} {intervals} onchange={handleScrub} />
</div>
```

### Example 4: Component with custom formatting

```svelte
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getHourlyAt, formatTemp, formatTime } from '$lib/weather-utils';

	const ns = getNsWeatherData();

	// Custom: show temp with decimal
	const preciseTemp = $derived(() => {
		const hourly = getHourlyAt(ns.hourlyData, ns.ms, ns.timezone);
		if (!hourly) return '--';
		const value = ns.units.temperature === 'C' ? celcius(hourly.temperature) : hourly.temperature;
		return `${value.toFixed(1)}°${ns.units.temperature}`;
	});

	// Custom: 24-hour time format
	const time24 = $derived(formatTime(ns.ms, ns.timezone, ns.timezoneAbbreviation, 'HH:mm'));
</script>

<div class="precise-display">
	<p>{preciseTemp}</p>
	<p>{time24}</p>
</div>
```

---

## Part 4: Testing Examples

```typescript
// weather-utils.test.ts

import { describe, it, expect } from 'vitest';
import {
	formatTemp,
	formatPercent,
	getHourlyAt,
	getDisplayBundle,
	getTemperatureStats,
	buildIntervals,
} from './weather-utils';

describe('formatTemp', () => {
	it('formats Fahrenheit', () => {
		expect(formatTemp(72.4, 'F')).toBe('72°F');
		expect(formatTemp(72.6, 'F')).toBe('73°F');
	});

	it('converts and formats Celsius', () => {
		expect(formatTemp(72, 'C')).toBe('22°C');
		expect(formatTemp(32, 'C')).toBe('0°C');
	});

	it('handles null/undefined', () => {
		expect(formatTemp(null, 'F')).toBe('--');
		expect(formatTemp(undefined, 'C')).toBe('--');
	});
});

describe('formatPercent', () => {
	it('formats percentages', () => {
		expect(formatPercent(65.4)).toBe('65%');
		expect(formatPercent(0)).toBe('0%');
		expect(formatPercent(100)).toBe('100%');
	});

	it('handles null/undefined', () => {
		expect(formatPercent(null)).toBe('--');
	});
});

describe('getHourlyAt', () => {
	const mockData = new Map([
		[
			1705363200000,
			{
				ms: 1705363200000,
				temperature: 72,
				humidity: 65,
				isDay: true,
				weatherCode: 0,
				dewPoint: 55,
				precipitation: 0,
				precipitationProbability: 10,
			},
		],
		[
			1705366800000,
			{
				ms: 1705366800000,
				temperature: 70,
				humidity: 68,
				isDay: true,
				weatherCode: 1,
				dewPoint: 54,
				precipitation: 0,
				precipitationProbability: 15,
			},
		],
	]);

	it('returns data at exact hour', () => {
		const result = getHourlyAt(mockData, 1705363200000, 'UTC');
		expect(result?.temperature).toBe(72);
	});

	it('snaps to hour boundary', () => {
		// 30 minutes past the hour should snap to the hour
		const result = getHourlyAt(mockData, 1705363200000 + 30 * 60 * 1000, 'UTC');
		expect(result?.temperature).toBe(72);
	});

	it('returns null for empty/null data', () => {
		expect(getHourlyAt(null, 1705363200000, 'UTC')).toBeNull();
		expect(getHourlyAt(new Map(), 1705363200000, 'UTC')).toBeNull();
	});
});

describe('getTemperatureStats', () => {
	const mockData = new Map([
		[
			1,
			{
				ms: 1,
				temperature: 70,
				dewPoint: 50,
				humidity: 0,
				isDay: true,
				weatherCode: 0,
				precipitation: 0,
				precipitationProbability: 0,
			},
		],
		[
			2,
			{
				ms: 2,
				temperature: 80,
				dewPoint: 55,
				humidity: 0,
				isDay: true,
				weatherCode: 0,
				precipitation: 0,
				precipitationProbability: 0,
			},
		],
		[
			3,
			{
				ms: 3,
				temperature: 75,
				dewPoint: 52,
				humidity: 0,
				isDay: true,
				weatherCode: 0,
				precipitation: 0,
				precipitationProbability: 0,
			},
		],
	]);

	it('calculates correct stats', () => {
		const stats = getTemperatureStats(mockData);
		expect(stats?.min).toBe(50); // Lowest dew point
		expect(stats?.max).toBe(80); // Highest temp
		expect(stats?.range).toBe(30);
		expect(stats?.minTempOnly).toBe(70); // Lowest temp (excluding dew point)
	});

	it('returns null for empty data', () => {
		expect(getTemperatureStats(null)).toBeNull();
		expect(getTemperatureStats(new Map())).toBeNull();
	});
});
```
