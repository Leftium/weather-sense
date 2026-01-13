/**
 * Sun altitude calculation for sky color rendering.
 *
 * Based on "horizon" by dnlzro (MIT License)
 * https://github.com/dnlzro/horizon
 */

/**
 * Calculate sun altitude (elevation angle) from time and sun times
 * Uses a simple sinusoidal approximation based on sunrise/sunset
 * @param ms - Current timestamp in milliseconds
 * @param sunrise - Sunrise timestamp in milliseconds
 * @param sunset - Sunset timestamp in milliseconds
 * @returns Sun altitude in radians (negative = below horizon)
 */
export function getSunAltitude(ms: number, sunrise: number, sunset: number): number {
	const DAY_MS = 24 * 60 * 60 * 1000;

	// Handle cross-midnight case (sunrise > sunset in display timezone)
	// This happens when viewing a location in a very different timezone
	// e.g., viewing Minnesota (UTC-6) from Seoul (UTC+9): sunrise appears at 22:49, sunset at 07:49
	if (sunrise > sunset) {
		// Normalize so sunrise < sunset by shifting times into a consistent frame
		// The key insight: daytime is between sunset and sunrise in this case
		if (ms >= sunset && ms < sunrise) {
			// ms is in "daytime" (between sunset and sunrise)
			// Shift sunset forward by 24h so sunrise < sunset
			sunset += DAY_MS;
		} else if (ms < sunset) {
			// ms is after midnight but before sunset (early morning, still "daytime")
			// Shift both ms and sunset forward
			ms += DAY_MS;
			sunset += DAY_MS;
		} else {
			// ms >= sunrise (evening/night)
			// Just shift sunset forward
			sunset += DAY_MS;
		}
	}

	const dayLength = sunset - sunrise;

	// Approximate max altitude based on day length (longer days = higher sun)
	// At equator on equinox, day ~12h, max altitude ~90°
	// This is a rough approximation
	const maxAltitude = (Math.PI / 2) * 0.8; // ~72° max for simplicity

	if (ms < sunrise) {
		// Before sunrise - sun is below horizon
		// Calculate progress from previous midnight to sunrise
		// timeUntilSunrise goes from large (at midnight) to 0 (at sunrise)
		const timeUntilSunrise = sunrise - ms;
		const halfNightLength = (DAY_MS - dayLength) / 2;
		// At midnight, timeUntilSunrise ~ halfNightLength, progress ~ 0
		// At sunrise, timeUntilSunrise ~ 0, progress ~ 1
		const progress = 1 - timeUntilSunrise / halfNightLength;
		const clampedProgress = Math.max(0, Math.min(1, progress));
		// Sun goes from -maxAltitude at midnight to 0 at sunrise
		return -maxAltitude * (1 - clampedProgress);
	} else if (ms > sunset) {
		// After sunset - sun is below horizon
		const timeSinceSunset = ms - sunset;
		const halfNightLength = (DAY_MS - dayLength) / 2;
		// At sunset, timeSinceSunset ~ 0, progress ~ 0
		// At midnight, timeSinceSunset ~ halfNightLength, progress ~ 1
		const progress = timeSinceSunset / halfNightLength;
		const clampedProgress = Math.max(0, Math.min(1, progress));
		// Sun goes from 0 at sunset to -maxAltitude at midnight
		return -maxAltitude * clampedProgress;
	} else {
		// Daytime - sun is above horizon
		const dayProgress = (ms - sunrise) / dayLength;
		// Sinusoidal curve: 0 at sunrise, maxAltitude at noon, 0 at sunset
		return maxAltitude * Math.sin(dayProgress * Math.PI);
	}
}
