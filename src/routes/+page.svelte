<script lang="ts">
	import 'iconify-icon';
	import haversine from 'haversine-distance';

	import { Map, TileLayer, Circle, Control } from 'leaflet';
	import Locate from 'leaflet.locatecontrol';
	import GestureHandling from 'leaflet-gesture-handling';
	import 'leaflet.fullscreen';

	import { onMount, onDestroy } from 'svelte';
	import { type WeatherDataEvents, makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	import { gg } from '$lib/gg.js';
	import { getEmitter } from '$lib/emitter.js';

	let mapElement: HTMLDivElement;

	let { data } = $props();

	const nsWeatherData = makeNsWeatherData();
	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	let mapFrameIndex = $state(0);

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

		gg('rainviewerData', $state.snapshot(data.rainviewerData));

		let radarLayers = $state({});
		let mapFrames = $state([]);
		let urlTemplates: string[] = [];

		const rvOption = {
			tileSize: 512, // can be 256 or 512.
			colorScheme: 4, // from 0 to 8. Check the https://rainviewer.com/api/color-schemes.html for additional information
			smoothData: 1, // 0 - not smooth, 1 - smooth
			snowColors: 1 // 0 - do not show snow colors, 1 - show snow colors
		};

		// Initialize internal data from the API response and options.
		function initialize(rvData) {
			// remove all already added tiled layers
			for (const i in radarLayers) {
				map.removeLayer(radarLayers[i]);
			}
			mapFrames = [];
			radarLayers = {};

			if (!rvData) {
				return;
			}

			if (rvData?.radar.past) {
				mapFrames = rvData.radar.past;
				if (rvData?.radar.nowcast) {
					mapFrames = mapFrames.concat(rvData.radar.nowcast);
				}
			}
		}
		// Animation functions
		function addLayer(frame) {
			if (!radarLayers[frame.path]) {
				const colorScheme = rvOption.colorScheme;
				const smooth = rvOption.smoothData;
				const snow = rvOption.snowColors;

				const urlTemplate = `${data.rainviewerData.host}/${frame.path}/${rvOption.tileSize}/{z}/{x}/{y}/${colorScheme}/${smooth}_${snow}.png`;

				urlTemplates.push(urlTemplate);

				const source = new TileLayer(urlTemplate, {
					tileSize: 256,
					opacity: 0.01,
					zIndex: frame.time
				});

				// Track layer loading state to not display the overlay
				// before it will completelly loads
				//source.on('loading', startLoadingTile);
				//source.on('load', finishLoadingTile);
				//source.on('remove', finishLoadingTile);

				radarLayers[frame.path] = source;
			}
			if (!map.hasLayer(radarLayers[frame.path])) {
				map.addLayer(radarLayers[frame.path]);
			}
		}

		initialize(data.rainviewerData);

		mapFrames.forEach((frame, index) => {
			addLayer(frame);
		});

		gg('mapFrames', $state.snapshot(mapFrames));
		gg('urlTemplates', urlTemplates);
		gg('generated', new Date(data.rainviewerData.generated * 1000));
		mapFrames.forEach((frame) => {
			gg(new Date(frame.time * 1000));
		});

		let startTime;
		function step(timeStamp) {
			if (!startTime) {
				startTime = timeStamp;
			}

			const deltaTime = timeStamp - startTime;

			mapFrameIndex = Math.floor(deltaTime / 100) % mapFrames.length;

			Object.values(radarLayers).forEach((layer) => layer?.setOpacity(0));
			radarLayers[mapFrames[mapFrameIndex].path]?.setOpacity(100);

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
			{mapFrameIndex}
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
