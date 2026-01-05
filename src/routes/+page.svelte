<script lang="ts">
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import TimeLine from './TimeLine.svelte';

	import DailyTiles from './DailyTiles.svelte';

	import {
		MS_IN_HOUR,
		MS_IN_DAY,
		TEMP_COLOR_HOT,
		TEMP_COLOR_COLD,
		jsonPretty,
		summarize,
		humanDistance,
		objectFromMap,
		wmoCode,
		getGroupedWmoCode,
		getDayWmoCode,
		getWeatherIcon,
		startOf,
		colors,
		aqiUsToLabel,
		aqiEuropeToLabel,
		getSkyColors,
		colorsDelta,
		contrastTextColor,
		formatTemp,
		temperatureToColor,
	} from '$lib/util.js';
	import { iconSetStore } from '$lib/iconSet.svelte';
	import RadarMapLibre from './RadarMapLibre.svelte';

	import { clearEvents, getEmitter } from '$lib/emitter.js';
	import { browser, dev } from '$app/environment';
	import { onDestroy, onMount, untrack } from 'svelte';

	const STORAGE_KEY_PLOT_VISIBILITY = 'weather-sense:plotVisibility';
	const STORAGE_KEY_UNITS = 'weather-sense:units';

	import { FORECAST_DAYS, makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	import { slide } from 'svelte/transition';
	import { maxBy } from 'lodash-es';
	import dayjs from 'dayjs';
	import utc from 'dayjs/plugin/utc';
	import timezonePlugin from 'dayjs/plugin/timezone';

	dayjs.extend(utc);
	dayjs.extend(timezonePlugin);

	const nsWeatherData = makeNsWeatherData();
	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	let { data } = $props();

	let forecastDaysVisible = $state(3);
	let showMoreOptions = $state(false);
	let groupIcons = $state(true);

	// Actual max forecast days based on available data (daily getter removes incomplete last day)
	const maxForecastDays = $derived(
		Math.max(0, ...(nsWeatherData.daily?.map((d) => d.fromToday + 1) ?? [FORECAST_DAYS])),
	);
	let isWideCollapsed = $state(false); // 480px+ : 3 columns for collapsed
	let isWideExpanded = $state(false); // 700px+ : 4 columns for expanded

	// Controls which plots are visible on the timeline
	let plotVisibility = $state({
		temp: true,
		tempRange: true,
		dewPoint: false,
		humidity: false,
		precip: true,
		chance: true,
		euAqi: true,
		usAqi: false,
	});

	// Flag to prevent saving until preferences are loaded
	let prefsLoaded = $state(false);

	// Save plotVisibility to localStorage when it changes (after initial load)
	$effect(() => {
		// Read plotVisibility to track changes
		const _ = JSON.stringify(plotVisibility);
		if (browser && prefsLoaded) {
			localStorage.setItem(STORAGE_KEY_PLOT_VISIBILITY, JSON.stringify(plotVisibility));
		}
	});

	// Checkbox configurations
	type CheckboxConfig = {
		key: string;
		label?: string;
		color: string;
		checked: boolean;
		bindKey?: keyof typeof plotVisibility | 'showMoreOptions';
		toggleUnits?: boolean;
		getValue: () => string;
		getValueEnd?: () => string; // For range display (e.g., "X to Y")
	};

	const getCheckboxConfigs = (): Record<string, CheckboxConfig> => ({
		temp: {
			key: 'temp',
			label: 'Temp:',
			color: 'gradient',
			checked: plotVisibility.temp,
			bindKey: 'temp',
			toggleUnits: true,
			getValue: () => nsWeatherData.format('displayTemperature'),
		},
		tempRange: {
			key: 'tempRange',
			color: 'gray',
			checked: plotVisibility.tempRange,
			bindKey: 'tempRange',
			toggleUnits: true,
			getValue: () => nsWeatherData.format('daily[2].temperatureMin', false),
			getValueEnd: () => nsWeatherData.format('daily[2].temperatureMax', false),
		},
		dewPoint: {
			key: 'dewPoint',
			label: 'Dew Pt:',
			color: colors.dewPoint,
			checked: plotVisibility.dewPoint,
			bindKey: 'dewPoint',
			toggleUnits: true,
			getValue: () => nsWeatherData.format('displayDewPoint', false),
		},
		humidity: {
			key: 'humidity',
			label: 'Humidity:',
			color: colors.humidity,
			checked: plotVisibility.humidity,
			bindKey: 'humidity',
			getValue: () => `${nsWeatherData.displayHumidity}%`,
		},
		precip: {
			key: 'precip',
			label: 'Precip:',
			color: colors.precipitation,
			checked: plotVisibility.precip,
			bindKey: 'precip',
			getValue: () => `${nsWeatherData.displayPrecipitation}mm`,
		},
		chance: {
			key: 'chance',
			label: 'Chance:',
			color: colors.precipitationProbability,
			checked: plotVisibility.chance,
			bindKey: 'chance',
			getValue: () => `${nsWeatherData.displayPrecipitationProbability}%`,
		},
		euAqi: {
			key: 'euAqi',
			label: 'EU AQI:',
			color: aqiEuropeToLabel(nsWeatherData.displayAqiEurope ?? null).color,
			checked: plotVisibility.euAqi,
			bindKey: 'euAqi',
			getValue: () => `${nsWeatherData.displayAqiEurope}`,
		},
		usAqi: {
			key: 'usAqi',
			label: 'US AQI:',
			color: aqiUsToLabel(nsWeatherData.displayAqiUs ?? null).color,
			checked: plotVisibility.usAqi,
			bindKey: 'usAqi',
			getValue: () => `${nsWeatherData.displayAqiUs}`,
		},
		showAll: {
			key: 'showAll',
			label: 'Show all',
			color: 'gray',
			checked: showMoreOptions,
			bindKey: 'showMoreOptions',
			getValue: () => '',
		},
	});

	// Layout orders: [narrow/wide] x [collapsed/expanded]
	const layoutOrders = {
		narrow: {
			collapsed: ['temp', 'humidity', 'precip', 'chance', 'euAqi', 'showAll'],
			expanded: ['temp', 'tempRange', 'dewPoint', 'humidity', 'precip', 'chance', 'euAqi', 'usAqi'],
		},
		wide: {
			collapsed: ['temp', 'precip', 'euAqi', 'humidity', 'chance', 'showAll'],
			expanded: ['temp', 'dewPoint', 'precip', 'euAqi', 'tempRange', 'humidity', 'chance', 'usAqi'],
		},
	};

	const currentOrder = $derived.by(() => {
		const isExpanded = showMoreOptions;
		const isWide = isExpanded ? isWideExpanded : isWideCollapsed;
		return layoutOrders[isWide ? 'wide' : 'narrow'][isExpanded ? 'expanded' : 'collapsed'];
	});

	const checkboxConfigs = $derived(getCheckboxConfigs());

	function handleCheckboxChange(
		bindKey: keyof typeof plotVisibility | 'showMoreOptions',
		event: Event,
	) {
		const checked = (event.target as HTMLInputElement).checked;
		if (bindKey === 'showMoreOptions') {
			showMoreOptions = checked;
		} else if (bindKey in plotVisibility) {
			plotVisibility[bindKey] = checked;
		}
	}

	// Initialize location once on mount (untrack to avoid re-running on data changes)
	untrack(() => {
		emit('weatherdata_requestedSetLocation', {
			source: data.source,
			name: data.name,
			coords: data.coords,
		});
	});

	// Find the day that contains the current ms timestamp
	const currentDay = $derived.by(() => {
		const ms = nsWeatherData.ms;
		// Find day where ms falls between start of day and start of next day
		const day = nsWeatherData.daily?.find((d, i, arr) => {
			const nextDay = arr[i + 1];
			if (nextDay) {
				return ms >= d.ms && ms < nextDay.ms;
			}
			// Last day - check if within 24 hours
			return ms >= d.ms && ms < d.ms + 24 * 60 * 60 * 1000;
		});
		// Fallback to today
		return day || nsWeatherData.daily?.find((d) => d.fromToday === 0);
	});

	// Get representative WMO code for the 24-hour hourly plot
	// When groupIcons=true: groups codes like TimeLine does, then picks most severe group representative
	// When groupIcons=false: picks most severe code overall (highest wsCode value)
	const hourly24WmoCode = $derived.by(() => {
		const hourlyStart = Date.now() - 2 * MS_IN_HOUR;
		const hourlyEnd = hourlyStart + 24 * MS_IN_HOUR;

		// Filter hourly data to the 24-hour window
		const hourlyInRange = nsWeatherData.hourly?.filter(
			(h) => h.ms >= hourlyStart && h.ms < hourlyEnd,
		);

		if (!hourlyInRange?.length) return null;

		if (!groupIcons) {
			// Ungrouped: find the most severe weather code overall
			const mostSevere = maxBy(hourlyInRange, (h) => wmoCode(h.weatherCode).wsCode ?? 0);
			return mostSevere?.weatherCode ?? null;
		}

		return getGroupedWmoCode(hourlyInRange, maxBy);
	});

	// Get isDay for the current real time (where past overlay ends on 24hr plot)
	const currentIsDay = $derived.by(() => {
		const now = Date.now();
		const currentHourMs = startOf(now, 'hour', nsWeatherData.timezone);
		const hourData = nsWeatherData.dataForecast.get(currentHourMs);
		return hourData?.isDay ?? true;
	});

	// Dynamic sky gradient with smooth animated transitions
	// Animates through TIME to ensure you never skip gradients (e.g., must pass through dawn)
	// Moves at constant COLOR speed for smooth visual transitions
	// If multiple transitions (dawn+dusk), speeds through early ones, slows for final one
	const TARGET_COLOR_DELTA_PER_SECOND = 0.5; // Color change per second (frame-rate independent)
	const MIN_TIME_STEP_PER_SEC = 1800000; // Min simulated ms per real second (30 min/sec)
	const MAX_TIME_STEP_PER_SEC = 216000000; // Max simulated ms per real second (60 hr/sec)
	const SNAP_THRESHOLD = 500; // Snap to target when within 500ms simulated time

	// Calculate initial sky colors based on timezone from request
	// Estimate sunrise ~6am and sunset ~6pm local time
	// Returns null if no timezone available (e.g., location passed via query param)
	function getInitialColors(timezone: string | null): string[] | null {
		if (!timezone) return null;
		const now = dayjs().tz(timezone);
		const todayStart = now.startOf('day');
		const estimatedSunrise = todayStart.add(6, 'hour').valueOf(); // 6:00 AM
		const estimatedSunset = todayStart.add(18, 'hour').valueOf(); // 6:00 PM
		return getSkyColors(now.valueOf(), estimatedSunrise, estimatedSunset);
	}

	const DAY_COLORS = ['#f0f8ff', '#a8d8f0', '#6bb3e0']; // Fallback daytime colors
	const DEFAULT_COLORS = getInitialColors(data.timezone) ?? DAY_COLORS;

	let animationFrameId: number | null = null;

	function getTimeOfDay(ms: number): number {
		// Use location's timezone, not local timezone
		const d = dayjs(ms).tz(nsWeatherData.timezone);
		return d.hour() * 3600000 + d.minute() * 60000 + d.second() * 1000 + d.millisecond();
	}

	function getDayStart(ms: number): number {
		// Use location's timezone, not local timezone
		return dayjs(ms).tz(nsWeatherData.timezone).startOf('day').valueOf();
	}

	// Count dawn/dusk transitions between two times
	// Transitions happen around sunrise and sunset (±1 hour is the colorful part)
	function countTransitions(fromMs: number, toMs: number, sunrise: number, sunset: number): number {
		const minMs = Math.min(fromMs, toMs);
		const maxMs = Math.max(fromMs, toMs);
		let count = 0;

		// Check if sunrise transition is in range (sunrise ± 1 hour)
		if (sunrise - MS_IN_HOUR < maxMs && sunrise + MS_IN_HOUR > minMs) {
			count++;
		}
		// Check if sunset transition is in range (sunset ± 1 hour)
		if (sunset - MS_IN_HOUR < maxMs && sunset + MS_IN_HOUR > minMs) {
			count++;
		}
		return count;
	}

	// Check if we're currently in the final transition (closest to target)
	function isInFinalTransition(
		displayMs: number,
		targetMs: number,
		sunrise: number,
		sunset: number,
	): boolean {
		const direction = targetMs > displayMs ? 1 : -1;

		// Find which transition target is in or just after
		const targetInSunrise = targetMs >= sunrise - MS_IN_HOUR && targetMs <= sunrise + MS_IN_HOUR;
		const targetInSunset = targetMs >= sunset - MS_IN_HOUR && targetMs <= sunset + MS_IN_HOUR;

		if (direction > 0) {
			// Moving forward: final transition is the last one before target
			if (targetInSunset || targetMs > sunset + MS_IN_HOUR) {
				// Target is at/past sunset, so sunset is final (if we haven't passed it)
				return displayMs >= sunset - MS_IN_HOUR;
			} else if (targetInSunrise || targetMs > sunrise + MS_IN_HOUR) {
				// Target is at/past sunrise but before sunset
				return displayMs >= sunrise - MS_IN_HOUR;
			}
		} else {
			// Moving backward: final transition is the last one before target (going back)
			if (targetInSunrise || targetMs < sunrise - MS_IN_HOUR) {
				// Target is at/before sunrise
				return displayMs <= sunrise + MS_IN_HOUR;
			} else if (targetInSunset || targetMs < sunset - MS_IN_HOUR) {
				// Target is at/before sunset but after sunrise
				return displayMs <= sunset + MS_IN_HOUR;
			}
		}

		return true; // Default to final (normal speed)
	}

	// Get the edge of the final transition (where we should stop skipping)
	function getFinalTransitionEdge(
		displayMs: number,
		targetMs: number,
		sunrise: number,
		sunset: number,
	): number | null {
		const direction = targetMs > displayMs ? 1 : -1;

		const targetInSunrise = targetMs >= sunrise - MS_IN_HOUR && targetMs <= sunrise + MS_IN_HOUR;
		const targetInSunset = targetMs >= sunset - MS_IN_HOUR && targetMs <= sunset + MS_IN_HOUR;

		if (direction > 0) {
			// Moving forward: find start of final transition
			if (targetInSunset || targetMs > sunset + MS_IN_HOUR) {
				// Final is sunset - return its start edge
				return sunset - MS_IN_HOUR;
			} else if (targetInSunrise || targetMs > sunrise + MS_IN_HOUR) {
				// Final is sunrise - return its start edge
				return sunrise - MS_IN_HOUR;
			}
		} else {
			// Moving backward: find end of final transition (going back)
			if (targetInSunrise || targetMs < sunrise - MS_IN_HOUR) {
				// Final is sunrise - return its end edge
				return sunrise + MS_IN_HOUR;
			} else if (targetInSunset || targetMs < sunset - MS_IN_HOUR) {
				// Final is sunset - return its end edge
				return sunset + MS_IN_HOUR;
			}
		}

		return null; // No transition edge
	}

	// The display time (absolute ms) that animates toward target - this drives the gradient
	let displayMs = $state(Date.now());
	let lastTargetDayStart = $state(getDayStart(Date.now()));

	// Compute colors from displayMs using currentDay's sunrise/sunset
	const displayColors = $derived.by(() => {
		if (!currentDay) return DEFAULT_COLORS;
		return getSkyColors(displayMs, currentDay.sunrise, currentDay.sunset);
	});

	// Immediate colors (no animation) for tracker
	const targetColors = $derived.by(() => {
		if (!currentDay) return DEFAULT_COLORS;
		return getSkyColors(nsWeatherData.ms, currentDay.sunrise, currentDay.sunset);
	});

	// Start animation loop - steps through time at constant color speed (frame-rate independent)
	$effect(() => {
		let lastFrameTime: number | null = null;

		function animate(currentTime: number) {
			// Calculate delta time (seconds since last frame)
			// Default to 16ms (~60fps) on first frame to avoid zero movement
			const deltaTime = lastFrameTime !== null ? (currentTime - lastFrameTime) / 1000 : 0.016;
			lastFrameTime = currentTime;

			if (!currentDay) {
				animationFrameId = requestAnimationFrame(animate);
				return;
			}

			const targetMs = nsWeatherData.ms;
			const targetDayStart = getDayStart(targetMs);

			// If day changed, teleport display to same time-of-day on new day
			if (targetDayStart !== lastTargetDayStart) {
				const currentTimeOfDay = getTimeOfDay(displayMs);
				displayMs = targetDayStart + currentTimeOfDay;
				lastTargetDayStart = targetDayStart;
			}

			const diff = targetMs - displayMs;
			const absDiff = Math.abs(diff);

			// If close enough, snap
			if (absDiff < SNAP_THRESHOLD) {
				displayMs = targetMs;
				animationFrameId = requestAnimationFrame(animate);
				return;
			}

			const direction = Math.sign(diff);

			// Determine if we should go fast or normal
			// Fast (skip) if: multiple transitions AND not in final transition yet
			const numTransitions = countTransitions(
				displayMs,
				targetMs,
				currentDay.sunrise,
				currentDay.sunset,
			);
			const inFinal = isInFinalTransition(
				displayMs,
				targetMs,
				currentDay.sunrise,
				currentDay.sunset,
			);
			const skipIntermediate = numTransitions > 1 && !inFinal;

			// Calculate time step based on delta time (frame-rate independent)
			let timeStep: number;
			if (skipIntermediate) {
				// Skip intermediate transitions - use max step, but stop at final transition edge
				timeStep = MAX_TIME_STEP_PER_SEC * deltaTime;

				// Don't skip into the final transition
				const edge = getFinalTransitionEdge(
					displayMs,
					targetMs,
					currentDay.sunrise,
					currentDay.sunset,
				);
				if (edge !== null) {
					const distToEdge = Math.abs(edge - displayMs);
					if (distToEdge < timeStep) {
						timeStep = distToEdge;
					}
				}
			} else {
				// Calculate color change rate at current position
				const sampleStep = 60000; // 1 minute sample
				const sampleMs = displayMs + direction * sampleStep;

				const currentColors = getSkyColors(displayMs, currentDay.sunrise, currentDay.sunset);
				const sampleColors = getSkyColors(sampleMs, currentDay.sunrise, currentDay.sunset);

				// Calculate max color delta across all 3 stops
				const maxDelta = colorsDelta(currentColors, sampleColors);

				// Target color delta for this frame = per-second rate * delta time
				const targetDelta = TARGET_COLOR_DELTA_PER_SECOND * deltaTime;

				if (maxDelta < 0.0001) {
					// Colors barely changing (midday/midnight), use max step
					timeStep = MAX_TIME_STEP_PER_SEC * deltaTime;
				} else {
					timeStep = (targetDelta / maxDelta) * sampleStep;
				}
			}

			// Clamp time step (scaled by deltaTime for frame-rate independence)
			const minStep = MIN_TIME_STEP_PER_SEC * deltaTime;
			const maxStep = MAX_TIME_STEP_PER_SEC * deltaTime;
			timeStep = Math.max(minStep, Math.min(maxStep, timeStep));

			// Don't overshoot target
			if (timeStep > absDiff) {
				timeStep = absDiff;
			}

			// Step toward target
			displayMs = displayMs + direction * timeStep;

			animationFrameId = requestAnimationFrame(animate);
		}

		animationFrameId = requestAnimationFrame(animate);

		return () => {
			if (animationFrameId) {
				cancelAnimationFrame(animationFrameId);
				animationFrameId = null;
			}
		};
	});

	// Detect iOS for gradient workaround (CSS @supports doesn't work for JS-generated styles)
	const isIOS = browser && /iPad|iPhone|iPod/.test(navigator.userAgent);

	// Build gradients from animated displayColors
	// Palettes are [light, mid, dark]
	// iOS: horizontal gradient (90deg) eliminates seam between sticky header and content
	// Others: diagonal gradient (45deg) - light bottom-left to dark top-right
	const skyGradient = $derived(
		isIOS
			? `linear-gradient(90deg, ${displayColors[0]} 0%, ${displayColors[1]} 50%, ${displayColors[2]} 100%)`
			: `linear-gradient(45deg, ${displayColors[0]} 0%, ${displayColors[1]} 50%, ${displayColors[2]} 100%)`,
	);

	// Text color based on middle color for contrast
	const textColor = $derived(contrastTextColor(displayColors[1]));

	// Text shadow is opposite of text color
	const textShadowColor = $derived(contrastTextColor(displayColors[1], true));

	// Calculate temp range based on visible hourly plot days only
	const visibleTempStats = $derived.by(() => {
		const visibleDays = (nsWeatherData.daily || []).filter(
			(day) => day.fromToday > -2 && day.fromToday < forecastDaysVisible,
		);
		if (visibleDays.length === 0) {
			return nsWeatherData.temperatureStats;
		}
		const minTemp = Math.min(...visibleDays.map((d) => d.temperatureMin));
		const maxTemp = Math.max(...visibleDays.map((d) => d.temperatureMax));
		return {
			minTemperatureOnly: minTemp,
			maxTemperature: maxTemp,
		};
	});

	function toggleUnits(node: HTMLElement, options: { temperature: boolean | string }) {
		function handleClick() {
			emit('weatherdata_requestedToggleUnits', options);
		}

		const abortController = new AbortController();
		const { signal } = abortController;

		node.addEventListener('click', handleClick, { signal });

		return {
			destroy() {
				abortController.abort();
			},
		};
	}

	// Save temperature unit to localStorage when it changes (after initial load)
	$effect(() => {
		// Read units to track changes
		const unit = nsWeatherData.units.temperature;
		if (browser && prefsLoaded) {
			localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify({ temperature: unit }));
		}
	});

	onDestroy(() => {
		clearEvents();
	});

	// Detect wide layout using matchMedia (separate breakpoints for collapsed vs expanded)
	const WIDE_COLLAPSED_BREAKPOINT = 480; // px - 3 columns
	const WIDE_EXPANDED_BREAKPOINT = 700; // px - 4 columns
	onMount(() => {
		// Load saved preferences from localStorage
		try {
			const savedPlotVisibility = localStorage.getItem(STORAGE_KEY_PLOT_VISIBILITY);
			if (savedPlotVisibility) {
				const parsed = JSON.parse(savedPlotVisibility);
				Object.assign(plotVisibility, parsed);
			}

			const savedUnits = localStorage.getItem(STORAGE_KEY_UNITS);
			if (savedUnits) {
				const parsed = JSON.parse(savedUnits);
				if (parsed.temperature) {
					emit('weatherdata_requestedToggleUnits', { temperature: parsed.temperature });
				}
			}
		} catch (e) {
			console.warn('Failed to load preferences from localStorage:', e);
		}

		// Enable saving preferences after loading
		prefsLoaded = true;

		// Scroll map partially out of view on initial load (1/3 of 280px map height hidden)
		// Use setTimeout to ensure content is fully rendered
		setTimeout(() => {
			document.documentElement.scrollTop = 93;
			document.body.scrollTop = 93; // Fallback for Safari
		}, 0);

		const mqCollapsed = window.matchMedia(`(min-width: ${WIDE_COLLAPSED_BREAKPOINT}px)`);
		const mqExpanded = window.matchMedia(`(min-width: ${WIDE_EXPANDED_BREAKPOINT}px)`);

		isWideCollapsed = mqCollapsed.matches;
		isWideExpanded = mqExpanded.matches;

		const handlerCollapsed = (e: MediaQueryListEvent) => {
			isWideCollapsed = e.matches;
		};
		const handlerExpanded = (e: MediaQueryListEvent) => {
			isWideExpanded = e.matches;
		};

		mqCollapsed.addEventListener('change', handlerCollapsed);
		mqExpanded.addEventListener('change', handlerExpanded);

		return () => {
			mqCollapsed.removeEventListener('change', handlerCollapsed);
			mqExpanded.removeEventListener('change', handlerExpanded);
		};
	});
