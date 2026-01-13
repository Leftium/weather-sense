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
export { weatherStore, type WeatherStore } from './store.svelte';

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
	getMinutelyPrecipAt,
	// Builders
	buildForecastMap,
	buildAirQualityMap,
	buildMinutelyData,
	buildDailyByFromTodayMap,
	// Bundles
	getDisplayBundle,
	getDisplayBundleFromStore,
	getSnapshot,
	// Derived
	getTemperatureStats,
	getIntervals,
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
	// OpenWeather types
	OwMinutelyForecast,
	OwCurrentWeather,
	OwHourlyForecast,
	OwDailyForecast,
	OwWeatherCondition,
	OwAlert,
	OwOneCallResponse,
	// Processed/derived types
	MinutelyPoint,
	// Event types
	WeatherDataEvents,
	// Snapshot types
	DisplayBundle,
	Snapshot,
} from './types';

// Constants
export { PAST_DAYS, FORECAST_DAYS } from './types';
