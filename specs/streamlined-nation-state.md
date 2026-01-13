# Streamlined Nation-State API

## TL;DR

Current NS has a **god object** problem: ~29 getters mixing raw state, lookups, and formatting.

**Solution: Thin NS + Pure Utils**

- NS keeps only raw state (flat, ~17 properties)
- Pure utility functions for lookups, formatting, derived values
- Components compose utils with raw state via `getDisplayBundle(ns)`

See `specs/sketches/thin-ns-utils.md` for implementation details.

---

## Architecture Layers

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
│  - getDisplayBundle(ns) - preferred pattern                  │
│  - Stateless, testable, reusable                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Thin NS (ns-weather-data.svelte.ts)                         │
│  - Raw state only (flat, ~17 properties)                     │
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

#### NS - Just Raw State (Flat)

```typescript
// ns-weather-data.svelte.ts

export function makeNsWeatherData() {
	// HOT STATE (changes at 15fps during scrubbing)
	let ms = $state(Date.now());
	let rawMs = Date.now();
	let radarPlaying = $state(false);
	let trackedElement = $state<HTMLElement | null>(null);

	// COLD STATE - location
	let coords = $state<Coordinates | null>(null);
	let name = $state<string | null>(null);
	let source = $state('???');

	// COLD STATE - timezone
	let timezone = $state('UTC');
	let timezoneAbbreviation = $state('UTC');
	let utcOffsetSeconds = $state(0);

	// COLD STATE - data
	let hourly = $state<HourlyData>(new Map());
	let daily = $state<DailyForecast[]>([]);
	let airQuality = $state<AirQualityData>(new Map());
	let radar = $state<Radar>({ generated: 0, host: '', frames: [] });

	// COLD STATE - settings
	let units = $state({ temperature: 'F' as 'C' | 'F' });
	let providerStatus = $state<Record<string, ProviderStatus>>({
		om: 'idle',
		omAir: 'idle',
	});

	// EVENT HANDLERS...

	// PUBLIC API - flat, raw state only
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
```

**29 → 17 properties** (removed ~12 lookup/formatting getters).

#### Utils - Pure Functions

```typescript
// lib/weather-utils.ts

// LOOKUPS - Get data at a point in time
export function getHourlyAt(hourly, ms, timezone): ForecastItem | null;
export function getAirQualityAt(airQuality, ms, timezone): AirQualityItem | null;
export function getDailyAt(daily, ms, timezone): DailyForecast | null;

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
	const time24 = $derived(formatTime(ns.ms, ns.timezone, ns.timezoneAbbreviation, 'HH:mm'));
</script>
```

### Comparison

| Aspect                   | Current (God Object)         | Thin NS + Utils                 |
| ------------------------ | ---------------------------- | ------------------------------- |
| NS properties            | 29                           | **17**                          |
| NS responsibility        | State + lookups + formatting | State only                      |
| Testing                  | Must mock NS                 | Utils are pure, trivial to test |
| Reusability              | Tied to NS instance          | Utils work anywhere             |
| Component verbosity      | Low                          | Medium (mitigated with bundles) |
| Adding new derived value | Modify NS                    | Add util function               |
