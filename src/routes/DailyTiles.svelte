<script lang="ts">
	import type { NsWeatherData, WeatherDataEvents } from '$lib/ns-weather-data.svelte';
	import {
		colors,
		wmoCode,
		getDayWmoCode,
		formatTemp,
		MS_IN_DAY,
		TEMP_COLOR_HOT,
		TEMP_COLOR_COLD,
	} from '$lib/util';
	import { trackable, isTempLabel } from '$lib/trackable';
	import { getEmitter } from '$lib/emitter';
	import { clamp, minBy, maxBy } from 'lodash-es';
	import { fade } from 'svelte/transition';

	let {
		nsWeatherData,
		forecastDaysVisible = 5,
		maxForecastDays = 16,
		skyGradient = 'linear-gradient(135deg, #eee 0%, #a8d8f0 50%, #6bb3e0 100%)',
		tileGradient = 'linear-gradient(160deg, #6bb3e0 0%, #a8d8f0 50%, #eee 100%)',
		textColor = '#333',
		textShadowColor = 'rgba(248, 248, 255, 0.8)',
		pastTileOpacity = 0.25,
		groupIcons = true,
		onMore,
		onAll,
		onReset,
	}: {
		nsWeatherData: NsWeatherData;
		forecastDaysVisible?: number;
		maxForecastDays?: number;
		skyGradient?: string;
		tileGradient?: string;
		textColor?: string;
		textShadowColor?: string;
		pastTileOpacity?: number;
		groupIcons?: boolean;
		onMore?: () => void;
		onAll?: () => void;
		onReset?: () => void;
	} = $props();

	const canExpand = $derived(forecastDaysVisible < maxForecastDays);
	const canReset = $derived(forecastDaysVisible > 3);

	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	function toggleUnits() {
		emit('weatherdata_requestedToggleUnits', { temperature: true });
	}

	// Calculate max tiles that can fit based on viewport width
	// Container max-width is 960px, no padding on DailyTiles
	function getContainerWidth() {
		if (typeof window === 'undefined') return 350;
		const vw = window.innerWidth;
		// Fixed max-width of 960px, full viewport width below that
		return Math.min(vw, 960);
	}

	function calcMaxTiles() {
		if (typeof window === 'undefined') return 5;
		const containerWidth = getContainerWidth();
		return Math.max(3, Math.floor(containerWidth / 70));
	}

	// Default to 3 for SSR, update on mount
	let maxTiles = $state(3);

	$effect(() => {
		maxTiles = calcMaxTiles();

		function handleResize() {
			maxTiles = calcMaxTiles();
		}

		window.addEventListener('resize', handleResize);
		window.addEventListener('orientationchange', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('orientationchange', handleResize);
		};
	});

	// Effective max tiles capped by what we'd actually show
	const effectiveMaxTiles = $derived(Math.min(maxTiles, forecastDaysVisible + 3));

	// Filter days based on how many tiles can fit and forecastDaysVisible
	// Prioritize: yesterday (-1), today (0), then future days, then older past days
	const days = $derived.by(() => {
		const allDays = nsWeatherData.daily || [];
		// Start from -1 (yesterday) through forecastDaysVisible future days
		const primary = allDays.filter(
			(day) => day.fromToday >= -1 && day.fromToday < forecastDaysVisible,
		);

		if (primary.length >= effectiveMaxTiles) {
			// Need to trim - keep yesterday and today, trim future days
			return primary.slice(0, effectiveMaxTiles);
		}

		// Have room for more - add older past days
		const remaining = effectiveMaxTiles - primary.length;
		const older = allDays
			.filter((day) => day.fromToday < -1)
			.sort((a, b) => b.fromToday - a.fromToday) // most recent first (-2 before -3)
			.slice(0, remaining);

		return [...older, ...primary];
	});

	const isLoading = $derived(days.length === 0);
	const placeholderCount = $derived(Math.min(5, maxTiles));

	// Calculate temperature range for y-scale
	const tempStats = $derived.by(() => {
		if (!days.length) return { min: 0, max: 100, range: 100 };

		const minTemp = minBy(days, 'temperatureMin')?.temperatureMin ?? 0;
		const maxTemp = maxBy(days, 'temperatureMax')?.temperatureMax ?? 100;
		const padding = (maxTemp - minTemp) * 0.15; // 15% padding

		return {
			min: minTemp - padding,
			max: maxTemp + padding,
			range: maxTemp + padding - (minTemp - padding),
		};
	});

	// Fixed precipitation scale for daily totals
	const PRECIP_LINEAR_MAX = 16; // mm/day - linear scale up to this value (~80th percentile of rainy days)

	// SVG dimensions
	const TILE_WIDTH = 70;
	const TILE_HEIGHT = 114;

	const TEMP_AREA_TOP = 50;
	const TEMP_AREA_BOTTOM = TILE_HEIGHT - 30; // Leave room for min temp labels and precip
	const TEMP_AREA_HEIGHT = TEMP_AREA_BOTTOM - TEMP_AREA_TOP;
	const PRECIP_BAR_BOTTOM = TILE_HEIGHT - 2; // Near bottom of tile
	const PRECIP_BAR_MAX_HEIGHT = PRECIP_BAR_BOTTOM - TEMP_AREA_TOP;
	const PRECIP_BAR_WIDTH = 26;
	const PRECIP_LABEL_Y = TILE_HEIGHT - 6; // Above bottom edge

	// Convert temperature to Y coordinate
	function tempToY(temp: number): number {
		const normalized = (temp - tempStats.min) / tempStats.range;
		return TEMP_AREA_BOTTOM - normalized * TEMP_AREA_HEIGHT;
	}

	// Generate SVG path for temperature line
	function generateTempPath(key: 'temperatureMax' | 'temperatureMin'): string {
		if (!days.length) return '';

		return days
			.map((day, i) => {
				const x = (i + 0.5) * TILE_WIDTH;
				const y = tempToY(day[key]);
				return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
			})
			.join(' ');
	}

	// Get precipitation bar height (fixed scale, linear up to PRECIP_LINEAR_MAX)
	function precipHeight(precip: number): number {
		const linearHeight =
			(Math.min(precip, PRECIP_LINEAR_MAX) / PRECIP_LINEAR_MAX) * PRECIP_BAR_MAX_HEIGHT;
		// Add overflow for values above linear max (logarithmic)
		if (precip > PRECIP_LINEAR_MAX) {
			const overflow =
				PRECIP_BAR_MAX_HEIGHT * 0.2 * (1 - Math.exp(-(precip - PRECIP_LINEAR_MAX) / 20));
			return linearHeight + overflow;
		}
		return linearHeight;
	}

	// Ref for trackable container
	let containerDiv: HTMLDivElement;

	// Tracker state
	let trackerX: number | null = $state(null);
	let trackerColor: string = $state('#FFEE00');

	// Get start of day ms for a given day
	function getDayStartMs(dayIndex: number): number {
		const day = days[dayIndex];
		if (!day) return 0;
		return day.ms;
	}

	// Convert ms to day index and X position within tiles
	function msToPosition(ms: number): { dayIndex: number; x: number } | null {
		if (!days.length) return null;

		for (let i = 0; i < days.length; i++) {
			const dayStart = getDayStartMs(i);
			const dayEnd = dayStart + MS_IN_DAY;

			if (ms >= dayStart && ms < dayEnd) {
				// Calculate X position within tile
				const fractionOfDay = (ms - dayStart) / MS_IN_DAY;
				const x = (i + fractionOfDay) * TILE_WIDTH;
				return { dayIndex: i, x };
			}
		}
		return null;
	}

	// Convert X position to timestamp
	function xToMs(clientX: number): number {
		const rect = containerDiv.getBoundingClientRect();
		const tilesWidth = days.length * TILE_WIDTH;
		const tilesLeft = rect.left + (rect.width - tilesWidth) / 2;
		const x = clientX - tilesLeft;

		// Clamp to valid range
		const clampedX = clamp(x, 0, tilesWidth - 1);
		const dayIndex = Math.floor(clampedX / TILE_WIDTH);
		const fractionOfDay = (clampedX % TILE_WIDTH) / TILE_WIDTH;

		const day = days[clamp(dayIndex, 0, days.length - 1)];
		if (!day) return Date.now();

		return day.ms + fractionOfDay * MS_IN_DAY;
	}

	// Update tracker display based on nsWeatherData.ms
	function updateTracker(ms: number) {
		const position = msToPosition(ms);

		if (position) {
			trackerX = position.x;
			trackerColor = 'yellow';
		} else {
			// Ghost tracker: show current time of day in first visible day
			trackerX = null;
		}
	}

	// React to nsWeatherData.ms changes
	$effect(() => {
		updateTracker(nsWeatherData.ms);
	});

	// Trackable options for this component
	const trackableOptions = {
		getMs: (e: PointerEvent | MouseEvent) => xToMs(e.clientX),
		getTrackedElement: () => nsWeatherData.trackedElement,
		onTimeChange: (ms: number) => emit('weatherdata_requestedSetTime', { ms }),
		onTrackingStart: (node: HTMLElement) => emit('weatherdata_requestedTrackingStart', { node }),
		onTrackingEnd: () => emit('weatherdata_requestedTrackingEnd'),
		shouldIgnoreTarget: isTempLabel,
	};
