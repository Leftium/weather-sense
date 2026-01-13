# Streamlined Nation-State API

## TL;DR

Current NS pattern has two issues:

1. **Verbose events** - Event name repeated 3 times (type def, handler, emit)
2. **God object** - NS has ~40 getters mixing raw state, lookups, and formatting

Proposed solutions (orthogonal, can adopt independently):

1. **Streamlined createNs()** - Method-based API reduces event boilerplate
2. **Thin NS + Pure Utils** - Extract formatting/lookups to pure functions, NS keeps only raw state (~7 getters)
3. **Event-based distribution** - Optional snapshot/patch events for read-side decoupling

---

## Architecture Layers

These improvements are independent and can be adopted in any order:

```
┌─────────────────────────────────────────────────────────────┐
│  Components                                                  │
│  - Use utils for formatting/lookups                          │
│  - Read state via getters OR event subscription              │
│  - Write via emit() or ns.method()                           │
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
│  - Raw state only (~7 getters)                               │
│  - Event handlers for mutations                              │
│  - Optional: snapshot/patch emission                         │
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
| 4    | Add createNs() helper      | Optional | Less event boilerplate             |
| 5    | Add snapshot/patch events  | Optional | Read-side decoupling               |
| 6    | Add multi-provider         | Feature  | OpenWeather integration            |

---

---

## Current Pattern (Event-Based)

```typescript
// 1. Type definition
type WeatherDataEvents = {
	weatherdata_requestedSetTime: { ms: number };
	weatherdata_requestedSetLocation: { coords: Coords; name?: string };
};

// 2. Handler registration (in NS)
on('weatherdata_requestedSetTime', ({ ms }) => {
	_ms = ms;
});

// 3. Consumer emit
emit('weatherdata_requestedSetTime', { ms: 123 });
```

**Problems:**

- Event name appears 3 times
- Easy to typo event name
- Verbose emit syntax
- Shape defined separately from handler logic

---

## Proposed: Method + Event Hybrid

```typescript
// Type definition (once)
type Events = {
	setTime: { ms: number };
	setLocation: { coords: Coords; name?: string };
};

// Handler definition (once) - key = event name suffix
const ns = createNs<Events>('weatherdata', {
	setTime: ({ ms }) => {
		_ms = ms;
	},
	setLocation: ({ coords, name }) => {
		_coords = coords;
		_name = name;
	},
});

// Consumer option 1: method call (cleaner)
ns.setTime({ ms: 123 });

// Consumer option 2: emit (for decoupled components)
emit('weatherdata_setTime', { ms: 123 });
```

**Benefits:**

- Event name defined once (object key)
- Prefix defined once (`'weatherdata'`)
- Method call = emit + handle (no separate wiring)
- Full autocomplete on `ns.setTime(...)`
- Type-safe params

---

## How It Works

### Object Keys Survive Minification

```typescript
const actions = {
	setTime: ({ ms }) => {
		_ms = ms;
	},
};

// After minification:
// { setTime: (a) => { b = a.ms; } }
//   ^^^^^^^ key preserved!
```

Function/param names get mangled, but object keys don't.

### Implementation Options

Two approaches with different trade-offs:

#### Option A: Event-First (with opt-out)

Handler registered as listener. Method emits event, handler runs via event system.

```typescript
function createNs<Events extends Record<string, unknown>>(
	prefix: string,
	handlers: { [K in keyof Events]: (params: Events[K]) => void },
) {
	const { on, emit } = getEmitter<PrefixedEvents<Events>>(import.meta);
	const methods = {} as NsMethods<Events>;

	for (const [name, handler] of Object.entries(handlers)) {
		const eventName = `${prefix}_${name}`;

		// Register handler for incoming events
		on(eventName, handler);

		// Create method that emits (handler runs via listener)
		methods[name] = (params, { silent = false } = {}) => {
			if (silent) {
				handler(params); // direct call, no event
			} else {
				emit(eventName, params); // handler called via on() listener
			}
		};
	}

	return methods;
}
```

| Call                                   | Handler runs    | Event emitted | External listeners |
| -------------------------------------- | --------------- | ------------- | ------------------ |
| `ns.setTime({ ms })`                   | Yes (via event) | Yes           | Notified           |
| `ns.setTime({ ms }, { silent: true })` | Yes (direct)    | No            | Not notified       |
| `emit('weatherdata_setTime', { ms })`  | Yes (via event) | Yes           | Notified           |

**Pros:**

- External `emit()` works (decoupled components)
- Event-sourcing fully supported
- Opt-out for perf-critical paths

**Cons:**

- Event overhead on every call (unless `silent: true`)

#### Option D: Direct-First (no external emit)

Handler NOT registered as listener. Method calls handler directly.

```typescript
function createNsLocal<Events extends Record<string, unknown>>(
	prefix: string,
	handlers: { [K in keyof Events]: (params: Events[K]) => void },
) {
	const { emit } = getEmitter<PrefixedEvents<Events>>(import.meta);
	const methods = {} as NsMethods<Events>;

	for (const [name, handler] of Object.entries(handlers)) {
		const eventName = `${prefix}_${name}`;

		// NO on() registration - external emit won't trigger handler

		// Create method that calls directly + optionally emits for logging
		methods[name] = (params, { emit: shouldEmit = false } = {}) => {
			handler(params); // always direct
			if (shouldEmit) emit(eventName, params); // for logging/event-sourcing only
		};
	}

	return methods;
}
```

| Call                                  | Handler runs | Event emitted | External listeners        |
| ------------------------------------- | ------------ | ------------- | ------------------------- |
| `ns.setTime({ ms })`                  | Yes (direct) | No            | Not notified              |
| `ns.setTime({ ms }, { emit: true })`  | Yes (direct) | Yes           | Notified (but no handler) |
| `emit('weatherdata_setTime', { ms })` | No           | Yes           | Notified (but no handler) |

**Pros:**

- Zero event overhead by default
- Simpler mental model (just function calls)

**Cons:**

- External `emit()` won't trigger handler
- Must opt-in to emit for event-sourcing
- Decoupled components can't trigger NS methods via events

#### Choosing Between A and D

| Use case                                   | Recommendation       |
| ------------------------------------------ | -------------------- |
| Decoupled components need to trigger NS    | **A** (event-first)  |
| Event-sourcing / replay required           | **A** (event-first)  |
| Performance critical, no external triggers | **D** (direct-first) |
| Simple app, no cross-component events      | **D** (direct-first) |

Can also mix: use **A** for NS that needs external triggers, **D** for internal-only NS.

```typescript
// Type helpers
type PrefixedEvents<E, P extends string> = {
	[K in keyof E as `${P}_${K & string}`]: E[K];
};

