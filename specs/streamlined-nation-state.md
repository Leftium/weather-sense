# Streamlined Nation-State API

## TL;DR

Current NS has a **god object** problem: ~29 getters mixing raw state, lookups, and formatting.

**Solution: Thin NS + Pure Utils**

- NS reduced from 29 top-level properties to **6** (grouped, max depth 2)
- Pure utility functions for lookups, formatting, derived values
- Components compose utils with raw state

See `specs/sketches/thin-ns-utils.md` for implementation details.

---

## Architecture Layers

These improvements are independent and can be adopted in any order:

```
┌─────────────────────────────────────────────────────────────┐
│  Components                                                  │
│  - Use utils for formatting/lookups                          │
│  - Read state via getters                                    │
│  - Write via emit()                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Pure Utils (weather-utils.ts)                               │
│  - formatTemp(), formatTime(), getHourlyAt()                 │
│  - Stateless, testable, reusable                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Thin NS (ns-weather-data.svelte.ts)                         │
│  - Raw state only (~6 grouped properties)                    │
│  - Event handlers for mutations                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Data Layer (providers, _raw, unified)                       │
│  - Multi-provider fetch                                      │
│  - UTC normalization                                         │
│  - Provider status tracking                                  │
└─────────────────────────────────────────────────────────────┘
```

### Adoption Path

| Step | Change                     | Scope    | Benefit                            |
| ---- | -------------------------- | -------- | ---------------------------------- |
| 1    | Extract utils from NS      | Refactor | Testable pure functions            |
| 2    | Slim down NS getters       | Refactor | Smaller NS, clearer responsibility |
| 3    | Add provider status/errors | Addition | Better error handling              |
| 4    | Add multi-provider         | Feature  | OpenWeather integration            |

---

## Thin NS + Pure Utils

### Problem: God Object

Current NS mixes concerns:

```typescript
// Raw state (necessary) - ~7 getters
get coords() { return coords; }
get forecast() { return forecast; }
get ms() { return _hot.ms; }

// Lookups (could be utils) - ~10 getters
get displayTemperature() {
  return dataForecast.get(startOf(_hot.ms, 'hour', timezone))?.temperature;
}

// Formatting (could be utils) - ~5 methods
format(dataPath: string, showUnits = true) { ... }
tzFormat(ms: number, format = '...') { ... }

// Derived state (could be utils) - ~15 getters
get temperatureStats() { ... }
get intervals() { ... }
```

**Result**: ~29 getters/methods, hard to test, tightly coupled.

### Solution: Extract to Pure Utils

#### NS - Just Raw State (Grouped)

```typescript
// ns-weather-data.svelte.ts

export function makeNsWeatherData() {
	// HOT STATE (changes at 15fps during scrubbing)
	let ms = $state(Date.now());
	let rawMs = Date.now();
	let radarPlaying = $state(false);
	let trackedElement = $state<HTMLElement | null>(null);

	// COLD STATE (changes on fetch/user action)
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

	// GROUPED OBJECTS (stable references with nested getters)
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

	// PUBLIC API - 6 top-level properties, max depth 2
	return {
		hot, // { ms, rawMs, radarPlaying, trackedElement }
		tz, // { timezone, abbreviation, offsetSeconds }
		location, // { coords, name, source }
		data, // { hourly, daily, airQuality, radar }
		units, // { temperature: 'F' | 'C' }
		providerStatus, // { om: 'success', ... }
	};
}
```

**29 → 6 top-level properties**, max depth 2.

#### Why Grouping is Safe (No Perf Concerns)

Svelte 5 uses fine-grained reactivity via Proxies. Accessing `ns.data.hourly` doesn't trigger re-renders when `ns.data.radar` changes.

Key: use **stable object references** with nested getters (as shown above). Don't create new objects on each access.

#### Utils - Pure Functions

```typescript
// lib/weather-utils.ts

// LOOKUPS - Get data at a point in time
export function getHourlyAt(hourlyData, ms, timezone): ForecastItem | null;
export function getAirQualityAt(airQualityData, ms, timezone): AirQualityItem | null;
export function getDailyAt(dailyData, ms, timezone): DailyForecast | null;

// FORMATTING - Convert values to display strings
export function formatTemp(n, unit): string;
export function formatTime(ms, timezone, abbreviation, format): string;
export function formatPercent(n): string;

// BUNDLE - Get all common display values at once (preferred pattern)
export function getDisplayBundle(ns): DisplayBundle;
```

#### Component Usage

```svelte
<!-- Using bundle (preferred for multiple values) -->
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getDisplayBundle } from '$lib/weather-utils';

	const ns = getNsWeatherData();
	const display = $derived(getDisplayBundle(ns));
</script>

<p>{display.temperature}</p><p>{display.time}</p><p>{display.humidity}</p>
```

```svelte
<!-- Using individual utils (when you need custom formatting) -->
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getHourlyAt, formatTime } from '$lib/weather-utils';

	const ns = getNsWeatherData();

	// Custom: 24-hour time format
	const time24 = $derived(formatTime(ns.hot.ms, ns.tz.timezone, ns.tz.abbreviation, 'HH:mm'));
</script>
```

### Comparison

| Aspect                   | Current (God Object)         | Thin NS + Utils                 |
| ------------------------ | ---------------------------- | ------------------------------- |
| NS top-level properties  | 29                           | **6**                           |
| NS max depth             | 1                            | 2                               |
| NS responsibility        | State + lookups + formatting | State only                      |
| Testing                  | Must mock NS                 | Utils are pure, trivial to test |
| Reusability              | Tied to NS instance          | Utils work anywhere             |
| Component verbosity      | Low                          | Medium (mitigated with bundles) |
| Adding new derived value | Modify NS                    | Add util function               |
