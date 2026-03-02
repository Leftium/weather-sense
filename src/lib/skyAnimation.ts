/**
 * Sky gradient animation system.
 *
 * Handles smooth color transitions when scrubbing through time on weather plots.
 * - Eased transitions on enter/leave/switch plot
 * - Time-based animation during scrubbing (slows during dawn/dusk)
 * - Direct DOM updates for performance (bypasses Svelte reactivity at 60fps)
 */

import {
	getSkyColors,
	getSkyColorsFullPalette,
	colorsDelta,
	mixColors,
	contrastTextColor,
	lerpPaletteFast,
	MS_IN_HOUR,
} from '$lib/util';
import { getSunAltitude } from '$lib/horizon';
import { gg } from '@leftium/gg';

// =============================================================================
// TYPES
// =============================================================================

export interface DayInfo {
	ms: number;
	sunrise: number;
	sunset: number;
}

export interface SkyAnimatorConfig {
	/** Get the day containing a timestamp (for sunrise/sunset lookup) */
	findDayForMs: (ms: number) => DayInfo | undefined;
	/** Get current tracking state */
	getTrackingState: () => { targetMs: number; trackedElement: HTMLElement | null };
	/** Get DOM element heights for gradient calculation */
	getHeights: () => { stickyHeight: number; tilesHeight: number };
	/** Get DOM elements to update */
	getElements: () => { stickyEl: HTMLElement | null; tilesEl: HTMLElement | null };
	/** Default colors when no day info available */
	defaultColors: string[];
}