type NsMethods<E> = {
	[K in keyof E]: (params: E[K], options?: { silent?: boolean } | { emit?: boolean }) => void;
};
```

---

## Type Safety

```typescript
type Events = {
	setTime: { ms: number };
};

const ns = createNs<Events>('weatherdata', {
	setTime: ({ ms }) => {
		_ms = ms;
	}, // OK

	foo: () => {}, // TS Error: 'foo' not in Events
});

ns.setTime({ ms: 'bad' }); // TS Error: string not assignable to number
ns.setTime({ wrong: 1 }); // TS Error: 'wrong' not in { ms: number }
```

---

## Searchability Trade-off

| Search for...       | Current                             | Proposed                  |
| ------------------- | ----------------------------------- | ------------------------- |
| All uses of setTime | `weatherdata_requestedSetTime`      | `ns.setTime` or `setTime` |
| Handler definition  | `on('weatherdata_requestedSetTime'` | `setTime:` in NS file     |
| Event in logs       | `weatherdata_requestedSetTime`      | `weatherdata_setTime`     |

**Mitigation:** Full event name still exists at runtime for logs, event-sourcing, debugging. Just constructed from prefix + key.

---

## Events Still Work (Option A only)

With Option A (event-first), external/decoupled components can still use events:

```typescript
// Component that doesn't import NS directly
import { getEmitter } from '$lib/emitter';
import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte';

const { emit, on } = getEmitter<WeatherDataEvents>(import.meta);

// Emit without NS reference - triggers handler!
emit('weatherdata_setTime', { ms: 123 });

// Listen for broadcasts
on('weatherdata_setTime', ({ ms }) => {
	console.log('time changed to', ms);
});
```

**Note:** With Option D (direct-first), external `emit()` will NOT trigger the handler - only `ns.setTime()` will.

---

## Event Sourcing Support

### Option A (event-first)

Events emitted by default, replay via `emit()`:

```typescript
// Record - events captured automatically
const eventLog: Array<{ type: string; params: unknown; timestamp: number }> = [];

// Replay - emit triggers handler
for (const event of eventLog) {
	emit(event.type, event.params);
}
```

### Option D (direct-first)

Must opt-in to emit, replay via method calls:

```typescript
// Record - must use { emit: true }
ns.setTime({ ms: 123 }, { emit: true }); // logs event

// Replay - use method, not emit (emit won't trigger handler)
for (const event of eventLog) {
	ns[event.type.replace('weatherdata_', '')]?.(event.params);
}
```

Option A is cleaner for event-sourcing. Option D requires more manual wiring.

---

## Migration Path

### Step 1: Add createNs alongside existing

```typescript
// Keep existing on() handlers
on('weatherdata_requestedSetTime', ({ ms }) => {
	_ms = ms;
});

// Add new method-based API
const methods = createNs<Events>('weatherdata', {
	setTime: ({ ms }) => {
		_ms = ms;
	}, // duplicate for now
});
```

### Step 2: Migrate consumers

```typescript
// Before
emit('weatherdata_requestedSetTime', { ms: 123 });

// After
ns.setTime({ ms: 123 });
```

### Step 3: Remove old handlers

Once all consumers migrated, remove duplicate `on()` registrations.

---

## Open Questions

1. **Naming convention change?**
   - Current: `weatherdata_requestedSetTime` (verbose, explicit direction)
   - Proposed: `weatherdata_setTime` (shorter)
   - Or keep `requested` prefix for clarity?

2. **Return values?**
   - Should methods return anything? Current events are fire-and-forget.
   - Could return `void` or `Promise<void>` for async handlers.

3. **Async handlers?**

   ```typescript
   const ns = createNs<Events>('weatherdata', {
   	async fetchData({ coords }) {
   		const data = await api.fetch(coords);
   		_data = data;
   	},
   });

   await ns.fetchData({ coords }); // wait for completion?
   ```

4. **Multiple NS coordination?**
   - NS-A method calls NS-B method directly?
   - Or still via events for decoupling?

---

## Decoupled Reads: Event-Based State Distribution

The current NS pattern couples components to NS via getters:

```typescript
// Every component imports NS and reads directly
const nsWeatherData = getNsWeatherData();
{
	nsWeatherData.coords;
}
{
	nsWeatherData.displayTemperature;
}
```

**Problems:**

- Components tightly coupled to NS structure
- Hard to test (must mock entire NS)
- Refactoring NS breaks all consumers
- Can't easily run components in isolation

### Proposed: Components Subscribe via Events

Instead of getters, components receive state updates via events:

```typescript
// Component subscribes to state updates
const weather = useWeatherState(); // hook handles subscription

// Reactive local state, decoupled from NS internals
{
	weather.coords;
}
{
	weather.displayTemperature;
}
```

**Challenge**: Sending full state on every update is expensive, especially during 15fps scrubbing.

**Solution**: Use patches for incremental updates.

### Snapshot + Patch Pattern

```typescript
// Full state for: initial load, new subscribers, error recovery
emit('weatherdata_snapshot', {
	version: 42,
	state: fullState,
});

// Patches for: incremental updates (especially hot state)
emit('weatherdata_patch', {
	version: 43,
	baseVersion: 42,
	patches: [{ op: 'replace', path: '/ms', value: 1705363200000 }],
});
```

#### When to Use Each

| Scenario                             | Send                  |
| ------------------------------------ | --------------------- |
| Component mounts                     | Snapshot              |
| Cold state changes (fetch, location) | Snapshot (simpler)    |
| Hot state changes (15fps scrub)      | Patches (performance) |
| Version mismatch detected            | Snapshot (recovery)   |

#### Simplified Hybrid

Skip patches for cold state entirely - only use for hot path:

```typescript
// Cold: full state, infrequent
emit('weatherdata_snapshot', fullColdState);

// Hot: minimal patch object at 15fps
emit('weatherdata_hotPatch', { ms: 1705363200000, trackedElement: null });
```

### Version-Based Consistency

Ensure patches apply in order:

```typescript
type PatchEvent = {
	baseVersion: number; // Apply only if local version matches
	version: number; // Version after applying
	patches: Patch[];
};

on('weatherdata_patch', (event) => {
	if (localVersion !== event.baseVersion) {
		// Missed patches - request full snapshot
		emit('weatherdata_requestSnapshot');
		return;
	}

	localState = applyPatches(localState, event.patches);
	localVersion = event.version;
});
```

**Alternative**: Use content hashes instead of versions to catch corruption bugs too.

### Generating Patches with Mutative

Use [Mutative](https://github.com/unadlib/mutative) (not Immer) for patch generation:

```typescript
import { create } from 'mutative';

let version = 0;

function updateState(recipe: (draft: State) => void) {
	const [nextState, patches] = create(state, recipe, { enablePatches: true });

	if (patches.length > 0) {
		version++;
		state = nextState;
		emit('weatherdata_patch', {
			baseVersion: version - 1,
			version,
			patches,
		});
	}
}

// Usage
updateState((draft) => {
	draft.coords = { latitude: 37.7, longitude: -122.4 };
	draft.name = 'San Francisco';
});
```

#### Why Mutative over Immer?

| Aspect            | Immer                   | Mutative           |
| ----------------- | ----------------------- | ------------------ |
| Mechanism         | Proxy-based             | Copy-on-write      |
| Performance       | Slower (proxy overhead) | ~10x faster        |
| Bundle size       | ~5KB                    | ~3KB               |
| API               | `produce()`             | Same API (drop-in) |
| Hot path friendly | No                      | **Yes**            |

Mutative's copy-on-write avoids proxy overhead, making it safe for hot state updates.

#### Hot Path Optimization

For maximum performance during 15fps scrubbing, skip Mutative entirely:

```typescript
// Hot path - manual patch, no library overhead
let pendingHotPatch: Partial<HotState> = {};

function setMs(ms: number) {
	_hot.ms = ms;
	_hot.rawMs = ms;
	pendingHotPatch.ms = ms;
}

// RAF loop batches and emits
function frameTick() {
	if (Object.keys(pendingHotPatch).length > 0) {
		emit('weatherdata_hotPatch', pendingHotPatch);
		pendingHotPatch = {};
	}
}
```

### Consumer Hook Implementation

```typescript
// lib/useWeatherState.svelte.ts
import { getEmitter } from '$lib/emitter';
import { apply } from 'mutative';

export function useWeatherState() {
	let state = $state<WeatherState | null>(null);
	let version = $state(0);

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	// Request initial snapshot
	$effect(() => {
		emit('weatherdata_requestSnapshot');
	});

	// Handle full snapshots
	on('weatherdata_snapshot', (event) => {
		state = event.state;
		version = event.version;
	});

	// Handle patches
	on('weatherdata_patch', (event) => {
		if (version !== event.baseVersion) {
			// Out of sync - request fresh snapshot
			emit('weatherdata_requestSnapshot');
			return;
		}

		state = apply(state, event.patches);
		version = event.version;
	});

	// Handle hot patches (no version check - last write wins)
	on('weatherdata_hotPatch', (patch) => {
		if (state) {
			Object.assign(state, patch);
		}
	});

	return {
		get current() {
			return state;
		},
		get version() {
			return version;
		},
	};
}
```

### Trade-offs Summary

| Aspect         | Getters (Current)      | Event + Patches       |
| -------------- | ---------------------- | --------------------- |
| Infrastructure | ~0 lines               | ~100-150 lines (once) |
| Per-component  | Import + wire NS       | `useWeatherState()`   |
| Coupling       | Direct to NS internals | Only to event schema  |
| Testing        | Mock entire NS         | Emit test events      |
| Refactoring NS | Breaks components      | Components unchanged  |
| Bundle size    | 0                      | +3KB (Mutative)       |

**Net result**: More upfront infrastructure, but less per-component boilerplate and better isolation.

### Implementation Checklist

- [ ] Add Mutative dependency: `pnpm add mutative`
- [ ] Create `useWeatherState()` hook
- [ ] Add version tracking to NS
- [ ] Emit snapshots on cold state changes
- [ ] Emit patches (or simple objects) for hot state
- [ ] Handle `weatherdata_requestSnapshot` event
- [ ] Migrate one component as proof of concept
- [ ] Measure performance impact

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

**Result**: ~40 getters/methods, hard to test, tightly coupled.

### Solution: Extract to Pure Utils

#### NS - Just Raw State

```typescript
// ns-weather-data.svelte.ts

export function makeNsWeatherData() {
  // State
  let coords = $state<Coordinates | null>(null);
  let name = $state<string | null>(null);
  let ms = $state(Date.now());
  let timezone = $state('UTC');
  let timezoneAbbreviation = $state('UTC');
  let units = $state({ temperature: 'F' as const });
  let forecast = $state<Forecast | null>(null);
  let radar = $state<Radar | null>(null);
  let providerStatus = $state<Record<string, ProviderStatus>>({});

  // Handlers (via events)
  on('setLocation', async (params) => { ... });
  on('setTime', (params) => { ms = params.ms; });
  on('toggleUnits', () => { ... });

  // Minimal API - just raw state
  return {
    get coords() { return coords; },
    get name() { return name; },
    get ms() { return ms; },
    get timezone() { return timezone; },
    get timezoneAbbreviation() { return timezoneAbbreviation; },
    get units() { return units; },
    get forecast() { return forecast; },
    get radar() { return radar; },
    get providerStatus() { return providerStatus; },
  };
}
```

**~9 getters** instead of ~40.

#### Utils - Pure Functions

```typescript
// lib/weather-utils.ts

import { startOf, celcius } from './util';
import dayjs from 'dayjs';

// =============================================================================
// LOOKUPS
// =============================================================================

export function getHourlyAt(
	forecast: Forecast | null,
	ms: number,
	timezone: string,
): HourlyForecast | null {
	if (!forecast) return null;
	const hourMs = startOf(ms, 'hour', timezone);
	return forecast.hourly.get(hourMs) ?? null;
}

export function getDailyAt(
	forecast: Forecast | null,
	ms: number,
	timezone: string,
): DailyForecast | null {
	if (!forecast) return null;
	const dayMs = startOf(ms, 'day', timezone);
	return forecast.daily.find((d) => d.ms === dayMs) ?? null;
}

export function getRadarFrameAt(radar: Radar | null, ms: number): RadarFrame | null {
	if (!radar?.frames.length) return null;
	// Find frame closest to ms
	return radar.frames.reduce((closest, frame) =>
		Math.abs(frame.ms - ms) < Math.abs(closest.ms - ms) ? frame : closest,
	);
}

// =============================================================================
// FORMATTING
// =============================================================================

export function formatTemp(n: number | null | undefined, unit: 'F' | 'C'): string {
	if (n == null) return '--';
	const value = unit === 'C' ? celcius(n) : n;
	return `${Math.round(value)}°${unit}`;
}

export function formatTime(ms: number, timezone: string, format = 'h:mm A'): string {
	return dayjs.tz(ms, timezone).format(format);
}

export function formatPercent(n: number | null | undefined): string {
	if (n == null) return '--';
	return `${Math.round(n)}%`;
}

export function formatPrecip(mm: number | null | undefined): string {
	if (mm == null) return '--';
	return `${mm.toFixed(1)} mm`;
}

// =============================================================================
// COMBINED HELPERS (convenience)
// =============================================================================

/** Get formatted temperature at current time */
export function getDisplayTemp(
	forecast: Forecast | null,
	ms: number,
	timezone: string,
	unit: 'F' | 'C',
): string {
	const hourly = getHourlyAt(forecast, ms, timezone);
	return formatTemp(hourly?.temperature, unit);
}

/** Get formatted humidity at current time */
export function getDisplayHumidity(
	forecast: Forecast | null,
	ms: number,
	timezone: string,
): string {
	const hourly = getHourlyAt(forecast, ms, timezone);
	return formatPercent(hourly?.humidity);
}

/** Get weather icon name at current time */
export function getDisplayIcon(forecast: Forecast | null, ms: number, timezone: string): string {
	const hourly = getHourlyAt(forecast, ms, timezone);
	return wmoToIcon(hourly?.weatherCode, hourly?.isDay) ?? 'unknown';
}

// =============================================================================
// DERIVED DATA
// =============================================================================

export function getTemperatureStats(forecast: Forecast | null): {
	min: number;
	max: number;
	range: number;
} | null {
	if (!forecast?.hourly.size) return null;

	const temps = [...forecast.hourly.values()].map((h) => h.temperature);
	const min = Math.min(...temps);
	const max = Math.max(...temps);

	return { min, max, range: max - min };
}

export function buildIntervals(forecast: Forecast | null, radar: Radar | null): IntervalItem[] {
	// ... interval building logic ...
}
```

#### Component Usage

```svelte
<!-- WeatherCard.svelte -->
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getDisplayTemp, formatTime, getHourlyAt, formatPercent } from '$lib/weather-utils';

	const ns = getNsWeatherData();

	// Compose utils with raw state
	const temp = $derived(getDisplayTemp(ns.forecast, ns.ms, ns.timezone, ns.units.temperature));
	const time = $derived(formatTime(ns.ms, ns.timezone));
	const humidity = $derived(formatPercent(getHourlyAt(ns.forecast, ns.ms, ns.timezone)?.humidity));