</script>

<div class="map-row container">
	<div class="map">
		<RadarMapLibre {nsWeatherData} />
	</div>
</div>

<div class="container sticky-info" style:--sky-gradient={skyGradient} style:color={textColor}>
	<div class="name">
		{nsWeatherData.name}
		<span class="accuracy"
			>({humanDistance(nsWeatherData.coords?.accuracy) || nsWeatherData.source})</span
		>
	</div>
	<div class="current">
		<div class="condition">
			<span>{wmoCode(nsWeatherData.displayWeatherCode).description}</span>
		</div>

		<img
			class="icon"
			src={getWeatherIcon(
				nsWeatherData.displayWeatherCode ?? 0,
				iconSetStore.value,
				nsWeatherData.displayIsDay,
			)}
			alt=""
		/>

		<div class="time">
			<div>{nsWeatherData.tzFormat(nsWeatherData.ms, 'ddd MMM D')}</div>
			<div>
				{nsWeatherData.tzFormat(nsWeatherData.ms, 'hh:mma')}
				<span class="timezone">{nsWeatherData.timezoneAbbreviation}</span>
			</div>
		</div>
	</div>

	{#snippet checkbox(config: CheckboxConfig)}
		<div>
			<label>
				{#if config.key === 'temp'}
					<input
						name="temperature"
						type="checkbox"
						checked={config.checked}
						onchange={(e) => handleCheckboxChange(config.bindKey!, e)}
					/>
				{:else if config.bindKey}
					<input
						type="checkbox"
						name={config.key === 'showAll'
							? 'showAll'
							: config.key === 'tempRange'
								? 'tempRange'
								: undefined}
						style="--color: {config.color}"
						checked={config.checked}
						onchange={(e) => handleCheckboxChange(config.bindKey!, e)}
					/>
				{:else}
					<input type="checkbox" checked={config.checked} style="--color: {config.color}" />
				{/if}
				{#if config.label && !config.getValueEnd}
					{config.label}
				{/if}
			</label>
			{#if config.getValue() && !config.getValue().includes('undefined')}
				{#if config.toggleUnits}
					<span use:toggleUnits={{ temperature: true }}>
						{config.getValue()}
					</span>
					{#if config.getValueEnd && config.getValueEnd() && !config
							.getValueEnd()
							.includes('undefined')}
						to
						<span use:toggleUnits={{ temperature: true }}>
							{config.getValueEnd()}
						</span>
					{/if}
				{:else}
					<span>{config.getValue()}</span>
				{/if}
			{/if}
		</div>
	{/snippet}

	<div
		class="other-measurements"
		class:collapsed={!showMoreOptions}
		class:expanded={showMoreOptions}
	>
		{#each currentOrder as key (key)}
			{@render checkbox(checkboxConfigs[key])}
		{/each}
	</div>
</div>

<div class="container main-content">
	<div class="scroll">
		<div class="sky-gradient-bg" style:--sky-gradient={skyGradient}>
			<DailyTiles
				{nsWeatherData}
				{forecastDaysVisible}
				{skyGradient}
				{textColor}
				{textShadowColor}
				{maxForecastDays}
				{groupIcons}
				onMore={() => (forecastDaysVisible = Math.min(forecastDaysVisible + 2, maxForecastDays))}
				onAll={() => (forecastDaysVisible = maxForecastDays)}
				onReset={() => (forecastDaysVisible = 3)}
			/>
		</div>

		<div class="timeline-grid">
			<div class="hourly-row">
				<div
					class="temp-gradient-bar"
					style:--color-high={nsWeatherData.daily?.[2]
						? temperatureToColor(
								nsWeatherData.daily[2].temperatureMax,
								visibleTempStats.minTemperatureOnly,
								visibleTempStats.maxTemperature,
							)
						: '#ccc'}
					style:--color-low={nsWeatherData.daily?.[2]
						? temperatureToColor(
								nsWeatherData.daily[2].temperatureMin,
								visibleTempStats.minTemperatureOnly,
								visibleTempStats.maxTemperature,
							)
						: '#ccc'}
				>
					<button
						class="icon-toggle"
						onclick={() => (groupIcons = !groupIcons)}
						title={`${wmoCode(hourly24WmoCode ?? undefined).description} (click to ${groupIcons ? 'ungroup' : 'group'} icons)`}
					>
						{#if hourly24WmoCode != null}
							<img
								class="icon small"
								src={getWeatherIcon(hourly24WmoCode, iconSetStore.value, currentIsDay)}
								alt=""
							/>
						{/if}
					</button>
				</div>
				<div class="day-label">
					<div class="day today">24hrs</div>
					<div class="high-low">
						<span style:color={TEMP_COLOR_HOT} use:toggleUnits={{ temperature: true }}>
							{nsWeatherData.format('daily[2].temperatureMax', false)}
						</span>
						<span style:color={TEMP_COLOR_COLD} use:toggleUnits={{ temperature: true }}>
							{nsWeatherData.format('daily[2].temperatureMin', false)}
						</span>
					</div>
				</div>
				<div class="timeline today">
					<TimeLine
						{nsWeatherData}
						{plotVisibility}
						{groupIcons}
						start={Date.now() - 2 * MS_IN_HOUR}
						trackerColor={targetColors[1]}
						tempStats={visibleTempStats}
					/>
				</div>
			</div>

			<hr class="timeline-divider" />

			{#each (nsWeatherData.daily || []).filter((day) => day.fromToday > -2 && day.fromToday < forecastDaysVisible) as day, index}
				{@const past = day.fromToday < 0}
				{@const today = day.fromToday === 0}
				{@const colorHigh = temperatureToColor(
					day.temperatureMax,
					visibleTempStats.minTemperatureOnly,
					visibleTempStats.maxTemperature,
				)}
				{@const colorLow = temperatureToColor(
					day.temperatureMin,
					visibleTempStats.minTemperatureOnly,
					visibleTempStats.maxTemperature,
				)}
				{@const dayWmoCode = getDayWmoCode(
					day.ms,
					day.weatherCode,
					nsWeatherData.hourly,
					groupIcons,
					maxBy,
				)}
				<div class={['day-row', { past }]} transition:slide={{ duration: 1000 }}>
					<div
						class={['temp-gradient-bar', { today }]}
						style:--color-high={colorHigh}
						style:--color-low={colorLow}
					>
						<button
							class="icon-toggle"
							onclick={() => (groupIcons = !groupIcons)}
							title={`${wmoCode(dayWmoCode).description} (click to ${groupIcons ? 'ungroup' : 'group'} icons)`}
						>
							<img
								class="icon small"
								src={getWeatherIcon(dayWmoCode, iconSetStore.value, true)}
								alt=""
							/>
						</button>
					</div>
					<div class="day-label">
						<div class={['day', { today }]}>
							{day.compactDate}
						</div>
						<div class="high-low">
							<span style:color={TEMP_COLOR_HOT} use:toggleUnits={{ temperature: true }}
								>{formatTemp(day.temperatureMax, nsWeatherData.units.temperature)}</span
							><span style:color={TEMP_COLOR_COLD} use:toggleUnits={{ temperature: true }}
								>{formatTemp(day.temperatureMin, nsWeatherData.units.temperature)}</span
							>
						</div>
					</div>
					<div class={['timeline', { today }]}>
						<TimeLine
							{nsWeatherData}
							{plotVisibility}
							{groupIcons}
							start={day.ms}
							xAxis={day.compactDate == 'Today'}
							ghostTracker={true}
							{past}
							trackerColor={targetColors[1]}
							tempStats={visibleTempStats}
						/>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<footer>
		<div class="footer-content">
			<div class="footer-column">
				<h3>Useful Info</h3>
				<ul>
					<li><a href="wmo-codes">WMO Codes</a></li>
					<li><a href="aqi">AQI Levels</a></li>
				</ul>
			</div>
			<div class="footer-column">
				<h3>Data powered by</h3>
				<ul>
					<li><a href="https://open-meteo.com/">Open-Meteo</a></li>
					<li><a href="https://openweathermap.org/">OpenWeather</a></li>
					<li><a href="https://www.rainviewer.com/api.html">RainViewer</a></li>
				</ul>
			</div>
			<div class="footer-column">
				<h3>About</h3>
				<ul>
					<li><a href="https://blog.leftium.com/2025/05/weathersense.html">Blog Post</a></li>
					<li>
						<a href="https://github.com/Leftium/weather-sense"
							><svg
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="currentColor"
								style="vertical-align: text-bottom; margin-right: 4px;"
								><path
									d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
								></path></svg
							>Leftium/weather-sense</a
						>
					</li>
					<li>
						<a href="https://leftium.com"
							><svg
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="currentColor"
								style="vertical-align: text-bottom; margin-right: 4px;"
								><path
									d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 0 0-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 0 1-.597-.933A9.268 9.268 0 0 1 4.09 12H2.255a7.024 7.024 0 0 0 3.072 2.472zM3.82 11a13.652 13.652 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0 0 13.745 12H11.91a9.27 9.27 0 0 1-.64 1.539 6.688 6.688 0 0 1-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 0 1-.312 2.5zm2.802-3.5a6.959 6.959 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 0 0-3.072-2.472c.218.284.418.598.597.933zM10.855 4a7.966 7.966 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4h2.355z"
								></path></svg
							>Leftium.com</a
						>
					</li>
				</ul>
			</div>
		</div>
		{#if dev}
			<div class="debug">
				<h3>Debug</h3>
				<div class="debug-item">
					<span class="debug-label">nsWeatherData.ms</span>
					<span>{nsWeatherData.ms} ({nsWeatherData.tzFormat(nsWeatherData.ms)})</span>
				</div>
				<details>
					<summary>nsWeatherData.dataAirQuality</summary>
					<pre>{jsonPretty(summarize(objectFromMap(nsWeatherData.dataAirQuality)))}</pre>
				</details>
				<details>
					<summary>nsWeatherData.current</summary>
					<pre>{jsonPretty(nsWeatherData.current)}</pre>
				</details>
				<details>
					<summary>nsWeatherData.hourly</summary>
					<pre>{jsonPretty(summarize(nsWeatherData.hourly))}</pre>
				</details>
				<details>
					<summary>nsWeatherData.daily</summary>
					<pre>{jsonPretty(summarize(nsWeatherData.daily))}</pre>
				</details>
			</div>
		{/if}
	</footer>

	<div hidden>
		<div role="group">
			<input type="text" value={`${nsWeatherData.name}`} />
			<button>Search</button>
		</div>
	</div>
</div>

<style lang="scss">
	@use '../variables' as *;

	// Size variables from open-props (only using these two)
	$size-1: 0.25rem;
	$size-3: 1rem;

	.sky-gradient-bg {
		background: var(--sky-gradient, $gradient-sky-default);
		background-attachment: fixed;
		transition: background 1s ease-out;

		// iOS Safari has severe performance issues with background-attachment: fixed
		@supports (-webkit-touch-callout: none) {
			background-attachment: scroll;
		}
	}

	.sticky-info {
		position: sticky;
		top: 0;
		z-index: 100;

		background: var(--sky-gradient, $gradient-sky-default);
		background-attachment: fixed;
		padding-block: 0.2em;
		transition:
			background 1s ease-out,
			color 1s ease-out;

		// iOS Safari has severe performance issues with background-attachment: fixed
		@supports (-webkit-touch-callout: none) {
			background-attachment: scroll;
		}

		& > div {
			padding-block: $size-1;
		}

		// Force text elements to inherit the dynamic color
		:where(span, div, label, a) {
			color: inherit;
		}
	}

	.name,
	.time,
	.current {
		margin: auto;
		font-family: Lato, sans-serif;
	}

	.timezone {
		font-size: small;
	}

	.scroll,
	.timeline-grid,
	.hourly-row {
		overflow-y: visible;
	}

	.main-content {
		overflow-x: hidden;
	}

	.current {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		line-height: 1.3;
	}

	.current > div:first-child {
		justify-self: end;
	}

	.current .icon {
		margin: 0 0.2em;
		height: 49px;
	}

	.current .time {
		width: 100%;
		text-align: left;
		margin-left: $size-1;
	}

	.current .condition {
		display: flex;
		flex-direction: column;
		margin-right: $size-1;
		justify-content: center;
		font-size: large;
		line-height: 1.2;
	}

	// Measurement checkboxes grid
	.other-measurements {
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: 1em;
		max-width: 24em;
		width: 100%;
		margin: auto;

		> div {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		input {
			margin: 0;
		}

		label {
			display: inline;
		}

		// Custom colored checkboxes with 3D bevels
		// Based on: https://moderncss.dev/pure-css-custom-checkbox-style/
		input[type='checkbox']:not([name='temperature']) {
			appearance: none;
			-webkit-appearance: none;
			background-color: $color-ghost-white;
			margin: 0;
			font: inherit;
			width: 1.2em;
			height: 1.2em;
			vertical-align: middle;
			transform: translateY(-0.1em);
			display: inline-grid;
			place-content: center;
			border: 3px solid var(--color);
			border-radius: 4px;
		}

		input[type='checkbox']:not([name='temperature'])::before {
			content: '';
			width: 1.2em;
			height: 1.2em;
			border-radius: inherit;
			transform: scale(0);
			transition: 200ms transform ease-in-out;
			background: var(--color);
		}

		input[type='checkbox']:not([name='temperature']):checked::before {
			transform: scale(1);
		}

		// Temp range checkbox - split blue/red with rounded corners
		input[type='checkbox'][name='tempRange'] {
			position: relative;
			border: none;
			background:
				linear-gradient($color-ghost-white, $color-ghost-white) padding-box,
				linear-gradient(110deg, #3366ff 0%, #3366ff 40%, #ff4444 60%, #ff4444 100%) border-box;
			border: 3px solid transparent;
		}

		input[type='checkbox'][name='tempRange']::before {
			background: linear-gradient(110deg, #3366ff 0%, #3366ff 40%, #ff4444 60%, #ff4444 100%);
			transform: scale(0);
			transition: 200ms transform ease-in-out;
		}

		input[type='checkbox'][name='tempRange']:checked::before {
			transform: scale(1);
		}

		// "Show all" checkbox - subtle beveled glass style matching forecast buttons
		input[type='checkbox'][name='showAll'] {
			background: rgba(255, 255, 255, 0.3);
			backdrop-filter: blur(4px);
			border: 1px solid;
			border-color: rgba(255, 255, 255, 0.35) rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.12)
				rgba(255, 255, 255, 0.35);
			box-shadow:
				inset 1px 1px 0 rgba(255, 255, 255, 0.2),
				inset -1px -1px 0 rgba(0, 0, 0, 0.05);
		}

		input[type='checkbox'][name='showAll']::before {
			background: rgba(0, 0, 0, 0.2);
			box-shadow: inset 1px 1px 1px rgba(255, 255, 255, 0.2);
		}

		// Temperature checkbox styles in app.scss (global) to prevent Svelte stripping ::before
	}

	@media (max-width: 480px) {
		.other-measurements {
			max-width: 100%;
			padding-inline: 1em;
		}
	}

	// Wide layout: 3 columns for collapsed
	@media (min-width: 480px) {
		.other-measurements.collapsed {
			grid-template-columns: 1fr 1fr 1fr;
			max-width: 28em;
		}
	}

	// Wide layout: 4 columns for expanded
	@media (min-width: 700px) {
		.other-measurements.expanded {
			grid-template-columns: 1fr 1fr 1fr 1fr;
			max-width: 36em;
		}
	}

	// Timeline grid - parent container for hourly and daily sections
	.timeline-grid {
		overflow-x: hidden;
		display: grid;
		grid-template-columns: 8px auto auto minmax(0, 1fr);
		grid-row-gap: 0.1em;
		grid-column-gap: 0.2em;
		margin-bottom: 0.2em;
		background: $color-ghost-white;
	}

	// Temperature gradient bar - shows day's temp range relative to global range
	.temp-gradient-bar {
		grid-column: 1 / 4; // Span columns 1-3, stop before timeline
		grid-row: 1;
		margin-right: -0.2em; // Compensate for grid gap
		height: 64px; // Match TimeLine plot height (without x-axis)
		background: linear-gradient(to bottom right, var(--color-high), var(--color-low));
		border-radius: 2px 0 0 2px;
		align-self: center; // Vertically center with plot
		position: relative;
		z-index: 0; // Behind icons and labels

		.icon-toggle {
			all: unset;
			cursor: pointer;
			position: absolute;
			right: -20px; // Position icon at right edge of gradient
			top: 50%;
			transform: translateY(calc(-50% - 20px));

			&:hover .icon.small {
				filter: brightness(1.1);
			}

			&:active .icon.small {
				filter: brightness(0.9);
			}
		}

		.icon.small {
			height: 40px;
			width: 40px;
			filter: drop-shadow(0 0 10px rgba(135, 206, 235, 0.8))
				drop-shadow(0 0 16px rgba(255, 255, 255, 0.7));
		}
	}

	.hourly-row .temp-gradient-bar,
	.temp-gradient-bar.today {
		height: 104px; // Match TimeLine plot height (with x-axis)
	}

	.timeline-divider {
		grid-column: 1 / -1;
		margin: 0.5em 0;
		border: none;
		border-top: 1px solid $color-border-light;
	}

	// Hourly row (24hrs) - spans all columns, uses subgrid
	.hourly-row {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: center;
		font-family: Lato, sans-serif;
		margin-top: 0.2em;
		margin-bottom: 0.5em;

		// Match daily row structure for consistent icon positioning
		.day-label {
			display: grid;
			grid-template-columns: subgrid;
			grid-column: 2 / span 2;
			grid-row: 1;

			.day {
				grid-column: span 2;
			}

			.high-low {
				display: grid;
				grid-template-columns: subgrid;
				grid-column: span 2;

				span {
					text-align: right;
				}
			}
		}

		.timeline {
			grid-column: 4;
			grid-row: 1;
		}

		div.day {
			margin: 0 0.1em;
			text-align: right;
		}
	}

	// Map row - edge-to-edge, no padding
	.map-row {
		overflow: hidden;
		padding-inline: 0;
	}

	// Daily rows - span all columns, use subgrid
	.day-row {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		position: relative;
		align-items: center;

		div.day {
			margin: 0 0.1em;
			text-align: right;
		}

		// Daily section uses subgrid for aligned temps
		.day-label {
			display: grid;
			grid-template-columns: subgrid;
			grid-column: 2 / span 2;
			grid-row: 1;

			.day {
				grid-column: span 2;
			}

			.high-low {
				display: grid;
				grid-template-columns: subgrid;
				grid-column: span 2;

				span {
					text-align: right;
				}
			}
		}

		.timeline {
			grid-column: 4;
			grid-row: 1;
		}
	}

	.day.today {
		font-weight: bold;
	}

	// Day label styles with text outline
	.day-label {
		overflow: visible;
		z-index: 1; // Above temp-gradient-bar

		.day {
			position: relative;
			z-index: 1;
			color: #3d2d2d;
			text-shadow:
				0 0 2px #f8f8ff,
				0 0 4px #f8f8ff,
				0 0 6px #f8f8ff,
				0 0 8px #f8f8ff,
				0 0 12px #f8f8ff,
				0 0 16px #f8f8ff,
				0 0 24px #f8f8ff,
				0 0 32px #f8f8ff;
		}

		.high-low {
			font-size: 13px;
			font-weight: bold;

			span {
				text-shadow:
					0 0 2px #f8f8ff,
					0 0 4px #f8f8ff,
					0 0 6px #f8f8ff,
					0 0 8px #f8f8ff;
			}
		}
	}

	.timeline {
		width: 100%;
		min-width: 0; // Allow grid item to shrink below content size
		height: calc(64px + $size-3);

		&.today {
			height: calc(104px + $size-3);
		}
	}

	.name {
		font-weight: bold;
		text-align: center;
	}

	.accuracy {
		font-size: small;
		opacity: 60%;
	}

	.map-row .map {
		height: 280px;
		width: 100%;

		:global(main) {
			width: 100%;
		}
	}

	.main-content {
		display: grid;
		padding-inline: 0;

		// Mobile: timeline plots extend edge-to-edge (override .container padding)
		@include mobile-only {
			padding-right: 0;
		}
	}

	.scroll {
		width: 100%;
		overflow: auto;
		position: relative;
	}

	// Footer
	footer {
		background: $color-ghost-white-dark;
		border-top: 1px solid $color-border-light;
		padding: 0.75em 1em;
		margin-top: 1em;
	}

	.footer-content {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5em;
		max-width: 40em;
		margin: 0 auto;
	}

	.footer-column h3 {
		font-size: 0.9em;
		font-weight: 600;
		margin-top: 0;
		margin-bottom: 0.5em;
		color: $color-text-primary;
	}

	.footer-column ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.footer-column li {
		margin-bottom: 0.3em;
		padding-left: 0;
		list-style: none;
	}

	.footer-column li::before,
	.footer-column li::marker {
		content: none;
		display: none;
	}

	.footer-column a {
		color: $color-text-secondary;
		text-decoration: none;
		font-size: 0.85em;
	}

	.footer-column a:hover {
		color: $color-link-hover;
		text-decoration: underline;
	}

	@media (max-width: 480px) {
		.footer-content {
			grid-template-columns: 1fr;
			gap: 1em;
		}

		.footer-column {
			display: flex;
			flex-direction: column;
			align-items: center;
		}

		.footer-column ul {
			text-align: left;
		}
	}

	// Debug section (dev only)
	.debug {
		margin-top: 1.5em;
		padding-top: 1em;
		border-top: 1px solid $color-border-light;

		h3 {
			font-size: 0.9em;
			font-weight: 600;
			margin-bottom: 0.5em;
			color: $color-text-primary;
		}

		.debug-item {
			font-size: 0.8em;
			margin-bottom: 0.25em;
		}

		.debug-label {
			font-family: monospace;
			color: $color-text-secondary;
			margin-right: 0.5em;
		}

		details {
			margin-bottom: 0.25em;
		}

		summary {
			cursor: pointer;
			font-size: 0.8em;
			font-family: monospace;
			color: $color-text-secondary;
		}

		pre {
			font-size: 0.75em;
			margin: 0.5em 0 0.5em 1em;
			white-space: pre-wrap;
			word-break: break-all;
			overflow-x: auto;
		}
	}

	// Hide sticky info in landscape mobile
	@media (max-height: 500px) and (orientation: landscape) {
		.sticky-info {
			display: none;
		}
	}

	// Hide sticky info when any element is fullscreen
	:global(body:has(:fullscreen)) .sticky-info,
	:global(body:has(:-webkit-full-screen)) .sticky-info {
		display: none;
	}
</style>
