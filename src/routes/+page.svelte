<script lang="ts">
	import type { WeatherDataEvents } from '$lib/weather';

	import TimeLine from './TimeLine.svelte';
	import MinutelyPrecipPlot from './MinutelyPrecipPlot.svelte';

	import DailyTiles from './DailyTiles.svelte';

	import {
		MS_IN_HOUR,
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
		getSkyColorsFullPalette,
		contrastTextColor,
		temperatureToColor,
		DAY_START_HOUR,
		mixColors,
	} from '$lib/util.js';
	import {
		createSkyAnimator,
		getInitialSkyColors,
		DAY_COLORS,
		type DayInfo,
	} from '$lib/skyAnimation';
	import type { WmoCodeInfo } from '$lib/util.js';
	import { iconSetStore } from '$lib/iconSet.svelte';
	import {
		calmModeStore,
		describeTemp,
		describePrecipAmount,
		describePrecipChance,
		describeHumidity,
		describeAqi,
		numberToWord,
		dayOfMonthToOrdinal,
		calmCompactDate,
	} from '$lib/calm.svelte';
	import RadarMapLibre from './RadarMapLibre.svelte';
	import {
		getDisplayBundleFromStore as getDisplayBundle,
		formatTemp,
		getTemperatureStats,
		getMinutelyPrecipAt,
		getWeightedAvgTemp,
		getPlotHighTemp,
		getPlotLowTemp,
		type TemperatureStats,
		FORECAST_DAYS,
		weatherData,
		initWeatherShell,
		weatherStore,
	} from '$lib/weather';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	import { clearEvents, getEmitter } from '$lib/emitter.js';
	import { browser, dev } from '$app/environment';
	import { page } from '$app/stores';
	import { onDestroy, onMount, untrack } from 'svelte';

	const STORAGE_KEY_PLOT_VISIBILITY = 'weather-sense:plotVisibility';
	const STORAGE_KEY_UNITS = 'weather-sense:units';

	import { slide } from 'svelte/transition';
	import { maxBy } from 'lodash-es';
	import dayjs from 'dayjs';
	import utc from 'dayjs/plugin/utc';
	import timezonePlugin from 'dayjs/plugin/timezone';

	dayjs.extend(utc);
	dayjs.extend(timezonePlugin);

	const { emit, on } = getEmitter<WeatherDataEvents>(import.meta);

	// Initialize weather shell (I/O orchestrator)
	const shell = initWeatherShell(weatherData);
	onDestroy(() => shell.destroy());

	// Display bundle - all formatted display values derived from store state
	const display = $derived(getDisplayBundle(weatherStore));

	let { data } = $props();

	// Show minutely plot when ?m param is present in URL (reactive to navigation)
	const showMinutely = $derived($page.url.searchParams.has('m'));

	// Demo mode - freezes sky gradient at ideal twilight for screenshots
	// ?demo or ?demo=sunset → sunset twilight, ?demo=sunrise → sunrise twilight
	const demoModeParam = $derived($page.url.searchParams.get('demo'));
	const isDemoMode = $derived(demoModeParam !== null);
	const demoType = $derived<'sunrise' | 'sunset'>(
		demoModeParam === 'sunrise' ? 'sunrise' : 'sunset',
	);

	// Calm mode - hides numbers and units for a more peaceful display
	// Entered via ?calm URL param, exited on any click/touch
	const calmModeFromUrl = $derived($page.url.searchParams.has('calm'));

	// Track if user has manually exited calm mode (to prevent URL from re-enabling)
	let calmModeUserExited = $state(false);

	// Sync URL param to store on mount and URL changes
	$effect(() => {
		if (calmModeFromUrl && !calmModeStore.value && !calmModeUserExited) {
			calmModeStore.value = true;
		}
	});

	// Reference for convenience in template
	const calmMode = $derived(calmModeStore.value);

	// Exit calm mode and mark as user-exited
	function exitCalmMode() {
		calmModeUserExited = true;
		calmModeStore.exit();
	}

	// URL with ?m param added (preserves other params like location)
	// Also preserves calm mode if active
	const minutelyUrl = $derived.by(() => {
		const params = new SvelteURLSearchParams($page.url.search);
		params.set('m', '');
		if (calmMode && !calmModeUserExited) {
			params.set('calm', '');
		} else {
			params.delete('calm');
		}
		return `${$page.url.pathname}?${params.toString()}`;
	});

	// URL with ?calm param added (for Calm mode link)
	const calmUrl = $derived.by(() => {
		const params = new SvelteURLSearchParams($page.url.search);
		params.set('calm', '');
		return `${$page.url.pathname}?${params.toString()}`;
	});

	let forecastDaysVisible = $state(3);
	let showMoreOptions = $state(false);
	let groupIcons = $state(true);

	// Actual max forecast days based on available data (daily getter removes incomplete last day)
	// Cap at FORECAST_DAYS - 1 since we fetch an extra day for 4am-4am boundaries
	const maxForecastDays = $derived(
		Math.min(
			FORECAST_DAYS - 1,
			Math.max(0, ...(weatherStore.daily?.map((d) => d.fromToday + 1) ?? [FORECAST_DAYS - 1])),
		),
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
		JSON.stringify(plotVisibility);
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
			toggleUnits: !calmMode,
			getValue: () => (calmMode ? describeTemp(display.raw.temperature) : display.temperature),
		},
		tempRange: {
			key: 'tempRange',
			color: 'gray',
			checked: plotVisibility.tempRange,
			bindKey: 'tempRange',
			toggleUnits: !calmMode,
			getValue: () =>
				calmMode
					? describeTemp(weatherStore.daily?.[2]?.temperatureMin)
					: formatTemp(
							weatherStore.daily?.[2]?.temperatureMin,
							weatherStore.units.temperature,
							false,
						),
			getValueEnd: () =>
				calmMode
					? describeTemp(weatherStore.daily?.[2]?.temperatureMax)
					: formatTemp(
							weatherStore.daily?.[2]?.temperatureMax,
							weatherStore.units.temperature,
							false,
						),
		},
		dewPoint: {
			key: 'dewPoint',
			label: 'Dew Pt:',
			color: colors.dewPoint,
			checked: plotVisibility.dewPoint,
			bindKey: 'dewPoint',
			toggleUnits: !calmMode,
			getValue: () =>
				calmMode
					? describeTemp(display.raw.dewPoint)
					: formatTemp(display.raw.dewPoint, weatherStore.units.temperature, false),
		},
		humidity: {
			key: 'humidity',
			label: calmMode ? 'Humid:' : 'Humidity:',
			color: colors.humidity,
			checked: plotVisibility.humidity,
			bindKey: 'humidity',
			getValue: () => (calmMode ? describeHumidity(display.raw.humidity) : display.humidity),
		},
		precip: {
			key: 'precip',
			label: 'Precip:',
			color: colors.precipitation,
			checked: plotVisibility.precip,
			bindKey: 'precip',
			getValue: () => {
				const isMinutelyScrub = weatherStore.trackedElement?.closest('.minutely-precip-plot');
				if (isMinutelyScrub) {
					const minutely = getMinutelyPrecipAt(weatherStore.dataMinutely, weatherStore.ms);
					if (minutely !== null) {
						return calmMode ? describePrecipAmount(minutely) : `${minutely.toFixed(1)}mm`;
					}
				}
				// Get hourly value directly (snap to hour boundary)
				const hourMs = startOf(weatherStore.ms, 'hour', weatherStore.timezone);
				const hourly = weatherStore.dataForecast.get(hourMs);
				const precip = hourly?.precipitation ?? null;
				return calmMode ? describePrecipAmount(precip) : `${precip?.toFixed(1) ?? '?'}mm`;
			},
		},
		chance: {
			key: 'chance',
			label: 'Chance:',
			color: colors.precipitationProbability,
			checked: plotVisibility.chance,
			bindKey: 'chance',
			getValue: () =>
				calmMode ? describePrecipChance(display.raw.precipChance) : display.precipChance,
		},
		euAqi: {
			key: 'euAqi',
			label: calmMode ? 'AQI:' : 'EU AQI:',
			color: aqiEuropeToLabel(display.raw.aqiEurope).color,
			checked: plotVisibility.euAqi,
			bindKey: 'euAqi',
			getValue: () => (calmMode ? describeAqi(display.raw.aqiEurope) : display.aqiEurope),
		},
		usAqi: {
			key: 'usAqi',
			label: 'US AQI:',
			color: aqiUsToLabel(display.raw.aqiUs).color,
			checked: plotVisibility.usAqi,
			bindKey: 'usAqi',
			getValue: () => (calmMode ? describeAqi(display.raw.aqiUs) : display.aqiUs),
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
			countryCode: data.countryCode ?? undefined,
			coords: data.coords,
			fetchMinutely: showMinutely,
		});
	});

	// Find the day that contains a given ms timestamp
	function findDayForMs(ms: number) {
		const day = weatherStore.daily?.find((d, i, arr) => {
			const nextDay = arr[i + 1];
			if (nextDay) {
				return ms >= d.ms && ms < nextDay.ms;
			}
			// Last day - check if within 24 hours
			return ms >= d.ms && ms < d.ms + 24 * 60 * 60 * 1000;
		});
		// Fallback to today
		return day || weatherStore.daily?.find((d) => d.fromToday === 0);
	}

	// Calculate ideal demo time for peak twilight colors
	// ~35 min offset gives rich colors (deeper into civil twilight)
	const demoMs = $derived.by(() => {
		if (!isDemoMode) return null;
		const today = weatherStore.daily?.find((d) => d.fromToday === 0);
		if (!today) return null;
		const TWILIGHT_OFFSET = 35 * 60 * 1000; // 35 minutes
		return demoType === 'sunrise'
			? today.sunrise - TWILIGHT_OFFSET
			: today.sunset + TWILIGHT_OFFSET;
	});

	// Get representative WMO code for the 24-hour hourly plot
	// When groupIcons=true: groups codes like TimeLine does, then picks most severe group representative
	// When groupIcons=false: picks most severe code overall (highest wsCode value)
	const hourly24WmoCode = $derived.by(() => {
		// Use same boundaries as TimeLine: startOf(hour) and exclude the 25th fencepost hour
		const hourlyStart = +dayjs
			.tz(Date.now() - 2 * MS_IN_HOUR, weatherStore.timezone)
			.startOf('hour');
		const hourlyEnd = hourlyStart + 24 * MS_IN_HOUR; // Exclusive: don't include 25th hour

		// Filter hourly data to the 24-hour window (exclusive end to skip fencepost hour)
		const hourlyInRange = weatherStore.hourly?.filter(
			(h) => h.ms >= hourlyStart && h.ms < hourlyEnd,
		);

		if (!hourlyInRange?.length) return null;

		if (!groupIcons) {
			// Ungrouped: find the most severe weather code overall
			const mostSevere = maxBy(
				hourlyInRange,
				(h) => (wmoCode(h.weatherCode) as WmoCodeInfo).wsCode ?? 0,
			);
			return mostSevere?.weatherCode ?? null;
		}

		return getGroupedWmoCode(hourlyInRange, maxBy);
	});

	// Get isDay for the current real time (where past overlay ends on 24hr plot)
	const currentIsDay = $derived.by(() => {
		const now = Date.now();
		const currentHourMs = startOf(now, 'hour', weatherStore.timezone);
		const hourData = weatherStore.dataForecast.get(currentHourMs);
		return hourData?.isDay ?? true;
	});

	// Dynamic sky gradient with smooth animated color transitions
	// Uses SkyAnimator for eased transitions on enter/leave/switch and time-based scrubbing

	const initialTimezone = untrack(() => data.timezone); // Capture initial value (intentionally non-reactive)
	const DEFAULT_COLORS = getInitialSkyColors(initialTimezone) ?? DAY_COLORS;

	// DOM refs for direct gradient updates (bypasses Svelte reactivity)
	let stickyInfoEl: HTMLDivElement;
	let skyGradientBgEl: HTMLDivElement;

	// Track dimensions for seamless vertical gradient calculation
	let stickyHeight = $state(200); // will be bound to element
	let tilesHeight = $state(400); // will be bound to element

	// Throttled display ms - triggers Svelte reactivity, updated at 15fps
	let throttledDisplayMs = $state(Date.now());

	// Create sky animator with callbacks
	const skyAnimator = createSkyAnimator({
		findDayForMs: (ms: number): DayInfo | undefined => {
			const day = findDayForMs(ms);
			return day ? { ms: day.ms, sunrise: day.sunrise, sunset: day.sunset } : undefined;
		},
		getTrackingState: () => {
			// Demo mode: freeze at ideal twilight time
			if (demoMs !== null) {
				// Create a fake element to indicate "tracking" so animator uses our time
				return { targetMs: demoMs, trackedElement: document.body };
			}
			return {
				targetMs: weatherStore.rawMs,
				trackedElement: weatherStore.trackedElement,
			};
		},
		getHeights: () => ({ stickyHeight, tilesHeight }),
		getElements: () => ({ stickyEl: stickyInfoEl, tilesEl: skyGradientBgEl }),
		defaultColors: DEFAULT_COLORS,
	});

	// Run sky animation on every frame tick (15fps from shell's RAF loop)
	on('weatherdata_frameTick', () => {
		const state = skyAnimator.tick();
		// Update reactive state when not tracking (for CSS variables)
		if (!weatherStore.trackedElement) {
			throttledDisplayMs = state.displayMs;
		}
	});

	// Compute colors from throttled displayMs (only recalculates at 15fps)
	const throttledColors = $derived.by(() => {
		const day = findDayForMs(throttledDisplayMs);
		if (!day) return DEFAULT_COLORS;
		return getSkyColorsFullPalette(throttledDisplayMs, day.sunrise, day.sunset);
	});

	// Detect iOS for gradient workaround (CSS @supports doesn't work for JS-generated styles)
	const isIOS = browser && /iPad|iPhone|iPod/.test(navigator.userAgent);

	// Build gradients from animated throttledColors
	// Palettes are [light, mid, dark]
	// iOS: horizontal gradient (90deg) eliminates seam between sticky header and content
	// Others: diagonal gradient (45deg) - light bottom-left to dark top-right
	// PERF: Use throttledColors (15fps) to reduce GPU usage
	const skyGradient = $derived(
		isIOS
			? `linear-gradient(90deg, ${throttledColors[2]} 0%, ${throttledColors[1]} 50%, ${throttledColors[0]} 100%)`
			: `linear-gradient(45deg, ${throttledColors[2]} 0%, ${throttledColors[1]} 50%, ${throttledColors[0]} 100%)`,
	);

	// Calculate the boundary color for seamless vertical gradient
	// Gradient goes: color0 (top) -> color1 (middle) -> color2 (bottom)
	const totalHeight = $derived(stickyHeight + tilesHeight);
	const stickyRatio = $derived(stickyHeight / totalHeight);

	// Boundary color for seamless vertical gradients (using throttled colors)
	const throttledBoundaryColor = $derived.by(() => {
		if (stickyRatio <= 0.5) {
			const t = stickyRatio / 0.5;
			return mixColors(throttledColors[0], throttledColors[1], t);
		} else {
			const t = (stickyRatio - 0.5) / 0.5;
			return mixColors(throttledColors[1], throttledColors[2], t);
		}
	});

	// Seamless vertical gradients for sticky and tiles
	// PERF: Use throttledColors (15fps) to reduce GPU usage
	const skyGradientStickyVertical = $derived(
		`linear-gradient(180deg, ${throttledColors[0]} 0%, ${throttledBoundaryColor} 100%)`,
	);
	const skyGradientTilesVertical = $derived(
		`linear-gradient(180deg, ${throttledBoundaryColor} 0%, ${throttledColors[2]} 100%)`,
	);

	// Horizontal gradient for blending (full opacity)
	const skyGradientHorizontal = $derived(
		`linear-gradient(90deg, ${throttledColors[2]} 0%, ${throttledColors[1]} 50%, ${throttledColors[0]} 100%)`,
	);

	// Body sky gradient is now updated via updateSkyGradientDOM() for consistency
	// with other gradient updates (uses displayMs directly, not throttledDisplayMs)

	// Text color based on middle color for contrast
	const textColor = $derived(contrastTextColor(throttledColors[1]));

	// Text shadow is opposite of text color
	const textShadowColor = $derived(contrastTextColor(throttledColors[1], true));

	// Calculate temp range based on visible hourly plot days only
	const visibleTempStats = $derived.by((): TemperatureStats | null => {
		const visibleDays = (weatherStore.daily || []).filter(
			(day) => day.fromToday > -2 && day.fromToday < forecastDaysVisible,
		);
		if (visibleDays.length === 0) {
			return getTemperatureStats(weatherStore.dataForecast);
		}
		const minTemp = Math.min(...visibleDays.map((d) => d.temperatureMin));
		const maxTemp = Math.max(...visibleDays.map((d) => d.temperatureMax));
		return {
			minTemperature: minTemp, // For visible days, use same as minTemperatureOnly
			maxTemperature: maxTemp,
			temperatureRange: maxTemp - minTemp,
			minTemperatureOnly: minTemp,
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
		const unit = weatherStore.units.temperature;
		if (browser && prefsLoaded) {
			localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify({ temperature: unit }));
		}
	});

	onDestroy(() => {
		clearEvents();
		skyAnimator.destroy();
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

	// Calm mode exit handler - use svelte:window for reliable event handling
	// Don't exit if user is scrubbing (trackedElement is set during scrub)
	function handleCalmModeExit(event: MouseEvent) {
		// Skip if scrubbing is active
		if (weatherStore.trackedElement) return;

		if (calmMode) {
			exitCalmMode();
		}
	}
</script>

<svelte:head>
	<title>{weatherStore.name ? `${weatherStore.name} - WeatherSense` : 'WeatherSense'}</title>
</svelte:head>

<svelte:window onclick={handleCalmModeExit} />

<div class="map-row container">
	<div class="map">
		<RadarMapLibre nsWeatherData={weatherStore} {calmMode} {demoMs} />
	</div>
	{#if showMinutely}
		<MinutelyPrecipPlot nsWeatherData={weatherStore} {demoMs} />
	{/if}
</div>

<div
	class="container sticky-info use-vertical"
	bind:this={stickyInfoEl}
	bind:offsetHeight={stickyHeight}
	style:--sky-gradient={skyGradient}
	style:--sky-gradient-horizontal={skyGradientHorizontal}
	style:--sky-gradient-vertical={skyGradientStickyVertical}
	style:color={textColor}
>
	<div class="name">
		{weatherStore.name}
		<span class="accuracy"
			>({humanDistance(weatherStore.coords?.accuracy) || weatherStore.source})</span
		>
	</div>
	<div class="current">
		<div class="condition">
			<span>{wmoCode(display.weatherCode ?? undefined).description}</span>
		</div>

		<img
			class="icon"
			src={getWeatherIcon(display.weatherCode ?? 0, iconSetStore.value, display.isDay)}
			alt=""
		/>

		<div class="time">
			{#if calmMode}
				{@const dayOfMonth = parseInt(weatherStore.tzFormat(weatherStore.ms, 'D'), 10)}
				<div>{weatherStore.tzFormat(weatherStore.ms, 'ddd')}</div>
				<div>{weatherStore.tzFormat(weatherStore.ms, 'MMM')} {dayOfMonthToOrdinal(dayOfMonth)}</div>
			{:else}
				<div>{weatherStore.tzFormat(weatherStore.ms, 'ddd MMM D')}</div>
				<div>
					{weatherStore.tzFormat(weatherStore.ms, 'hh:mma')}
					<span class="timezone">{weatherStore.timezoneAbbreviation}</span>
				</div>
			{/if}
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
		<div
			class="sky-gradient-bg use-vertical"
			bind:this={skyGradientBgEl}
			bind:offsetHeight={tilesHeight}
			style:--sky-gradient={skyGradient}
			style:--sky-gradient-horizontal={skyGradientHorizontal}
			style:--sky-gradient-vertical={skyGradientTilesVertical}
			style:--btn-text-color={textColor}
			style:--btn-text-shadow={textShadowColor}
		>
			<DailyTiles
				nsWeatherData={weatherStore}
				{forecastDaysVisible}
				{maxForecastDays}
				{groupIcons}
				{calmMode}
				onMore={() => (forecastDaysVisible = Math.min(forecastDaysVisible + 2, maxForecastDays))}
				onAll={() => (forecastDaysVisible = maxForecastDays)}
				onReset={() => (forecastDaysVisible = 3)}
			/>
		</div>

		<div class="timeline-grid">
			<div class="hourly-row">
				<div class="day-label">
					<div class="day today">{calmMode ? 'Twenty-four Hour Outlook' : '24hrs'}</div>
					{#if !calmMode}
						<div class="temps">
							<span class="avg" use:toggleUnits={{ temperature: true }}>
								{formatTemp(
									groupIcons
										? getWeightedAvgTemp(weatherStore.daily?.[2]?.ms ?? 0, weatherStore.hourly)
										: weatherStore.daily?.[2]?.temperatureMean,
									weatherStore.units.temperature,
									false,
								)}
							</span>
							<span
								class="high"
								style:color={TEMP_COLOR_HOT}
								use:toggleUnits={{ temperature: true }}
							>
								{formatTemp(
									groupIcons
										? getPlotHighTemp(weatherStore.daily?.[2]?.ms ?? 0, weatherStore.hourly)
										: weatherStore.daily?.[2]?.temperatureMax,
									weatherStore.units.temperature,
									false,
								)}
							</span>
							<span
								class="low"
								style:color={TEMP_COLOR_COLD}
								use:toggleUnits={{ temperature: true }}
							>
								{formatTemp(
									groupIcons
										? getPlotLowTemp(weatherStore.daily?.[2]?.ms ?? 0, weatherStore.hourly)
										: weatherStore.daily?.[2]?.temperatureMin,
									weatherStore.units.temperature,
									false,
								)}
							</span>
						</div>
					{/if}
				</div>
				<div
					class="temp-gradient-bar"
					style:--color-high={weatherStore.daily?.[2] && visibleTempStats
						? temperatureToColor(
								weatherStore.daily[2].temperatureMax,
								visibleTempStats.minTemperatureOnly,
								visibleTempStats.maxTemperature,
							)
						: '#ccc'}
					style:--color-low={weatherStore.daily?.[2] && visibleTempStats
						? temperatureToColor(
								weatherStore.daily[2].temperatureMin,
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
				<div class="timeline today">
					<TimeLine
						nsWeatherData={weatherStore}
						{plotVisibility}
						{groupIcons}
						start={Date.now() - 2 * MS_IN_HOUR}
						tempStats={visibleTempStats}
						debugTrackerMs={undefined}
					/>
				</div>
			</div>

			<hr class="timeline-divider" />

			{#each (weatherStore.daily || []).filter((day) => day.fromToday > -2 && day.fromToday < forecastDaysVisible) as day (day.ms)}
				{@const past = day.fromToday < 0}
				{@const today = day.fromToday === 0}
				{@const colorHigh = temperatureToColor(
					day.temperatureMax,
					visibleTempStats?.minTemperatureOnly ?? 0,
					visibleTempStats?.maxTemperature ?? 100,
				)}
				{@const colorLow = temperatureToColor(
					day.temperatureMin,
					visibleTempStats?.minTemperatureOnly ?? 0,
					visibleTempStats?.maxTemperature ?? 100,
				)}
				{@const dayWmoCode = getDayWmoCode(
					day.ms,
					day.weatherCode,
					weatherStore.hourly,
					groupIcons,
					maxBy,
				)}
				{@const avgTemp = groupIcons
					? getWeightedAvgTemp(day.ms, weatherStore.hourly)
					: day.temperatureMean}
				{@const highTemp = groupIcons
					? getPlotHighTemp(day.ms, weatherStore.hourly)
					: day.temperatureMax}
				{@const lowTemp = groupIcons
					? getPlotLowTemp(day.ms, weatherStore.hourly)
					: day.temperatureMin}
				<div class={['day-row', { past }]} transition:slide={{ duration: 1000 }}>
					<div class={['day-label', { past }]}>
						<div class={['day', { today }]}>
							{calmMode ? calmCompactDate(day.compactDate) : day.compactDate}
						</div>
						{#if !calmMode}
							<div class="temps">
								<span class="avg" use:toggleUnits={{ temperature: true }}>
									{formatTemp(avgTemp, weatherStore.units.temperature, false)}
								</span>
								<span
									class="high"
									style:color={TEMP_COLOR_HOT}
									use:toggleUnits={{ temperature: true }}
									>{formatTemp(highTemp, weatherStore.units.temperature, false)}</span
								><span
									class="low"
									style:color={TEMP_COLOR_COLD}
									use:toggleUnits={{ temperature: true }}
									>{formatTemp(lowTemp, weatherStore.units.temperature, false)}</span
								>
							</div>
						{/if}
					</div>
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
					<div class={['timeline', { today }]}>
						<TimeLine
							nsWeatherData={weatherStore}
							{plotVisibility}
							{groupIcons}
							start={day.ms + DAY_START_HOUR * MS_IN_HOUR}
							xAxis={day.compactDate == 'Today'}
							ghostTracker
							tempStats={visibleTempStats}
							debugTrackerMs={undefined}
						/>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<footer>
		<div class="footer-content">
			<div class="footer-column">
				<h3>Useful Links</h3>
				<ul>
					<li><a href={resolve('/wmo-codes')}>WMO Codes</a></li>
					<li><a href={resolve('/aqi')}>AQI Levels</a></li>
					<li>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- dynamic URL from $page -->
						<a
							href={minutelyUrl}
							onclick={(e) => {
								e.preventDefault();
								emit('weatherdata_requestedFetchMinutely');
								goto(minutelyUrl).then(() => {
									document.documentElement.scrollTop = 0;
									document.body.scrollTop = 0; // Safari fallback
								});
							}}>{calmMode ? 'Minutely Forecast' : '60min Forecast'}</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</li>
					<li>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- dynamic URL from $page -->
						<a
							href={calmUrl}
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation(); // Prevent window click handler from exiting calm mode
								calmModeUserExited = false;
								calmModeStore.value = true;
								goto(calmUrl);
							}}>Calm Mode</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</li>
				</ul>
			</div>
			<div class="footer-column">
				<h3>Data powered by</h3>
				<ul>
					<li><a href="https://open-meteo.com/">Open-Meteo</a></li>
					<li>
						<a
							href="https://old.openweathermap.org/find?q={encodeURIComponent(
								weatherStore.name ?? '',
							)}{weatherStore.countryCode ? ',' + weatherStore.countryCode : ''}">OpenWeather</a
						>
					</li>
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
							>weather-sense</a
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
					<span class="debug-label">weatherStore.ms</span>
					<span>{weatherStore.ms} ({weatherStore.tzFormat(weatherStore.ms)})</span>
				</div>
				<div class="debug-item">
					<span class="debug-label">OpenWeather</span>
					<span>{weatherStore.owOneCall ? 'Loaded' : 'Not available'}</span>
					{#if weatherStore.owOneCall}
						<span class="debug-detail">
							(minutely: {weatherStore.owOneCall.minutely?.length ?? 0}, hourly: {weatherStore
								.owOneCall.hourly?.length ?? 0}, daily: {weatherStore.owOneCall.daily?.length ?? 0},
							alerts: {weatherStore.owOneCall.alerts?.length ?? 0})
						</span>
					{/if}
				</div>
				<div class="debug-item">
					<span class="debug-label">dataMinutely</span>
					<span>{weatherStore.dataMinutely.length} points</span>
				</div>
				<details>
					<summary>weatherStore.dataAirQuality</summary>
					<pre>{jsonPretty(summarize(objectFromMap(weatherStore.dataAirQuality)))}</pre>
				</details>
				<details>
					<summary>weatherStore.current</summary>
					<pre>{jsonPretty(weatherStore.current)}</pre>
				</details>
				<details>
					<summary>weatherStore.hourly</summary>
					<pre>{jsonPretty(summarize(weatherStore.hourly))}</pre>
				</details>
				<details>
					<summary>weatherStore.daily</summary>
					<pre>{jsonPretty(summarize(weatherStore.daily))}</pre>
				</details>
				{#if weatherStore.owOneCall}
					<details>
						<summary>weatherStore.owOneCall.minutely (60-min precipitation)</summary>
						<pre>{jsonPretty(summarize(weatherStore.owOneCall.minutely))}</pre>
					</details>
					<details>
						<summary>weatherStore.owOneCall.current</summary>
						<pre>{jsonPretty(weatherStore.owOneCall.current)}</pre>
					</details>
					<details>
						<summary>weatherStore.owOneCall.hourly</summary>
						<pre>{jsonPretty(summarize(weatherStore.owOneCall.hourly))}</pre>
					</details>
					<details>
						<summary>weatherStore.owOneCall.daily</summary>
						<pre>{jsonPretty(summarize(weatherStore.owOneCall.daily))}</pre>
					</details>
					{#if weatherStore.owOneCall.alerts?.length}
						<details>
							<summary>weatherStore.owOneCall.alerts</summary>
							<pre>{jsonPretty(weatherStore.owOneCall.alerts)}</pre>
						</details>
					{/if}
				{/if}
			</div>
		{/if}
	</footer>

	<div hidden>
		<div role="group">
			<input type="text" value={`${weatherStore.name}`} />
			<button>Search</button>
		</div>
	</div>
</div>

<style lang="scss">
	@use '../variables' as *;

	// Size variables from open-props (only using these two)
	$size-1: 0.25rem;
	$size-3: 1rem;

	// Note: :global(body) with min-height: 100vh was removed - it breaks iOS Safari sticky positioning

	.sky-gradient-bg {
		background: var(--sky-gradient-horizontal), var(--sky-gradient-vertical);
		background-blend-mode: overlay;
		transition: background 1s ease-out;
	}

	.sticky-info {
		position: sticky;
		top: 0;
		z-index: 100;

		background: var(--sky-gradient-horizontal), var(--sky-gradient-vertical);
		background-blend-mode: overlay;
		padding-block: 0.2em;
		transition:
			background 1s ease-out,
			color 1s ease-out;

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
	// Uses grid with named columns so subgrid can align temps across rows
	.timeline-grid {
		overflow-x: hidden;
		display: grid;
		grid-template-columns: 64px auto auto auto 1fr;
		row-gap: 1.5em;
		margin-bottom: 0.2em;
		background: $color-ghost-white;
	}

	// Temperature gradient bar - shows day's temp range as square/rect with centered icon
	.temp-gradient-bar {
		grid-column: 1;
		grid-row: 2;
		width: 64px;
		height: 64px; // Match TimeLine plot height (without x-axis)
		background: linear-gradient(
			to bottom right,
			var(--color-high) 0%,
			var(--color-high) 20%,
			var(--color-low) 80%,
			var(--color-low) 100%
		);
		display: flex;
		align-items: center;
		justify-content: center;

		.icon-toggle {
			all: unset;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;

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
			filter: drop-shadow(0 0 3px rgba(100, 149, 237, 0.6))
				drop-shadow(0 0 6px rgba(100, 149, 237, 0.4)) drop-shadow(0 0 12px rgba(100, 149, 237, 0.3));
		}
	}

	.hourly-row .temp-gradient-bar,
	.temp-gradient-bar.today {
		height: 104px; // Match TimeLine plot height (with x-axis) - same width (64px)
	}

	.timeline-divider {
		grid-column: 1 / -1; // Span all columns
		margin: 0.5em 0;
		border: none;
		border-top: 1px solid $color-border-light;
	}

	// Shared row styles for hourly and daily rows
	// Uses subgrid to inherit column alignment from .timeline-grid
	.hourly-row,
	.day-row {
		display: grid;
		grid-column: 1 / -1; // Span all parent columns
		grid-template-columns: subgrid;
		grid-template-rows: auto auto; // Row 1: label, Row 2: plot
		font-family: Lato, sans-serif;
	}

	.hourly-row {
		margin-top: 0.2em;
		margin-bottom: 0.5em;
	}

	.day-row {
		position: relative;
	}

	// Map row - edge-to-edge, no padding
	.map-row {
		overflow: hidden;
		padding-inline: 0;
	}

	// Day label styles - now on ghost-white background
	// Uses subgrid to align temps across all rows
	.day-label {
		grid-column: 1 / -1; // Span all columns
		grid-row: 1;
		align-self: end; // Align to bottom, close to plot
		display: grid;
		grid-template-columns: subgrid;
		align-items: baseline;
		overflow: visible;
		z-index: 1;
		line-height: 1.2;

		.day {
			grid-column: 1;
			text-align: left;
			padding-left: 0.3em;
			box-sizing: border-box;
			color: $color-text-primary;
			font-weight: 600;
			white-space: nowrap;

			&.today {
				font-weight: 900;
			}
		}

		.temps {
			grid-column: 2 / 5; // Span avg, high, low columns
			display: grid;
			grid-template-columns: subgrid;
			font-size: 13px;
			font-weight: bold;

			.avg,
			.high,
			.low {
				padding-right: 0.4em;
				text-align: right;
			}

			.avg {
				color: $color-text-secondary;
			}
		}

		&.past {
			opacity: 0.6;
		}
	}

	.timeline {
		grid-column: 2 / -1; // Span from column 2 to end (over temp columns + plot)
		grid-row: 2;
		min-width: 0; // Allow grid item to shrink below content size
		height: 64px; // Plot height without x-axis

		&.today {
			height: calc(104px + $size-3); // Extra height for x-axis labels
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
		background: $color-ghost-white; // Prevent body gradient showing through gaps

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
