<script lang="ts">
	import type { NsWeatherData, WeatherDataEvents } from '$lib/ns-weather-data.svelte';
	import { colors, wmoCode, celcius, MS_IN_DAY } from '$lib/util';
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
		onExpand,
	}: {
		nsWeatherData: NsWeatherData;
		forecastDaysVisible?: number;
		maxForecastDays?: number;
		skyGradient?: string;
		tileGradient?: string;
		textColor?: string;
		textShadowColor?: string;
		onExpand?: () => void;
	} = $props();

	const canExpand = $derived(forecastDaysVisible < maxForecastDays && onExpand);

	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	function toggleUnits() {
		emit('weatherdata_requestedToggleUnits', { temperature: true });
	}

	function formatTemp(temp: number): string {
		if (nsWeatherData.units.temperature === 'C') {
			return `${celcius(temp)?.toFixed(1)}°`;
		}
		return `${Math.round(temp)}°`;
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
		const moreButtonWidth = forecastDaysVisible < maxForecastDays ? 16 : 0;
		return Math.max(3, Math.floor((containerWidth - moreButtonWidth) / 70));
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
	const PRECIP_LINEAR_MAX = 10; // mm/day - linear scale up to this value (lower = taller bars for small values)

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
	let trackerColor: string = $state('yellow');

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

	// Calculate X position for past overlay (full past days only, not partial today)
	const pastOverlayWidth = $derived.by(() => {
		// Find today's tile index
		const todayIndex = days.findIndex((day) => day.fromToday === 0);
		if (todayIndex <= 0) return 0;
		// Cover all tiles before today
		return todayIndex * TILE_WIDTH;
	});

	// Svelte action for tracking
	function trackable(node: HTMLElement) {
		let trackUntilMouseUp = false;
		let mouseIsOver = false;

		function trackToMouseX(e: PointerEvent | MouseEvent) {
			const ms = xToMs(e.clientX);
			emit('weatherdata_requestedSetTime', { ms });
		}

		function handlePointerMove(e: PointerEvent) {
			if (nsWeatherData.trackedElement === node) {
				trackToMouseX(e);
			} else if (mouseIsOver && nsWeatherData.trackedElement === null) {
				trackToMouseX(e);
				emit('weatherdata_requestedTrackingStart', { node });
			}
		}

		function handlePointerDown(e: PointerEvent) {
			// Don't start tracking if clicking on a temp label (for toggle units)
			// SVG elements use className.baseVal, HTML elements use classList
			const target = e.target as Element;
			const isTempLabel =
				target?.classList?.contains('temp-label') ||
				(target as SVGElement)?.className?.baseVal?.includes('temp-label');
			if (isTempLabel) {
				return;
			}
			trackUntilMouseUp = true;
			trackToMouseX(e);
			emit('weatherdata_requestedTrackingStart', { node });
		}

		function handlePointerUp(e: PointerEvent) {
			if (nsWeatherData.trackedElement === node) {
				trackUntilMouseUp = false;
				emit('weatherdata_requestedTrackingEnd');
			}
		}

		function handleMouseEnter(e: MouseEvent) {
			mouseIsOver = true;
			if (!nsWeatherData.trackedElement) {
				trackToMouseX(e);
				emit('weatherdata_requestedTrackingStart', { node });
			}
		}

		function handleMouseLeave(e: MouseEvent) {
			mouseIsOver = false;
			if (nsWeatherData.trackedElement === node && !trackUntilMouseUp) {
				emit('weatherdata_requestedTrackingEnd');
			}
		}

		const abortController = new AbortController();
		const { signal } = abortController;

		window.addEventListener('pointermove', handlePointerMove, { signal });
		node.addEventListener('pointerdown', handlePointerDown, { signal });
		window.addEventListener('pointerup', handlePointerUp, { signal });
		node.addEventListener('mouseenter', handleMouseEnter, { signal });
		node.addEventListener('mouseleave', handleMouseLeave, { signal });

		return {
			destroy() {
				abortController.abort();
			},
		};
	}
</script>

<div
	class="daily-tiles"
	style:--tile-count={isLoading ? placeholderCount : days.length}
	style:--has-more={canExpand ? 1 : 0}
	style:--sky-gradient={skyGradient}
	bind:this={containerDiv}
>
	<!-- Wrapper to constrain trackable area to just the tiles -->
	<div class="tiles-track-area" use:trackable>
		<div class="tiles">
			{#each isLoading ? Array(placeholderCount) : days as day, i}
				{@const past = !isLoading && day.fromToday < 0}
				{@const today = !isLoading && day.fromToday === 0}
				<div
					class="tile"
					class:past
					title={!isLoading ? wmoCode(day.weatherCode).description : ''}
					style:--tile-gradient={tileGradient}
				>
					<div class="tile-bg"></div>
					{#if !isLoading}
						<img
							class="tile-icon"
							src={wmoCode(day.weatherCode).icon}
							alt=""
							in:fade={{ duration: 300 }}
						/>
						<div class="tile-content" in:fade={{ duration: 300 }}>
							<div class="date" class:today>{day.compactDate}</div>
						</div>
					{/if}
				</div>
			{/each}

			{#if canExpand}
				<button
					class="more-tile"
					onclick={() => onExpand?.()}
					title="Load more days"
					disabled={isLoading}
				>
					›
				</button>
			{/if}

			<!-- SVG overlay for temp lines and precip bars -->
			{#if !isLoading}
				<svg
					class="overlay"
					viewBox="0 0 {days.length * TILE_WIDTH} {TILE_HEIGHT}"
					preserveAspectRatio="none"
					in:fade={{ duration: 300 }}
				>
					<!-- Precipitation bars and labels -->
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
							<text
								x={(i + 0.5) * TILE_WIDTH}
								y={PRECIP_LABEL_Y}
								text-anchor="middle"
								font-size="10"
								font-weight="600"
								fill="#268bd2"
								stroke="white"
								stroke-width="2"
								paint-order="stroke fill"
							>
								{day.precipitation.toFixed(1)}mm
							</text>
						{/if}
					{/each}

					<!-- High temperature line -->
					<path d={generateTempPath('temperatureMax')} fill="none" stroke="red" stroke-width="2" />

					<!-- Low temperature line -->
					<path d={generateTempPath('temperatureMin')} fill="none" stroke="blue" stroke-width="2" />

					<!-- High temperature dots and labels -->
					{#each days as day, i}
						{@const x = (i + 0.5) * TILE_WIDTH}
						{@const y = tempToY(day.temperatureMax)}
						<circle cx={x} cy={y} r="4" fill="red" />
						<text
							{x}
							y={y - 8}
							text-anchor="middle"
							font-size="11"
							font-weight="bold"
							fill="red"
							stroke="white"
							stroke-width="3"
							paint-order="stroke fill"
							class="temp-label"
							role="button"
							tabindex="0"
							onclick={toggleUnits}
							onkeydown={(e) => e.key === 'Enter' && toggleUnits()}
						>
							{formatTemp(day.temperatureMax)}
						</text>
					{/each}

					<!-- Low temperature dots and labels -->
					{#each days as day, i}
						{@const x = (i + 0.5) * TILE_WIDTH}
						{@const y = tempToY(day.temperatureMin)}
						<circle cx={x} cy={y} r="4" fill="blue" />
						<text
							{x}
							y={y + 14}
							text-anchor="middle"
							font-size="11"
							font-weight="bold"
							fill="blue"
							stroke="white"
							stroke-width="3"
							paint-order="stroke fill"
							class="temp-label"
							role="button"
							tabindex="0"
							onclick={toggleUnits}
							onkeydown={(e) => e.key === 'Enter' && toggleUnits()}
						>
							{formatTemp(day.temperatureMin)}
						</text>
					{/each}

					<!-- Past time dim overlay for SVG elements (AQI, temp lines, etc) -->
					{#if pastOverlayWidth > 0}
						{@const borderInset = 2}
						<rect
							x={borderInset}
							y={borderInset}
							width={pastOverlayWidth - borderInset * 2}
							height={TILE_HEIGHT - borderInset * 2}
							fill="white"
							opacity="0.5"
							rx="1"
						/>
					{/if}

					<!-- Tracker vertical line -->
					{#if trackerX !== null}
						<line
							x1={trackerX}
							y1="0"
							x2={trackerX}
							y2={TILE_HEIGHT}
							stroke={trackerColor}
							stroke-width="2"
						/>
					{/if}
				</svg>
			{/if}
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
		margin-bottom: 0.75em;
	}

	.tiles-track-area {
		width: calc(var(--tile-count) * 70px + var(--has-more) * 16px);
		margin-inline: auto;
		user-select: none;
		touch-action: none;
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
			opacity: 0.7;
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
		z-index: 1;
	}

	.more-tile {
		width: 16px;
		min-width: 16px;
		flex-shrink: 0;
		height: 114px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.25);
		backdrop-filter: blur(4px);
		border: 2px solid;
		border-color: rgba(255, 255, 255, 0.5) rgba(0, 0, 0, 0.15) rgba(0, 0, 0, 0.2)
			rgba(255, 255, 255, 0.5);
		border-left: none;
		box-shadow:
			inset 1px 1px 0 rgba(255, 255, 255, 0.3),
			inset -1px -1px 0 rgba(0, 0, 0, 0.1),
			0 2px 4px rgba(0, 0, 0, 0.15);
		padding: 0;
		margin: 0;
		cursor: pointer;
		font-size: 18px;
		font-weight: bold;
		color: rgba(0, 0, 0, 0.6);
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);

		&:hover {
			background: rgba(255, 255, 255, 0.35);
		}
	}

	.date {
		font-size: 14px;
		font-weight: 600;
		margin-bottom: 0;
		color: #333;
		text-shadow:
			-1px -1px 0 rgba(248, 248, 255, 0.8),
			1px -1px 0 rgba(248, 248, 255, 0.8),
			-1px 1px 0 rgba(248, 248, 255, 0.8),
			1px 1px 0 rgba(248, 248, 255, 0.8);

		&.today {
			font-weight: 900;
		}
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
		}
	}
</style>
