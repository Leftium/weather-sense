# Sketch: Thin NS + Pure Utils Architecture

This file demonstrates the proposed refactoring:

- NS reduced from 29 top-level properties to **6** (max depth 2)
- Pure utility functions for lookups, formatting, derived values
- Components compose utils with raw state via `getDisplayBundle(ns)`

---

## Part 1: Thin NS (ns-weather-data.svelte.ts)

```typescript
import { getEmitter } from '$lib/emitter';
import type { Coordinates, Radar } from '$lib/types';

// =============================================================================
// TYPES
// =============================================================================

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

type ProviderStatus = 'idle' | 'loading' | 'success' | 'error';

// Event types
type WeatherDataEvents = {
	weatherdata_requestedSetLocation: { source: string; coords?: Coordinates; name?: string };
	weatherdata_requestedSetTime: { ms: number };
	weatherdata_requestedToggleUnits: { temperature: boolean | string };
	weatherdata_requestedTogglePlay: undefined;
	weatherdata_requestedTrackingStart: { node: HTMLElement };
	weatherdata_requestedTrackingEnd: undefined;
};

// =============================================================================
// NS FACTORY
// =============================================================================

export function makeNsWeatherData() {
	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	// ---------------------------------------------------------------------------
	// HOT STATE (changes at 15fps during scrubbing)
	// ---------------------------------------------------------------------------
	let ms = $state(Date.now());
	let rawMs = Date.now(); // Non-reactive for polling
	let radarPlaying = $state(false);
	let trackedElement = $state<HTMLElement | null>(null);

	// ---------------------------------------------------------------------------
	// COLD STATE (changes on fetch/user action)
	// ---------------------------------------------------------------------------
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

	let providerStatus = $state<Record<string, ProviderStatus>>({
		om: 'idle',
		omAir: 'idle',
	});

	// ---------------------------------------------------------------------------
	// GROUPED OBJECTS (stable references with nested getters)
	// ---------------------------------------------------------------------------

	const hot = {
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
	};

	const tz = {
		get timezone() {
			return timezone;
		},
		get abbreviation() {
			return timezoneAbbreviation;
		},
		get offsetSeconds() {
			return utcOffsetSeconds;
		},
	};

	const location = {
		get coords() {
			return coords;
		},
		get name() {
			return name;
		},
		get source() {
			return source;
		},
	};

	const data = {
		get hourly() {
			return hourlyData;
		},
		get daily() {
			return dailyData;
		},
		get airQuality() {
			return airQualityData;
		},
		get radar() {
			return radar;
		},
	};

	// ---------------------------------------------------------------------------
	// EVENT HANDLERS
	// ---------------------------------------------------------------------------

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

		// Fetch logic would go here...
	});

	on('weatherdata_requestedToggleUnits', (params) => {
		if (params.temperature === 'C' || params.temperature === 'F') {
			units = { ...units, temperature: params.temperature };
		} else if (params.temperature) {
			units = { ...units, temperature: units.temperature === 'F' ? 'C' : 'F' };
		}
	});

	on('weatherdata_requestedTogglePlay', () => {
		radarPlaying = !radarPlaying;
	});

	on('weatherdata_requestedTrackingStart', ({ node }) => {
		trackedElement = node;
	});

	on('weatherdata_requestedTrackingEnd', () => {
		trackedElement = null;
		rawMs = Date.now();
		ms = Date.now();
	});

	// ---------------------------------------------------------------------------
	// PUBLIC API - 6 top-level properties, max depth 2
	// ---------------------------------------------------------------------------
	return {
		hot, // { ms, rawMs, radarPlaying, trackedElement }
		tz, // { timezone, abbreviation, offsetSeconds }
		location, // { coords, name, source }
		data, // { hourly, daily, airQuality, radar }
		units, // { temperature: 'F' | 'C' }
		providerStatus, // { om: 'success', ... }
	};
}

export type NsWeatherData = ReturnType<typeof makeNsWeatherData>;
```

### Property Access Examples

```typescript
// All access is max depth 2
ns.hot.ms; // number
ns.hot.rawMs; // number
ns.hot.radarPlaying; // boolean
ns.hot.trackedElement; // HTMLElement | null

ns.tz.timezone; // string (e.g., 'America/Los_Angeles')
ns.tz.abbreviation; // string (e.g., 'PST')
ns.tz.offsetSeconds; // number

ns.location.coords; // Coordinates | null
ns.location.name; // string | null
ns.location.source; // string

ns.data.hourly; // Map<number, ForecastItem>
ns.data.daily; // DailyForecast[]
ns.data.airQuality; // Map<number, AirQualityItem>
ns.data.radar; // Radar

ns.units.temperature; // 'F' | 'C'

ns.providerStatus.om; // 'idle' | 'loading' | 'success' | 'error'
ns.providerStatus.omAir; // 'idle' | 'loading' | 'success' | 'error'
```

---

## Part 2: Pure Utils (lib/weather-utils.ts)

