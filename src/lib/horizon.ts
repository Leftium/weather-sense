/**
 * Physically-based sky gradient renderer
 *
 * Based on "horizon" by dnlzro (MIT License)
 * https://github.com/dnlzro/horizon
 *
 * Physical model from "A Scalable and Production Ready Sky and Atmosphere
 * Rendering Technique" (Sébastien Hillaire).
 *
 * Implementation derived from "Production Sky Rendering" (Andrew Helmer,
 * MIT License). Source: https://www.shadertoy.com/view/slSXRW
 */

// Vector utilities
type Vec3 = [number, number, number];

function clamp(x: number, min: number, max: number) {
	return Math.max(min, Math.min(max, x));
}

function dot(v1: Vec3, v2: Vec3) {
	return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

function len(v: Vec3) {
	return Math.hypot(v[0], v[1], v[2]);
}

function norm(v: Vec3): Vec3 {
	const l = len(v) || 1;
	return [v[0] / l, v[1] / l, v[2] / l];
}

function add(v1: Vec3, v2: Vec3): Vec3 {
	return [v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]];
}

function scale(v: Vec3, s: number): Vec3 {
	return [v[0] * s, v[1] * s, v[2] * s];
}

function vecExp(v: Vec3): Vec3 {
	return [Math.exp(v[0]), Math.exp(v[1]), Math.exp(v[2])];
}

// Constants
const PI = Math.PI;

// Coefficients of media components (m^-1)
const RAYLEIGH_SCATTER = [5.802e-6, 13.558e-6, 33.1e-6];
const MIE_SCATTER = 3.996e-6;
const MIE_ABSORB = 4.44e-6;
const OZONE_ABSORB = [0.65e-6, 1.881e-6, 0.085e-6];

// Altitude density distribution metrics
const RAYLEIGH_SCALE_HEIGHT = 8e3;
const MIE_SCALE_HEIGHT = 1.2e3;

// Additional parameters
const GROUND_RADIUS = 6_360e3;
const TOP_RADIUS = 6_460e3;
const SUN_INTENSITY = 1.0;

// Rendering
const SAMPLES = 32; // used for gradient stops and integration steps
const FOV_DEG = 75;

// Post-processing
const EXPOSURE = 25.0;
const GAMMA = 2.2;
const SUNSET_BIAS_STRENGTH = 0.1;

// ACES tonemapper (Knarkowicz)
function aces(color: Vec3): Vec3 {
	return color.map((c) => {
		const n = c * (2.51 * c + 0.03);
		const d = c * (2.43 * c + 0.59) + 0.14;
		return Math.max(0, Math.min(1, n / d));
	}) as Vec3;
}

// Enhance sunset hues (i.e., make warmer)
function applySunsetBias([r, g, b]: Vec3): Vec3 {
	// Relative luminance (sRGB)
	const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	// Weight is higher for darker sky (near horizon/twilight), lower midday
	const w = 1.0 / (1.0 + 2.0 * lum);
	const k = SUNSET_BIAS_STRENGTH; // overall strength
	const rb = 1.0 + 0.5 * k * w; // boost red
	const gb = 1.0 - 0.5 * k * w; // suppress green
	const bb = 1.0 + 1.0 * k * w; // boost blue
	return [Math.max(0, r * rb), Math.max(0, g * gb), Math.max(0, b * bb)];
}

function rayleighPhase(angle: number) {
	return (3 * (1 + Math.cos(angle) ** 2)) / (16 * PI);
}

function miePhase(angle: number) {
	const g = 0.8;
	const scl = 3 / (8 * PI);
	const num = (1 - g ** 2) * (1 + Math.cos(angle) ** 2);
	const denom = (2 + g ** 2) * (1 + g ** 2 - 2 * g * Math.cos(angle)) ** (3 / 2);
	return (scl * num) / denom;
}

// From "5.3.2 Intersecting Ray or Segment Against Sphere" (Real-Time Collision Detection)
function intersectSphere(p: Vec3, d: Vec3, r: number) {
	// Sphere center is at origin, so M = P - C = P
	const m = p;
	const b = dot(m, d);
	const c = dot(m, m) - r ** 2;
	const discr = b ** 2 - c;
	if (discr < 0)
		// Ray misses sphere
		return null;
	const t = -b - Math.sqrt(discr);
	if (t < 0)
		// Ray inside sphere; Use far discriminant
		return -b + Math.sqrt(discr);
	return t;
}