</script>

<div class="card">
	<h1>{ns.name ?? 'Loading...'}</h1>
	<p class="temp">{temp}</p>
	<p class="time">{time}</p>
	<p class="humidity">Humidity: {humidity}</p>
</div>
```

#### Bundle Pattern (Reduce Verbosity)

For components that need many display values:

```typescript
// weather-utils.ts

/** Bundle common display values for a point in time */
export function getDisplayBundle(
	forecast: Forecast | null,
	ms: number,
	timezone: string,
	units: { temperature: 'F' | 'C' },
) {
	const hourly = getHourlyAt(forecast, ms, timezone);

	return {
		temp: formatTemp(hourly?.temperature, units.temperature),
		humidity: formatPercent(hourly?.humidity),
		dewPoint: formatTemp(hourly?.dewPoint, units.temperature),
		precipChance: formatPercent(hourly?.precipitationProbability),
		precip: formatPrecip(hourly?.precipitation),
		icon: wmoToIcon(hourly?.weatherCode, hourly?.isDay) ?? 'unknown',
		time: formatTime(ms, timezone, 'h:mm A'),
		date: formatTime(ms, timezone, 'MMM D'),
	};
}
```

```svelte
<!-- Component using bundle -->
<script lang="ts">
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getDisplayBundle } from '$lib/weather-utils';

	const ns = getNsWeatherData();
	const display = $derived(getDisplayBundle(ns.forecast, ns.ms, ns.timezone, ns.units));
