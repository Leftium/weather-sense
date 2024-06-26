<script lang="ts">
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import TimeLine from './TimeLine.svelte';

	import { SOLARIZED_BLUE, SOLARIZED_RED, headAndTail, humanDistance, wmoCode } from '$lib/util.js';
	import RadarMap from './RadarMap.svelte';

	import { makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	const nsWeatherData = makeNsWeatherData();

	let { data } = $props();

	import { clearEvents, getEmitter } from '$lib/emitter.js';
	import { dev } from '$app/environment';
	import { onDestroy } from 'svelte';
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

	onDestroy(() => {
		clearEvents();
	});
</script>

<div class="pico container">
	<h3>WeatherSense</h3>
</div>

<div class="pico container sticky-info">
	<div class="name">
		{nsWeatherData.name}
		<span class="accuracy"
			>({humanDistance(nsWeatherData.coords?.accuracy) || nsWeatherData.source})</span
		>
	</div>
	<div class="time">
		{nsWeatherData.tzFormat(nsWeatherData.time, 'ddd MMM D, h:mma')}
		<span class="timezone">{nsWeatherData.timezoneAbbreviation}</span>
	</div>
	<div class="current">
		<div>
			<div class="main-temperature" use:toggleUnits={{ temperature: true }}>
				{nsWeatherData.format('displayTemperature')}
			</div>
			<div class="temperature-range">
				<span use:toggleUnits={{ temperature: true }}>
					{nsWeatherData.format('daily[2].temperatureMin', false)}
				</span>
				to
				<span use:toggleUnits={{ temperature: true }}>
					{nsWeatherData.format('daily[2].temperatureMax', false)}
				</span>
			</div>
		</div>
		<img class="icon" src={wmoCode(nsWeatherData.displayWeatherCode).icon} alt="" />

		<div class="condition">
			<span>{wmoCode(nsWeatherData.displayWeatherCode).description}</span>
		</div>
	</div>
	<div class="other-measurements">
		<span><b>Humidity:</b> {nsWeatherData.displayHumidity}%</span>
		<span><b>Dew Point:</b> {nsWeatherData.displayDewPoint}</span>
		<span><b>Precipitation:</b> {nsWeatherData.displayPrecipitation}mm</span>
	</div>
</div>

<div class="container">
	<div class="scroll">
		<div class="hourly pico">
			<b>Next 24 hours</b>
			<TimeLine {nsWeatherData} startTime={+new Date() / 1000 - 2 * 60 * 60} />
		</div>

		<div class="map">
			<RadarMap {nsWeatherData} />
		</div>

		<div class="daily grid pico">
			{#each nsWeatherData.daily || [] as day, index}
				{@const past = day.fromToday < 0}
				<div class="grid day-label">
					<div class="grid icon-date">
						<img
							class="icon small"
							src={wmoCode(day.weatherCode).icon}
							title={wmoCode(day.weatherCode).description}
							alt=""
							class:past
						/>
						<div class="day" class:today={day.fromToday === 0} class:past>
							{day.timeCompact}
						</div>
					</div>
					<div class="grid high-low">
						<div style:color={SOLARIZED_RED} class:past use:toggleUnits={{ temperature: true }}>
							{nsWeatherData.format(`daily[${index}].temperatureMax`, false)}
						</div>
						<div style:color={SOLARIZED_BLUE} class:past use:toggleUnits={{ temperature: true }}>
							{nsWeatherData.format(`daily[${index}].temperatureMin`, false)}
						</div>
					</div>
				</div>
				<div class="timeline">
					<TimeLine
						{nsWeatherData}
						startTime={day.time}
						xAxis={day.timeCompact == 'Today'}
						ghostTracker={true}
					/>
				</div>
			{/each}
		</div>
	</div>

	{#if dev}
		<div class="pico debug">
			<pre>nsWeatherData.utcOffsetSeconds = {`${nsWeatherData.utcOffsetSeconds}`}</pre>
			<pre>nsWeatherData.timezone = {`${nsWeatherData.timezone}`}</pre>
			<pre>nsWeatherData.time = {`${JSON.stringify(nsWeatherData.time, null, 4)}`} ({nsWeatherData.tzFormat(
					nsWeatherData.time
				)})</pre>
			<pre>nsWeatherData.current = {`${JSON.stringify(nsWeatherData.current, null, 4)}`}</pre>
			<pre>nsWeatherData.minutely = {`${JSON.stringify(headAndTail(nsWeatherData.minutely), null, 4)}`}</pre>
			<pre>nsWeatherData.hourly = {`${JSON.stringify(headAndTail(nsWeatherData.hourly), null, 4)}`}</pre>
			<pre>nsWeatherData.daily = {`${JSON.stringify(headAndTail(nsWeatherData.daily), null, 4)}`}</pre>
		</div>
	{/if}

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
	.time,
	.current {
		margin: auto;
		font-family: Lato, sans-serif;
	}

	.timezone {
		font-size: small;
	}

	.container,
	.scroll,
	.hourly {
		overflow-y: visible !important;
	}

	.current {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
	}

	.current > div:first-child {
		justify-self: end;
	}

	.current .icon {
		margin-right: 0.5em;
		height: 64px;
	}

	.main-temperature {
		font-size: 2.3em;
		margin-right: 0.2em;
		line-height: 1.1;
	}

	.temperature-range {
		text-align: center;
	}

	.current .condition {
		display: flex;
		flex-direction: column;
		justify-content: center;
		font-size: x-large;
		font-weight: bold;
		line-height: 1.2;
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
		margin: 1em 0;
	}

	.daily {
		grid-template-columns: auto 1fr;
	}

	.daily div.day {
		margin: 0 0.1em;
		text-align: right;
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

	.daily .grid {
		grid-template-columns: auto;
		grid-template-rows: auto;
	}

	.daily .grid .grid {
		grid-template-columns: auto auto;
	}

	.daily .icon-date {
		align-items: end;
		line-height: normal;
	}

	.daily .high-low {
		font-size: smaller;
		align-items: start;
		justify-content: center;
	}

	.timeline {
		flex-grow: 1;
		height: 90px;
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

	.grid {
		grid-row-gap: 0.1em;
		grid-column-gap: 0.2em;
	}
</style>
