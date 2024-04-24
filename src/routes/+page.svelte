<script lang="ts">
	import 'iconify-icon';
	import { type WeatherDataEvents, makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	import { getEmitter } from '$lib/emitter.js';

	let { data } = $props();

	const nsWeatherData = makeNsWeatherData();
	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	emit('weatherdata_requestedSetLocation', {
		source: data.source,
		name: data.name,
		coords: data.coords
	});

	function onGeolocate() {
		const options = {
			enableHighAccuracy: true
		};

		function success(pos: GeolocationPosition) {
			emit('weatherdata_requestedSetLocation', {
				source: 'geolocation',
				coords: pos.coords
			});
		}

		function error(err: GeolocationPositionError) {
			console.warn(`ERROR(${err.code}): ${err.message}`);
		}

		navigator.geolocation.getCurrentPosition(success, error, options);
	}
</script>

<div class="container">
	<div class="scroll">
		<pre>nsWeatherData = {JSON.stringify(nsWeatherData, null, 4)}</pre>
		<pre>data = {JSON.stringify(data, null, 4)}</pre>
	</div>

	<div>
		<div role="group">
			<button onclick={onGeolocate}><iconify-icon icon="gis:location-arrow"></iconify-icon></button>
			<input type="text" value={`${nsWeatherData.name}`} />
			<button>Search</button>
		</div>
	</div>
</div>

<style>
	.container {
		height: 100vh;
		height: 100dvh;

		display: grid;
		grid-template-rows: 1fr auto;
	}

	.scroll {
		overflow: auto;
	}
</style>
