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
	import { clamp } from 'lodash-es';
	import { MS_IN_SECOND } from '$lib/util.js';

	let mainElement: HTMLElement;
	let mapElement: HTMLDivElement;

	let animationFrameId: number;

	let { nsWeatherData }: { nsWeatherData: NsWeatherData } = $props();

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	let radarLayers: Record<string, RadarLayer & { __brand: 'RadarMapLibre' }> = $state({});

	let radarFrameIndex = $derived.by(() => {
		if (!nsWeatherData.radar?.frames?.length) return 0;

		const firstFrame = nsWeatherData.radar.frames[0];
		const lastFrame =
			nsWeatherData.radar.frames[15] ??
			nsWeatherData.radar.frames[nsWeatherData.radar.frames.length - 1];

		if (!firstFrame || !lastFrame || firstFrame.ms === lastFrame.ms) return 0;

		const fractionPlayed = (nsWeatherData.ms - firstFrame.ms) / (lastFrame.ms - firstFrame.ms);

		// Ensure we never return NaN or invalid indices
		if (!isFinite(fractionPlayed) || fractionPlayed < 0) return 0;

		const index = Math.floor(15 * fractionPlayed);
		return clamp(index, 0, Math.min(15, nsWeatherData.radar.frames.length - 1));
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
		const lat = nsWeatherData.coords?.latitude ?? 0;
		const lon = nsWeatherData.coords?.longitude ?? 0;
		const accuracy = nsWeatherData.coords?.accuracy ?? 0;

		emit('weatherdata_requestedFetchRainviewerData');

		map = new maplibregl.Map({
			container: mapElement,
			style: 'https://tiles.openfreemap.org/styles/positron',
			cooperativeGestures: true,
			center: [lon, lat],
			zoom: (dev ? 5 : 9) + 0.7725, // Can zoom past 10 thanks to overzoom
			attributionControl: false,
		});

		let geolocateControl = new maplibregl.GeolocateControl({
			positionOptions: {
				enableHighAccuracy: true,
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

			map.flyTo({
				center: [longitude, latitude],
				zoom: dev ? 5 : 10, // Can use zoom 10+ with overzoom enabled
				duration: 0,
			});
		});

		map
			.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-left')
			.addControl(new maplibregl.FullscreenControl({ container: mainElement }))
			.addControl(new maplibregl.GlobeControl(), 'top-left')
			.addControl(new maplibregl.NavigationControl(), 'bottom-right')
			.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }))
			.addControl(new maplibregl.ScaleControl())
			.addControl(geolocateControl, 'top-right');

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

			// Initialize radar layers if data is already available
			if (nsWeatherData.radar?.frames?.length) {
				const radarFrame = nsWeatherData.radar.frames[radarFrameIndex];
				if (radarFrame) {
					addRainviewerLayer(radarFrame, radarFrameIndex);
					if (nsWeatherData.radar.frames[0]) {
						addRainviewerLayer(nsWeatherData.radar.frames[0], 0, true);
					}
				}
			}
		});

		// Start in globe projection:
		map.on('style.load', () => {
			map.setProjection({ type: 'globe' });
		});

		////Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

		////const accuracyCircle = new Circle([lat, lon], { radius: accuracy }).addTo(map);

		///---------------------------------------------------------------------------------------///

		function addRainviewerLayer(frame: RadarFrame, index: number, preload = false) {
			if (!frame?.path) {
				return null;
			}
			if (!radarLayers[frame.path]) {
				const colorScheme = 8; // from 0 to 8. Check the https://rainviewer.com/api/color-schemes.html for additional information
				const smooth = 1; // 0 - not smooth, 1 - smooth
				const snow = 1; // 0 - do not show snow colors, 1 - show snow colors
				const tileSize = 256; // can be 256 or 512.

				const layerId = `rv-layer-${frame.ms}`;
				const sourceId = `rv-src-${frame.ms}`;
				// Direct to RainViewer with overzoom protection (maxzoom: 10)
				const tileUrl = `${nsWeatherData.radar.host}${frame.path}/${tileSize}/{z}/{x}/{y}/${colorScheme}/${smooth}_${snow}.webp`;

				if (!map.getSource(sourceId)) {
					map.addSource(sourceId, {
						type: 'raster',
						tiles: [tileUrl],
						tileSize: 256,
						maxzoom: 10, // Don't fetch tiles above zoom 10 - will overzoom instead
						attribution:
							'<a href="https://www.rainviewer.com/api.html" target="_blank">RainViewer</a>',
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
			if (preload && nsWeatherData.radar?.frames && nextIndex < nsWeatherData.radar.frames.length) {
				const nextFrame = nsWeatherData.radar.frames[nextIndex];
				if (nextFrame) {
					addRainviewerLayer(nextFrame, nextIndex, true);
				}
			}
			return radarLayer;
		}

		on('weatherdata_updatedRadar', function () {
			//gg('Initialize Radar layers.');
			if (!nsWeatherData.radar?.frames?.length) return;
			if (!map) return; // Map must exist

			// If map style isn't ready yet, wait for it to load
			if (!map.isStyleLoaded()) {
				map.once('load', () => {
					const radarFrame = nsWeatherData.radar.frames[radarFrameIndex];
					if (radarFrame) {
						addRainviewerLayer(radarFrame, radarFrameIndex);
						if (nsWeatherData.radar.frames[0]) {
							addRainviewerLayer(nsWeatherData.radar.frames[0], 0, true);
						}
					}
				});
				return;
			}

			const radarFrame = nsWeatherData.radar.frames[radarFrameIndex];
			if (!radarFrame) return;

			// Load and display current radar layer.
			addRainviewerLayer(radarFrame, radarFrameIndex);

			// Pre-load next radar layers:
			if (nsWeatherData.radar.frames[0]) {
				addRainviewerLayer(nsWeatherData.radar.frames[0], 0, true);
			}
		});

		///---------------------------------------------------------------------------------------///

		let prevTimestamp = 0;
		function step(timeStamp: number) {
			if (nsWeatherData.radar?.generated && nsWeatherData.radar?.frames?.length) {
				const deltaTime = timeStamp - prevTimestamp;

				if (deltaTime > 20) {
					// Advance time if playing
					if (nsWeatherData.radarPlaying) {
						emit('weatherdata_requestedSetTime', { ms: nsWeatherData.ms + 40 * MS_IN_SECOND });
					}

					// Update layer opacity
					if (radarFrameIndex < nsWeatherData.radar.frames.length) {
						Object.values(radarLayers).forEach((radarLayer, index) => {
							if (!radarLayer?.ms) return;
							const layerId = `rv-layer-${radarLayer.ms}`;
							if (map.getLayer(layerId)) {
								map.setPaintProperty(
									layerId,
									'raster-opacity',
									index === radarFrameIndex ? 0.6 : 0,
								);
							}
						});
					}

					prevTimestamp = timeStamp;
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
