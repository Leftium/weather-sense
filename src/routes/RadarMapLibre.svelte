<script lang="ts">
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import 'iconify-icon';

	import type { RadarFrame, RadarLayer } from '$lib/types.js';
	import type { WeatherStore, WeatherDataEvents } from '$lib/weather';

	import { onDestroy, onMount } from 'svelte';

	import { getEmitter } from '$lib/emitter.js';
	import RadarTimeline from '$lib/RadarTimeline.svelte';
	import { dev } from '$app/environment';
	import { clamp } from 'lodash-es';

	let mainElement: HTMLElement;
	let mapElement: HTMLDivElement;

	let {
		nsWeatherData,
		calmMode = false,
		demoMode = false,
	}: { nsWeatherData: WeatherStore; calmMode?: boolean; demoMode?: boolean } = $props();

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

	// Detect when tracker is outside radar time range (demo mode never mutes)
	let radarOutOfRange = $derived.by(() => {
		if (demoMode) return false;
		if (!nsWeatherData.radar?.frames?.length) return false;

		const firstFrame = nsWeatherData.radar.frames[0];
		const lastFrame =
			nsWeatherData.radar.frames[15] ??
			nsWeatherData.radar.frames[nsWeatherData.radar.frames.length - 1];

		if (!firstFrame || !lastFrame) return false;

		return nsWeatherData.ms < firstFrame.ms || nsWeatherData.ms > lastFrame.ms;
	});

	let map: maplibregl.Map;
	let scaleControl: maplibregl.ScaleControl;
	let locationMarker: maplibregl.Marker;

	onMount(async () => {
		const lat = nsWeatherData.coords?.latitude ?? 0;
		const lon = nsWeatherData.coords?.longitude ?? 0;
		// const accuracy = nsWeatherData.coords?.accuracy ?? 0; // TODO: use for location marker

		emit('weatherdata_requestedFetchRainviewerData');

		// Demo mode uses zoom 5 (zoomed out to avoid grainy radar tiles)
		const initialZoom = demoMode ? 5 : (dev ? 8 : 9) + 0.7725;

		map = new maplibregl.Map({
			container: mapElement,
			style: 'https://tiles.openfreemap.org/styles/positron',
			cooperativeGestures: true,
			center: [lon, lat],
			zoom: initialZoom,
			attributionControl: false,
		});

		// Add location marker with pulsing dot
		const markerEl = document.createElement('div');
		markerEl.className = 'pulsing-marker';
		locationMarker = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
			.setLngLat([lon, lat])
			.addTo(map);

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

			map.flyTo({
				center: [longitude, latitude],
				zoom: demoMode ? 5 : dev ? 8 : 10, // Demo mode zoomed out for cleaner radar
				duration: 0,
			});
		});

		const scaleUnit = nsWeatherData.units.temperature === 'C' ? 'metric' : 'imperial';
		scaleControl = new maplibregl.ScaleControl({ unit: scaleUnit });

		map
			.addControl(geolocateControl, 'bottom-right')
			.addControl(new maplibregl.FullscreenControl({ container: mainElement }), 'bottom-right')
			.addControl(new maplibregl.GlobeControl(), 'top-left')
			.addControl(new maplibregl.NavigationControl(), 'top-right')
			.addControl(scaleControl);

		map.on('load', () => {
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

		function addRainviewerLayer(
			frame: RadarFrame,
			index: number,
			preload = false,
			visible = false,
		) {
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
						maxzoom: 7, // RainViewer restricted to zoom 7 as of Feb 2026
					});
				}

				if (!map.getLayer(layerId)) {
					map.addLayer({
						id: layerId,
						type: 'raster',
						source: sourceId,
						paint: { 'raster-opacity': visible ? 0.6 : 0 },
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
			if (!nsWeatherData.radar?.frames?.length) return;
			if (!map) return;

			function initRadarLayers() {
				const radarFrame = nsWeatherData.radar.frames[radarFrameIndex];
				if (radarFrame) {
					addRainviewerLayer(radarFrame, radarFrameIndex, false, true);
					if (nsWeatherData.radar.frames[0]) {
						addRainviewerLayer(nsWeatherData.radar.frames[0], 0, true);
					}
				}
			}

			// If map style isn't ready yet, wait for styledata event
			if (!map.isStyleLoaded()) {
				map.once('styledata', initRadarLayers);
				return;
			}

			initRadarLayers();

			// Pre-load next radar layers:
			if (nsWeatherData.radar.frames[0]) {
				addRainviewerLayer(nsWeatherData.radar.frames[0], 0, true);
			}
		});
	});

	// Update radar layer opacity and sepia effect when radarFrameIndex changes
	// Shell's unified RAF loop drives time advancement during playback
	$effect(() => {
		const frameIndex = radarFrameIndex;
		const outOfRange = radarOutOfRange;
		if (!map || !nsWeatherData.radar?.frames?.length) return;

		// Update layer opacity to show current frame
		Object.values(radarLayers).forEach((radarLayer, index) => {
			if (!radarLayer?.ms) return;
			const layerId = `rv-layer-${radarLayer.ms}`;
			if (map.getLayer(layerId)) {
				map.setPaintProperty(layerId, 'raster-opacity', index === frameIndex ? 0.6 : 0);
				// Apply sepia effect when tracker is outside radar time range
				// Sepia approximation: desaturate + hue shift toward brown
				map.setPaintProperty(layerId, 'raster-saturation', outOfRange ? -0.7 : 0);
				map.setPaintProperty(layerId, 'raster-hue-rotate', outOfRange ? 30 : 0);
			}
		});
	});

	// Resize map when container size changes (e.g., when day labels change width)
	let resizeObserver: ResizeObserver;
	$effect(() => {
		if (!mapElement) return;

		resizeObserver = new ResizeObserver(() => {
			map?.resize();
		});
		resizeObserver.observe(mapElement);

		return () => {
			resizeObserver?.disconnect();
		};
	});

	// Scroll map into view when radar starts playing
	$effect(() => {
		if (nsWeatherData.radarPlaying && mainElement) {
			document.documentElement.scrollTop = 0;
			document.body.scrollTop = 0; // Fallback for Safari
		}
	});

	// Update scale control when temperature units change
	$effect(() => {
		if (!map || !scaleControl) return;
		const newUnit = nsWeatherData.units.temperature === 'C' ? 'metric' : 'imperial';
		scaleControl.setUnit(newUnit);
	});

	// Update location marker when coordinates change
	$effect(() => {
		if (!locationMarker || !nsWeatherData.coords) return;
		const lat = nsWeatherData.coords.latitude;
		const lon = nsWeatherData.coords.longitude;
		locationMarker.setLngLat([lon, lat]);
	});

	onDestroy(() => {
		if (map) {
			map.remove();
		}
	});
</script>

<main bind:this={mainElement} class:calm={calmMode}>
	<div bind:this={mapElement}></div>
	<RadarTimeline bind:radarLayers {nsWeatherData} />
</main>

<style>
	main {
		display: grid;
		grid-template-rows: 1fr auto;
		height: 100%;
		width: 100%;
	}

	main > div {
		width: 100%;
	}

	:global(.pulsing-marker) {
		width: 14px;
		height: 14px;
		background: #3b82f6;
		border: 2px solid white;
		border-radius: 50%;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
	}

	/* Hide scale control in calm mode */
	main.calm :global(.maplibregl-ctrl-scale) {
		display: none;
	}
</style>