// Optical depth approximation
function computeTransmittance(height: number, angle: number) {
	const rayOrigin: Vec3 = [0, GROUND_RADIUS + height, 0];
	const rayDirection: Vec3 = [Math.sin(angle), Math.cos(angle), 0];

	const distance = intersectSphere(rayOrigin, rayDirection, TOP_RADIUS);
	if (!distance) return [1, 1, 1];

	// March along the ray using a fixed step size
	const segmentLength = distance / SAMPLES;
	let t = 0.5 * segmentLength;

	// Accumulate path-integrated densities
	let odRayleigh = 0; // molecules (Rayleigh)
	let odMie = 0; // aerosols (Mie)
	let odOzone = 0; // ozone (absorption only)
	for (let i = 0; i < SAMPLES; i++) {
		// Position along the ray and its altitude above ground
		const pos = add(rayOrigin, scale(rayDirection, t));
		const h = len(pos) - GROUND_RADIUS;

		// Exponential falloff with altitude for Rayleigh and Mie densities
		const dR = Math.exp(-h / RAYLEIGH_SCALE_HEIGHT);
		const dM = Math.exp(-h / MIE_SCALE_HEIGHT);

		// Integrate (density × path length)
		odRayleigh += dR * segmentLength;

		// Simple ozone layer: triangular profile centered at 25 km, width 30 km
		const ozoneDensity = 1.0 - Math.min(Math.abs(h - 25e3) / 15e3, 1.0);
		odOzone += ozoneDensity * segmentLength;

		odMie += dM * segmentLength;
		t += segmentLength;
	}

	// Convert integrated densities into per-channel optical depth (Beer-Lambert)
	const tauR = [
		RAYLEIGH_SCATTER[0] * odRayleigh,
		RAYLEIGH_SCATTER[1] * odRayleigh,
		RAYLEIGH_SCATTER[2] * odRayleigh,
	];
	const tauM = [MIE_ABSORB * odMie, MIE_ABSORB * odMie, MIE_ABSORB * odMie];
	const tauO = [OZONE_ABSORB[0] * odOzone, OZONE_ABSORB[1] * odOzone, OZONE_ABSORB[2] * odOzone];

	// Total optical depth: transmittance T = exp(-tau)
	const tau = [
		-(tauR[0] + tauM[0] + tauO[0]),
		-(tauR[1] + tauM[1] + tauO[1]),
		-(tauR[2] + tauM[2] + tauO[2]),
	];
	return vecExp(tau as Vec3);
}

export interface SkyGradientResult {
	gradient: string;
	zenithColor: string;
	horizonColor: string;
	zenithRgb: Vec3;
	horizonRgb: Vec3;
}

/**
 * Render sky gradient at given solar altitude (elevation angle in radians)
 * @param altitude - Sun elevation angle in radians (negative = below horizon)
 * @returns Object with CSS gradient string and zenith/horizon colors
 */
