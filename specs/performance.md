# Performance Optimizations

This document summarizes performance optimizations made to WeatherSense.

## GPU Usage Summary

| Scenario                 | Before | After |
| ------------------------ | ------ | ----- |
| Idle (pointer over plot) | 4-24%  | 0%    |
| Scrubbing max            | 66-70% | 55%   |
| Dawn/dusk scrub burst    | 70%    | 45%   |
| Map marker animation     | 13%    | 0%    |

---

# GPU Optimizations

## 1. Map Location Marker Animation

**Commit:** `8ff6d84`

**Problem:** The pulsing CSS animation on the current location marker consumed 13% GPU even when using opacity-only animation. The `transform: scale()` combined with opacity was expensive.

**Solution:** Remove the animated `::after` pseudo-element and keyframes entirely. The static blue dot with white border is sufficient for indicating current location.

**Files:** `RadarMapLibre.svelte`

---

## 2. Skip Tracker DOM Updates When Position Unchanged

**Commits:** `ba05f34`, `0d4fc64`

**Problem:** The `frameTick` event fired at 15fps during tracking, triggering tracker DOM updates on all plots even when the cursor was stationary. This caused 4-24% idle GPU usage.

**Solution:**

- `TimeLine.svelte` now tracks `lastTrackerMs` and skips DOM updates when position hasn't changed
- `frameTick` still emits at 15fps (needed for sky animation), but listeners are smart about skipping work
- Added `pointer-events: none` to SVG children to reduce hit-testing overhead

**Files:** `ns-weather-data.svelte.ts`, `TimeLine.svelte`

---

## 3. GPU-Accelerated Tracker with will-change

**Commit:** `ba05f34`

**Problem:** Without `will-change: transform`, tracker movement during scrubbing used 66% GPU max.

**Solution:** Keep `will-change: transform` on tracker group element. This hints to the browser to promote the layer for GPU compositing, reducing scrubbing GPU from 66% to 55%.

**Files:** `TimeLine.svelte`

---

## 4. Pre-computed Sky Color Cache

**Commit:** `dc35ebc`

**Problem:** Sky color calculations during dawn/dusk scrubbing were expensive due to Color.js operations in the render loop (~67% GPU).

**Solution:**

- Pre-compute sky color palettes for all altitude steps at startup
- Replace Color.js calls with cached lookup + fast RGB interpolation
- Add fast RGB lerp functions that avoid object allocations

**Result:** GPU during dawn/dusk scrubbing reduced from ~67% to ~40-50%

**Files:** `util.ts`

---

## 5. Static Body Background

**Commit:** `ec96b3c`

**Problem:** Dynamic sky gradient on body element caused GPU overhead since body covers the entire viewport.

**Solution:** Use static `$color-ghost-white` for body background. Sky gradient remains visible on sticky header and tiles sections only.

**Files:** `+page.svelte`

---

## 6. Deferred Color Computation

**Commit:** `2be23f7`

**Problem:** During rapid plot switching, `getTargetColors()` was computed on every switch, wasting CPU/GPU.

**Solution:**

- Defer `getTargetColors()` until after 100ms settle delay
- Memoize `contrastTextColor()` with LRU-style cache (max 500 entries)
- Throttle transition animation from 60fps to 15fps

**Files:** `util.ts`, `+page.svelte`

---

## 7. Consolidated RAF Loop

**Commit:** `f95bb59`

**Problem:** Two independent `setInterval` timers for tracking and sky animation caused timing misalignment and wasted cycles.

**Solution:** Replace with single RAF-based frame loop throttled to 15fps:

- `ns-weather-data` uses RAF instead of setInterval
- Sky animation driven by `frameTick` event
- Auto-pauses when tab is hidden (RAF behavior)

**Files:** `ns-weather-data.svelte.ts`, `+page.svelte`

---

## 8. Direct DOM Manipulation for Gradients

**Commit:** `d17cbf8`

**Problem:** Reactive updates to sky gradients triggered Svelte's reactivity system unnecessarily.

**Solution:**

- Add direct DOM refs (`stickyInfoEl`, `skyGradientBgEl`)
- Update gradients via `element.style.background` in animation loop
- Bypass reactive system during active tracking

**Files:** `+page.svelte`

---

## 9. Event-Driven Tracker Updates

**Commit:** `30c40a3`

**Problem:** Trackers used polling intervals independently, causing timing drift and unnecessary work.

**Solution:**

- Replace polling intervals with `frameTick` event listener
- All trackers update on same tick for perfect alignment
- Use direct DOM manipulation for tracker position

**Files:** `TimeLine.svelte`, `DailyTiles.svelte`

---

## 10. Stop Sky Animation When Idle

**Commit:** `820872c`

**Problem:** Sky animation interval ran continuously even when target was reached.

