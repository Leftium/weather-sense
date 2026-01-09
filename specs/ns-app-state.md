# Expanding Nation State to Include UI State

## Current Architecture

### nsWeatherData (existing)

Contains weather domain data and some UI-adjacent state:

- **Cold state** (changes on fetch/user action): `coords`, `timezone`, `units`, `hourly`, `daily`, `dataForecast`, `radar`
- **Hot state** (changes at 15fps during scrubbing): `ms`, `rawMs`, `radarPlaying`, `trackedElement`

### Component-local state (+page.svelte)

UI state currently scattered in components:

- `displayMs`, `throttledDisplayMs` - animated time position
- `displayColors`, `throttledColors` - sky gradient colors
- `scrubTargetMs`, `scrubStartDisplayMs` - animation targets
- `forecastDaysVisible` - UI preference
- `showMoreOptions`, `groupIcons` - UI toggles
- `plotVisibility` - which plots are shown
- `isWideCollapsed`, `isWideExpanded` - responsive layout state
- `stickyHeight`, `tilesHeight` - DOM measurements

---

## Proposed: nsAppState (or composed NS)

### Option A: Extend nsWeatherData

Add UI state directly to existing nsWeatherData.

**Pros:** Single source of truth, simpler
**Cons:** Mixes concerns, larger module

### Option B: Create nsUiState + compose

New nation state for UI, composed with nsWeatherData.

```typescript
// ns-ui-state.svelte.ts
export function makeNsUiState(nsWeatherData: NsWeatherData) {
  return {
    // Animation state
    displayMs: $state(Date.now()),
    displayColors: $state(DEFAULT_COLORS),
    scrubTargetMs: $state(Date.now()),

    // User preferences
    forecastDaysVisible: $state(3),
    groupIcons: $state(true),
    plotVisibility: $state({ temp: true, humidity: false, ... }),

    // Computed/derived
    get skyGradient() { ... },
    get textColor() { ... },
  };
}

// ns-app.svelte.ts (composition)
export function makeNsApp() {
  const weatherData = makeNsWeatherData();
  const uiState = makeNsUiState(weatherData);

  return {
    weatherData,
    ui: uiState,

    // Serialization
    serialize(): AppSnapshot { ... },
    restore(snapshot: AppSnapshot) { ... },

    // Simulation API
    simulatePointerMove(x: number, plotIndex: number) { ... },
    simulateScrubTo(ms: number) { ... },
    simulateDayClick(dayIndex: number) { ... },
  };
}
```

**Pros:**

- Separation of concerns
- Each NS remains focused
- Easier to test independently

**Cons:**

- More modules to manage
- Cross-NS coordination needed

---

## Serialization for Testing/AI Agents

### Snapshot Structure

```typescript
type AppSnapshot = {
	// Weather data (cold state only - hot state is transient)
	weather: {
		coords: Coordinates;
		timezone: string;
		units: { temperature: 'C' | 'F' };
		daily: DailyForecast[];
		hourly: HourlyForecast[];
		// Note: dataForecast Map would need serialization
	};

	// UI state
	ui: {
		currentMs: number; // What time is being viewed
		displayMs: number; // Animation progress
		displayColors: string[]; // Current sky colors
		forecastDaysVisible: number;
		plotVisibility: PlotVisibility;
		groupIcons: boolean;
		trackedPlotIndex: number | null; // Which plot is being scrubbed
	};

	// Metadata
	meta: {
		snapshotTime: number;
		version: string;
	};
};
```

### Simulation API for Testing

```typescript
interface AppSimulator {
	// Load state
	loadSnapshot(snapshot: AppSnapshot): void;

	// Simulate user actions
	pointerEnterPlot(plotIndex: number, x: number): void;
	pointerMoveTo(x: number): void;
	pointerLeave(): void;
	clickDay(dayIndex: number): void;
	togglePlot(plotName: keyof PlotVisibility): void;

	// Advance time (for animations)
	tick(deltaMs: number): void;
	tickUntilIdle(): void;

	// Assertions
	getDisplayedTime(): number;
	getSkyColors(): string[];
	getTrackerPositions(): { plotIndex: number; x: number }[];
}
```