</script>

<div
	class="daily-tiles"
	style:--tile-count={isLoading ? placeholderCount : days.length}
	style:--sky-gradient={skyGradient}
	style:--past-tile-opacity={pastTileOpacity}
	bind:this={containerDiv}
>
	<!-- Wrapper to constrain trackable area to just the tiles -->
	<div class="tiles-track-area" use:trackable={trackableOptions}>
		<div class="tiles">
			{#each isLoading ? Array(placeholderCount) : days as day, i}
				{@const past = !isLoading && day.fromToday < 0}
				{@const today = !isLoading && day.fromToday === 0}
				{@const tileWmoCode = !isLoading
					? getDayWmoCode(day.ms, day.weatherCode, nsWeatherData.hourly, groupIcons, maxBy)
					: 0}
				<div
					class="tile"
					class:past
					title={!isLoading ? wmoCode(tileWmoCode).description : ''}
					style:--tile-gradient={tileGradient}
				>
					<div class="tile-bg"></div>
					{#if !isLoading}
						<img
							class="tile-icon"
							src={wmoCode(tileWmoCode).icon}
							alt=""
							in:fade={{ duration: 300 }}
						/>
						<div class="tile-content" in:fade={{ duration: 300 }}>
							<div class="date" class:today>{day.compactDate}</div>
						</div>
					{/if}
				</div>
			{/each}

			<!-- SVG underlay for precipitation bars and temp lines/dots (behind tracker) -->
			{#if !isLoading}
				<svg
					class="precip-underlay"
					viewBox="0 0 {days.length * TILE_WIDTH} {TILE_HEIGHT}"
					preserveAspectRatio="none"
					in:fade={{ duration: 300 }}
				>
					<!-- Precipitation bars -->
					{#each days as day, i}
						{@const barHeight = precipHeight(day.precipitation)}
						{@const barX = (i + 0.5) * TILE_WIDTH - PRECIP_BAR_WIDTH / 2}
						{@const barY = PRECIP_BAR_BOTTOM - barHeight}
						{#if day.precipitation > 0}
							<rect
								x={barX}
								y={barY}
								width={PRECIP_BAR_WIDTH}
								height={barHeight}
								fill={colors.precipitation}
								opacity="0.7"
							/>
						{/if}
					{/each}

					<!-- High temperature line -->
					<path
						d={generateTempPath('temperatureMax')}
						fill="none"
						stroke={TEMP_COLOR_HOT}
						stroke-width="2"
					/>

					<!-- Low temperature line -->
					<path
						d={generateTempPath('temperatureMin')}
						fill="none"
						stroke={TEMP_COLOR_COLD}
						stroke-width="2"
					/>

					<!-- High temperature dots -->
					{#each days as day, i}
						{@const x = (i + 0.5) * TILE_WIDTH}
						{@const y = tempToY(day.temperatureMax)}
						<circle cx={x} cy={y} r="3" fill={TEMP_COLOR_HOT} />
					{/each}

					<!-- Low temperature dots -->
					{#each days as day, i}
						{@const x = (i + 0.5) * TILE_WIDTH}
						{@const y = tempToY(day.temperatureMin)}
						<circle cx={x} cy={y} r="3" fill={TEMP_COLOR_COLD} />
					{/each}
				</svg>
			{/if}

			<!-- Tracker line (in front of precip bars, behind temp lines/labels) -->
			{#if !isLoading && trackerX !== null}
				<div
					class="tracker-line"
					style:left="{trackerX}px"
					style:background-color={trackerColor}
				></div>
			{/if}

			<!-- SVG overlay for temp lines, labels, and precip labels -->
			{#if !isLoading}
				<svg
					class="overlay"
					viewBox="0 0 {days.length * TILE_WIDTH} {TILE_HEIGHT}"
					preserveAspectRatio="none"
					in:fade={{ duration: 300 }}
				>
					<!-- Ghost white glow filter for text -->
					<defs>
						<filter
							id="white-glow"
							x="-100%"
							y="-100%"
							width="300%"
							height="300%"
							filterUnits="objectBoundingBox"
						>
							<feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
							<feFlood flood-color="#f8f8ff" result="white" />
							<feComposite in="white" in2="blur" operator="in" result="glow" />
							<feMerge>
								<feMergeNode in="glow" />
								<feMergeNode in="glow" />
								<feMergeNode in="glow" />
								<feMergeNode in="glow" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>

					<!-- Precipitation labels -->
					{#each days as day, i}
						{#if day.precipitation > 0}
							<text
								x={(i + 1) * TILE_WIDTH - 4}
								y={PRECIP_LABEL_Y}
								text-anchor="end"
								font-size="10"
								font-weight="600"
								fill={TEMP_COLOR_COLD}
								filter="url(#white-glow)"
							>
								{day.precipitation.toFixed(1)}mm
							</text>
						{/if}
					{/each}

					<!-- High temperature labels -->
					{#each days as day, i}
						{@const x = (i + 0.5) * TILE_WIDTH}
						{@const y = tempToY(day.temperatureMax)}
						<text
							{x}
							y={y - 8}
							text-anchor="middle"
							font-size="11"
							font-weight="bold"
							fill={TEMP_COLOR_HOT}
							filter="url(#white-glow)"
							class="temp-label"
							role="button"
							tabindex="0"
							onclick={toggleUnits}
							onkeydown={(e) => e.key === 'Enter' && toggleUnits()}
						>
							{formatTemp(day.temperatureMax, nsWeatherData.units.temperature)}
						</text>
					{/each}

					<!-- Low temperature labels -->
					{#each days as day, i}
						{@const x = (i + 0.5) * TILE_WIDTH}
						{@const y = tempToY(day.temperatureMin)}
						<text
							{x}
							y={y + 14}
							text-anchor="middle"
							font-size="11"
							font-weight="bold"
							fill={TEMP_COLOR_COLD}
							filter="url(#white-glow)"
							class="temp-label"
							role="button"
							tabindex="0"
							onclick={toggleUnits}
							onkeydown={(e) => e.key === 'Enter' && toggleUnits()}
						>
							{formatTemp(day.temperatureMin, nsWeatherData.units.temperature)}
						</text>
					{/each}
				</svg>
			{/if}
		</div>
	</div>

	<div
		class="button-bar"
		style:--btn-text-color={textColor}
		style:--btn-text-shadow={textShadowColor}
	>
		<div class="button-group">
			<button class="day-count" onclick={() => onMore?.()} disabled={isLoading || !canExpand}>
				{forecastDaysVisible} day forecast
			</button>

			<button class="tile-btn" onclick={() => onAll?.()} disabled={isLoading || !canExpand}
				>All</button
			>
			<button class="tile-btn" onclick={() => onReset?.()} disabled={isLoading || !canReset}>
				Reset
			</button>
		</div>
	</div>
</div>

<style lang="scss">
	.daily-tiles {
		position: relative;
		z-index: 1;
		width: 100%;
		overflow: clip;
		background: transparent;
	}

	.tiles-track-area {
		width: calc(var(--tile-count) * 70px);
		margin-inline: auto;
		user-select: none;
		/* pan-y for native vertical scroll; horizontal gestures captured for scrubbing */
		touch-action: pan-y;
	}

	.tiles {
		position: relative;
		display: flex;
		overflow: visible;
	}

	.tile {
		box-sizing: border-box;
		width: 70px;
		min-width: 70px;
		flex-shrink: 0;
		height: 114px;
		display: grid;
		grid-template-areas: 'stack';
		border: 2px solid;
		border-color: rgba(255, 255, 255, 0.5) rgba(0, 0, 0, 0.15) rgba(0, 0, 0, 0.2)
			rgba(255, 255, 255, 0.5);
		box-shadow:
			inset 1px 1px 0 rgba(255, 255, 255, 0.3),
			inset -1px -1px 0 rgba(0, 0, 0, 0.1),
			0 2px 4px rgba(0, 0, 0, 0.15);
		overflow: hidden;

		> * {
			grid-area: stack;
		}

		&.past > * {
			opacity: var(--past-tile-opacity, 0.7);
		}
	}

	.tile-bg {
		width: 100%;
		height: 100%;
		background: var(--tile-gradient, linear-gradient(160deg, #6bb3e0 0%, #a8d8f0 50%, #eee 100%));
		transition: background 1s ease-out;
	}

	.tile-icon {
		width: 94px;
		height: 94px;
		margin: -38px 0 0 -32px;
		pointer-events: none;
	}

	.tile-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 4px;
		z-index: 6; // Above tracker-line (5)
	}

	.button-bar {
		display: flex;
		justify-content: center;
		margin-top: 3px;
		padding-bottom: 3px;

		.button-group {
			display: flex;
			align-items: stretch;
			background: rgba(255, 255, 255, 0.3);
			backdrop-filter: blur(4px);
			border: 1px solid rgba(0, 0, 0, 0.1);
			border-radius: 4px;
			overflow: hidden;
		}

		.day-count {
			padding: 0.3em 0.6em;
			margin: 0;
			font-size: 11px;
			font-weight: 500;
			color: color-mix(in srgb, var(--btn-text-color, #333) 70%, transparent);
			text-shadow: 0 1px 1px color-mix(in srgb, var(--btn-text-shadow, #f8f8ff) 60%, transparent);
			background: transparent;
			border: none;
			border-right: 1px solid rgba(0, 0, 0, 0.08);
			border-radius: 0;
			transition:
				background 0.15s,
				color 1s ease-out,
				text-shadow 1s ease-out;

			&:hover:not(:disabled) {
				background: rgba(255, 255, 255, 0.3);
			}

			&:disabled {
				opacity: 0.4;
				cursor: default;
			}
		}

		button.tile-btn {
			padding: 0.3em 0.6em;
			margin: 0;
			font-size: 11px;
			font-weight: 500;
			color: color-mix(in srgb, var(--btn-text-color, #333) 70%, transparent);
			text-shadow: 0 1px 1px color-mix(in srgb, var(--btn-text-shadow, #f8f8ff) 60%, transparent);
			background: transparent;
			border: none;
			border-right: 1px solid rgba(0, 0, 0, 0.08);
			border-radius: 0;
			transition:
				background 0.15s,
				color 1s ease-out,
				text-shadow 1s ease-out;

			&:last-child {
				border-right: none;
			}

			&:hover:not(:disabled) {
				background: rgba(255, 255, 255, 0.3);
			}

			&:active:not(:disabled) {
				background: rgba(0, 0, 0, 0.05);
			}

			&:disabled {
				opacity: 0.4;
				cursor: default;
			}
		}
	}

	.date {
		font-size: 14px;
		font-weight: 600;
		margin-bottom: 0;
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

		&.today {
			font-weight: 900;
		}
	}

	.precip-underlay {
		position: absolute;
		top: 0;
		left: 0;
		width: calc(var(--tile-count) * 70px);
		height: 114px;
		pointer-events: none;
		z-index: 4; // Behind tracker line
	}

	.tracker-line {
		position: absolute;
		top: 2px;
		bottom: 2px;
		width: 2px;
		transform: translateX(-1px); // Center the line on the position
		pointer-events: none;
		z-index: 5; // In front of precip bars, behind temp lines/labels
	}

	.overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: calc(var(--tile-count) * 70px);
		height: 114px;
		pointer-events: none;
		z-index: 10; // Above tile content so temp labels can be clicked

		:global(.temp-label) {
			pointer-events: auto;
			cursor: pointer;
			outline: none;
		}
	}
</style>