**Solution:** Stop animation interval when target reached. Start animation via `frameTick` event only during tracking.

**Files:** `+page.svelte`

---

## 11. Non-Reactive Time Tracking

**Commit:** `d9163c2`

**Problem:** Updating reactive `ms` state on every mouse move triggered Svelte's reactivity system, causing 80%+ GPU usage during scrubbing.

**Solution:**

- Add `rawMs`: non-reactive, updates on every mouse move
- Add `frameMs`: updates at 15fps during tracking for sync
- Only update reactive `msTracker` when NOT tracking
- Avoids Svelte reactivity overhead during scrubbing

**Files:** `ns-weather-data.svelte.ts`

---

## 12. Throttle Mouse Move Updates

**Commit:** `b45807c`

**Problem:** Every mouse move event triggered updates, causing CPU overhead during fast scrubbing.

**Solution:**

- Add time-based throttling (60fps cap)
- Skip updates if not enough time passed since last update
- Reduces CPU overhead during fast scrubbing

**Files:** `trackable.ts`

---

## 13. Stop Animation Loops When Idle

**Commit:** `fd5e2fd`

**Problem:** Animation loops continued running even when idle, causing 80-90% GPU usage.

**Solution:**

- Stop sky gradient animation loop when `displayMs` reaches `targetMs`
- Only run radar animation loop when `radarPlaying` is true
- Reset `animationFrameId` to null when loop stops so it can restart

**Result:** GPU usage drops from 80-90% to 0% when idle

**Files:** `+page.svelte`, `RadarMapLibre.svelte`

---

## 14. iOS Touch Scrubbing Performance

**Commit:** `33f004a`

**Problem:** Touch scrubbing on iOS was janky due to rapid pointer events and CSS issues.

**Solution:**

- Add RAF throttling for touch scrub events to coalesce rapid pointer events
- Disable `background-attachment: fixed` on mobile (causes iOS Safari jank)
- Desktop retains immediate mouse tracking and fixed background effect

**Files:** `trackable.ts`, `+page.svelte`

---

## 15. Radar Tile Loading Optimization

**Commit:** `472c678`

**Problem:** Radar tiles loaded in suboptimal order, and unloaded layers were displayed causing visual glitches.

**Solution:**

- Optimize tile layer loading order
- Don't display unloaded layers
- Better animation algorithm for radar playback

**Files:** `+page.svelte`, `ns-weather-data.svelte.ts`

---

# Network/API Optimizations

## 16. Reduce Forecast Days

**Commits:** `ad54729`, `1aad41a`

**Problem:** Fetching too many forecast days increased API response time and data processing.

**Solution:** Cap forecast days to 10 (down from 16). Provides sufficient forecast range while reducing payload size and processing time.

**Files:** `ns-weather-data.svelte.ts`, `+page.svelte`

---

## 17. Split Forecast Fetch

**Commit:** `b6db552`

**Problem:** Single large forecast API call blocked initial render.

**Solution:** Split forecast fetch into initial + extended requests for faster initial load. (Note: later reverted in `9e095fd` as no performance benefit was measured)

**Files:** `ns-weather-data.svelte.ts`

---

## 18. Debounce Location Updates

**Commit:** `fc38534`

**Problem:** Location updates triggered API refetch even for tiny coordinate changes.

**Solution:** Only emit `weatherdata_requestedSetLocation` if new coordinates are more than 1km from current `data.coords`. Prevents unnecessary API calls from GPS drift.

**Files:** `+page.svelte`

---

## 19. RainViewer Proxy Optimization

**Commit:** `c00e9d1`

**Problem:** RainViewer proxy had inefficient request handling.

**Solution:** Optimize RainViewer proxy performance and handle null values from OpenMeteo API gracefully.

**Files:** `ns-weather-data.svelte.ts`, `rainviewer-proxy/[...path]/+server.ts`

---

## Key Techniques

### GPU/Rendering

1. **`will-change: transform`** - Promotes elements to GPU layer for efficient compositing
2. **Skip unchanged updates** - Track previous values and skip DOM work when nothing changed
3. **Pre-computation** - Move expensive calculations to startup time
4. **Direct DOM manipulation** - Bypass reactive systems during high-frequency updates
5. **Event consolidation** - Single timing source for all animations
6. **Throttling** - 15fps is sufficient for most UI updates, saves significant GPU
7. **`pointer-events: none`** - Reduces browser hit-testing overhead on complex SVGs
8. **Remove CSS animations** - Static elements when animation isn't essential

### Network/API

9. **Debounce location updates** - Ignore changes below threshold (1km)
10. **Reduce payload size** - Fetch only necessary data (e.g., fewer forecast days)
11. **Proxy optimization** - Efficient request handling for third-party APIs
