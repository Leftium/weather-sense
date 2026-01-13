# Streamlined Nation-State API

## TL;DR

Current NS pattern is verbose - event name repeated 3 times (type def, handler, emit). Proposed: method-based API where calling `ns.setTime({ ms })` both mutates state AND emits event. Single source of truth.

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
