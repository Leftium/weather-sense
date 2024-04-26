<script lang="ts">
	import 'iconify-icon';
	import haversine from 'haversine-distance';

	import { Map, TileLayer, Circle, Control } from 'leaflet';
	import Locate from 'leaflet.locatecontrol';
	import GestureHandling from 'leaflet-gesture-handling';
	import 'leaflet.fullscreen';

	import { onMount } from 'svelte';
	import {
		type RadarFrame,
		type WeatherDataEvents,
		makeNsWeatherData
	} from '$lib/ns-weather-data.svelte.js';
	import { gg } from '$lib/gg.js';
	import { getEmitter } from '$lib/emitter.js';

	let mapElement: HTMLDivElement;

	let { data } = $props();

	const nsWeatherData = makeNsWeatherData();
	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	type RadarLayer = {
		index: number;
		time: number;
		loaded: boolean;
		tileLayer: TileLayer;
	};

	let radarLayers: Record<string, RadarLayer> = $state({});
	let radarFrameIndex = $state(12);

	emit('weatherdata_requestedSetLocation', {
		source: data.source,
		name: data.name,
		coords: data.coords
	});

	onMount(() => {
		const lat = nsWeatherData.coords?.latitude || 0;
		const lon = nsWeatherData.coords?.longitude || 0;
		const accuracy = nsWeatherData.coords?.accuracy || 0;

		Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

		let map = new Map(mapElement, {
			center: [lat, lon],
			zoom: 6,
			zoomControl: false,
			gestureHandling: true,
			fullscreenControl: true,
			forceSeparateButton: true,
			fullscreenControlOptions: {
				position: 'topright'
			}
		});

		new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(map);

		const accuracyCircle = new Circle([lat, lon], { radius: accuracy }).addTo(map);

		new Control.Zoom({ position: 'topleft' }).addTo(map);

		const locateControl = new Locate({
			position: 'bottomleft',
			initialZoomLevel: 11
		}).addTo(map);

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

		///---------------------------------------------------------------------------------------///

		function addLayer(frame: RadarFrame, index: number) {
			if (!radarLayers[frame.path]) {
				const colorScheme = 4; // from 0 to 8. Check the https://rainviewer.com/api/color-schemes.html for additional information
				const smooth = 1; // 0 - not smooth, 1 - smooth
				const snow = 1; // 0 - do not show snow colors, 1 - show snow colors
				const tileSize = 512; // can be 256 or 512.

				const urlTemplate = `${nsWeatherData.radar.host}/${frame.path}/${tileSize}/{z}/{x}/{y}/${colorScheme}/${smooth}_${snow}.png`;

				const tileLayer = new TileLayer(urlTemplate, {
					tileSize: 256,
					opacity: 0,
					zIndex: frame.time
				});

				radarLayers[frame.path] = {
					index,
					time: frame.time,
					loaded: false,
					tileLayer
				};

				//tileLayer.on('loading', startLoadingTile);
				tileLayer.on('load', () => {
					radarLayers[frame.path].loaded = true;
				});
				//tileLayer.on('remove', finishLoadingTile);
			}
			if (!map.hasLayer(radarLayers[frame.path].tileLayer)) {
				map.addLayer(radarLayers[frame.path].tileLayer);
			}
			return radarLayers[frame.path];
		}

		on('weatherdata_updatedRadar', function () {
			const radarFrame = nsWeatherData.radar.frames[radarFrameIndex];

			// Load and display current radar layer.
			addLayer(radarFrame, radarFrameIndex)?.tileLayer.on('load', ({ target }) => {
				target.setOpacity(100);
			});

			// Start preloading other radar layers.
			nsWeatherData.radar.frames.forEach((frame, index) => {
				addLayer(frame, index);
			});
		});

		///---------------------------------------------------------------------------------------///

		let prevTimestamp = 0;
		function step(timeStamp: number) {
			if (nsWeatherData.radar.generated) {
				const deltaTime = timeStamp - prevTimestamp;

				if (deltaTime > 100) {
					radarFrameIndex = (radarFrameIndex + 1) % nsWeatherData.radar.frames.length;
					const path = nsWeatherData.radar.frames[radarFrameIndex].path;

					if (radarLayers[path].loaded) {
						Object.values(radarLayers).forEach((layer) => layer?.tileLayer.setOpacity(0));
						radarLayers[path].tileLayer.setOpacity(100);

						prevTimestamp = timeStamp;
					} else {
						radarFrameIndex--;
					}
				}
			}
			requestAnimationFrame(step);
		}

		requestAnimationFrame(step);

		return () => {
			if (map) {
				gg('Unloading Leaflet map.');
				map.remove();
			}
		};
	});
</script>

<div class="container">
	<div class="scroll">
		<div class="map" bind:this={mapElement}></div>

		<div class="pico">
			{radarFrameIndex}
			<pre>nsWeatherData = {JSON.stringify(nsWeatherData, null, 4)}</pre>
			<pre>Object.keys(radarLayers) = {JSON.stringify(
					Object.keys(radarLayers).map((key) => ({
						key,
						loaded: radarLayers[key].loaded
					})),
					null,
					4
				)}</pre>
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
		height: 500px;
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
