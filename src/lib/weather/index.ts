/**
 * Weather module - Data/Calc/Shell architecture.
 *
 * Layers (Grokking Simplicity):
 * - data.svelte.ts  → Data (pure state)
 * - calc.ts         → Calculations (pure functions)
 * - shell.ts        → Actions (I/O orchestrator)
 * - store.svelte.ts → Reactive snapshot receiver
 *
 * Usage:
 * ```typescript
 * // In root component (e.g., +page.svelte)
 * import { weatherData, initWeatherShell } from '$lib/weather';
 * const shell = initWeatherShell(weatherData);
 * onDestroy(() => shell.destroy());
 *
 * // In any component
 * import { weatherStore } from '$lib/weather';
 * const { snapshot } = weatherStore;
 * ```
 */

// Data layer (singleton state)
export { weatherData, type WeatherData } from './data.svelte';

// Shell (I/O orchestrator)
export { initWeatherShell } from './shell';

// Store (reactive snapshot receiver)
export { weatherStore } from './store.svelte';

// Calculations (pure functions)
export {
	// Formatting
	formatTemp,
	formatTime,
	formatPercent,
	formatPrecip,
	formatAqi,
	tzFormat,
	// Lookups
	getHourlyAt,
	getAirQualityAt,
	// Builders
	buildForecastMap,
	buildAirQualityMap,
	// Bundles
	getDisplayBundle,
	getSnapshot,
	// Derived
	getTemperatureStats,
	getIntervals,
	// Legacy (for migration period)
	getDisplayBundleLegacy,
	getTemperatureStatsLegacy,
} from './calc';

// Types
export type {
	// Data types
	Coordinates,
	Radar,
	RadarFrame,
	AirQuality,
	CurrentForecast,
	HourlyForecast,
	DailyForecast,
	OmForecast,
	OmAirQuality,
	ForecastItem,
	AirQualityItem,
	IntervalItem,
	TemperatureStats,
	Units,
	// Event types
	WeatherDataEvents,
	// Snapshot types
	DisplayBundle,
	Snapshot,
} from './types';

// Constants
export { PAST_DAYS, FORECAST_DAYS } from './types';
