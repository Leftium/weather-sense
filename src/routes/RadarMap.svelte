<script lang="ts">
	import type { RadarFrame, RadarLayer } from '$lib/types.js';
	import type { NsWeatherData, WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import 'iconify-icon';
	import haversine from 'haversine-distance';

	import type { Control, Map } from 'leaflet';

	import { mount, onDestroy, onMount, tick, unmount, untrack } from 'svelte';

	import { gg } from '$lib/gg.js';
	import { getEmitter } from '$lib/emitter.js';
	import RadarTimeline from '$lib/RadarTimeline.svelte';
	import { MS_IN_SECOND } from '$lib/util';

	let mapElement: HTMLDivElement;
	let map: Map | null = null;
	let locateControl: Control.Locate;
	let radarTimelineControl: RadarTimeline;
	let animationFrameId: number;

	let {
		nsWeatherData,
		mapStyle = 'openstreetmap',
	}: { nsWeatherData: NsWeatherData; mapStyle?: string } = $props();

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	let radarLayers: Record<string, RadarLayer & { __brand: 'RadarMap' }> = $state({});

	let radarFrameIndex = $derived.by(() => {
		const fractionPlayed =
			(nsWeatherData.ms - nsWeatherData.radar.frames[0]?.ms) /
			(nsWeatherData.radar.frames[15]?.ms - nsWeatherData.radar.frames[0]?.ms);

		return Math.floor(15 * fractionPlayed) || 12;
	});

	onMount(async () => {
		emit('weatherdata_requestedFetchRainviewerData');

		const { Map, TileLayer, Circle, Control, DomUtil, DomEvent } = await import('leaflet');
		const { GestureHandling } = await import('leaflet-gesture-handling');
		const { LocateControl } = await import('leaflet.locatecontrol');
		await import('leaflet.fullscreen');

		const lat = nsWeatherData.coords?.latitude ?? 0;
		const lon = nsWeatherData.coords?.longitude ?? 0;
		const accuracy = nsWeatherData.coords?.accuracy ?? 0;

		Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

		let map = new Map(mapElement, {
			center: [lat, lon],
			zoom: 10,
			zoomControl: false,
			attributionControl: false,
			// @ts-expect-error: added by leaflet-gesture-handling
			gestureHandling: false,
			fullscreenControl: true,
			forceSeparateButton: true,
			fullscreenControlOptions: {
				position: 'topright',
			},
		});

		if (true || mapStyle === 'openstreetmap') {
			new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				className: 'bw',
				attribution:
					'<a href="https://www.rainviewer.com/api.html" target="_blank">Rainviewer</a> | &copy; <a href="https://www.openstreetmap.org/about" target="_blank">OpenStreetMap</a>',
			}).addTo(map);
		} else {
			new TileLayer('https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg', {
				className: 'bw',
				attribution:
					'<a href="https://www.rainviewer.com/api.html" target="_blank">Rainviewer</a> | <a target="_blank" href="http://stamen.com">Stamen</a> | <a href="https://stadiamaps.com/" target="_blank">Stadia</a> | &copy; <a href="https://www.openstreetmap.org/about" target="_blank">OpenStreetMap</a>',
			}).addTo(map);
		}

		const accuracyCircle = new Circle([lat, lon], { radius: accuracy }).addTo(map);
		const scaleCircles = [...Array(10).keys()].map((n) => {
			return new Circle([lat, lon], {
				color: '#ffffff',
				opacity: 0.5,
				fillOpacity: 0,
				radius: (n + 1) * 10_000,
			}).addTo(map);
		});

		new Control.Attribution({ position: 'topleft' }).addTo(map);
		new Control.Scale({ position: 'bottomleft' }).addTo(map);

		locateControl = new LocateControl({
			showCompass: false,
			position: 'bottomright',
			initialZoomLevel: 10,
		});
		locateControl.addTo(map);

		new Control.Zoom({ position: 'bottomright' }).addTo(map);

		map.on('locationfound', async function onLocationFound(e) {
			accuracyCircle.setLatLng(e.latlng).setRadius(e.accuracy);
			scaleCircles.map((circle) => {
				circle.setLatLng(e.latlng);
			});

			gg(e);

			const distance = nsWeatherData.coords
				? haversine(nsWeatherData.coords, e.latlng)
				: Number.MAX_VALUE;
			gg({ distance });

			// Uncomment to avoid calling weather API's again for very small changes in location.
			if (distance > 1000) {
				emit('weatherdata_requestedSetLocation', {
					source: 'geolocation',
					coords: {
						latitude: e.latlng.lat,
						longitude: e.latlng.lng,
						accuracy: e.accuracy,
					},
				});
			}

			await tick();
			locateControl.stop();
		});

		///---------------------------------------------------------------------------------------///

		function addLayer(frame: RadarFrame, index: number, preload = false) {
			if (!frame?.path) {
				return null;
			}
			if (!radarLayers[frame.path]) {
				const colorScheme = 6; // from 0 to 8. Check the https://rainviewer.com/api/color-schemes.html for additional information
				const smooth = 1; // 0 - not smooth, 1 - smooth
				const snow = 1; // 0 - do not show snow colors, 1 - show snow colors
				const tileSize = 512; // can be 256 or 512.

				// Direct to RainViewer - no proxy needed with overzoom protection
				const urlTemplate = `${nsWeatherData.radar.host}${frame.path}/${tileSize}/{z}/{x}/{y}/${colorScheme}/${smooth}_${snow}.webp`;

				const tileLayer = new TileLayer(urlTemplate, {
					tileSize: 256,
					opacity: 0,
					zIndex: frame.ms,
				});

				radarLayers[frame.path] = {
					index,
					ms: frame.ms,
					loaded: false,
					tileLayer,
				} as RadarLayer & { __brand: 'RadarMap' };

				//tileLayer.on('loading', startLoadingTile);
				tileLayer.on('load', () => {
					radarLayers[frame.path].loaded = true;
				});
				//tileLayer.on('remove', finishLoadingTile);
			}

			const radarLayer = radarLayers[frame.path];
			if (!map.hasLayer(radarLayer.tileLayer)) {
				map
					.addLayer(radarLayer.tileLayer)
					.on('zoomstart', () => {
						if (radarLayer.index < radarFrameIndex - 1 || radarLayer.index > radarFrameIndex + 1) {
							map.removeLayer(radarLayer.tileLayer);
						}
					})
					.on('zoomend', () => {
						if (!map.hasLayer(radarLayer.tileLayer)) {
							map.addLayer(radarLayer.tileLayer);
						}
					});
			}

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
			addLayer(radarFrame, radarFrameIndex)?.tileLayer.on('load', ({ target }) => {
				target.setOpacity(0.6);
			});

			// Pre-load next radar layers:
			addLayer(nsWeatherData.radar.frames[0], 0, true);
		});

		///---------------------------------------------------------------------------------------///

		// Insert div.leaflet-footer element into leaflet map.
		// Add to list of Leaflet control corners as 'footer'.
		// @ts-expect-error: using undocumented _controlCorners
		map._controlCorners.footer = DomUtil.create('div', 'leaflet-footer', map.getContainer());

		// Define a simple control class that positions itself into newly created footer control corner:
		const RadarControl = Control.extend({
			options: {
				position: 'footer',
			},
			onAdd: function () {
				const container = DomUtil.create('div', 'full-width');
				DomEvent.disableClickPropagation(container);

				radarTimelineControl = mount(RadarTimeline, {
					target: container,
					props: {
						radarLayers,
						nsWeatherData,
					},
				});

				DomEvent.disableClickPropagation(container);

				return container;
			},
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
						emit('weatherdata_requestedSetTime', { ms: nsWeatherData.ms + 40 * MS_IN_SECOND });
					}

					const path = nsWeatherData.radar.frames[radarFrameIndex]?.path;

					if (radarLayers[path]?.loaded) {
						Object.values(radarLayers).forEach((layer) => layer?.tileLayer.setOpacity(0));
						radarLayers[path].tileLayer.setOpacity(0.6);

						prevTimestamp = timeStamp;
					} else {
						const radarFrame = nsWeatherData.radar.frames[radarFrameIndex];

						// Load and display current radar layer.
						addLayer(radarFrame, radarFrameIndex)?.tileLayer.on('load', ({ target }) => {
							target.setOpacity(0.6);
						});

						// Pre-load next radar layer:
						const nextFrameIndex = radarFrameIndex + 1;
						if (radarFrameIndex < 16) {
							addLayer(nsWeatherData.radar.frames[nextFrameIndex], nextFrameIndex);
						}
					}
				}
			}
			animationFrameId = requestAnimationFrame(step);
		}

		animationFrameId = requestAnimationFrame(step);
	});

	onDestroy(() => {
		if (map) {
			let typedMap = map as Map;
			gg('Unloading Leaflet map.');
			typedMap.remove();
		}
		if (radarTimelineControl) {
			unmount(radarTimelineControl);
		}
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
	});
</script>

<div bind:this={mapElement} style:height="100%"></div>

<style>
	div :global(.leaflet-footer) {
		/* Stick to bottom of map: */
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;

		/* Display above map layers: */
		z-index: 1000;

		pointer-events: none;

		background-color: whitesmoke;
		height: 44px;

		padding: 3px 10px;
	}

	/* Raise bottom control corners above footer: */
	div :global(.leaflet-bottom) {
		bottom: 44px;
	}

	div :global(.leaflet-control-attribution) {
		font-size: x-small;
	}

	div :global(.full-width) {
		width: 100%;
	}

	div :global(.bw) {
		filter: grayscale(75%);
	}
</style>
