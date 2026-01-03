<script lang="ts">
	import { type NsWeatherData, type WeatherDataEvents } from '$lib/ns-weather-data.svelte';
	import type { RadarLayer } from '$lib/types';

	import { clamp, find } from 'lodash-es';
	import { untrack } from 'svelte';

	import { getEmitter } from '$lib/emitter';
	import { gg } from '@leftium/gg';
	import { MS_IN_MINUTE, MS_IN_SECOND } from './util';

	let {
		radarLayers = $bindable(),
		nsWeatherData,
	}: { radarLayers: Record<string, RadarLayer>; nsWeatherData: NsWeatherData } = $props();

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	const step = MS_IN_SECOND;
	const TEN_MINUTES = 10 * MS_IN_MINUTE; // Milliseconds in 10 minutes.
	const initialMs = untrack(() => nsWeatherData.ms);
	let min = $state(TEN_MINUTES * (Math.floor(initialMs / TEN_MINUTES) - 12));
	let max = $state(TEN_MINUTES * (Math.floor(initialMs / TEN_MINUTES) + 4));
	let range = $derived(makeRange(min, max));

	function makeRange(min: number, max: number) {
		const range = [];
		for (let x = min; x <= max; x += step * 10 * 60) {
			range.push(x);
		}
		return range;
	}

	on('weatherdata_updatedRadar', function ({ nsWeatherData }) {
		//gg('nsWeatherData.radar', $state.snapshot(nsWeatherData.radar));

		min = nsWeatherData.radar.msStart ?? min;
		max = nsWeatherData.radar.msEnd ?? max;
	});

	function oninput(this: HTMLInputElement) {
		const ms = Number(this.value);
		emit('weatherdata_requestedSetTime', { ms });
	}

	function onclick() {
		emit('weatherdata_requestedTogglePlay');
	}
</script>

<div class="radar-timeline">
	<div class="range-wrapper">
		{#key [min, max]}
			<input type="range" {min} {max} value={clamp(nsWeatherData.ms, min, max)} {step} {oninput} />
		{/key}
		<datalist id="radar-markers">
			{#each range as ms, index}
				{@const isMinorIndex = index % 4}
				<div
					class="tick"
					class:loaded={index === range.length - 1 || find(radarLayers, ['index', index])?.loaded}
					class:minor-time={isMinorIndex}
				>
					{nsWeatherData.tzFormat(ms, isMinorIndex ? 'mm' : 'h:mm')}
				</div>
			{/each}
		</datalist>
	</div>

	<div role="none" class="play-pause" {onclick}>
		<iconify-icon
			icon={`solar:${nsWeatherData.radarPlaying ? 'pause' : 'play'}-bold`}
			width="1em"
			height="1em"
			style="color: #666"
		></iconify-icon>
	</div>
</div>

<style>
	.radar-timeline {
		display: flex;
		align-items: flex-start;
		padding: 1px 0.5em 2px;
		gap: 0.5em;
		background-color: whitesmoke;
	}

	.play-pause {
		cursor: pointer;
		display: flex;
		align-items: center;
		padding-top: 1px;
	}

	.range-wrapper {
		flex-grow: 1;
		line-height: 0;
	}

	/* Custom range slider */
	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 6px;
		margin: 0;
		padding: 0;
		cursor: pointer;
		background: #ccc;
		border-radius: 3px;
		display: block;
	}

	/* Thumb - webkit */
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 10px;
		background: #666;
		border-radius: 2px;
		border: none;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
		transform: translateY(2px);
	}

	/* Thumb - Firefox */
	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 10px;
		background: #666;
		border-radius: 2px;
		border: none;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}

	/* Track - Firefox */
	input[type='range']::-moz-range-track {
		background: #ccc;
		height: 6px;
		border-radius: 3px;
	}

	datalist#radar-markers {
		width: 100%;
		display: flex;
		justify-content: space-between;
		margin: 4px 0 0 0;
		padding: 0;
	}

	div.tick {
		margin: 0;
		padding: 0;
		opacity: 0;
		font-size: 9px;
		line-height: 1;
		text-align: center;
		text-wrap: nowrap;
		color: #666;
	}

	div.loaded {
		opacity: 1;
	}

	div.loaded.minor-time {
		opacity: 0.3;
	}

	@media (max-width: 510px) {
		div.tick.minor-time {
			visibility: hidden;
		}
	}
</style>