export interface SkyAnimatorState {
	/** Current display colors */
	colors: string[];
	/** Current display time in ms */
	displayMs: number;
	/** Whether a transition is in progress */
	isTransitioning: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DAY_COLORS = ['#f0f8ff', '#a8d8f0', '#6bb3e0']; // Fallback daytime colors

// Transition timing
const TRANSITION_DURATION = 300; // ms
const SETTLE_DELAY = 100; // ms - wait for mouse to settle before transitioning
const TRANSITION_FRAME_INTERVAL = 1000 / 15; // 15fps

// Scrub animation
const TARGET_COLOR_DELTA_PER_FRAME = 0.5 / 15; // Color change per frame at 15fps
const MIN_TIME_STEP = 30000; // Min 30 seconds per frame
const MAX_TIME_STEP = 14400000; // Max 4 hours per frame
const SNAP_THRESHOLD = 30000; // Snap when within 30 seconds

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/** easeOutExpo - fast start, slow end */
function ease(t: number): number {
	return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Count dawn/dusk transition zones that overlap with the range between two times.
 * A transition zone is sunrise/sunset ± 1 hour.
 */
function countTransitions(fromMs: number, toMs: number, sunrise: number, sunset: number): number {
	const minMs = Math.min(fromMs, toMs);
	const maxMs = Math.max(fromMs, toMs);
	let count = 0;

	if (sunrise - MS_IN_HOUR < maxMs && sunrise + MS_IN_HOUR > minMs) {
		count++;
	}
	if (sunset - MS_IN_HOUR < maxMs && sunset + MS_IN_HOUR > minMs) {
		count++;
	}
	return count;
}

/**
 * Find which transition (sunrise or sunset) is closest to target.
 */
function findFinalTransition(
	displayMs: number,
	targetMs: number,
	sunrise: number,
	sunset: number,
): 'sunrise' | 'sunset' | null {
	const minMs = Math.min(displayMs, targetMs);
	const maxMs = Math.max(displayMs, targetMs);

	const sunriseInRange = sunrise - MS_IN_HOUR < maxMs && sunrise + MS_IN_HOUR > minMs;
	const sunsetInRange = sunset - MS_IN_HOUR < maxMs && sunset + MS_IN_HOUR > minMs;

	if (!sunriseInRange && !sunsetInRange) return null;
	if (sunriseInRange && !sunsetInRange) return 'sunrise';
	if (!sunriseInRange && sunsetInRange) return 'sunset';

	const sunriseDist = Math.abs(sunrise - targetMs);
	const sunsetDist = Math.abs(sunset - targetMs);
	return sunriseDist < sunsetDist ? 'sunrise' : 'sunset';
}

/**
 * Check if displayMs is currently in the final transition zone.
 */
function isInFinalTransition(
	displayMs: number,
	targetMs: number,
	sunrise: number,
	sunset: number,
): boolean {
	const finalTrans = findFinalTransition(displayMs, targetMs, sunrise, sunset);
	if (finalTrans === null) return false;

	const finalTime = finalTrans === 'sunrise' ? sunrise : sunset;
	return Math.abs(displayMs - finalTime) < MS_IN_HOUR;
}

/**
 * Get the edge of the final transition zone (where we should stop skipping).
 */
function getFinalTransitionEdge(
	displayMs: number,
	targetMs: number,
	sunrise: number,
	sunset: number,
): number | null {
	const finalTrans = findFinalTransition(displayMs, targetMs, sunrise, sunset);
	if (finalTrans === null) return null;

	const finalTime = finalTrans === 'sunrise' ? sunrise : sunset;
	const direction = targetMs > displayMs ? 1 : -1;

	if (direction > 0) {
		return finalTime - MS_IN_HOUR;
	} else {
		return finalTime + MS_IN_HOUR;
	}
}

// =============================================================================
// SKY ANIMATOR CLASS
// =============================================================================

export class SkyAnimator {
	private config: SkyAnimatorConfig;

	// Display state
	private displayMs: number = Date.now();
	private displayColors: string[];

	// Tracking state
	private wasTracking = false;
	private lastTrackedElement: HTMLElement | null = null;

	// Transition state (for enter/leave/switch)
	private transitionStartTime: number | null = null;
	private transitionStartColors: string[];
	private transitionTargetColors: string[];
	private transitionTargetMs: number = Date.now();
	private transitionRafId: number | null = null;
	private transitionLastFrameTime = 0;
	private settleTimeoutId: ReturnType<typeof setTimeout> | null = null;

	// Scrub state (for within-plot animation)
	private scrubTargetMs: number = Date.now();
	private scrubStartDisplayMs: number = Date.now();

	constructor(config: SkyAnimatorConfig) {
		this.config = config;
		this.displayColors = [...config.defaultColors];
		this.transitionStartColors = [...config.defaultColors];
		this.transitionTargetColors = [...config.defaultColors];
	}

	// ===========================================================================
	// PUBLIC API
	// ===========================================================================

	/**
	 * Call this on every frame tick (typically 15fps from weather shell).
	 * Returns current state for reactive updates.
	 */
	tick(): SkyAnimatorState {
		const { targetMs, trackedElement } = this.config.getTrackingState();
		const isTracking = !!trackedElement;

		this.handleSkyUpdate(targetMs, isTracking, trackedElement);

		return {
			colors: this.displayColors,
			displayMs: this.displayMs,
			isTransitioning: this.transitionStartTime !== null || this.settleTimeoutId !== null,
		};
	}

	/**
	 * Get current colors for reactive Svelte state.
	 */
	getColors(): string[] {
		return this.displayColors;
	}

	/**
	 * Get current display time.
	 */
	getDisplayMs(): number {
		return this.displayMs;
	}

	/**
	 * Check if a transition is in progress.
	 */
	isTransitioning(): boolean {
		return this.transitionStartTime !== null || this.settleTimeoutId !== null;
	}

	/**
	 * Clean up timers and animation frames.
	 */
	destroy(): void {
		this.cancelTransition();
	}

	// ===========================================================================
	// INTERNAL: Color computation
	// ===========================================================================

	private hasLoggedRealData = false;

	private getTargetColors(targetMs: number): string[] {
		const day = this.config.findDayForMs(targetMs);
		if (!day) return this.config.defaultColors;

		if (!this.hasLoggedRealData) {
			this.hasLoggedRealData = true;
			const nowMs = Date.now();
			const altRad = getSunAltitude(nowMs, day.sunrise, day.sunset);
			const altDeg = altRad * (180 / Math.PI);
			const utc = (ms: number) => new Date(ms).toISOString().slice(11, 19) + ' UTC';
			gg('sky FINAL', {
				now: utc(nowMs),
				sunrise: utc(day.sunrise),
				sunset: utc(day.sunset),
				altitudeDeg: Math.round(altDeg * 100) / 100,
			});
		}

		return getSkyColorsFullPalette(targetMs, day.sunrise, day.sunset);
	}

	// ===========================================================================
	// INTERNAL: Transition animation (enter/leave/switch plot)
	// ===========================================================================

	private runTransition = (now: number): void => {
		if (this.transitionStartTime === null) {
			this.transitionRafId = null;
			return;
		}

		// Throttle to 15fps
		if (now - this.transitionLastFrameTime < TRANSITION_FRAME_INTERVAL) {
			this.transitionRafId = requestAnimationFrame(this.runTransition);
			return;
		}
		this.transitionLastFrameTime = now;

		const elapsed = now - this.transitionStartTime;
		const progress = Math.min(1, elapsed / TRANSITION_DURATION);
		const easedProgress = ease(progress);

		// Lerp colors
		this.displayColors = lerpPaletteFast(
			this.transitionStartColors,
			this.transitionTargetColors,
			easedProgress,
		);
		this.updateDOM();

		if (progress >= 1) {
			// Done
			this.displayMs = this.transitionTargetMs;
			this.scrubTargetMs = this.transitionTargetMs;
			this.transitionStartTime = null;
			this.transitionRafId = null;
		} else {
			this.transitionRafId = requestAnimationFrame(this.runTransition);
		}
	};

	private startTransitionNow(targetColors: string[]): void {
		this.transitionStartColors = [...this.displayColors];
		this.transitionTargetColors = targetColors;
		this.transitionStartTime = performance.now();

		if (this.transitionRafId === null) {
			this.transitionRafId = requestAnimationFrame(this.runTransition);
		}
	}

	private startTransition(targetMs: number): void {
		if (this.settleTimeoutId !== null) {
			clearTimeout(this.settleTimeoutId);
		}

		this.settleTimeoutId = setTimeout(() => {
			this.settleTimeoutId = null;
			const targetColors = this.getTargetColors(targetMs);
			this.startTransitionNow(targetColors);
		}, SETTLE_DELAY);
	}

	private cancelTransition(): void {
		if (this.settleTimeoutId !== null) {
			clearTimeout(this.settleTimeoutId);
			this.settleTimeoutId = null;
		}
		if (this.transitionRafId !== null) {
			cancelAnimationFrame(this.transitionRafId);
			this.transitionRafId = null;
		}
		this.transitionStartTime = null;
	}

	// ===========================================================================
	// INTERNAL: Scrub animation (within plot)
	// ===========================================================================

	private animateScrub(): void {
		const totalDiff = this.scrubTargetMs - this.scrubStartDisplayMs;
		const remainingDiff = this.scrubTargetMs - this.displayMs;
		const absDiff = Math.abs(remainingDiff);

		// Snap if close enough
		if (absDiff < SNAP_THRESHOLD) {
			this.displayMs = this.scrubTargetMs;
			this.displayColors = this.getTargetColors(this.displayMs);
			this.updateDOM();
			return;
		}

		const direction = Math.sign(remainingDiff);
		const day = this.config.findDayForMs(this.displayMs);

		if (!day) {
			// Fallback to instant
			this.displayMs = this.scrubTargetMs;
			this.displayColors = this.getTargetColors(this.displayMs);
			this.updateDOM();
			return;
		}

		const numTransitions = countTransitions(
			this.displayMs,
			this.scrubTargetMs,
			day.sunrise,
			day.sunset,
		);
		const inFinal = isInFinalTransition(
			this.displayMs,
			this.scrubTargetMs,
			day.sunrise,
			day.sunset,
		);
		const skipIntermediate = numTransitions > 1 && !inFinal;

		let timeStep: number;

		if (skipIntermediate) {
			const edge = getFinalTransitionEdge(
				this.displayMs,
				this.scrubTargetMs,
				day.sunrise,
				day.sunset,
			);
			timeStep = edge !== null ? Math.abs(edge - this.displayMs) : MAX_TIME_STEP;
		} else {
			// Normal animation - use color-based speed
			const sampleStep = 60000;
			const sampleMs = this.displayMs + direction * sampleStep;

			const currentColors = getSkyColors(this.displayMs, day.sunrise, day.sunset);
			const sampleColors = getSkyColors(sampleMs, day.sunrise, day.sunset);
			const colorDelta = colorsDelta(currentColors, sampleColors);

			const sunAlt = getSunAltitude(this.displayMs, day.sunrise, day.sunset);
			const altDeg = (sunAlt * 180) / Math.PI;
			const ALTITUDE_TRANSITION_MAX = 6;
			const approachingTransition = altDeg > ALTITUDE_TRANSITION_MAX && altDeg < 30;

			if (colorDelta >= 0.0001) {
				timeStep = (TARGET_COLOR_DELTA_PER_FRAME / colorDelta) * sampleStep;
			} else if (approachingTransition) {
				timeStep = 6 * 60 * 1000;
			} else {
				timeStep = MAX_TIME_STEP;
			}

			// Don't overshoot into transition
			if (numTransitions >= 1 && !inFinal) {
				const edge = getFinalTransitionEdge(
					this.displayMs,
					this.scrubTargetMs,
					day.sunrise,
					day.sunset,
				);
				if (edge !== null) {
					const distToEdge = Math.abs(edge - this.displayMs);
					if (timeStep > distToEdge) {
						timeStep = distToEdge;
					}
				}
			}

			// Apply easing
			const progress = Math.abs(totalDiff) > 0 ? 1 - absDiff / Math.abs(totalDiff) : 1;
			const easedMultiplier = 2 - ease(progress);
			timeStep = timeStep * easedMultiplier;
		}

		// Clamp and don't overshoot
		timeStep = Math.max(MIN_TIME_STEP, Math.min(MAX_TIME_STEP, timeStep));
		if (timeStep > absDiff) {
			timeStep = absDiff;
		}

		this.displayMs = this.displayMs + direction * timeStep;
		this.displayColors = this.getTargetColors(this.displayMs);
		this.updateDOM();
	}

	private startScrub(targetMs: number): void {
		this.scrubTargetMs = targetMs;
		this.scrubStartDisplayMs = this.displayMs;
		this.animateScrub();
	}

	// ===========================================================================
	// INTERNAL: Main update logic
	// ===========================================================================

	private handleSkyUpdate(
		targetMs: number,
		isTracking: boolean,
		trackedElement: HTMLElement | null,
	): void {
		const justStartedTracking = isTracking && !this.wasTracking;
		const justStoppedTracking = !isTracking && this.wasTracking;
		const switchedPlots =
			isTracking && this.wasTracking && trackedElement !== this.lastTrackedElement;
		const targetChanged = justStartedTracking || justStoppedTracking || switchedPlots;

		this.wasTracking = isTracking;
		this.lastTrackedElement = trackedElement;

		if (targetChanged) {
			this.cancelTransition();
			const newTargetMs = isTracking ? targetMs : Date.now();
			this.transitionTargetMs = newTargetMs;
			this.startTransition(newTargetMs);
			return;
		}

		if (isTracking) {
			// Wait for transition to complete before scrubbing
			if (this.settleTimeoutId !== null || this.transitionStartTime !== null) {
				return;
			}

			const targetMoved = Math.abs(targetMs - this.scrubTargetMs) > SNAP_THRESHOLD;
			if (targetMoved) {
				this.startScrub(targetMs);
			} else {
				this.animateScrub();
			}
		}
	}

	// ===========================================================================
	// INTERNAL: DOM updates
	// ===========================================================================

	private updateDOM(): void {
		const { stickyEl, tilesEl } = this.config.getElements();
		const { stickyHeight, tilesHeight } = this.config.getHeights();
		const colors = this.displayColors;

		// Calculate boundary color for seamless vertical gradient
		const total = stickyHeight + tilesHeight;
		const ratio = stickyHeight / total;
		let boundaryCol: string;
		if (ratio <= 0.5) {
			const t = ratio / 0.5;
			boundaryCol = mixColors(colors[0], colors[1], t);
		} else {
			const t = (ratio - 0.5) / 0.5;
			boundaryCol = mixColors(colors[1], colors[2], t);
		}

		const gradientH = `linear-gradient(90deg, ${colors[2]} 0%, ${colors[1]} 50%, ${colors[0]} 100%)`;
		const gradientVSticky = `linear-gradient(180deg, ${colors[0]} 0%, ${boundaryCol} 100%)`;
		const gradientVTiles = `linear-gradient(180deg, ${boundaryCol} 0%, ${colors[2]} 100%)`;

		if (stickyEl) {
			stickyEl.style.background = `${gradientH}, ${gradientVSticky}`;
			stickyEl.style.backgroundBlendMode = 'overlay';
			stickyEl.style.color = contrastTextColor(colors[1]);
		}

		if (tilesEl) {
			tilesEl.style.background = `${gradientH}, ${gradientVTiles}`;
			tilesEl.style.backgroundBlendMode = 'overlay';
			tilesEl.style.setProperty('--btn-text-color', contrastTextColor(colors[1]));
			tilesEl.style.setProperty('--btn-text-shadow', contrastTextColor(colors[1], true));
		}
	}
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createSkyAnimator(config: SkyAnimatorConfig): SkyAnimator {
	return new SkyAnimator(config);
}

// =============================================================================
// HELPER: Get initial colors from coordinates + timezone estimate
// =============================================================================

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezonePlugin from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

/**
 * Estimate sunrise/sunset timestamps for a given date and latitude.
 * Uses the standard solar declination / hour-angle equation.
 * Returns { sunrise, sunset } as UTC millisecond timestamps,
 * or null for polar day/night (sun never rises or never sets).
 */
function estimateSunTimes(
	date: Date,
	latitude: number,
	longitude: number,
): { sunrise: number; sunset: number } | null {
	const RAD = Math.PI / 180;
	// Day of year (UTC-based to avoid local timezone issues)
	const year = date.getUTCFullYear();
	const startOfYear = Date.UTC(year, 0, 1);
	const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000) + 1;

	// Fractional year in radians (γ)
	const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1);

	// Equation of time correction (minutes) — accounts for orbital eccentricity and axial tilt
	// Source: NOAA Solar Calculations
	const eqTime =
		229.18 *
		(0.000075 +
			0.001868 * Math.cos(gamma) -
			0.032077 * Math.sin(gamma) -
			0.014615 * Math.cos(2 * gamma) -
			0.04089 * Math.sin(2 * gamma));

	// Solar declination (radians) — NOAA formula
	const declination =
		0.006918 -
		0.399912 * Math.cos(gamma) +
		0.070257 * Math.sin(gamma) -
		0.006758 * Math.cos(2 * gamma) +
		0.000907 * Math.sin(2 * gamma) -
		0.002697 * Math.cos(3 * gamma) +
		0.00148 * Math.sin(3 * gamma);

	// Hour angle for sunrise/sunset (solar zenith ~90.833° accounts for refraction + solar disc)
	const latRad = latitude * RAD;
	const cosHourAngle =
		(Math.cos(90.833 * RAD) - Math.sin(latRad) * Math.sin(declination)) /
		(Math.cos(latRad) * Math.cos(declination));

	// Polar night or midnight sun — no standard sunrise/sunset
	if (cosHourAngle > 1 || cosHourAngle < -1) return null;

	const hourAngleDeg = Math.acos(cosHourAngle) / RAD;

	// Solar noon in minutes from midnight UTC, adjusted for longitude and equation of time
	// 720 = 12h * 60min (solar noon at prime meridian)
	const solarNoonMin = 720 - 4 * longitude - eqTime;

	const sunriseMin = solarNoonMin - 4 * hourAngleDeg;
	const sunsetMin = solarNoonMin + 4 * hourAngleDeg;

	const midnightUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

	return {
		sunrise: midnightUtc + sunriseMin * 60_000,
		sunset: midnightUtc + sunsetMin * 60_000,
	};
}

/**
 * Calculate initial sky colors using lat/lon for accurate sunrise/sunset estimation.
 * Falls back to timezone-based 6am/6pm estimate if coords unavailable,
 * or returns null if neither is available.
 */
export function getInitialSkyColors(
	timezone: string | null,
	coords?: { latitude: number; longitude: number } | null,
): { colors: string[]; meta: Record<string, unknown> } | null {
	const nowMs = Date.now();

	let estimatedSunrise: number;
	let estimatedSunset: number;
	let source: string;

	if (coords) {
		const sunTimes = estimateSunTimes(new Date(nowMs), coords.latitude, coords.longitude);
		if (sunTimes) {
			estimatedSunrise = sunTimes.sunrise;
			estimatedSunset = sunTimes.sunset;
			source = 'solar equation';
		} else {
			// Polar day/night — can't estimate, fall back
			if (!timezone) return null;
			const todayStart = dayjs(nowMs).tz(timezone).startOf('day');
			estimatedSunrise = todayStart.add(6, 'hour').valueOf();
			estimatedSunset = todayStart.add(18, 'hour').valueOf();
			source = 'hardcoded 6am/6pm (polar fallback)';
		}
	} else if (timezone) {
		const todayStart = dayjs(nowMs).tz(timezone).startOf('day');
		estimatedSunrise = todayStart.add(6, 'hour').valueOf();
		estimatedSunset = todayStart.add(18, 'hour').valueOf();
		source = 'hardcoded 6am/6pm';
	} else {
		return null;
	}

	// Format times for logging — use timezone if available, otherwise show UTC
	const formatTime = timezone
		? (ms: number) => dayjs(ms).tz(timezone).format('HH:mm:ss')
		: (ms: number) => dayjs(ms).utc().format('HH:mm:ss [UTC]');

	return {
		colors: getSkyColorsFullPalette(nowMs, estimatedSunrise, estimatedSunset),
		meta: {
			now: formatTime(nowMs),
			sunrise: formatTime(estimatedSunrise),
			sunset: formatTime(estimatedSunset),
			altitudeDeg:
				Math.round(
					((getSunAltitude(nowMs, estimatedSunrise, estimatedSunset) * 180) / Math.PI) * 100,
				) / 100,
			source,
		},
	};
}

export { DAY_COLORS };