---

## Performance Considerations

### Will this cause GPU/CPU issues?

**No, if done correctly:**

1. **Serialization is infrequent** - Only on demand for debugging/testing, not every frame

2. **Hot state remains non-reactive** - Keep `rawMs` pattern for high-frequency updates

3. **Simulation can skip rendering** - Headless testing doesn't need DOM updates

   ```typescript
   const app = makeNsApp({ headless: true });
   app.simulateScrubTo(sunriseMs);
   expect(app.ui.displayColors).toEqual(expectedDawnColors);
   // No GPU involved - just state calculations
   ```

4. **Lazy serialization** - Only serialize what's needed

   ```typescript
   serialize(options: { includeHourly?: boolean }) {
     return {
       weather: {
         daily: this.weatherData.daily,
         hourly: options.includeHourly ? this.weatherData.hourly : undefined,
       },
       // ...
     };
   }
   ```

5. **Existing optimizations still apply**:
   - Skip unchanged tracker updates
   - Throttle frameTick to 15fps
   - Pre-computed sky color cache
   - Direct DOM manipulation for gradients

### Performance Risk: Over-reactivity

**Avoid:**

```typescript
// BAD: Making hot state reactive in nsUiState
displayMs: $state(Date.now()); // Updates trigger Svelte reactivity cascade
```

**Instead:**

```typescript
// GOOD: Keep hot state as plain values, update via events
_hot: {
  displayMs: Date.now(),  // Plain value
  displayColors: DEFAULT_COLORS,
},

// Explicit throttled reactive proxy for components that need it
get throttledDisplayMs() { return this._throttled.displayMs; }
```

---

## Benefits for AI Coding Agents

### Current Workflow (with screenshots)

1. User describes bug/feature
2. Agent requests screenshot
3. User takes screenshot, pastes
4. Agent interprets visual state
5. Agent makes changes
6. Repeat...

### Proposed Workflow (with snapshots)

1. User describes bug/feature
2. Agent requests `app.serialize()`
3. User runs in console, pastes JSON
4. Agent has exact state: time, colors, preferences, data
5. Agent can reproduce locally in tests
6. Agent writes fix + test case
7. Test validates fix without browser

### Example: Debugging Sky Color Issue

```typescript
// Agent receives this snapshot
{
  "weather": {
    "timezone": "America/Chicago",
    "daily": [{ "sunrise": 1736420400000, "sunset": 1736456400000, ... }]
  },
  "ui": {
    "currentMs": 1736418000000,  // 6:00 AM
    "displayMs": 1736419200000,   // 6:20 AM (animating)
    "displayColors": ["#1a1a2e", "#16213e", "#0f3460"],  // Wrong - should be dawn colors!
  }
}

// Agent can write test
test('dawn colors at 6:20 AM', () => {
  const app = makeNsApp({ headless: true });
  app.loadSnapshot(bugSnapshot);

  // Verify the bug
  expect(app.ui.displayColors).not.toEqual(expectedDawnColors);

  // After fix
  app.tick(0);  // Recalculate
  expect(app.ui.displayColors).toEqual(expectedDawnColors);
});
```

---

## Implementation Steps

1. **Extract UI state types** - Define `UiState`, `AppSnapshot` types

2. **Create nsUiState** - Move animation/preference state from +page.svelte

3. **Add serialize/restore** - JSON-compatible snapshot methods

4. **Create simulation API** - Methods to drive state without DOM

5. **Add headless mode** - Skip DOM operations when testing

6. **Update components** - Use `nsApp.ui.*` instead of local state

7. **Add console helper** - `window.getAppSnapshot()` for debugging

---

## Open Questions

1. **Where do DOM measurements go?** (`stickyHeight`, `tilesHeight`)
   - These are derived from actual DOM, not serializable
   - Could use defaults in headless mode

2. **How to handle Maps?** (`dataForecast`, `dataAirQuality` are Maps)
   - Serialize as arrays: `[...map.entries()]`
   - Restore with `new Map(entries)`

3. **Event replay?**
   - Could record events for full replay capability
   - More complex, maybe future enhancement