</script>

<p>{display.temp}</p><p>{display.time}</p><p>{display.humidity}</p>
```

### Comparison

| Aspect                   | Current (God Object)         | Thin NS + Utils                 |
| ------------------------ | ---------------------------- | ------------------------------- |
| NS getters               | ~40                          | ~9                              |
| NS responsibility        | State + lookups + formatting | State only                      |
| Testing                  | Must mock NS                 | Utils are pure, trivial to test |
| Reusability              | Tied to NS instance          | Utils work anywhere             |
| Component verbosity      | Low                          | Medium (mitigated with bundles) |
| Adding new derived value | Modify NS                    | Add util function               |

### Testing Utils

```typescript
// weather-utils.test.ts

import { describe, it, expect } from 'vitest';
import { formatTemp, getHourlyAt, getDisplayTemp } from './weather-utils';

describe('formatTemp', () => {
	it('formats Fahrenheit', () => {
		expect(formatTemp(72.4, 'F')).toBe('72°F');
	});

	it('formats Celsius', () => {
		expect(formatTemp(72, 'C')).toBe('22°C');
	});

	it('handles null', () => {
		expect(formatTemp(null, 'F')).toBe('--');
	});
});

describe('getHourlyAt', () => {
	const mockForecast = {
		hourly: new Map([
			[1705363200000, { temperature: 72, humidity: 65 }],
			[1705366800000, { temperature: 70, humidity: 68 }],
		]),
	};

	it('returns hourly data at exact time', () => {
		const result = getHourlyAt(mockForecast, 1705363200000, 'UTC');
		expect(result?.temperature).toBe(72);
	});

	it('returns null for missing forecast', () => {
		expect(getHourlyAt(null, 1705363200000, 'UTC')).toBeNull();
	});
});
```

No NS mocking needed - just pure function inputs and outputs.

---

## Sketch: Refactored NS Definition

Complete example showing streamlined NS with event-based state distribution.

### Type Definitions

```typescript
// lib/ns-weather-data.svelte.ts

