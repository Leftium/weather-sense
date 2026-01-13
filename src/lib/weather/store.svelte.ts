/**
 * Reactive store for weather snapshots.
 *
 * Components use this to receive read-only snapshots via events.
 * This decouples components from the data layer.
 *
 * Usage:
 * ```svelte
 * <script>
 *   import { weatherStore } from '$lib/weather';
 *   const { snapshot, frameMs } = weatherStore;
 * </script>
 *
 * {#if snapshot}
 *   <p>{snapshot.temperature}</p>
 * {/if}
 * ```
 */

import { getEmitter } from '$lib/emitter';
import type { WeatherDataEvents, Snapshot } from './types';

const { on } = getEmitter<WeatherDataEvents>(import.meta);

/** Current snapshot (cold state) */
let snapshot = $state<Snapshot | null>(null);

/** Current frame time (hot state, updates at 15fps during scrubbing) */
let frameMs = $state(Date.now());

// Subscribe to events
on('weatherdata_snapshot', (data) => {
	snapshot = data;
});

on('weatherdata_frameTick', (data) => {
	frameMs = data.ms;
});

/**
 * Weather store - reactive snapshot receiver.
 *
 * Components read from this instead of importing data directly.
 */
export const weatherStore = {
	/** Full snapshot of weather data (null until first fetch) */
	get snapshot() {
		return snapshot;
	},

	/** Current display time in ms (updates at 15fps during scrubbing) */
	get frameMs() {
		return frameMs;
	},
};
