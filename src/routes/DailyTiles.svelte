<script lang="ts">
	import type { NsWeatherData, WeatherDataEvents } from '$lib/ns-weather-data.svelte';
	import {
		colors,
		wmoCode,
		celcius,
		MS_IN_DAY,
		MS_IN_HOUR,
		aqiEuropeToLabel,
		contrastTextColor,
	} from '$lib/util';
	import { getEmitter } from '$lib/emitter';
	import { clamp, minBy, maxBy } from 'lodash-es';

	let {
		nsWeatherData,
		forecastDaysVisible = 5,
		maxForecastDays = 16,
		onExpand,
	}: {
		nsWeatherData: NsWeatherData;
		forecastDaysVisible?: number;
		maxForecastDays?: number;
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
	// Initialize conservatively - will be updated by effect
	let maxTiles = $state(
		typeof window !== 'undefined' ? Math.max(3, Math.floor((window.innerWidth - 150) / 80)) : 8,
	);

	$effect(() => {
		function updateMaxTiles() {
			// Account for container padding, margins, and borders (~150px buffer)
			const availableWidth = window.innerWidth - 150;
			maxTiles = Math.max(3, Math.floor(availableWidth / 80));
		}

		updateMaxTiles();
		window.addEventListener('resize', updateMaxTiles);
		window.addEventListener('orientationchange', updateMaxTiles);
		return () => {
			window.removeEventListener('resize', updateMaxTiles);
			window.removeEventListener('orientationchange', updateMaxTiles);
		};
	});

	// Filter days based on how many tiles can fit and forecastDaysVisible
	// Prioritize: all past days (up to 2), today, then fill with future up to forecastDaysVisible
	const days = $derived.by(() => {
		const allDays = nsWeatherData.daily || [];
		// Start from -2 (2 days ago) through forecastDaysVisible future days
		const filtered = allDays.filter(
			(day) => day.fromToday >= -2 && day.fromToday < forecastDaysVisible,
		);

		if (filtered.length <= maxTiles) {
			return filtered;
		}

		// Need to trim - keep all past days and today, trim future
		return filtered.slice(0, maxTiles);
	});

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
	const PRECIP_LINEAR_MAX = 20; // mm/day - linear scale up to this value

	// SVG dimensions
	const TILE_WIDTH = 80;
	const TILE_HEIGHT = 130;
	const AQI_BAND_HEIGHT = 15; // Leave 1px for bottom border
	const AQI_BAND_Y = TILE_HEIGHT - AQI_BAND_HEIGHT - 1;

	// Compute daily max AQI from hourly dataAirQuality
	const dailyAqi = $derived.by(() => {
		const result: Map<number, { maxAqi: number; label: ReturnType<typeof aqiEuropeToLabel> }> =
			new Map();

		if (!nsWeatherData.dataAirQuality.size || !days.length) return result;

		for (const day of days) {
			const dayStart = day.ms;
			const dayEnd = dayStart + MS_IN_DAY;

			let maxAqi = 0;

			// Iterate through hours in this day
			for (let hourMs = dayStart; hourMs < dayEnd; hourMs += MS_IN_HOUR) {
				const hourData = nsWeatherData.dataAirQuality.get(hourMs);
				if (hourData && hourData.aqiEurope > maxAqi) {
					maxAqi = hourData.aqiEurope;
				}
			}

			const label = aqiEuropeToLabel(maxAqi || null);
			result.set(day.ms, { maxAqi, label });
		}

		return result;
	});

	const TEMP_AREA_TOP = 60;
	const TEMP_AREA_BOTTOM = AQI_BAND_Y - 15; // Above the AQI band with padding
	const TEMP_AREA_HEIGHT = TEMP_AREA_BOTTOM - TEMP_AREA_TOP;
	const PRECIP_BAR_MAX_HEIGHT = AQI_BAND_Y - TEMP_AREA_TOP; // Full height from top to AQI band
	const PRECIP_BAR_BOTTOM = AQI_BAND_Y; // Flush with AQI band
	const PRECIP_BAR_WIDTH = 30;

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
	style:--tile-count={days.length}
	style:--has-more={canExpand ? 1 : 0}
	bind:this={containerDiv}
	use:trackable
>
	<!-- Tile backgrounds -->
	<div class="tiles">
		{#each days as day}
			{@const past = day.fromToday < 0}
			{@const today = day.fromToday === 0}
			<div
				class="tile"
				class:past
				style:--icon-url="url({wmoCode(day.weatherCode).icon})"
				title={wmoCode(day.weatherCode).description}
			>
				<div class="date" class:today>{day.compactDate}</div>
				{#if day.precipitation > 0}
					<div class="precip">{day.precipitation.toFixed(1)}mm</div>
				{/if}
			</div>
		{/each}

		{#if canExpand}
			<button class="more-tile" onclick={() => onExpand?.()} title="Load more days"> ›› </button>
		{/if}

		<!-- SVG overlay for temp lines and precip bars -->
		<svg
			class="overlay"
			viewBox="0 0 {days.length * TILE_WIDTH} {TILE_HEIGHT}"
			preserveAspectRatio="none"
		>
			<!-- AQI bands at bottom -->
			{#each days as day, i}
				{@const aqiData = dailyAqi.get(day.ms)}
				{@const label = aqiData?.label}
				{@const fillText = label ? contrastTextColor(label.color) : 'black'}
				{@const fillShadow = label
					? contrastTextColor(label.color, true, 'rgba(255 255 255 / 50%)', 'rgba(51 51 51 / 50%)')
					: 'white'}
				{#if label && label.color}
					<!-- Inset rect to reveal tile borders (1px on sides, 1px on bottom) -->
					<rect
						x={i * TILE_WIDTH + 1}
						y={AQI_BAND_Y}
						width={TILE_WIDTH - 2}
						height={AQI_BAND_HEIGHT - 1}
						fill={label.color}
					/>
					<!-- Label shadow -->
					<text
						x={(i + 0.5) * TILE_WIDTH}
						y={AQI_BAND_Y + AQI_BAND_HEIGHT / 2}
						text-anchor="middle"
						dominant-baseline="middle"
						font-size="10"
						fill={fillShadow}
						dx="1"
						dy="1"
					>
						{label.text}
					</text>
					<!-- Label text -->
					<text
						x={(i + 0.5) * TILE_WIDTH}
						y={AQI_BAND_Y + AQI_BAND_HEIGHT / 2}
						text-anchor="middle"
						dominant-baseline="middle"
						font-size="10"
						fill={fillText}
					>
						{label.text}
					</text>
				{/if}
			{/each}

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
					onclick={toggleUnits}
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
					onclick={toggleUnits}
				>
					{formatTemp(day.temperatureMin)}
				</text>
			{/each}

			<!-- Past time dim overlay (covers past days + elapsed portion of today) -->
			{#if pastOverlayWidth > 0}
				<rect
					x="0"
					y="0"
					width={pastOverlayWidth}
					height={TILE_HEIGHT}
					fill="white"
					opacity="0.5"
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
	</div>
</div>

<style lang="scss">
	.daily-tiles {
		position: relative;
		width: 100%;
		overflow: visible;
		user-select: none;
		touch-action: none;
		background: linear-gradient(135deg, #fff 0%, #d0d0d0 50%, #fff 100%);
	}

	.tiles {
		position: relative;
		display: flex;
		justify-content: center;
		overflow: visible;
		width: fit-content;
		margin-inline: auto;
	}

	.tile {
		width: 80px;
		min-width: 80px;
		flex-shrink: 0;
		height: 130px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 4px;
		background-color: #87ceeb;
		background-image: var(--icon-url);
		background-size: 108px 108px;
		background-repeat: no-repeat;
		background-position: -37px -44px;
		border: 1px solid #6bb3e0;
		border-right: none;

		&.past {
			opacity: 0.7;
		}
	}

	.more-tile {
		width: 24px;
		min-width: 24px;
		flex-shrink: 0;
		height: 130px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #6bb3e0;
		border: 1px solid #6bb3e0;
		border-left: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		font-size: 18px;
		font-weight: bold;
		color: white;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);

		&:hover {
			background-color: #5aa3d0;
		}
	}

	.date {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 0;
		text-shadow:
			-1px -1px 0 rgba(255, 255, 255, 0.8),
			1px -1px 0 rgba(255, 255, 255, 0.8),
			-1px 1px 0 rgba(255, 255, 255, 0.8),
			1px 1px 0 rgba(255, 255, 255, 0.8);

		&.today {
			font-weight: 900;
		}
	}

	.precip {
		font-size: 11px;
		font-weight: 600;
		color: #268bd2;
		text-shadow:
			-1px -1px 0 rgba(255, 255, 255, 0.9),
			1px -1px 0 rgba(255, 255, 255, 0.9),
			-1px 1px 0 rgba(255, 255, 255, 0.9),
			1px 1px 0 rgba(255, 255, 255, 0.9);
	}

	.overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: calc(var(--tile-count) * 80px);
		height: 130px;
		pointer-events: none;

		:global(.temp-label) {
			pointer-events: auto;
			cursor: pointer;
		}
	}
</style>