import { create } from 'mutative';
import { getEmitter } from '$lib/emitter';
import type { Coordinates, Radar } from '$lib/types';

// ============================================================================
// STATE TYPES
// ============================================================================

/** Hot state - changes at 15fps during scrubbing */
type HotState = {
	ms: number;
	rawMs: number;
	radarPlaying: boolean;
	trackedElement: HTMLElement | null;
};

/** Cold state - changes on fetch/user action */
type ColdState = {
	// Location
	coords: Coordinates | null;
	name: string | null;
	source: string;

	// Timezone
	timezone: string;
	timezoneAbbreviation: string;
	utcOffsetSeconds: number;

	// Data
	forecast: ForecastData | null;
	airQuality: AirQualityData | null;
	radar: Radar;

	// Units
	units: { temperature: 'C' | 'F' };

	// Provider status
	providerStatus: Record<string, 'idle' | 'loading' | 'success' | 'error'>;
	providerErrors: Record<string, Error | null>;
};

/** Combined state for snapshots */
type WeatherState = {
	hot: HotState;
	cold: ColdState;
	version: number;
};

// ============================================================================
// EVENT TYPES
// ============================================================================

type WeatherDataEvents = {
	// === Commands (external → NS) ===
	setLocation: { source: string; coords?: Coordinates; name?: string };
	setTime: { ms: number };
	toggleUnits: { temperature?: boolean | 'C' | 'F' };
	togglePlay: undefined;
	startTracking: { node: HTMLElement };
	endTracking: undefined;
	fetchRadar: undefined;
	requestSnapshot: undefined;

	// === Notifications (NS → external) ===
	snapshot: { version: number; state: WeatherState };
	patch: { baseVersion: number; version: number; patches: Patch[] };
	hotPatch: Partial<HotState>;
	trackingEnded: undefined;
};

