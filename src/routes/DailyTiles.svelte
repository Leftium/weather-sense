<script lang="ts">
	import type { NsWeatherData, WeatherDataEvents } from '$lib/ns-weather-data.svelte';
	import {
		colors,
		wmoCode,
		WMO_CODES,
		celcius,
		MS_IN_DAY,
		MS_IN_HOUR,
		TEMP_COLOR_HOT,
		TEMP_COLOR_COLD,
	} from '$lib/util';
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

	function formatTemp(temp: number): string {
		if (nsWeatherData.units.temperature === 'C') {
			return `${celcius(temp)?.toFixed(1)}°`;
		}
		return `${Math.round(temp)}°`;
	}

	// Helper: get most severe WMO code from grouped hourly data (replicates TimeLine's grouping logic)
	function getGroupedWmoCode(hourlyData: { ms: number; weatherCode: number }[]): number | null {
		if (!hourlyData?.length) return null;

		function precipitationGroup(code: number) {
			if (WMO_CODES[code]?.wsCode !== undefined) {
				return Math.floor(WMO_CODES[code].wsCode / 1000) % 10;
			}
			return -1;
		}

		function determineNextCode(prevCode: number | undefined, currCode: number) {
			if (prevCode !== undefined) {
				if (precipitationGroup(prevCode) === precipitationGroup(currCode)) {
					return WMO_CODES[prevCode].wsCode > WMO_CODES[currCode].wsCode ? prevCode : currCode;
				}
			}
			return currCode;
		}

		// Build grouped codes (simplified version of TimeLine's logic)
		type GroupedCode = { weatherCode: number; counts: Record<number, number> };
		const groupedCodes = hourlyData.reduce((accumulator: GroupedCode[], current, index, array) => {
			const prevItem = accumulator.at(-1);
			const prevCode = prevItem?.weatherCode;
			const prevPrecipGroup =
				prevCode !== undefined
					? precipitationGroup(prevCode)
					: precipitationGroup(current.weatherCode);

			let nextCode = determineNextCode(prevCode, current.weatherCode);
			const counts =
				prevItem !== undefined && prevPrecipGroup === precipitationGroup(nextCode)
					? prevItem.counts
					: {};
			counts[current.weatherCode] = counts[current.weatherCode] || 0;

			if (index < array.length - 1) {
				counts[current.weatherCode] += 1;
			}

			// For clear/cloudy group (0), pick most common code
			if (precipitationGroup(nextCode) === 0) {
				nextCode = Number(
					maxBy(Object.keys(counts), (code) => counts[Number(code)] + Number(code) / 100),
				);
			}

			if (prevItem && prevPrecipGroup === precipitationGroup(nextCode)) {
				accumulator[accumulator.length - 1] = { weatherCode: nextCode, counts };
			} else {
				accumulator.push({ weatherCode: nextCode, counts });
			}
			return accumulator;
		}, [] as GroupedCode[]);

		// Pick the most severe from the group representatives
		const mostSevereGroup = maxBy(groupedCodes, (g) => wmoCode(g.weatherCode).wsCode ?? 0);
		return mostSevereGroup?.weatherCode ?? null;
	}

	// Helper: get representative WMO code for a day's tile
	// When groupIcons=true: uses grouped logic (most severe group representative)
	// When groupIcons=false: returns the fallback code (from daily data)
	function getDayWmoCode(dayMs: number, fallbackCode: number): number {
		if (!groupIcons) {
			return fallbackCode;
		}

		const dayEnd = dayMs + 24 * MS_IN_HOUR;
		const hourlyInRange = nsWeatherData.hourly?.filter((h) => h.ms >= dayMs && h.ms < dayEnd);

		return getGroupedWmoCode(hourlyInRange ?? []) ?? fallbackCode;
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

	// Calculate X position for past overlay (full past days only, not partial today)
	const pastOverlayWidth = $derived.by(() => {
		// Find today's tile index
		const todayIndex = days.findIndex((day) => day.fromToday === 0);
		if (todayIndex <= 0) return 0;
		// Cover all tiles before today
		return todayIndex * TILE_WIDTH;
	});

	// Svelte action for tracking
	// Supports both mouse hover (desktop) and touch scrubbing (mobile).
	// On mobile: direction detection - horizontal = scrub, vertical = scroll.
	function trackable(node: HTMLElement) {
		let trackUntilMouseUp = false;
		let mouseIsOver = false;

		// Touch gesture state
		let touchStartX = 0;
		let touchStartY = 0;
		let savedScrollTop = 0;
		let gestureDecided = false;
		let isScrubbing = false;
		let activePointerId: number | null = null;
		const GESTURE_THRESHOLD = 8; // pixels to move before deciding gesture type

		function trackToMouseX(e: PointerEvent | MouseEvent) {
			const ms = xToMs(e.clientX);
			emit('weatherdata_requestedSetTime', { ms });
		}

		function handlePointerMove(e: PointerEvent) {
			// Skip touch events - handled separately
			if (e.pointerType === 'touch') return;

			if (nsWeatherData.trackedElement === node) {
				trackToMouseX(e);
			} else if (mouseIsOver && nsWeatherData.trackedElement === null) {
				trackToMouseX(e);
				emit('weatherdata_requestedTrackingStart', { node });
			}
		}

		function handlePointerDown(e: PointerEvent) {
			// Skip touch events - handled separately
			if (e.pointerType === 'touch') return;

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
			// Skip touch events - handled separately
			if (e.pointerType === 'touch') return;

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

		// Touch pointer event handlers - direction detection for scrub vs scroll
		function handleTouchPointerDown(e: PointerEvent) {
			if (e.pointerType !== 'touch') return;

			// Don't start tracking if touching a temp label (for toggle units)
			const target = e.target as Element;
			const isTempLabel =
				target?.classList?.contains('temp-label') ||
				(target as SVGElement)?.className?.baseVal?.includes('temp-label');
			if (isTempLabel) {
				return;
			}

			touchStartX = e.clientX;
			touchStartY = e.clientY;
			savedScrollTop = document.documentElement.scrollTop || document.body.scrollTop;
			gestureDecided = false;
			isScrubbing = false;
			activePointerId = e.pointerId;
		}

		function handleTouchPointerMove(e: PointerEvent) {
			if (e.pointerType !== 'touch') return;
			if (activePointerId === null) return;

			const deltaX = e.clientX - touchStartX;
			const deltaY = e.clientY - touchStartY;
			const absDeltaX = Math.abs(deltaX);
			const absDeltaY = Math.abs(deltaY);

			// If already scrubbing, continue scrubbing
			if (isScrubbing) {
				trackToMouseX(e);
				// Lock scroll position
				document.documentElement.scrollTop = savedScrollTop;
				document.body.scrollTop = savedScrollTop;
				return;
			}

			// If already decided to scroll, let native scroll handle it
			if (gestureDecided && !isScrubbing) {
				return;
			}

			// Decide gesture type once threshold is reached
			if (!gestureDecided && (absDeltaX > GESTURE_THRESHOLD || absDeltaY > GESTURE_THRESHOLD)) {
				gestureDecided = true;

				if (absDeltaX > absDeltaY) {
					// More horizontal = scrubbing - capture pointer and set touch-action
					isScrubbing = true;
					node.style.touchAction = 'none';
					node.setPointerCapture(e.pointerId);
					trackToMouseX(e);
					emit('weatherdata_requestedTrackingStart', { node });
				} else {
					// More vertical = scrolling - let native scroll handle it
					isScrubbing = false;
					activePointerId = null;
				}
			}
		}

		function handleTouchPointerUp(e: PointerEvent) {
			if (e.pointerType !== 'touch') return;

			if (isScrubbing) {
				emit('weatherdata_requestedTrackingEnd');
				node.style.touchAction = ''; // Restore native scroll for next gesture
			}

			gestureDecided = false;
			isScrubbing = false;
			activePointerId = null;
		}

		const abortController = new AbortController();
		const { signal } = abortController;

		window.addEventListener('pointermove', handlePointerMove, { signal });
		node.addEventListener('pointerdown', handlePointerDown, { signal });
		window.addEventListener('pointerup', handlePointerUp, { signal });
		node.addEventListener('mouseenter', handleMouseEnter, { signal });
		node.addEventListener('mouseleave', handleMouseLeave, { signal });

		// Touch pointer events for mobile
		node.addEventListener('pointerdown', handleTouchPointerDown, { signal });
		window.addEventListener('pointermove', handleTouchPointerMove, { signal });
		window.addEventListener('pointerup', handleTouchPointerUp, { signal });

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
	style:--sky-gradient={skyGradient}
	bind:this={containerDiv}
>
	<!-- Wrapper to constrain trackable area to just the tiles -->
	<div class="tiles-track-area" use:trackable>
		<div class="tiles">
			{#each isLoading ? Array(placeholderCount) : days as day, i}
				{@const past = !isLoading && day.fromToday < 0}
				{@const today = !isLoading && day.fromToday === 0}
				{@const tileWmoCode = !isLoading ? getDayWmoCode(day.ms, day.weatherCode) : 0}
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
					<!-- Precipitation labels -->
					{#each days as day, i}
						{#if day.precipitation > 0}
							<text
								x={(i + 0.5) * TILE_WIDTH}
								y={PRECIP_LABEL_Y}
								text-anchor="middle"
								font-size="10"
								font-weight="600"
								fill={TEMP_COLOR_COLD}
								stroke="#f8f8ff"
								stroke-opacity="0.85"
								stroke-width="2"
								paint-order="stroke fill"
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
							stroke="#f8f8ff"
							stroke-opacity="0.85"
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
							stroke="#f8f8ff"
							stroke-opacity="0.85"
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
			cursor: pointer;
			transition: background 0.15s;

			&:hover:not(:disabled) {
				background: rgba(255, 255, 255, 0.3);
			}

			&:disabled {
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
			cursor: pointer;
			transition: background 0.15s;

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
				cursor: not-allowed;
			}
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
