<script lang="ts">
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import TimeLine from './TimeLine.svelte';

	import {
		MS_IN_HOUR,
		SOLARIZED_BLUE,
		SOLARIZED_RED,
		jsonPretty,
		summarize,
		humanDistance,
		objectFromMap,
		wmoCode,
		colors,
	} from '$lib/util.js';
	import RadarMap from './RadarMap.svelte';

	import { clearEvents, getEmitter } from '$lib/emitter.js';
	import { dev } from '$app/environment';
	import { onDestroy } from 'svelte';

	import { makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';

	const nsWeatherData = makeNsWeatherData();
	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	let { data } = $props();

	let displayDewPoint = $state(false);

	emit('weatherdata_requestedSetLocation', {
		source: data.source,
		name: data.name,
		coords: data.coords,
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
			},
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
	<div class="current">
		<div class="time">
			<div>{nsWeatherData.tzFormat(nsWeatherData.ms, 'ddd MMM D')}</div>
			<div>
				{nsWeatherData.tzFormat(nsWeatherData.ms, 'h:mma')}
				<span class="timezone">{nsWeatherData.timezoneAbbreviation}</span>
			</div>
		</div>

		<img class="icon" src={wmoCode(nsWeatherData.displayWeatherCode).icon} alt="" />

		<div class="condition">
			<span>{wmoCode(nsWeatherData.displayWeatherCode).description}</span>
		</div>
	</div>

	<div class="other-measurements">
		<div>
			<label>
				<input
					type="checkbox"
					style:background-color={colors.temperature}
					style:border-color={colors.temperature}
				/>
				Temp:
			</label>
			<span use:toggleUnits={{ temperature: true }}>
				{nsWeatherData.format('displayTemperature')}
			</span>
		</div>
		<div>
			<label>
				<input type="checkbox" />
				H|L:
				<span use:toggleUnits={{ temperature: true }}>
					{nsWeatherData.format('daily[2].temperatureMax', false)}
				</span>|<span use:toggleUnits={{ temperature: true }}>
					{nsWeatherData.format('daily[2].temperatureMin', false)}
				</span>
			</label>
		</div>
		<div>
			<label>
				<input
					type="checkbox"
					style:background-color={colors.dewPoint}
					style:border-color={colors.dewPoint}
					bind:checked={displayDewPoint}
				/>
				Dew Point:
			</label>
			<span use:toggleUnits={{ temperature: true }}>
				{nsWeatherData.format('displayDewPoint', false)}
			</span>
		</div>
		<div>
			<label>
				<input
					type="checkbox"
					style:background-color={'white' || colors.humidity}
					style:border-color={colors.humidity}
				/>
				Humidity:
				<span>{nsWeatherData.displayHumidity}%</span>
			</label>
		</div>

		<div>
			<label>
				<input
					type="checkbox"
					style:background-color={colors.precipitation}
					style:border-color={colors.precipitation}
				/>
				Precip:
				<span>{nsWeatherData.displayPrecipitation}mm</span>
			</label>
		</div>
		<div>
			<label>
				<input
					type="checkbox"
					style:background-color={colors.precipitationProbability}
					style:border-color={colors.precipitationProbability}
				/>
				Chance:
				<span>{nsWeatherData.displayPrecipitationProbability}%</span>
			</label>
		</div>
	</div>
</div>

<div class="container">
	<div class="scroll">
		<div class="hourly pico">
			<b>Next 24 hours</b>
			<TimeLine {nsWeatherData} start={Date.now() - 2 * MS_IN_HOUR} />
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
							{day.compactDate}
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
						start={day.ms}
						xAxis={day.compactDate == 'Today'}
						ghostTracker={true}
					/>
				</div>
			{/each}
		</div>
	</div>

	{#if dev}
		<div class="pico debug">
			<pre>nsWeatherData.ms = {nsWeatherData.ms} ({nsWeatherData.tzFormat(nsWeatherData.ms)})</pre>
			<pre>nsWeatherData.data = {jsonPretty(summarize(objectFromMap(nsWeatherData.data)))}</pre>

			<pre>nsWeatherData.current = {jsonPretty(nsWeatherData.current)}</pre>
			<pre>nsWeatherData.hourly = {jsonPretty(summarize(nsWeatherData.hourly))}</pre>
			<pre>nsWeatherData.daily = {jsonPretty(summarize(nsWeatherData.daily))}</pre>
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
		margin: 0 0.5em;
		height: 64px;
	}

	.current .time {
		width: 100%;

		text-align: right;
	}

	.current .condition {
		display: flex;
		flex-direction: column;
		justify-content: center;
		font-size: large;
		line-height: 1.2;
	}

	.current .condition span {
		padding-right: 0.3em;
	}

	.other-measurements {
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: 1em;

		width: 100%;
		max-width: 20em;
		margin: auto;
		margin-bottom: 0.2em;
	}

	.other-measurements input {
		margin: 0;
	}

	.other-measurements label {
		display: inline;
	}

	.hourly,
	.daily {
		font-family: Lato, sans-serif;
		margin-top: 0.2em;
		margin-bottom: 1.5em;
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
