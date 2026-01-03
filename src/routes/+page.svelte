<script lang="ts">
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import TimeLine from './TimeLine.svelte';

	import DailyTiles from './DailyTiles.svelte';

	import {
		MS_IN_HOUR,
		SOLARIZED_BLUE,
		SOLARIZED_RED,
		jsonPretty,
		summarize,
		humanDistance,
		objectFromMap,
		wmoCode,
		colors,
		aqiUsToLabel,
		aqiEuropeToLabel,
		getSkyColors,
		colorsDelta,
		contrastTextColor,
	} from '$lib/util.js';
	import RadarMapLibre from './RadarMapLibre.svelte';

	import { clearEvents, getEmitter } from '$lib/emitter.js';
	import { browser, dev } from '$app/environment';
	import { onDestroy, onMount, untrack } from 'svelte';

	const STORAGE_KEY_PLOT_VISIBILITY = 'weather-sense:plotVisibility';
	const STORAGE_KEY_UNITS = 'weather-sense:units';

	import { FORECAST_DAYS, makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	import { slide } from 'svelte/transition';

	const nsWeatherData = makeNsWeatherData();
	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	let { data } = $props();

	let forecastDaysVisible = $state(3);
	let showMoreOptions = $state(false);
	let isWideCollapsed = $state(false); // 480px+ : 3 columns for collapsed
	let isWideExpanded = $state(false); // 700px+ : 4 columns for expanded

	// Controls which plots are visible on the timeline
	let plotVisibility = $state({
		temp: true,
		dewPoint: true,
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
			checked: plotVisibility.temp,
			bindKey: 'temp',
			toggleUnits: true,
			getValue: () => nsWeatherData.format('daily[2].temperatureMin', false),
			getValueEnd: () => nsWeatherData.format('daily[2].temperatureMax', false),
		},
		dewPoint: {
			key: 'dewPoint',
			label: 'Dew Point:',
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
			collapsed: ['temp', 'dewPoint', 'precip', 'chance', 'euAqi', 'showAll'],
			expanded: ['temp', 'tempRange', 'dewPoint', 'humidity', 'precip', 'chance', 'euAqi', 'usAqi'],
		},
		wide: {
			collapsed: ['temp', 'precip', 'euAqi', 'dewPoint', 'chance', 'showAll'],
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

	// Dynamic sky gradient with smooth animated transitions
	// Animates through TIME to ensure you never skip gradients (e.g., must pass through dawn)
	// Moves at constant COLOR speed for smooth visual transitions
	// If multiple transitions (dawn+dusk), speeds through early ones, slows for final one
	const TARGET_COLOR_DELTA_NORMAL = 0.008; // Normal color change per frame
	const MIN_TIME_STEP = 30000; // Minimum 30 seconds per frame
	const MAX_TIME_STEP = 3600000; // Maximum 1 hour per frame
	const MS_IN_DAY = 24 * 60 * 60 * 1000;
	const DEFAULT_COLORS = ['#f0f8ff', '#a8d8f0', '#6bb3e0']; // Day colors

	let animationFrameId: number | null = null;

	function getTimeOfDay(ms: number): number {
		const date = new Date(ms);
		return (
			date.getHours() * 3600000 +
			date.getMinutes() * 60000 +
			date.getSeconds() * 1000 +
			date.getMilliseconds()
		);
	}

	function getDayStart(ms: number): number {
		const date = new Date(ms);
		date.setHours(0, 0, 0, 0);
		return date.getTime();
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

	// Start animation loop - steps through time at constant color speed
	$effect(() => {
		function animate() {
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
			if (absDiff < MIN_TIME_STEP) {
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

			// Calculate time step
			let timeStep: number;
			if (skipIntermediate) {
				// Skip intermediate transitions - use max step, but stop at final transition edge
				timeStep = MAX_TIME_STEP;

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

				if (maxDelta < 0.0001) {
					// Colors barely changing (midday/midnight), use max step
					timeStep = MAX_TIME_STEP;
				} else {
					timeStep = (TARGET_COLOR_DELTA_NORMAL / maxDelta) * sampleStep;
				}
			}

			// Clamp time step
			timeStep = Math.max(MIN_TIME_STEP, Math.min(MAX_TIME_STEP, timeStep));

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

	// Build gradients from animated displayColors
	const skyGradient = $derived(
		`linear-gradient(-135deg, ${displayColors[0]} 0%, ${displayColors[1]} 50%, ${displayColors[2]} 100%)`,
	);

	const tileGradient = $derived(
		`linear-gradient(135deg, ${displayColors[0]} 0%, ${displayColors[1]} 50%, ${displayColors[2]} 100%)`,
	);

	// Text color based on middle color for contrast
	const textColor = $derived(contrastTextColor(displayColors[1]));

	// Text shadow is opposite of text color
	const textShadowColor = $derived(contrastTextColor(displayColors[1], true));

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

<div class="pico container sticky-info" style:--sky-gradient={skyGradient} style:color={textColor}>
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

		<img class="icon" src={wmoCode(nsWeatherData.displayWeatherCode).icon} alt="" />

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

<div class="container">
	<div class="scroll">
		<div class="sky-gradient-bg" style:--sky-gradient={skyGradient}></div>
		<DailyTiles
			{nsWeatherData}
			{forecastDaysVisible}
			{skyGradient}
			{tileGradient}
			{textColor}
			{textShadowColor}
			maxForecastDays={FORECAST_DAYS}
			onExpand={() =>
				(forecastDaysVisible =
					forecastDaysVisible === 3 ? 5 : Math.min(forecastDaysVisible * 2, FORECAST_DAYS))}
		/>

		<div class="timeline-grid">
			<div class="hourly-row pico">
				<div class="day-label">
					<div class="day today">
						<img
							class="icon small"
							src={wmoCode(nsWeatherData.displayWeatherCode).icon}
							title={wmoCode(nsWeatherData.displayWeatherCode).description}
							alt=""
						/>
						24hrs
					</div>
					<div class="high-low">
						<span style:color={SOLARIZED_RED} use:toggleUnits={{ temperature: true }}>
							{nsWeatherData.format('daily[2].temperatureMax', false)}
						</span>
						<span style:color={SOLARIZED_BLUE} use:toggleUnits={{ temperature: true }}>
							{nsWeatherData.format('daily[2].temperatureMin', false)}
						</span>
					</div>
				</div>
				<div class="timeline today">
					<TimeLine {nsWeatherData} {plotVisibility} start={Date.now() - 2 * MS_IN_HOUR} />
				</div>
			</div>

			<div class="map-row">
				<div class="map">
					<RadarMapLibre {nsWeatherData} />
				</div>
			</div>

			{#each (nsWeatherData.daily || []).filter((day) => day.fromToday > -2 && day.fromToday < forecastDaysVisible) as day, index}
				{@const past = day.fromToday < 0}
				{@const today = day.fromToday === 0}
				<div class={['day-row', 'pico', { past }]} transition:slide={{ duration: 1000 }}>
					<div class="day-label">
						<div class={['day', { today }]}>
							<img
								class="icon small"
								src={wmoCode(day.weatherCode).icon}
								title={wmoCode(day.weatherCode).description}
								alt=""
							/>
							{day.compactDate}
						</div>
						<div class="high-low">
							<span style:color={SOLARIZED_RED} use:toggleUnits={{ temperature: true }}
								>{nsWeatherData.format(`daily[${index}].temperatureMax`, false)}</span
							><span style:color={SOLARIZED_BLUE} use:toggleUnits={{ temperature: true }}
								>{nsWeatherData.format(`daily[${index}].temperatureMin`, false)}</span
							>
						</div>
					</div>
					<div class={['timeline', { today }]}>
						<TimeLine
							{nsWeatherData}
							{plotVisibility}
							start={day.ms}
							xAxis={day.compactDate == 'Today'}
							ghostTracker={true}
							{past}
						/>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<footer class="pico">
		<div class="footer-content">
			<div class="footer-column">
				<h3>Useful Info</h3>
				<ul>
					<li><a href="wmo-codes">WMO Codes</a></li>
					<li><a href="aqi">AQI Levels</a></li>
				</ul>
			</div>
			<div class="footer-column">
				<h3>Data</h3>
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

	<div class="pico" hidden>
		<div role="group">
			<input type="text" value={`${nsWeatherData.name}`} />
			<button>Search</button>
		</div>
	</div>
</div>

<style lang="scss">
	@use 'open-props-scss' as *;

	.sky-gradient-bg {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 138px; // Covers daily tiles area (tiles are ~130px) plus padding below
		background: var(--sky-gradient, linear-gradient(135deg, #eee 0%, #a8d8f0 50%, #6bb3e0 100%));
		background-attachment: fixed;
		pointer-events: none;
		z-index: -1;
		transition: background 1s ease-out;
	}

	.sticky-info {
		position: sticky;
		top: 0;
		z-index: 100000;

		background: var(--sky-gradient, linear-gradient(135deg, #eee 0%, #a8d8f0 50%, #6bb3e0 100%));
		background-attachment: fixed;
		padding: 0.2em 1rem;
		transition: background 1s ease-out;

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

	.container,
	.scroll,
	.timeline-grid,
	.hourly-row {
		overflow-y: visible !important;
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

	.other-measurements {
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: 1em;

		max-width: 22em;
		width: 100%;
		margin: auto;

		input {
			margin: 0;
		}

		label {
			display: inline;
		}

		/*************************************************************************************/
		/*Based on: https://moderncss.dev/pure-css-custom-checkbox-style/ */
		input[type='checkbox']:not([name='temperature']) {
			// Override Pico's checkbox styling
			appearance: none;
			-webkit-appearance: none;
			background-color: #fff !important;
			margin: 0;

			font: inherit;
			width: 1.2em;
			height: 1.2em;

			transform: translateY(-0.06em);

			display: inline-grid;
			place-content: center;

			border: 3px solid var(--color) !important;
			border-radius: var(--pico-border-radius);
		}

		input[type='checkbox']:not([name='temperature'])::before {
			content: '' !important;
			width: 1.2em !important;
			height: 1.2em !important;
			border-radius: inherit;

			transform: scale(0) !important;
			transition: 200ms transform ease-in-out !important;

			background: var(--color) !important;
			background-image: none !important;
			box-shadow: none !important;
		}

		input[type='checkbox']:not([name='temperature']):checked::before {
			transform: scale(1) !important;
		}

		/*************************************************************************************/
		// Temperature checkbox styles are in app.scss (global) to prevent Svelte from stripping ::before
	}

	@media (width < 480px) {
		.other-measurements {
			max-width: 18em;
		}
	}

	// Wide layout: 3 columns for collapsed, 4 columns for expanded (at wider breakpoint)
	@media (width >= 480px) {
		.other-measurements.collapsed {
			grid-template-columns: 1fr 1fr 1fr;
			max-width: 28em;
		}
	}

	@media (width >= 700px) {
		.other-measurements.expanded {
			grid-template-columns: 1fr 1fr 1fr 1fr;
			max-width: 36em;
		}
	}

	// Parent grid container for hourly, map, and daily sections
	.timeline-grid {
		display: grid;
		grid-template-columns: auto auto 1fr;
		grid-row-gap: 0.1em;
		grid-column-gap: 0.2em;
		margin-bottom: 0.2em;
		background: white; // Cover the gradient below daily tiles
	}

	// Step 2: Add right padding on mobile for scroll gesture safety
	// Left side has natural gap from day labels; daily tiles need edge-to-edge
	@media (max-width: 575px) {
		.timeline-grid,
		footer {
			padding-right: 1rem;
		}
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

		.day-label {
			grid-column: span 2;
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			justify-content: center;
		}

		.timeline {
			grid-column: 3;
		}

		div.day {
			margin: 0 0.1em;
			text-align: right;
		}
	}

	// Map row - spans all columns, map goes in timeline column
	.map-row {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;

		> .map {
			grid-column: 3;
		}
	}

	// Daily rows - span all columns, use subgrid
	.day-row {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		position: relative;
		align-items: center;

		&.past::after {
			content: '';
			position: absolute;
			inset: 0;
			background: white;
			opacity: 0.5;
			pointer-events: none;
			z-index: 10;
		}

		div.day {
			margin: 0 0.1em;
			text-align: right;
		}

		// Daily section uses subgrid for aligned temps
		.day-label {
			display: grid;
			grid-template-columns: subgrid;
			grid-column: span 2;

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
	}

	.day.today {
		font-weight: bold;
	}

	// Shared .day and .high-low styles
	.day-label {
		overflow: visible;

		.day {
			position: relative;
			z-index: 1;
			text-shadow:
				-1px -1px 0 rgba(255, 255, 255, 0.8),
				1px -1px 0 rgba(255, 255, 255, 0.8),
				-1px 1px 0 rgba(255, 255, 255, 0.8),
				1px 1px 0 rgba(255, 255, 255, 0.8);

			.icon.small {
				position: absolute;
				right: -20px;
				top: 50%;
				transform: translateY(-50%);
				z-index: -1;
				height: 40px;
				width: 40px;
				filter: drop-shadow(0 0 10px rgba(135, 206, 235, 0.8));
			}
		}

		.high-low {
			font-size: smaller;
			text-shadow:
				-1px -1px 0 rgba(255, 255, 255, 0.8),
				1px -1px 0 rgba(255, 255, 255, 0.8),
				-1px 1px 0 rgba(255, 255, 255, 0.8),
				1px 1px 0 rgba(255, 255, 255, 0.8);
		}
	}

	.timeline {
		flex-grow: 1;
		height: calc(64px + $size-3);

		&.today {
			height: calc(104px + $size-3);
		}
	}

	.name {
		font-weight: bold;
	}

	.accuracy {
		font-size: small;
		opacity: 60%;
	}

	.map-row .map {
		height: 368px;
	}

	.container {
		display: grid;
	}

	.scroll {
		overflow: auto;
		position: relative;
	}

	footer {
		background: #f5f5f5;
		border-top: 1px solid #e0e0e0;
		padding: 1.5em 1em;
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
		margin-bottom: 0.5em;
		color: #333;
	}

	.footer-column ul {
		list-style: none !important;
		padding: 0 !important;
		margin: 0 !important;
	}

	.footer-column li {
		margin-bottom: 0.3em;
		padding-left: 0 !important;
		list-style: none !important;
	}

	.footer-column li::before,
	.footer-column li::marker {
		content: none !important;
		display: none !important;
	}

	.footer-column a {
		color: #666;
		text-decoration: none;
		font-size: 0.85em;
	}

	.footer-column a:hover {
		color: #268bd2;
		text-decoration: underline;
	}

	@media (max-width: 480px) {
		.footer-content {
			grid-template-columns: 1fr;
			gap: 1em;
			text-align: center;
		}
	}

	.debug {
		margin-top: 1.5em;
		padding-top: 1em;
		border-top: 1px solid #e0e0e0;

		h3 {
			font-size: 0.9em;
			font-weight: 600;
			margin-bottom: 0.5em;
			color: #333;
		}

		.debug-item {
			font-size: 0.8em;
			margin-bottom: 0.25em;
		}

		.debug-label {
			font-family: monospace;
			color: #666;
			margin-right: 0.5em;
		}

		details {
			margin-bottom: 0.25em;
		}

		summary {
			cursor: pointer;
			font-size: 0.8em;
			font-family: monospace;
			color: #666;
		}

		pre {
			font-size: 0.75em;
			margin: 0.5em 0 0.5em 1em;
			white-space: pre-wrap;
			word-break: break-all;
			overflow-x: auto;
		}
	}

	@media (max-width: 768px) {
		.map-row .map {
			height: 290px;
		}
	}

	@media (max-height: 500px) and (orientation: landscape) {
		.sticky-info {
			display: none;
		}
	}
</style>
