<script lang="ts">
	import type { RadarFrame, RadarLayer } from '$lib/types.js';
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import 'iconify-icon';
	import haversine from 'haversine-distance';

	import type { Control, Map } from 'leaflet';

	import { mount, onDestroy, onMount, unmount, untrack } from 'svelte';

	import { gg } from '$lib/gg.js';
	import { getEmitter } from '$lib/emitter.js';
	import { makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	import RadarTimeline from '$lib/RadarTimeline.svelte';
	import { humanDistance, tsToTime } from '$lib/util.js';

	let mapElement: HTMLDivElement;
	let map: Map;
	let locateControl: Control.Locate;
	let radarTimelineControl: RadarTimeline;
	let animationFrameId: number;

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

	onMount(async () => {
		emit('weatherdata_requestedFetchRainviewerData');

		const { Map, TileLayer, Circle, Control, DomUtil, DomEvent } = await import('leaflet');
		const { GestureHandling } = await import('leaflet-gesture-handling');
		await import('leaflet.locatecontrol');
		await import('leaflet.fullscreen');

		const lat = nsWeatherData.coords?.latitude || 0;
		const lon = nsWeatherData.coords?.longitude || 0;
		const accuracy = nsWeatherData.coords?.accuracy || 0;

		Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

		let map = new Map(mapElement, {
			center: [lat, lon],
			zoom: 5,
			zoomControl: false,
			attributionControl: false,
			// @ts-expect-error: added by leaflet-gesture-handling
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

		locateControl = new Control.Locate({
			showCompass: false,
			position: 'bottomright',
			initialZoomLevel: 11
		});

		locateControl.addTo(map);
		new Control.Zoom({ position: 'bottomright' }).addTo(map);

		map.on('locationfound', function onLocationFound(e) {
			accuracyCircle.setLatLng(e.latlng).setRadius(e.accuracy);

			locateControl.stop();

			gg(e);

			const distance = nsWeatherData.coords
				? haversine(nsWeatherData.coords, e.latlng)
				: Number.MAX_VALUE;
			gg({ distance });

			// Uncomment to avoid calling weather API's again for very small changes in location.
			//if (distance > 1000) {
			emit('weatherdata_requestedSetLocation', {
				source: 'geolocation',
				coords: {
					latitude: e.latlng.lat,
					longitude: e.latlng.lng,
					accuracy: e.accuracy
				}
			});
			//}
		});

		///---------------------------------------------------------------------------------------///

		function addLayer(frame: RadarFrame, index: number, preload = false) {
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
			gg('Initialize Radar layers.');
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
				position: 'footer'
			},
			onAdd: function () {
				const container = DomUtil.create('div', 'full-width');
				DomEvent.disableClickPropagation(container);

				radarTimelineControl = mount(RadarTimeline, {
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
			gg('Unloading Leaflet map.');
			map.remove();
		}
		if (radarTimelineControl) {
			unmount(radarTimelineControl);
		}
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
	});

	$effect(() => {
		const fractionPlayed =
			(nsWeatherData.time - nsWeatherData.radar.frames[0]?.time) /
			(nsWeatherData.radar.frames[15]?.time - nsWeatherData.radar.frames[0]?.time);

		radarFrameIndex = Math.floor(15 * fractionPlayed) || 12;
		untrack(() => {
			// gg({ radarFrameIndex, fractionPlayed, 'nsWeatherData.time': nsWeatherData.time });
		});
	});

	function handleEnablePreciseLocation() {
		locateControl.start();
	}

	function handleComposeEmail() {
		if (nsWeatherData.accuracySurveyText) {
			const emailBody = `${nsWeatherData.accuracySurveyText.replaceAll('\n', '%0D%0A')}`;
			const emailUrl = `mailto:john@leftium.com?subject=Geoip accuracy survey&body=${emailBody}`;
			window.open(emailUrl, '_blank');
		}
	}

	function handleCopyToClipboard() {
		if (nsWeatherData.accuracySurveyText) {
			navigator.clipboard.writeText(nsWeatherData.accuracySurveyText);
		}
	}
</script>

<div class="pico container">
	<h3>Geolocation Accuracy Survey</h3>
</div>

<div class="pico container sticky-info">
	<div class="name">
		{nsWeatherData.name}
		<span class="accuracy">({humanDistance(nsWeatherData.coords?.accuracy)})</span>
	</div>
	<div class="time">
		{tsToTime(nsWeatherData.time, 'ddd mmm d, h:MMtt')}
	</div>
</div>

<div class="container">
	<div class="scroll">
		<div class="map" bind:this={mapElement}></div>

		<div class="pico debug">
			<ol>
				<li>
					<button onclick={handleEnablePreciseLocation}>Enable precise location</button>
				</li>
				<li>
					<button onclick={handleComposeEmail} disabled={!nsWeatherData.accuracySurveyText}
						>Compose email with accuracy data</button
					> You will have a chance to edit the email before sending.
				</li>
				<li>
					If the button above does not work, send an email with the data to <a
						href="mailto:john@leftium.com">john@leftium.com</a
					>. The button below will try to copy the data to your clipboard:<br />
					<button onclick={handleCopyToClipboard} disabled={!nsWeatherData.accuracySurveyText}
						>Copy accuracy data to clipboard</button
					>
					<br />
				</li>
				<li>
					Please add information that may help: cellular/wifi; device type (PC, mobile, etc); if the
					location data is completely inaccurate, etc
				</li>
				<li>
					<b> Thank you! </b> Your personal information will never be shared. Data will only be used
					to determine a generic accuracy value (radius) for the geo-ip location in my weather app.
				</li>
			</ol>
			<h4>Location data:</h4>
			<pre>{nsWeatherData.accuracySurveyText || 'No precise location data, yet.'}</pre>
		</div>
	</div>

	<div class="pico" hidden>
		<div role="group">
			<input type="text" value={`${nsWeatherData.name}`} />
			<button>Search</button>
		</div>
	</div>
</div>

<style>
	.sticky-info {
		position: sticky;
		top: 0;
		z-index: 10000;

		background-color: var(--pico-background-color);
	}

	h3 {
		margin-bottom: 0.1em;
	}

	.name,
	.time {
		margin: auto;
		font-family: Lato, sans-serif;
	}

	.name {
		font-size: xx-large;
	}

	.accuracy {
		font-size: small;
		opacity: 60%;
	}

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
		height: 44px;

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
		height: 400px;
	}

	.container {
		display: grid;
		grid-template-rows: 1fr auto;
	}

	.scroll {
		overflow: auto;
	}

	.debug {
		margin-top: 1em;
	}

	@media (max-width: 768px) {
		.map {
			height: 220px;
		}
	}
</style>
