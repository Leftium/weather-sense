<script lang="ts">
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte';
	import type { RadarLayer } from '$lib/types';

	import _ from 'lodash-es';
	import dateFormat from 'dateformat';

	import { getEmitter } from '$lib/emitter';
	import { gg } from '$lib/gg';

	let { radarLayers }: { radarLayers: Record<string, RadarLayer> } = $props();

	const { on } = getEmitter<WeatherDataEvents>(import.meta);

	const step = 60;
	let min = $state(0);
	let max = $state(0);
	let value = $state(0);

	function makeRange(min: number, max: number) {
		const range = [];
		for (let x = min; x <= max; x += step * 10) {
			range.push(x);
		}
		gg('range', range);
		return range;
	}

	function tsToTime(ts: number, format = 'h:MMt') {
		const date = new Date(ts * 1000);
		return dateFormat(date, format);
	}

	on('weatherdata_updatedRadar', function ({ nsWeatherData }) {
		gg('nsWeatherData.radar', $state.snapshot(nsWeatherData.radar));

		value = Math.floor(+new Date() / 1000);
		min = nsWeatherData.radar.frames[0].time;
		max = nsWeatherData.radar.frames.at(-1)?.time || value;

		gg({ min, max, value });
	});
</script>

<div class="pico">
	<input type="range" name="" id="" {min} {max} {value} {step} list="radar-markers" />

	<datalist id="radar-markers">
		{#each makeRange(min, max) as value, index}
			{@const isMinorIndex = index % 3}

			<div
				class="tick"
				class:loaded={_.find(radarLayers, ['index', index])?.loaded}
				class:minor-time={isMinorIndex}
			>
				{tsToTime(value, isMinorIndex ? 'MM' : 'h:MMt')}
			</div>
		{/each}
	</datalist>
</div>

<style>
	.pico {
		line-height: 1;
	}

	input {
		width: 100%;
		padding: 0 calc((100% / 32) - (23.75px / 2)) !important;
		margin: 0 !important;
	}

	datalist#radar-markers {
		width: 100%;
		display: flex;
		justify-content: space-between;
	}

	div.tick {
		width: calc(100% / 16);
		opacity: 0;

		font-size: x-small;
		text-align: center;
		text-wrap: nowrap;
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
