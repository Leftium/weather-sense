<script lang="ts">
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import timeline from '$lib/merry-timeline';

	import TimeLine from './TimeLine.svelte';

	import { headAndTail, humanDistance, tsToTime, wmoCode } from '$lib/util.js';
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

	function toggleUnits(node: HTMLElement, options: { temperature: boolean | string }) {
		function handleClick() {
			emit('weatherdata_requestedToggleUnits', options);
		}

		const abortController = new AbortController();
		const { signal } = abortController;

		node.addEventListener('click', handleClick, { signal });

		return {
			destroy() {
				abortController.abort();
			}
		};
	}

	let merryTimelinePrev24Div: HTMLDivElement;
	let merryTimelineNext24Div: HTMLDivElement;
	let merryTimeline48Div: HTMLDivElement;

	function makeMerryData(hour: { time: any; weatherCode: number | undefined }) {
		return {
			time: hour.time,
			color: wmoCode(hour.weatherCode).color,
			text: wmoCode(hour.weatherCode).description
			//annotation: String(hour.weatherCode)
		};
	}

	/*
	$effect(function () {
		const merryDataPrev24 = nsWeatherData.prev24?.map(makeMerryData) || [];
		const merryDataNext24 = nsWeatherData.next24?.map(makeMerryData) || [];
		const merryData48 = [...merryDataPrev24, ...merryDataNext24];
		const options = { _timezone: 'America/Chicago' };

		timeline(merryTimelinePrev24Div, merryDataPrev24, options);
		timeline(merryTimelineNext24Div, merryDataNext24, options);
		timeline(merryTimeline48Div, merryData48, options);
	});
    */
</script>

<div class="pico container">
	<h3>WeatherSense</h3>
</div>

<div class="pico container sticky-info">
	<div class="name">
		{nsWeatherData.name}
		<span class="accuracy">({humanDistance(nsWeatherData.coords?.accuracy)})</span>
	</div>
	<div class="time">
		{tsToTime(nsWeatherData.time, 'ddd mmm d, h:MMtt')}
	</div>
	<div class="current">
		<div class="flex">
			<div class="main-temperature" use:toggleUnits={{ temperature: true }}>
				{nsWeatherData.format('displayTemperature')}
			</div>
		</div>
		<img class="icon" src={wmoCode(nsWeatherData.displayWeatherCode).icon} alt="" />
		<div>
			<div class="condition">
				<span>{wmoCode(nsWeatherData.displayWeatherCode).description}</span>
			</div>
			<div>
				<span use:toggleUnits={{ temperature: true }}>
					{nsWeatherData.format('daily[2].temperatureMin', false)}
				</span>-<span use:toggleUnits={{ temperature: true }}>
					{nsWeatherData.format('daily[2].temperatureMax', false)}
				</span>
			</div>
		</div>
	</div>
	<div class="other-measurements">
		<span><b>Humidity:</b>{nsWeatherData.displayHumidity}%</span>
		<span><b>Precipitation:</b>{nsWeatherData.displayPrecipitation}mm</span>
	</div>
</div>

<div class="container">
	<div class="scroll">
		<div class="map">
			<RadarMap {nsWeatherData} />
		</div>

		<div class="hourly pico">
			<article>
				<b>Next 24 hours</b>
				<TimeLine {nsWeatherData} />
			</article>
		</div>
	</div>

	<div class="pico debug">
		<pre>nsWeatherData.time = {`${JSON.stringify(nsWeatherData.time, null, 4)}`} ({tsToTime(
				nsWeatherData.time,
				'ddd mmm d, h:MMtt'
			)})</pre>
		<pre>nsWeatherData.current = {`${JSON.stringify(nsWeatherData.current, null, 4)}`}</pre>
		<pre>nsWeatherData.minutely = {`${JSON.stringify(headAndTail(nsWeatherData.minutely), null, 4)}`}</pre>
		<pre>nsWeatherData.hourly = {`${JSON.stringify(headAndTail(nsWeatherData.hourly), null, 4)}`}</pre>
		<pre>nsWeatherData.daily = {`${JSON.stringify(headAndTail(nsWeatherData.daily), null, 4)}`}</pre>
	</div>

	<div class="pico" hidden>
		<div role="group">
			<input type="text" value={`${nsWeatherData.name}`} />
			<button>Search</button>
		</div>
	</div>
</div>

<style>
	.flex {
		display: flex;
	}

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
	.time,
	.current {
		margin: auto;
		font-family: Lato, sans-serif;
	}

	.current {
		display: flex;
	}

	.current .icon {
		margin-right: 0.5em;
		height: 64px;
	}

	.main-temperature {
		font-size: 2.3em;
		margin-right: 0.2em;
	}

	.current .condition {
		font-size: x-large;
		font-weight: bold;
	}

	.current .condition span {
		padding-right: 0.3em;
	}

	.other-measurements {
		margin: auto;
	}

	.hourly,
	.daily {
		font-family: Lato, sans-serif;
		margin: 1em;
	}

	.daily article > div {
		margin: 0 0.1em;
	}

	.daily .icon.small {
		height: 32px;
		width: 32px;
	}

	.daily .today {
		font-weight: bold;
	}

	.past {
		opacity: 0.4;
	}

	.name {
		font-weight: bold;
	}

	.accuracy {
		font-size: small;
		opacity: 60%;
	}

	.map {
		height: 240px;
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
		overflow-x: scroll;
	}

	@media (max-width: 768px) {
		.map {
			height: 220px;
		}
	}
</style>
