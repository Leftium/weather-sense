<script lang="ts">
	import type { NsWeatherData, WeatherDataEvents } from '$lib/ns-weather-data.svelte';
	import { colors, wmoCode, celcius } from '$lib/util';
	import { getEmitter } from '$lib/emitter';
	import { minBy, maxBy } from 'lodash-es';

	let {
		nsWeatherData,
	}: {
		nsWeatherData: NsWeatherData;
	} = $props();

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

	// Filter days: 2 past days through future
	const days = $derived((nsWeatherData.daily || []).filter((day) => day.fromToday >= -2));

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
	const PRECIP_LINEAR_MAX = 10; // mm/day - linear scale up to this value

	// SVG dimensions
	const TILE_WIDTH = 80;
	const TILE_HEIGHT = 130;
	const TEMP_AREA_TOP = 60;
	const TEMP_AREA_BOTTOM = 120;
	const TEMP_AREA_HEIGHT = TEMP_AREA_BOTTOM - TEMP_AREA_TOP;
	const PRECIP_BAR_MAX_HEIGHT = TEMP_AREA_HEIGHT;
	const PRECIP_BAR_BOTTOM = TEMP_AREA_BOTTOM;
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
</script>

<div class="daily-tiles" style:--tile-count={days.length}>
	<!-- Tile backgrounds -->
	<div class="tiles">
		{#each days as day}
			{@const past = day.fromToday < 0}
			<div
				class="tile"
				class:past
				style:--icon-url="url({wmoCode(day.weatherCode).icon})"
				title={wmoCode(day.weatherCode).description}
			>
				<div class="date">{day.compactDate}</div>
			</div>
		{/each}
	</div>

	<!-- SVG overlay for temp lines and precip bars -->
	<svg
		class="overlay"
		viewBox="0 0 {days.length * TILE_WIDTH} {TILE_HEIGHT}"
		preserveAspectRatio="none"
	>
		<!-- Past day dim overlay -->
		{#each days as day, i}
			{#if day.fromToday < 0}
				<rect
					x={i * TILE_WIDTH}
					y="0"
					width={TILE_WIDTH}
					height={TILE_HEIGHT}
					fill="white"
					opacity="0.5"
				/>
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
	</svg>
</div>

<style lang="scss">
	.daily-tiles {
		position: relative;
		width: 100%;
		max-width: calc(var(--tile-count) * 80px);
		margin: 1em auto;
		overflow: visible;
	}

	.tiles {
		display: flex;
		justify-content: center;
		overflow: visible;
	}

	.tile {
		width: 80px;
		height: 130px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 4px;
		background-color: #f5f5f5;
		background-image: var(--icon-url);
		background-size: 108px 108px;
		background-repeat: no-repeat;
		background-position: -36px -27px;
		border: 1px solid #ddd;
		border-right: none;

		&:last-child {
			border-right: 1px solid #ddd;
		}

		&.past {
			background-color: #fafafa;
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
	}

	.overlay {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: calc(var(--tile-count) * 80px);
		height: 130px;
		pointer-events: none;

		:global(.temp-label) {
			pointer-events: auto;
			cursor: pointer;
		}
	}
</style>