type Patch = {
	op: 'replace' | 'add' | 'remove';
	path: string;
	value?: unknown;
};
```

### NS Factory

```typescript
// ============================================================================
// NS FACTORY
// ============================================================================

export function makeNsWeatherData() {
	const { on, emit } = getEmitter<WeatherDataEvents>('weatherdata');

	// --------------------------------------------------------------------------
	// STATE
	// --------------------------------------------------------------------------

	let version = 0;

	const hot: HotState = $state({
		ms: Date.now(),
		rawMs: Date.now(),
		radarPlaying: false,
		trackedElement: null,
	});

	const cold: ColdState = $state({
		coords: null,
		name: null,
		source: '???',
		timezone: 'Greenwich',
		timezoneAbbreviation: 'GMT',
		utcOffsetSeconds: 0,
		forecast: null,
		airQuality: null,
		radar: { generated: 0, host: '', frames: [] },
		units: { temperature: 'F' },
		providerStatus: { om: 'idle', omAir: 'idle', ow: 'idle' },
		providerErrors: { om: null, omAir: null, ow: null },
	});

	// --------------------------------------------------------------------------
	// HELPERS
	// --------------------------------------------------------------------------

	function getSnapshot(): WeatherState {
		return {
			hot: $state.snapshot(hot),
			cold: $state.snapshot(cold),
			version,
		};
	}

	function emitSnapshot() {
		emit('snapshot', { version, state: getSnapshot() });
	}

	function updateCold(recipe: (draft: ColdState) => void) {
		const [nextCold, patches] = create($state.snapshot(cold), recipe, {
			enablePatches: true,
		});

		if (patches.length > 0) {
			const baseVersion = version;
			version++;
			Object.assign(cold, nextCold);
			emit('patch', { baseVersion, version, patches });
		}
	}

	// Hot state batching for 15fps
	let pendingHotPatch: Partial<HotState> = {};
	let frameRafId: number | null = null;

	function emitHotPatch() {
		if (Object.keys(pendingHotPatch).length > 0) {
			emit('hotPatch', pendingHotPatch);
			pendingHotPatch = {};
		}
	}

	// --------------------------------------------------------------------------
	// COMMAND HANDLERS
	// --------------------------------------------------------------------------

	const handlers = {
		setLocation: async ({ source, coords, name }: WeatherDataEvents['setLocation']) => {
			updateCold((draft) => {
				draft.source = source;
				if (coords) draft.coords = coords;
				if (name) draft.name = name;
				draft.providerStatus.om = 'loading';
				draft.providerStatus.omAir = 'loading';
			});

			// Fetch in parallel
			await Promise.all([fetchOpenMeteoForecast(), fetchOpenMeteoAirQuality()]);
		},

		setTime: ({ ms }: WeatherDataEvents['setTime']) => {
			hot.rawMs = ms;

			if (!hot.trackedElement) {
				hot.ms = ms;
			}

			// Queue for batched emit
			pendingHotPatch.ms = ms;
			pendingHotPatch.rawMs = ms;
		},

		toggleUnits: ({ temperature }: WeatherDataEvents['toggleUnits']) => {
			updateCold((draft) => {
				if (temperature === 'C' || temperature === 'F') {
					draft.units.temperature = temperature;
				} else if (temperature) {
					draft.units.temperature = draft.units.temperature === 'F' ? 'C' : 'F';
				}
			});
		},

		togglePlay: () => {
			hot.radarPlaying = !hot.radarPlaying;
			pendingHotPatch.radarPlaying = hot.radarPlaying;
		},

		startTracking: ({ node }: WeatherDataEvents['startTracking']) => {
			hot.trackedElement = node;
			pendingHotPatch.trackedElement = node;

			// Start RAF loop for batched hot patches
			if (frameRafId === null) {
				const FRAME_INTERVAL = 1000 / 15;
				let lastFrameTime = performance.now();

				function frameTick(now: number) {
					if (frameRafId === null) return;

					if (now - lastFrameTime >= FRAME_INTERVAL) {
						lastFrameTime = now;
						hot.ms = hot.rawMs;
						pendingHotPatch.ms = hot.rawMs;
						emitHotPatch();
					}

					frameRafId = requestAnimationFrame(frameTick);
				}
				frameRafId = requestAnimationFrame(frameTick);
			}
		},

		endTracking: () => {
			hot.trackedElement = null;
			hot.rawMs = Date.now();
			hot.ms = Date.now();

			// Stop RAF loop
			if (frameRafId !== null) {
				cancelAnimationFrame(frameRafId);
				frameRafId = null;
			}

			// Final emit
			pendingHotPatch = { ms: hot.ms, rawMs: hot.rawMs, trackedElement: null };
			emitHotPatch();

			emit('trackingEnded', undefined);
		},

		fetchRadar: async () => {
			// ... radar fetch logic ...
		},

		requestSnapshot: () => {
			emitSnapshot();
		},
	};

	// --------------------------------------------------------------------------
	// FETCH FUNCTIONS
	// --------------------------------------------------------------------------

	async function fetchOpenMeteoForecast() {
		if (!cold.coords) return;

		try {
			const response = await fetch(buildForecastUrl(cold.coords));
			const json = await response.json();

			updateCold((draft) => {
				draft.forecast = normalizeForecast(json);
				draft.timezone = json.timezone;
				draft.timezoneAbbreviation = json.timezone_abbreviation;
				draft.utcOffsetSeconds = json.utc_offset_seconds;
				draft.providerStatus.om = 'success';
				draft.providerErrors.om = null;
			});
		} catch (error) {
			updateCold((draft) => {
				draft.providerStatus.om = 'error';
				draft.providerErrors.om = error as Error;
			});
		}
	}

	async function fetchOpenMeteoAirQuality() {
		// Similar pattern...
	}

	// --------------------------------------------------------------------------
	// REGISTER EVENT HANDLERS
	// --------------------------------------------------------------------------

	on('setLocation', handlers.setLocation);
	on('setTime', handlers.setTime);
	on('toggleUnits', handlers.toggleUnits);
	on('togglePlay', handlers.togglePlay);
	on('startTracking', handlers.startTracking);
	on('endTracking', handlers.endTracking);
	on('fetchRadar', handlers.fetchRadar);
	on('requestSnapshot', handlers.requestSnapshot);

	// --------------------------------------------------------------------------
	// PUBLIC API
	// --------------------------------------------------------------------------

	return {
		// Methods (call directly or via event)
		...handlers,

		// Snapshot for initial sync
		getSnapshot,

		// Format helpers (stateless, safe to expose)
		tzFormat: (ms: number, format = 'ddd MMM D, h:mm:ss.SSSa z') => {
			return dayjs.tz(ms, cold.timezone).format(format).replace('z', cold.timezoneAbbreviation);
		},

		format: (value: number, type: 'temperature') => {
			// Unit conversion + formatting
		},
	};
}

