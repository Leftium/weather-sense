# Sketch: Thin NS + Pure Utils Architecture

This file demonstrates the proposed refactoring:

- NS keeps only raw state (flat, ~17 properties)
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
	// COLD STATE - location
	// ---------------------------------------------------------------------------
	let coords = $state<Coordinates | null>(null);
	let name = $state<string | null>(null);
	let source = $state('???');

	// ---------------------------------------------------------------------------
	// COLD STATE - timezone
	// ---------------------------------------------------------------------------
	let timezone = $state('UTC');
	let timezoneAbbreviation = $state('UTC');
	let utcOffsetSeconds = $state(0);

	// ---------------------------------------------------------------------------
	// COLD STATE - data
	// ---------------------------------------------------------------------------
	let hourly = $state<HourlyData>(new Map());
	let daily = $state<DailyForecast[]>([]);
	let airQuality = $state<AirQualityData>(new Map());
	let radar = $state<Radar>({ generated: 0, host: '', frames: [] });

	// ---------------------------------------------------------------------------
	// COLD STATE - settings
	// ---------------------------------------------------------------------------
	let units = $state({ temperature: 'F' as 'C' | 'F' });
	let providerStatus = $state<Record<string, ProviderStatus>>({
		om: 'idle',
		omAir: 'idle',
	});

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
	// PUBLIC API - flat, raw state only (~17 properties)
	// ---------------------------------------------------------------------------
	return {
		// Hot
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

		// Data
		get hourly() {
			return hourly;
		},
		get daily() {
			return daily;
		},
		get airQuality() {
			return airQuality;
		},
		get radar() {
			return radar;
		},

		// Settings
		get units() {
			return units;
		},
		get providerStatus() {
			return providerStatus;
		},
	};
}

export type NsWeatherData = ReturnType<typeof makeNsWeatherData>;
```

### Property Access Examples

```typescript
// All flat access
ns.ms; // number
ns.rawMs; // number
ns.radarPlaying; // boolean
ns.trackedElement; // HTMLElement | null

ns.coords; // Coordinates | null
ns.name; // string | null
ns.source; // string

ns.timezone; // string (e.g., 'America/Los_Angeles')
ns.timezoneAbbreviation; // string (e.g., 'PST')
ns.utcOffsetSeconds; // number

ns.hourly; // Map<number, ForecastItem>
ns.daily; // DailyForecast[]
ns.airQuality; // Map<number, AirQualityItem>
ns.radar; // Radar

ns.units.temperature; // 'F' | 'C'
ns.providerStatus.om; // 'idle' | 'loading' | 'success' | 'error'
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
	hourly: Map<number, ForecastItem> | null | undefined,
	ms: number,
	timezone: string,
): ForecastItem | null {
	if (!hourly?.size) return null;
	const hourMs = startOf(ms, 'hour', timezone);
	return hourly.get(hourMs) ?? null;
}

/** Get air quality data at a specific time */
export function getAirQualityAt(
	airQuality: Map<number, AirQualityItem> | null | undefined,
	ms: number,
	timezone: string,
): AirQualityItem | null {
	if (!airQuality?.size) return null;
	const hourMs = startOf(ms, 'hour', timezone);
	return airQuality.get(hourMs) ?? null;
}

/** Get daily forecast for a specific day */
export function getDailyAt(
	daily: DailyForecast[] | null | undefined,
	ms: number,
	timezone: string,
): DailyForecast | null {
	if (!daily?.length) return null;
	const dayMs = startOf(ms, 'day', timezone);
	return daily.find((d) => d.ms === dayMs) ?? null;
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
	const hourlyItem = getHourlyAt(ns.hourly, ns.ms, ns.timezone);
	const aqItem = getAirQualityAt(ns.airQuality, ns.ms, ns.timezone);

	return {
		temperature: formatTemp(hourlyItem?.temperature, ns.units.temperature),
		humidity: formatPercent(hourlyItem?.humidity),
		dewPoint: formatTemp(hourlyItem?.dewPoint, ns.units.temperature),
		precipitation: formatPrecip(hourlyItem?.precipitation),
		precipChance: formatPercent(hourlyItem?.precipitationProbability),
		weatherCode: hourlyItem?.weatherCode ?? null,
		isDay: hourlyItem?.isDay ?? true,
		aqiUs: formatAqi(aqItem?.aqiUs),
		aqiEurope: formatAqi(aqItem?.aqiEurope),
		time: formatTime(ns.ms, ns.timezone, ns.timezoneAbbreviation, 'h:mm:ss A'),
		date: formatTime(ns.ms, ns.timezone, ns.timezoneAbbreviation, 'ddd MMM D'),
		location: ns.name ?? 'Loading...',
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
	hourly: Map<number, ForecastItem> | null,
): TemperatureStats | null {
	if (!hourly?.size) return null;

	const entries = [...hourly.values()];
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
	if (ns.hourly) {
		for (const ms of ns.hourly.keys()) {
			msSet.add(ms);
		}
	}

	// Add radar frame timestamps
	if (ns.radar?.frames) {
		for (const frame of ns.radar.frames) {
			msSet.add(frame.ms);
		}
		const lastFrame = ns.radar.frames.at(-1);
		if (lastFrame) {
			msSet.add(lastFrame.ms + 10 * 60 * 1000);
		}
	}

	// Build intervals
	const sorted = [...msSet].sort((a, b) => a - b);
	return sorted.map((ms, i) => ({
		ms,
		msEnd: sorted[i + 1] ? sorted[i + 1] - 1 : ms,
		msPretty: formatTime(ms, ns.timezone, ns.timezoneAbbreviation),
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
		const hourlyItem = getHourlyAt(ns.hourly, ns.ms, ns.timezone);
		if (!hourlyItem) return '--';
		const value =
			ns.units.temperature === 'C' ? celcius(hourlyItem.temperature) : hourlyItem.temperature;
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

### Example 3: Timeline component (raw ms + derived intervals)

```svelte
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getEmitter } from '$lib/emitter';
	import { buildIntervals, formatTime } from '$lib/weather-utils';

	const ns = getNsWeatherData();
	const { emit } = getEmitter('weatherdata');

	// Raw ms for positioning
	const currentMs = $derived(ns.ms);

	// Derived intervals
	const intervals = $derived(buildIntervals(ns));

	// Formatted time for display
	const timeLabel = $derived(formatTime(ns.ms, ns.timezone, ns.timezoneAbbreviation, 'h:mm A'));

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

| Aspect            | Before                       | After             |
| ----------------- | ---------------------------- | ----------------- |
| NS properties     | 29                           | **17**            |
| NS responsibility | State + lookups + formatting | State only        |
| Display logic     | In NS                        | In utils (bundle) |
| Derived values    | In NS                        | In utils          |
| Testing           | Mock NS                      | Pure functions    |
