<script lang="ts">
	import { type NsWeatherData, type WeatherDataEvents } from '$lib/ns-weather-data.svelte';
	import type { RadarLayer } from '$lib/types';

	import _ from 'lodash-es';

	import { getEmitter } from '$lib/emitter';
	import { gg } from '$lib/gg';
	import { tsToTime } from '$lib/util';

	let {
		radarLayers,
		nsWeatherData
	}: { radarLayers: Record<string, RadarLayer>; nsWeatherData: NsWeatherData } = $props();

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	const step = 1;
	let min = $state(0);
	let max = $state(0);

	function makeRange(min: number, max: number) {
		const range = [];
		for (let x = min; x <= max; x += step * 10 * 60) {
			range.push(x);
		}
		gg('range', range);
		return range;
	}

	on('weatherdata_updatedRadar', function ({ nsWeatherData }) {
		gg('nsWeatherData.radar', $state.snapshot(nsWeatherData.radar));

		min = nsWeatherData.radar.frames[0].time;
		max = (nsWeatherData.radar.frames.at(-1)?.time || 0) + 10 * 60;
	});

	function oninput(this: HTMLInputElement) {
		const time = Number(this.value);
		emit('weatherdata_requestedSetTime', { time });
	}

	function onclick() {
		emit('weatherdata_requestedTogglePlay');
	}
</script>

<div class="pico">
	<div class="range-wrapper">
		<input type="range" name="" id="" {min} {max} value={nsWeatherData.time} {step} {oninput} />
		<datalist id="radar-markers">
			{#each makeRange(min, max) as value, index}
				{@const isMinorIndex = index % 4}
				<div
					class="tick"
					class:loaded={index === 16 || _.find(radarLayers, ['index', index])?.loaded}
					class:minor-time={isMinorIndex}
				>
					{tsToTime(value, isMinorIndex ? 'MM' : 'h:MMt')}
				</div>
			{/each}
		</datalist>
	</div>

	<div role="none" class="play-pause" {onclick}>
		{#if nsWeatherData.radarPlaying}
			<iconify-icon icon="solar:pause-bold" width="2em" height="2em" style="color: black"
			></iconify-icon>
		{:else}
			<iconify-icon icon="solar:play-bold" width="2em" height="2em" style="color: black"
			></iconify-icon>
		{/if}
	</div>
</div>

<style>
	.pico {
		display: flex;
		align-items: center;
		line-height: 1;
	}

	.play-pause {
		margin-right: 6px;
		margin-top: 8px;
	}

	.range-wrapper {
		flex-grow: 1;
	}

	input {
		width: 100%;
		padding: 0 calc(((100% / 17) - (23.75px)) / 2) !important;
		margin: 0 !important;
	}

	datalist#radar-markers {
		width: 100%;
		display: flex;
		justify-content: space-between;
	}

	div.tick {
		width: calc(100% / 17);
		opacity: 0;

		font-size: x-small;
		text-align: center;
		text-wrap: nowrap;

		color: black;
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

		.play-pause {
			margin-left: 16px;
		}
	}
</style>