export type NsWeatherData = ReturnType<typeof makeNsWeatherData>;
```

### Consumer Hook

```typescript
// lib/useWeatherState.svelte.ts

import { getEmitter } from '$lib/emitter';
import { apply } from 'mutative';
import type { WeatherState } from './ns-weather-data.svelte';

export function useWeatherState() {
	const { on, emit } = getEmitter<WeatherDataEvents>('weatherdata');

	let state = $state<WeatherState | null>(null);
	let version = $state(-1);

	// Request initial snapshot on mount
	$effect(() => {
		emit('requestSnapshot', undefined);
	});

	// Handle snapshots
	on('snapshot', (event) => {
		state = event.state;
		version = event.version;
	});

	// Handle cold patches
	on('patch', (event) => {
		if (!state) return;

		if (version !== event.baseVersion) {
			// Out of sync - request fresh snapshot
			emit('requestSnapshot', undefined);
			return;
		}

		// Apply patches to cold state
		state = {
			...state,
			cold: apply(state.cold, event.patches),
			version: event.version,
		};
		version = event.version;
	});

	// Handle hot patches (no version check - last write wins)
	on('hotPatch', (patch) => {
		if (state) {
			state = {
				...state,
				hot: { ...state.hot, ...patch },
			};
		}
	});

	return {
		// Reactive getters
		get state() {
			return state;
		},
		get version() {
			return version;
		},
		get ready() {
			return state !== null;
		},

		// Convenience accessors
		get coords() {
			return state?.cold.coords ?? null;
		},
		get name() {
			return state?.cold.name ?? null;
		},
		get ms() {
			return state?.hot.ms ?? Date.now();
		},
		get timezone() {
			return state?.cold.timezone ?? 'UTC';
		},
		get forecast() {
			return state?.cold.forecast ?? null;
		},
		get units() {
			return state?.cold.units ?? { temperature: 'F' };
		},
		get providerStatus() {
			return state?.cold.providerStatus ?? {};
		},

		// Derived values
		get displayTemperature() {
			if (!state?.cold.forecast) return null;
			const hourMs = startOfHour(state.hot.ms);
			return state.cold.forecast.hourly.get(hourMs)?.temperature;
		},
	};
}
```

### Component Usage

```svelte
<!-- src/routes/WeatherDisplay.svelte -->
<script lang="ts">
	import { useWeatherState } from '$lib/useWeatherState.svelte';
	import { getEmitter } from '$lib/emitter';

	const weather = useWeatherState();
	const { emit } = getEmitter('weatherdata');

	function handleLocationChange(coords: Coordinates) {
		emit('setLocation', { source: 'user', coords });
	}

	function handleScrub(ms: number) {
		emit('setTime', { ms });
	}

	function toggleUnits() {
		emit('toggleUnits', { temperature: true });
	}
