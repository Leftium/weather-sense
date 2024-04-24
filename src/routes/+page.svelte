<script lang="ts">
	import 'iconify-icon';
	import { onMount, onDestroy } from 'svelte';
	import { type WeatherDataEvents, makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	import { gg } from '$lib/gg.js';
	import { getEmitter } from '$lib/emitter.js';

	let mapElement: HTMLDivElement;
	let leafletRemover: { remove: () => void };

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

	onMount(async () => {
		const L = await import('leaflet');

		const lat = nsWeatherData.coords?.latitude || 0;
		const lon = nsWeatherData.coords?.longitude || 0;

		let map = (leafletRemover = L.map(mapElement).setView([lat, lon], 13));

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(map);
	});

	onDestroy(() => {
		if (leafletRemover) {
			gg('Unloading Leaflet map.');
			leafletRemover.remove();
		}
	});
</script>

<div class="container">
	<div class="scroll">
		<div class="map" bind:this={mapElement}></div>

		<div class="pico">
			<pre>nsWeatherData = {JSON.stringify(nsWeatherData, null, 4)}</pre>
			<pre>data = {JSON.stringify(data, null, 4)}</pre>
		</div>
	</div>

	<div class="pico">
		<div role="group">
			<button onclick={onGeolocate}><iconify-icon icon="gis:location-arrow"></iconify-icon></button>
			<input type="text" value={`${nsWeatherData.name}`} />
			<button>Search</button>
		</div>
	</div>
</div>

<style>
	.map {
		height: 600px;
	}

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
