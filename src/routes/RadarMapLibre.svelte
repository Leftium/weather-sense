<script lang="ts">
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { circle } from '@turf/circle';
	import { featureCollection } from '@turf/helpers';
	import 'iconify-icon';
	import haversine from 'haversine-distance';

	import type { RadarFrame, RadarLayer } from '$lib/types.js';
	import type { NsWeatherData, WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import { onDestroy, onMount } from 'svelte';

	import { gg } from '$lib/gg.js';
	import { getEmitter } from '$lib/emitter.js';
	import RadarTimeline from '$lib/RadarTimeline.svelte';
	import { dev } from '$app/environment';

	let mainElement: HTMLElement;
	let mapElement: HTMLDivElement;

	let animationFrameId: number;

	let { nsWeatherData }: { nsWeatherData: NsWeatherData } = $props();

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	let radarLayers: Record<string, RadarLayer & { __brand: 'RadarMapLibre' }> = $state({});

	let radarFrameIndex = $derived.by(() => {
		const fractionPlayed =
			(nsWeatherData.ms - nsWeatherData.radar.frames[0]?.ms) /
			(nsWeatherData.radar.frames[15]?.ms - nsWeatherData.radar.frames[0]?.ms);

		return Math.min(15, Math.floor(15 * fractionPlayed));
	});

	function makeCircleFeaturesCollection(center: [number, number]) {
		return featureCollection(
			[...Array(10).keys()].map((n) =>
				circle(center, (n + 1) * 10, {
					steps: 64,
					units: 'kilometers',
				}),
			),
		);
	}

	let map: maplibregl.Map;
	onMount(async () => {
		const lat = nsWeatherData.coords?.latitude || 0;
		const lon = nsWeatherData.coords?.longitude || 0;
		const accuracy = nsWeatherData.coords?.accuracy || 0;

		emit('weatherdata_requestedFetchRainviewerData');

		map = new maplibregl.Map({
			container: mapElement,
			style: 'https://tiles.openfreemap.org/styles/positron',
			center: [lon, lat],
			zoom: dev ? 5 : 10,
			attributionControl: false,
		});

		let geolocateControl = new maplibregl.GeolocateControl({
			positionOptions: {
				enableHighAccuracy: true,
			},
			fitBoundsOptions: {
				maxZoom: dev ? 5 : 10,
			},
		});

		geolocateControl.on('geolocate', (event) => {
			const { longitude, latitude, accuracy } = event.coords;
			// TODO: Don't emit events when new coords are too close.

			emit('weatherdata_requestedSetLocation', {
				source: 'geolocation',
				coords: {
					latitude,
					longitude,
					accuracy,
				},
			});

			if (map) {
				const source = map.getSource('circles') as maplibregl.GeoJSONSource;
				source.setData(makeCircleFeaturesCollection([longitude, latitude]));
			}
		});

		map
			.addControl(new maplibregl.AttributionControl({}), 'top-left')
			.addControl(new maplibregl.FullscreenControl({ container: mainElement }))
			.addControl(new maplibregl.GlobeControl())
			.addControl(new maplibregl.NavigationControl(), 'bottom-right')
			.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }))
			.addControl(new maplibregl.ScaleControl())
			.addControl(geolocateControl, 'bottom-right');

		map.on('load', () => {
			map.addSource('circles', { type: 'geojson', data: makeCircleFeaturesCollection([lon, lat]) });
			map.addLayer({
				id: 'circles',
				type: 'line',
				source: 'circles',
				paint: {
					'line-color': 'rgba(0, 0, 0, 20%)',
					'line-width': 3,
				},
			});
		});

		////Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

		////const accuracyCircle = new Circle([lat, lon], { radius: accuracy }).addTo(map);

		///---------------------------------------------------------------------------------------///

		function addLayer(frame: RadarFrame, index: number, preload = false) {
			if (!frame?.path) {
				return null;
			}
			if (!radarLayers[frame.path]) {
				const colorScheme = 4; // from 0 to 8. Check the https://rainviewer.com/api/color-schemes.html for additional information
				const smooth = 1; // 0 - not smooth, 1 - smooth
				const snow = 1; // 0 - do not show snow colors, 1 - show snow colors
				const tileSize = 256; // can be 256 or 512.

				const layerId = `rv-layer-${frame.ms}`;
				const sourceId = `rv-src-${frame.ms}`;
				const tileUrl = `${nsWeatherData.radar.host}/${frame.path}/${tileSize}/{z}/{x}/{y}/${colorScheme}/${smooth}_${snow}.png`;

				if (!map.getSource(sourceId)) {
					map.addSource(sourceId, {
						type: 'raster',
						tiles: [tileUrl],
						tileSize: 256,
					});
				}

				if (!map.getLayer(layerId)) {
					map.addLayer({
						id: layerId,
						type: 'raster',
						source: sourceId,
						paint: { 'raster-opacity': 0 },
					});
				}

				radarLayers[frame.path] = {
					index,
					ms: frame.ms,
					loaded: true,
					layerId,
					sourceId,
				} as RadarLayer & { __brand: 'RadarMapLibre' };

				// TODO: set .loaded
			}

			const radarLayer = radarLayers[frame.path];

			const nextIndex = index + 1;
			if (preload && nextIndex < nsWeatherData.radar.frames.length) {
				addLayer(nsWeatherData.radar.frames[nextIndex], nextIndex, true);
			}
			return radarLayer;
		}

		on('weatherdata_updatedRadar', function () {
			//gg('Initialize Radar layers.');
			const radarFrame = nsWeatherData.radar.frames[radarFrameIndex];

			// Load and display current radar layer.
			addLayer(radarFrame, radarFrameIndex);

			// Pre-load next radar layers:
			addLayer(nsWeatherData.radar.frames[0], 0, true);
		});

		///---------------------------------------------------------------------------------------///

		let prevTimestamp = 0;
		function step(timeStamp: number) {
			if (nsWeatherData.radar.generated) {
				const deltaTime = timeStamp - prevTimestamp;

				if (deltaTime > 20 && radarFrameIndex < nsWeatherData.radar.frames.length) {
					Object.values(radarLayers).forEach((radarLayer, index) => {
						const layerId = `rv-layer-${radarLayer.ms}`;
						map.setPaintProperty(layerId, 'raster-opacity', index === radarFrameIndex ? 0.6 : 0);
					});
				}
			}
			animationFrameId = requestAnimationFrame(step);
		}

		animationFrameId = requestAnimationFrame(step);
	});

	onDestroy(() => {
		if (map) {
			map.remove();
		}
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
	});
</script>

<main bind:this={mainElement}>
	<div bind:this={mapElement}></div>
	<RadarTimeline bind:radarLayers {nsWeatherData} />
</main>

<style>
	main {
		display: grid;
		grid-auto-flow: column;
		grid-template-rows: 1fr auto;

		height: 100%;
	}
</style>
