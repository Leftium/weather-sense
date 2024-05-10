<script lang="ts">
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import { humanDistance, tsToTime } from '$lib/util.js';
	import RadarMap from './RadarMap.svelte';

	import { makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	const nsWeatherData = makeNsWeatherData();

	let { data } = $props();

	import { getEmitter } from '$lib/emitter.js';
	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	emit('weatherdata_requestedSetLocation', {
		source: data.source,
		name: data.name,
		coords: data.coords
	});
</script>

<div class="pico container">
	<h3>WeatherSense</h3>
</div>

<div class="pico container sticky-info">
	<div class="name">
		{nsWeatherData.name}
		<span class="accuracy">({humanDistance(nsWeatherData.coords?.accuracy)})</span>
	</div>
	<div class="time">
		{tsToTime(nsWeatherData.time, 'ddd mmm d, h:MMtt')}
	</div>
</div>

<div class="container">
	<div class="scroll">
		<div class="map">
			<RadarMap {nsWeatherData} />
		</div>
	</div>

	<div class="pico debug">
		<pre>nsWeatherData = {`${JSON.stringify(nsWeatherData, null, 4)}`}</pre>
	</div>

	<div class="pico" hidden>
		<div role="group">
			<input type="text" value={`${nsWeatherData.name}`} />
			<button>Search</button>
		</div>
	</div>
</div>

<style>
	.sticky-info {
		position: sticky;
		top: 0;
		z-index: 10000;

		background-color: var(--pico-background-color);
	}

	h3 {
		margin-bottom: 0.1em;
	}

	.name,
	.time {
		margin: auto;
		font-family: Lato, sans-serif;
	}

	.name {
		font-size: xx-large;
	}

	.accuracy {
		font-size: small;
		opacity: 60%;
	}

	.map {
		height: 400px;
	}

	.container {
		display: grid;
		grid-template-rows: 1fr auto;
	}

	.scroll {
		overflow: auto;
	}

	.debug {
		margin-top: 1em;
		overflow-x: scroll;
	}

	@media (max-width: 768px) {
		.map {
			height: 220px;
		}
	}
</style>