export function renderSkyGradient(altitude: number): SkyGradientResult {
	const cameraPosition: Vec3 = [0, GROUND_RADIUS, 0];
	const sunDirection: Vec3 = norm([Math.cos(altitude), Math.sin(altitude), 0]);

	// Projection constant (used to tilt rays upward)
	const focalZ = 1.0 / Math.tan((FOV_DEG * 0.5 * PI) / 180.0);

	const stops = [] as Array<{ percent: number; rgb: Vec3 }>;
	for (let i = 0; i < SAMPLES; i++) {
		const s = i / (SAMPLES - 1);

		const viewDirection = norm([0, s, focalZ]);

		const inscattered: Vec3 = [0, 0, 0];

		const tExitTop = intersectSphere(cameraPosition, viewDirection, TOP_RADIUS);
		if (tExitTop !== null && tExitTop > 0) {
			const rayOrigin = cameraPosition.slice() as Vec3;

			// Fixed-step integration along the valid path segment
			const segmentLength = tExitTop / SAMPLES;
			let tRay = segmentLength * 0.5;

			// Precompute camera-to-space transmittance and the direction polarity
			const rayOriginRadius = len(rayOrigin);
			const isRayPointingDownwardAtStart = dot(rayOrigin, viewDirection) / rayOriginRadius < 0.0;
			const startHeight = rayOriginRadius - GROUND_RADIUS;
			const startRayCos = clamp(
				dot(
					[
						rayOrigin[0] / rayOriginRadius,
						rayOrigin[1] / rayOriginRadius,
						rayOrigin[2] / rayOriginRadius,
					],
					viewDirection,
				),
				-1,
				1,
			);
			const startRayAngle = Math.acos(Math.abs(startRayCos));
			const transmittanceCameraToSpace = computeTransmittance(startHeight, startRayAngle);

			for (let j = 0; j < SAMPLES; j++) {
				// Position and local frame
				const samplePos = add(rayOrigin, scale(viewDirection, tRay));
				const sampleRadius = len(samplePos);
				const upUnit: Vec3 = [
					samplePos[0] / sampleRadius,
					samplePos[1] / sampleRadius,
					samplePos[2] / sampleRadius,
				];
				const sampleHeight = sampleRadius - GROUND_RADIUS;

				// Angles for view ray and sun relative to local up
				const viewCos = clamp(dot(upUnit, viewDirection), -1, 1);
				const sunCos = clamp(dot(upUnit, sunDirection), -1, 1);
				const viewAngle = Math.acos(Math.abs(viewCos));
				const sunAngle = Math.acos(sunCos);

				// Transmittance camera→sample and sample→space
				const transmittanceToSpace = computeTransmittance(sampleHeight, viewAngle);
				const transmittanceCameraToSample = [0, 0, 0] as Vec3;
				for (let k = 0; k < 3; k++) {
					transmittanceCameraToSample[k] = isRayPointingDownwardAtStart
						? transmittanceToSpace[k] / transmittanceCameraToSpace[k]
						: transmittanceCameraToSpace[k] / transmittanceToSpace[k];
				}

				// Transmittance from sample toward the sun
				const transmittanceLight = computeTransmittance(sampleHeight, sunAngle);

				// Local densities and phase functions
				const opticalDensityRay = Math.exp(-sampleHeight / RAYLEIGH_SCALE_HEIGHT);
				const opticalDensityMie = Math.exp(-sampleHeight / MIE_SCALE_HEIGHT);
				const sunViewCos = clamp(dot(sunDirection, viewDirection), -1, 1);
				const sunViewAngle = Math.acos(sunViewCos);
				const phaseR = rayleighPhase(sunViewAngle);
				const phaseM = miePhase(sunViewAngle);

				// Single-scattering contribution
				const scatteredRgb = [0, 0, 0] as Vec3;
				for (let k = 0; k < 3; k++) {
					const rayleighTerm = RAYLEIGH_SCATTER[k] * opticalDensityRay * phaseR;
					const mieTerm = MIE_SCATTER * opticalDensityMie * phaseM;
					scatteredRgb[k] = transmittanceLight[k] * (rayleighTerm + mieTerm);
				}

				// Accumulate along the ray
				for (let k = 0; k < 3; k++) {
					inscattered[k] += transmittanceCameraToSample[k] * scatteredRgb[k] * segmentLength;
				}
				tRay += segmentLength;
			}

			for (let k = 0; k < 3; k++) inscattered[k] *= SUN_INTENSITY;
		}

		// Post-process: exposure → gentle sunset bias → ACES tonemap → gamma → 8-bit RGB
		let color = inscattered.slice() as Vec3;
		color = color.map((c) => c * EXPOSURE) as Vec3;
		color = applySunsetBias(color);
		color = aces(color);
		color = color.map((c) => Math.pow(c, 1.0 / GAMMA)) as Vec3;
		const rgb = color.map((c) => Math.round(clamp(c, 0, 1) * 255)) as Vec3;

		// 0% at zenith (top), 100% at horizon (bottom)
		const percent = (1 - s) * 100;
		stops.push({ percent, rgb });
	}

	// Compose CSS gradient string from the ordered stops
	stops.sort((a, b) => a.percent - b.percent);
	const colorStops = stops
		.map(
			({ percent, rgb }) =>
				`rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]}) ${Math.round(percent * 100) / 100}%`,
		)
		.join(', ');

	const zenithRgb = stops[0].rgb;
	const horizonRgb = stops[stops.length - 1].rgb;

	return {
		gradient: `linear-gradient(to bottom, ${colorStops})`,
		zenithColor: `rgb(${zenithRgb[0]}, ${zenithRgb[1]}, ${zenithRgb[2]})`,
		horizonColor: `rgb(${horizonRgb[0]}, ${horizonRgb[1]}, ${horizonRgb[2]})`,
		zenithRgb,
		horizonRgb,
	};
}

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
