<script lang="ts">
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import { humanDistance, tsToTime } from '$lib/util.js';
	import RadarMap from './RadarMap.svelte';

	import { makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	const nsWeatherData = makeNsWeatherData();

	let { data } = $props();

	import { getEmitter } from '$lib/emitter.js';
	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	emit('weatherdata_requestedSetLocation', {
		source: data.source,
		name: data.name,
		coords: data.coords
	});

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
		<div class="map">
			<RadarMap {nsWeatherData} />
		</div>

		<div class="pico debug">
			<ol>
				<li>Enable precise location. (Tap the arrow button on map.)</li>
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
