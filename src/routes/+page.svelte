<script lang="ts">
	import type { RadarFrame, RadarLayer } from '$lib/types.js';
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import 'iconify-icon';
	import haversine from 'haversine-distance';

	import { Map, TileLayer, Circle, Control, DomUtil, DomEvent } from 'leaflet';
	import 'leaflet.locatecontrol';
	import GestureHandling from 'leaflet-gesture-handling';
	import 'leaflet.fullscreen';

	import { mount, onMount, untrack } from 'svelte';

	import { gg } from '$lib/gg.js';
	import { getEmitter } from '$lib/emitter.js';
	import { makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	import RadarTimeline from '$lib/RadarTimeline.svelte';
	import { tsToTime } from '$lib/util.js';

	let mapElement: HTMLDivElement;

	let { data } = $props();

	const nsWeatherData = makeNsWeatherData();
	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

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
			attributionControl: false,
			gestureHandling: true,
			fullscreenControl: true,
			forceSeparateButton: true,
			fullscreenControlOptions: {
				position: 'topright'
			}
		});

		/*
		new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(map);
		/**/

		/**/
		new TileLayer('https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg', {
			attribution:
				'<a href="https://www.rainviewer.com/api.html" target="_blank">Rainviewer</a> | <a target="_blank" href="http://stamen.com">Stamen</a> | <a href="https://stadiamaps.com/" target="_blank">Stadia</a> | &copy; <a href="https://www.openstreetmap.org/about" target="_blank">OpenStreetMap</a>'
		}).addTo(map);
		/**/

		const accuracyCircle = new Circle([lat, lon], { radius: accuracy }).addTo(map);

		new Control.Attribution({ position: 'topleft' }).addTo(map);

		const locateControl = new Control.Locate({
			position: 'bottomright',
			initialZoomLevel: 11
		}).addTo(map);
		new Control.Zoom({ position: 'bottomright' }).addTo(map);

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
			if (!frame?.path) {
				return null;
			}
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
			gg('Initialize Radar layers.');
			const radarFrame = nsWeatherData.radar.frames[radarFrameIndex];

			// Load and display current radar layer.
			addLayer(radarFrame, radarFrameIndex)?.tileLayer.on('load', ({ target }) => {
				target.setOpacity(0.6);
			});

			/**/
			// Start preloading other radar layers.
			nsWeatherData.radar.frames.forEach((frame, index) => {
				addLayer(frame, index);
			});
			/**/
		});

		///---------------------------------------------------------------------------------------///

		// Insert div.leaflet-footer element into leaflet map.
		// Add to list of Leaflet control corners as 'footer'.
		map._controlCorners.footer = DomUtil.create('div', 'leaflet-footer', map._container);

		// Define a simple control class that positions itself into newly created footer control corner:
		const RadarControl = Control.extend({
			options: {
				position: 'footer'
			},
			onAdd: function () {
				const container = DomUtil.create('div', 'full-width');
				DomEvent.disableClickPropagation(container);

				const radarTimelineControl = mount(RadarTimeline, {
					target: container,
					props: {
						radarLayers,
						nsWeatherData
					}
				});

				DomEvent.disableClickPropagation(container);

				return container;
			}
		});

		// Add simple control defined above to map:
		new RadarControl().addTo(map);

		///---------------------------------------------------------------------------------------///

		let prevTimestamp = 0;
		function step(timeStamp: number) {
			if (nsWeatherData.radar.generated) {
				const deltaTime = timeStamp - prevTimestamp;

				if (deltaTime > 20) {
					if (nsWeatherData.radarPlaying) {
						emit('weatherdata_requestedSetTime', { time: nsWeatherData.time + 40 });
					}

					const path = nsWeatherData.radar.frames[radarFrameIndex]?.path;

					if (radarLayers[path]?.loaded) {
						Object.values(radarLayers).forEach((layer) => layer?.tileLayer.setOpacity(0));
						radarLayers[path].tileLayer.setOpacity(0.6);

						prevTimestamp = timeStamp;
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

	$effect(() => {
		const fractionPlayed =
			(nsWeatherData.time - nsWeatherData.radar.frames[0]?.time) /
			(nsWeatherData.radar.frames[15]?.time - nsWeatherData.radar.frames[0]?.time);

		radarFrameIndex = Math.floor(15 * fractionPlayed);
		untrack(() => {
			// gg({ radarFrameIndex, fractionPlayed, 'nsWeatherData.time': nsWeatherData.time });
		});
	});
</script>

<div class="container">
	<div class="scroll">
		<div class="map" bind:this={mapElement}></div>

		<div class="pico">
			{tsToTime(nsWeatherData.time)}
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
	:global(.leaflet-footer) {
		/* Stick to bottom of map: */
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;

		/* Display above map layers: */
		z-index: 1000;

		pointer-events: none;

		background-color: whitesmoke;
		height: 42px;

		padding: 3px 10px;
	}

	/* Raise bottom control corners above footer: */
	:global(.leaflet-bottom) {
		bottom: 44px;
	}

	:global(.leaflet-control-attribution) {
		font-size: x-small;
	}

	:global(.full-width) {
		width: 100%;
	}

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
