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
  setTime: ({ ms }) => { _ms = ms; },
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
  handlers: { [K in keyof Events]: (params: Events[K]) => void }
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
        handler(params);  // direct call, no event
      } else {
        emit(eventName, params);  // handler called via on() listener
      }
    };
  }
  
  return methods;
}
```

| Call | Handler runs | Event emitted | External listeners |
|------|-------------|---------------|-------------------|
| `ns.setTime({ ms })` | Yes (via event) | Yes | Notified |
| `ns.setTime({ ms }, { silent: true })` | Yes (direct) | No | Not notified |
| `emit('weatherdata_setTime', { ms })` | Yes (via event) | Yes | Notified |

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
  handlers: { [K in keyof Events]: (params: Events[K]) => void }
) {
  const { emit } = getEmitter<PrefixedEvents<Events>>(import.meta);
  const methods = {} as NsMethods<Events>;
  
  for (const [name, handler] of Object.entries(handlers)) {
    const eventName = `${prefix}_${name}`;
    
    // NO on() registration - external emit won't trigger handler
    
    // Create method that calls directly + optionally emits for logging
    methods[name] = (params, { emit: shouldEmit = false } = {}) => {
      handler(params);  // always direct
      if (shouldEmit) emit(eventName, params);  // for logging/event-sourcing only
    };
  }
  
  return methods;
}
```

| Call | Handler runs | Event emitted | External listeners |
|------|-------------|---------------|-------------------|
| `ns.setTime({ ms })` | Yes (direct) | No | Not notified |
| `ns.setTime({ ms }, { emit: true })` | Yes (direct) | Yes | Notified (but no handler) |
| `emit('weatherdata_setTime', { ms })` | No | Yes | Notified (but no handler) |

**Pros:**
- Zero event overhead by default
- Simpler mental model (just function calls)

**Cons:**
- External `emit()` won't trigger handler
- Must opt-in to emit for event-sourcing
- Decoupled components can't trigger NS methods via events

#### Choosing Between A and D

| Use case | Recommendation |
|----------|----------------|
| Decoupled components need to trigger NS | **A** (event-first) |
| Event-sourcing / replay required | **A** (event-first) |
| Performance critical, no external triggers | **D** (direct-first) |
| Simple app, no cross-component events | **D** (direct-first) |

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
  setTime: ({ ms }) => { _ms = ms; },  // OK
  
  foo: () => {},  // TS Error: 'foo' not in Events
});

ns.setTime({ ms: 'bad' });  // TS Error: string not assignable to number
ns.setTime({ wrong: 1 });   // TS Error: 'wrong' not in { ms: number }
```

---

## Searchability Trade-off

| Search for... | Current | Proposed |
|---------------|---------|----------|
| All uses of setTime | `weatherdata_requestedSetTime` | `ns.setTime` or `setTime` |
| Handler definition | `on('weatherdata_requestedSetTime'` | `setTime:` in NS file |
| Event in logs | `weatherdata_requestedSetTime` | `weatherdata_setTime` |

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
ns.setTime({ ms: 123 }, { emit: true });  // logs event

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
on('weatherdata_requestedSetTime', ({ ms }) => { _ms = ms; });

// Add new method-based API
const methods = createNs<Events>('weatherdata', {
  setTime: ({ ms }) => { _ms = ms; },  // duplicate for now
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
   
   await ns.fetchData({ coords });  // wait for completion?
   ```

4. **Multiple NS coordination?**
   - NS-A method calls NS-B method directly?
   - Or still via events for decoupling?
