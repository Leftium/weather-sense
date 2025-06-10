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
		aqiUsToLabel,
		aqiEuropeToLabel,
	} from '$lib/util.js';
	import RadarMap from './RadarMap.svelte';

	import { clearEvents, getEmitter } from '$lib/emitter.js';
	import { dev } from '$app/environment';
	import { onDestroy } from 'svelte';

	import { makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';

	const nsWeatherData = makeNsWeatherData();
	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	let { data } = $props();

	let displayDewPoint = $state(true);

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
	<span>
		<b>WeatherSense</b>
		<a href="https://blog.leftium.com/2025/05/weathersense.html">About this app</a> |
		<a href="wmo-codes">WMO Codes</a>
	</span>
</div>

<div class="pico container sticky-info">
	<div class="name">
		{nsWeatherData.name}
		<span class="accuracy"
			>({humanDistance(nsWeatherData.coords?.accuracy) || nsWeatherData.source})</span
		>
	</div>
	<div class="current">
		<div class="condition">
			<span>{wmoCode(nsWeatherData.displayWeatherCode).description}</span>
		</div>

		<img class="icon" src={wmoCode(nsWeatherData.displayWeatherCode).icon} alt="" />

		<div class="time">
			<div>{nsWeatherData.tzFormat(nsWeatherData.ms, 'ddd MMM D')}</div>
			<div>
				{nsWeatherData.tzFormat(nsWeatherData.ms, 'hh:mma')}
				<span class="timezone">{nsWeatherData.timezoneAbbreviation}</span>
			</div>
		</div>
	</div>

	<div class="other-measurements">
		<div>
			<label>
				<input type="checkbox" style:color="black" style:border-color="black" checked />
				Temp:
			</label>
			<span use:toggleUnits={{ temperature: true }}>
				{nsWeatherData.format('displayTemperature')}
			</span>
		</div>

		<div>
			<label>
				<input
					type="checkbox"
					style:color={colors.dewPoint}
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
					checked
					style:color={colors.precipitation}
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
					checked
					style:color={aqiEuropeToLabel(nsWeatherData.displayAqiEurope ?? 0).color}
					style:border-color={aqiEuropeToLabel(nsWeatherData.displayAqiEurope ?? 0).color}
				/>
				EU AQI:
				<span>{nsWeatherData.displayAqiEurope}</span>
			</label>
		</div>

		<div>
			<label>
				<input type="checkbox" checked style:color="gray" />
			</label>
			<span use:toggleUnits={{ temperature: true }}>
				{nsWeatherData.format('daily[2].temperatureMin', false)}
			</span>
			to
			<span use:toggleUnits={{ temperature: true }}>
				{nsWeatherData.format('daily[2].temperatureMax', false)}
			</span>
		</div>

		<div>
			<label>
				<input type="checkbox" style:color={colors.humidity} style:border-color={colors.humidity} />
				Humidity:
				<span>{nsWeatherData.displayHumidity}%</span>
			</label>
		</div>

		<div>
			<label>
				<input
					type="checkbox"
					checked
					style:color={colors.precipitationProbability}
					style:border-color={colors.precipitationProbability}
				/>
				Chance:
				<span>{nsWeatherData.displayPrecipitationProbability}%</span>
			</label>
		</div>

		<div>
			<label>
				<input
					type="checkbox"
					checked={false}
					style:color={aqiUsToLabel(nsWeatherData.displayAqiUs ?? 0).color}
					style:border-color={aqiUsToLabel(nsWeatherData.displayAqiUs ?? 0).color}
				/>
				US AQI:
				<span>{nsWeatherData.displayAqiUs}</span>
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
			<RadarMap {nsWeatherData} mapStyle={data.mapStyle} />
		</div>

		<div class="daily grid pico">
			{#each nsWeatherData.daily || [] as day, index}
				{@const past = day.fromToday < 0}
				{@const today = day.fromToday === 0}
				<div class="grid day-label">
					<div class="grid icon-date">
						<img
							class="icon small"
							src={wmoCode(day.weatherCode).icon}
							title={wmoCode(day.weatherCode).description}
							alt=""
							class:past
						/>
						<div class={['day', { past, today }]}>
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
				<div class={['timeline', { today }]}>
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

	<center class="pico">
		<div>
			Weather/AQI/geocoding by <a href="https://open-meteo.com/">Open-Meteo.com</a>
		</div>
		<div>Reverse geocoding by <a href="https://openweathermap.org/">OpenWeather</a></div>
	</center>

	{#if dev}
		<div class="pico debug">
			<pre>nsWeatherData.ms = {nsWeatherData.ms} ({nsWeatherData.tzFormat(nsWeatherData.ms)})</pre>
			<pre>nsWeatherData.dataAirQuality = {jsonPretty(
					summarize(objectFromMap(nsWeatherData.dataAirQuality)),
				)}</pre>

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

<style lang="scss">
	@use 'open-props-scss' as *;

	.sticky-info {
		position: sticky;
		top: 0;
		z-index: 10000;

		background-color: var(--pico-background-color);

		background-color: #eee;
		padding: 0.2em 0.3em;
		border-bottom-left-radius: 4.75px;
		border-bottom-right-radius: 4.75px;

		& > div {
			padding-block: $size-1;
		}
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

		line-height: 1.3;
	}

	.current > div:first-child {
		justify-self: end;
	}

	.current .icon {
		margin: 0 0.2em;
		height: 49px;
	}

	.current .time {
		width: 100%;

		text-align: left;
	}

	.current .condition {
		display: flex;
		flex-direction: column;
		justify-content: center;
		font-size: large;
		line-height: 1.2;
	}

	.other-measurements {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1fr;
		column-gap: 1em;

		max-width: 36em;
		width: 100%;
		margin: auto;
	}

	@media (width < 768px) {
		.other-measurements {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: 1fr 1fr 1fr 1fr;
			grid-auto-flow: column;

			max-width: 18em;
		}
	}

	.other-measurements input {
		margin: 0;
	}

	.other-measurements label {
		display: inline;
	}

	/*************************************************************************************/
	/*Based on: https://moderncss.dev/pure-css-custom-checkbox-style/ */
	.other-measurements input[type='checkbox'] {
		appearance: none;
		/* For iOS < 15 to remove gradient background */
		background-color: #fff !important;
		/* Not removed via appearance */
		margin: 0;

		font: inherit;
		width: 1.2em;
		height: 1.2em;

		transform: translateY(-0.12em);

		display: inline-grid;
		place-content: center;
	}

	.other-measurements input[type='checkbox']::before {
		content: '';
		width: inherit;
		height: inherit;
		border-radius: inherit;

		transform: scale(0);
		transition: 200ms transform ease-in-out;

		box-shadow: inset 2em 2em;
	}

	.other-measurements input[type='checkbox']:checked::before {
		transform: scale(1);
	}

	/*************************************************************************************/

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

	.daily .day.today {
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
		height: calc(64px + $size-3);

		&.today {
			height: calc(104px + $size-3);
		}
	}

	.name {
		font-weight: bold;
	}

	.accuracy {
		font-size: small;
		opacity: 60%;
	}

	.map {
		height: 320px;
	}

	.container {
		display: grid;
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
			height: 240px;
		}
	}

	.grid {
		grid-row-gap: 0.1em;
		grid-column-gap: 0.2em;
	}
</style>