</script>

{#if !weather.ready}
	<p>Loading...</p>
{:else}
	<div class="weather">
		<h1>{weather.name ?? 'Unknown Location'}</h1>

		{#if weather.displayTemperature != null}
			<p class="temp">
				{weather.displayTemperature}°{weather.units.temperature}
			</p>
		{/if}

		<button onclick={toggleUnits}>
			Switch to °{weather.units.temperature === 'F' ? 'C' : 'F'}
		</button>

		<!-- Provider status indicators -->
		<div class="status">
			{#each Object.entries(weather.providerStatus) as [provider, status]}
				<span class="provider {status}">{provider}: {status}</span>
			{/each}
		</div>

		<!-- Timeline scrubbing -->
		<Timeline ms={weather.ms} onscrub={handleScrub} />
	</div>
{/if}
```

### Comparison: Before vs After

#### Before (Getter-Based)

```svelte
<script>
	import { getNsWeatherData } from '$lib/ns-weather-data.svelte';
	import { getEmitter } from '$lib/emitter';

	const nsWeatherData = getNsWeatherData();
	const { emit } = getEmitter(import.meta);

	// Direct reads - tightly coupled to NS structure
	$: coords = nsWeatherData.coords;
	$: name = nsWeatherData.name;
	$: ms = nsWeatherData.ms;
	$: temp = nsWeatherData.displayTemperature;
</script>

<h1>{nsWeatherData.name}</h1>
<p>{nsWeatherData.displayTemperature}°{nsWeatherData.units.temperature}</p>
```

#### After (Event-Based)

```svelte
<script>
	import { useWeatherState } from '$lib/useWeatherState.svelte';
	import { getEmitter } from '$lib/emitter';

	const weather = useWeatherState();
	const { emit } = getEmitter('weatherdata');

	// Decoupled - only knows event schema + state shape
</script>

{#if weather.ready}
	<h1>{weather.name}</h1>
	<p>{weather.displayTemperature}°{weather.units.temperature}</p>
{/if}
```

### Key Differences

| Aspect              | Before                 | After                     |
| ------------------- | ---------------------- | ------------------------- |
| Import              | NS factory             | Hook + emitter            |
| Coupling            | Direct to NS internals | Event schema only         |
| Initialization      | Immediate              | Async (wait for snapshot) |
| Testing             | Mock NS factory        | Emit test events          |
| Component isolation | Must have NS context   | Self-contained            |
| Hot updates         | Direct read            | Batched via hotPatch      |
| Cold updates        | Direct read            | Via snapshot/patch        |