```typescript
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

/** Get hourly forecast data at a specific time */
export function getHourlyAt(
	hourlyData: Map<number, ForecastItem> | null | undefined,
	ms: number,
	timezone: string,
): ForecastItem | null {
	if (!hourlyData?.size) return null;
	const hourMs = startOf(ms, 'hour', timezone);
	return hourlyData.get(hourMs) ?? null;
}

/** Get air quality data at a specific time */
export function getAirQualityAt(
	airQualityData: Map<number, AirQualityItem> | null | undefined,
	ms: number,
	timezone: string,
): AirQualityItem | null {
	if (!airQualityData?.size) return null;
	const hourMs = startOf(ms, 'hour', timezone);
	return airQualityData.get(hourMs) ?? null;
}

/** Get daily forecast for a specific day */
export function getDailyAt(
	dailyData: DailyForecast[] | null | undefined,
	ms: number,
	timezone: string,
): DailyForecast | null {
	if (!dailyData?.length) return null;
	const dayMs = startOf(ms, 'day', timezone);
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

// =============================================================================
// FORMATTING - Convert values to display strings
// =============================================================================

/** Format temperature with unit conversion */
export function formatTemp(n: number | null | undefined, unit: 'F' | 'C'): string {
	if (n == null) return '--';
	const value = unit === 'C' ? celcius(n) : n;
	return `${Math.round(value ?? 0)}°${unit}`;
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
	const hourly = getHourlyAt(ns.data.hourly, ns.hot.ms, ns.tz.timezone);
	const aq = getAirQualityAt(ns.data.airQuality, ns.hot.ms, ns.tz.timezone);

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
		time: formatTime(ns.hot.ms, ns.tz.timezone, ns.tz.abbreviation, 'h:mm:ss A'),
		date: formatTime(ns.hot.ms, ns.tz.timezone, ns.tz.abbreviation, 'ddd MMM D'),
		location: ns.location.name ?? 'Loading...',
	};
}

// =============================================================================
// DERIVED DATA - Compute derived values from raw data
// =============================================================================

export type TemperatureStats = {
	min: number;
	max: number;
	range: number;
	minTempOnly: number;
};

/** Calculate temperature statistics for y-axis scaling */
export function getTemperatureStats(
	hourlyData: Map<number, ForecastItem> | null,
): TemperatureStats | null {
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
export function buildIntervals(ns: NsWeatherData): IntervalItem[] {
	const msSet = new Set<number>();

	// Add hourly timestamps
	if (ns.data.hourly) {
		for (const ms of ns.data.hourly.keys()) {
			msSet.add(ms);
		}
	}

	// Add radar frame timestamps
	if (ns.data.radar?.frames) {
		for (const frame of ns.data.radar.frames) {
			msSet.add(frame.ms);
		}
		const lastFrame = ns.data.radar.frames.at(-1);
		if (lastFrame) {
			msSet.add(lastFrame.ms + 10 * 60 * 1000);
		}
	}

	// Build intervals
	const sorted = [...msSet].sort((a, b) => a - b);
	return sorted.map((ms, i) => ({
		ms,
		msEnd: sorted[i + 1] ? sorted[i + 1] - 1 : ms,
		msPretty: formatTime(ms, ns.tz.timezone, ns.tz.abbreviation),
	}));
}
```

---

## Part 3: Component Usage Examples

### Example 1: Using bundle (preferred for multiple values)

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

### Example 2: Raw values + custom formatting

```svelte
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getHourlyAt, formatTime, celcius } from '$lib/weather-utils';

	const ns = getNsWeatherData();

	// Custom: show temp with decimal
	const preciseTemp = $derived.by(() => {
		const hourly = getHourlyAt(ns.data.hourly, ns.hot.ms, ns.tz.timezone);
		if (!hourly) return '--';
		const value = ns.units.temperature === 'C' ? celcius(hourly.temperature) : hourly.temperature;
		return `${value.toFixed(1)}°${ns.units.temperature}`;
	});

	// Custom: 24-hour time format
	const time24 = $derived(formatTime(ns.hot.ms, ns.tz.timezone, ns.tz.abbreviation, 'HH:mm'));
</script>

<div class="precise-display">
	<p>{preciseTemp}</p>
	<p>{time24}</p>
</div>
```

### Example 3: Timeline component (raw ms + derived intervals)

```svelte
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getEmitter } from '$lib/emitter';
	import { buildIntervals, formatTime } from '$lib/weather-utils';

	const ns = getNsWeatherData();
	const { emit } = getEmitter('weatherdata');

	// Raw ms for positioning
	const currentMs = $derived(ns.hot.ms);

	// Derived intervals
	const intervals = $derived(buildIntervals(ns));

	// Formatted time for display
	const timeLabel = $derived(formatTime(ns.hot.ms, ns.tz.timezone, ns.tz.abbreviation, 'h:mm A'));

	function handleScrub(newMs: number) {
		emit('weatherdata_requestedSetTime', { ms: newMs });
	}
</script>

<div class="timeline">
	<span class="time-label">{timeLabel}</span>
	<Scrubber value={currentMs} {intervals} onchange={handleScrub} />
</div>
```

---

## Part 4: Testing Examples

```typescript
// weather-utils.test.ts

import { describe, it, expect } from 'vitest';
import { formatTemp, formatPercent, getHourlyAt, getTemperatureStats } from './weather-utils';

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

---

## Summary

| Aspect               | Before  | After                   |
| -------------------- | ------- | ----------------------- |
| Top-level properties | 29      | **6**                   |
| Max depth            | 1       | 2                       |
| Getters in NS        | 29      | 16 (nested in 6 groups) |
| Display logic        | In NS   | In utils (bundle)       |
| Derived values       | In NS   | In utils                |
| Testing              | Mock NS | Pure functions          |
