<script lang="ts">
	import 'iconify-icon';
	import haversine from 'haversine-distance';
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

	onMount(async () => {
		await import('leaflet.locatecontrol');
		await import('leaflet.fullscreen');
		const { GestureHandling } = await import('leaflet-gesture-handling');
		const L = await import('leaflet');

		const lat = nsWeatherData.coords?.latitude || 0;
		const lon = nsWeatherData.coords?.longitude || 0;
		const accuracy = nsWeatherData.coords?.accuracy || 0;

		L.Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

		let map = (leafletRemover = new L.Map(mapElement, {
			center: [lat, lon],
			zoom: 10,
			zoomControl: false,
			gestureHandling: true,
			fullscreenControl: true,
			forceSeparateButton: true,
			fullscreenControlOptions: {
				position: 'topright'
			}
		}));

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(map);

		const accuracyCircle = L.circle([lat, lon], { radius: accuracy }).addTo(map);

		new L.Control.Zoom({ position: 'topleft' }).addTo(map);
		const locateControl = L.control
			.locate({ position: 'bottomleft', initialZoomLevel: 11 })
			.addTo(map);

		map.on('locationfound', function onLocationFound(e) {
			accuracyCircle.setLatLng(e.latlng).setRadius(e.accuracy);

			// locateControl.stop();

			gg(e);

			const distance = nsWeatherData.coords
				? haversine(nsWeatherData.coords, e.latlng)
				: Number.MAX_VALUE;
			gg({ distance });
			if (distance > 1000) {
				emit('weatherdata_requestedSetLocation', {
					source: 'geolocation',
					coords: {
						latitude: e.latlng.lat,
						longitude: e.latlng.lng,
						accuracy: e.accuracy
					}
				});
			}
		});
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
			<input type="text" value={`${nsWeatherData.name}`} />
			<button>Search</button>
		</div>
	</div>
</div>

<style>
	.map {
		height: 300px;
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
