<script lang="ts">
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import TimeLine from './TimeLine.svelte';

	import DailyTiles from './DailyTiles.svelte';

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
		getSkyGradient,
		getTileGradient,
		getTextColor,
		getTextShadowColor,
	} from '$lib/util.js';
	import RadarMapLibre from './RadarMapLibre.svelte';

	import { clearEvents, getEmitter } from '$lib/emitter.js';
	import { dev } from '$app/environment';
	import { onDestroy } from 'svelte';

	import { FORECAST_DAYS, makeNsWeatherData } from '$lib/ns-weather-data.svelte.js';
	import { slide } from 'svelte/transition';

	const nsWeatherData = makeNsWeatherData();
	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	let { data } = $props();

	let forecastDaysVisible = $state(3);
	let displayDewPoint = $state(true);

	// Find the day that contains the current ms timestamp
	const currentDay = $derived.by(() => {
		const ms = nsWeatherData.ms;
		// Find day where ms falls between start of day and start of next day
		const day = nsWeatherData.daily?.find((d, i, arr) => {
			const nextDay = arr[i + 1];
			if (nextDay) {
				return ms >= d.ms && ms < nextDay.ms;
			}
			// Last day - check if within 24 hours
			return ms >= d.ms && ms < d.ms + 24 * 60 * 60 * 1000;
		});
		// Fallback to today
		return day || nsWeatherData.daily?.find((d) => d.fromToday === 0);
	});

	// Dynamic sky gradient based on current time
	const skyGradient = $derived.by(() => {
		if (currentDay) {
			return getSkyGradient(nsWeatherData.ms, currentDay.sunrise, currentDay.sunset);
		}
		// Default daytime gradient
		return 'linear-gradient(135deg, #eee 0%, #a8d8f0 50%, #6bb3e0 100%)';
	});

	// Tile gradient - similar colors, different angle
	const tileGradient = $derived.by(() => {
		if (currentDay) {
			return getTileGradient(nsWeatherData.ms, currentDay.sunrise, currentDay.sunset);
		}
		// Default daytime gradient for tiles
		return 'linear-gradient(160deg, #6bb3e0 0%, #a8d8f0 50%, #eee 100%)';
	});

	// Dynamic text color for contrast against sky gradient
	const textColor = $derived.by(() => {
		if (currentDay) {
			return getTextColor(nsWeatherData.ms, currentDay.sunrise, currentDay.sunset);
		}
		return '#333'; // Default dark text for daytime
	});

	// Dynamic text shadow color (opposite of text color)
	const textShadowColor = $derived.by(() => {
		if (currentDay) {
			return getTextShadowColor(nsWeatherData.ms, currentDay.sunrise, currentDay.sunset);
		}
		return 'rgba(255, 255, 255, 0.8)'; // Default white shadow for daytime
	});

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
		<a href="wmo-codes">WMO Codes</a> |
		<a href="aqi">AQI Levels</a> |
		<a href="https://blog.leftium.com/2025/05/weathersense.html">About</a>
	</span>
</div>

<div class="pico container sticky-info" style:--sky-gradient={skyGradient} style:color={textColor}>
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
				<input name="temperature" type="checkbox" checked />
				Temp:
			</label>
			<span use:toggleUnits={{ temperature: true }}>
				{nsWeatherData.format('displayTemperature')}
			</span>
		</div>

		<div>
			<label>
				<input type="checkbox" style="--color: {colors.dewPoint}" bind:checked={displayDewPoint} />
				Dew Point:
			</label>
			<span use:toggleUnits={{ temperature: true }}>
				{nsWeatherData.format('displayDewPoint', false)}
			</span>
		</div>

		<div>
			<label>
				<input type="checkbox" checked style="--color: {colors.precipitation}" />
				Precip:
				<span>{nsWeatherData.displayPrecipitation}mm</span>
			</label>
		</div>

		<div>
			<label>
				<input
					type="checkbox"
					checked
					style="--color: {aqiEuropeToLabel(nsWeatherData.displayAqiEurope ?? null).color}"
				/>
				EU AQI:
				<span>{nsWeatherData.displayAqiEurope}</span>
			</label>
		</div>

		<div>
			<label>
				<input type="checkbox" checked style="--color: gray" />
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
				<input type="checkbox" style="--color: {colors.humidity}" />
				Humidity:
				<span>{nsWeatherData.displayHumidity}%</span>
			</label>
		</div>

		<div>
			<label>
				<input type="checkbox" checked style="--color: {colors.precipitationProbability}" />
				Chance:
				<span>{nsWeatherData.displayPrecipitationProbability}%</span>
			</label>
		</div>

		<div>
			<label>
				<input
					type="checkbox"
					checked={false}
					style="--color: {aqiUsToLabel(nsWeatherData.displayAqiUs ?? null).color}"
				/>
				US AQI:
				<span>{nsWeatherData.displayAqiUs}</span>
			</label>
		</div>
	</div>
</div>

<div class="container">
	<div class="scroll">
		<div class="sky-gradient-bg" style:--sky-gradient={skyGradient}></div>
		<DailyTiles
			{nsWeatherData}
			{forecastDaysVisible}
			{skyGradient}
			{tileGradient}
			{textColor}
			{textShadowColor}
			maxForecastDays={FORECAST_DAYS}
			onExpand={() =>
				(forecastDaysVisible =
					forecastDaysVisible === 3 ? 5 : Math.min(forecastDaysVisible * 2, FORECAST_DAYS))}
		/>

		<div class="timeline-grid">
			<div class="hourly-row pico">
				<div class="day-label">
					<div class="day today">
						<img
							class="icon small"
							src={wmoCode(nsWeatherData.displayWeatherCode).icon}
							title={wmoCode(nsWeatherData.displayWeatherCode).description}
							alt=""
						/>
						24hrs
					</div>
					<div class="high-low">
						<span style:color={SOLARIZED_RED} use:toggleUnits={{ temperature: true }}>
							{nsWeatherData.format('daily[2].temperatureMax', false)}
						</span>
						<span style:color={SOLARIZED_BLUE} use:toggleUnits={{ temperature: true }}>
							{nsWeatherData.format('daily[2].temperatureMin', false)}
						</span>
					</div>
				</div>
				<div class="timeline today">
					<TimeLine {nsWeatherData} start={Date.now() - 2 * MS_IN_HOUR} />
				</div>
			</div>

			<div class="map-row">
				<div class="map">
					<RadarMapLibre {nsWeatherData} />
				</div>
			</div>

			{#each (nsWeatherData.daily || []).filter((day) => day.fromToday > -2 && day.fromToday < forecastDaysVisible) as day, index}
				{@const past = day.fromToday < 0}
				{@const today = day.fromToday === 0}
				<div class={['day-row', 'pico', { past }]} transition:slide={{ duration: 1000 }}>
					<div class="day-label">
						<div class={['day', { today }]}>
							<img
								class="icon small"
								src={wmoCode(day.weatherCode).icon}
								title={wmoCode(day.weatherCode).description}
								alt=""
							/>
							{day.compactDate}
						</div>
						<div class="high-low">
							<span style:color={SOLARIZED_RED} use:toggleUnits={{ temperature: true }}
								>{nsWeatherData.format(`daily[${index}].temperatureMax`, false)}</span
							><span style:color={SOLARIZED_BLUE} use:toggleUnits={{ temperature: true }}
								>{nsWeatherData.format(`daily[${index}].temperatureMin`, false)}</span
							>
						</div>
					</div>
					<div class={['timeline', { today }]}>
						<TimeLine
							{nsWeatherData}
							start={day.ms}
							xAxis={day.compactDate == 'Today'}
							ghostTracker={true}
							{past}
						/>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<center class="pico attribution">
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

	.sky-gradient-bg {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 138px; // Covers daily tiles area (tiles are ~130px) plus padding below
		background: var(--sky-gradient, linear-gradient(135deg, #eee 0%, #a8d8f0 50%, #6bb3e0 100%));
		background-attachment: fixed;
		pointer-events: none;
		z-index: -1;
	}

	.sticky-info {
		position: sticky;
		top: 0;
		z-index: 100000;

		background: var(--sky-gradient, linear-gradient(135deg, #eee 0%, #a8d8f0 50%, #6bb3e0 100%));
		background-attachment: fixed;
		padding: 0.2em 0.3em;

		& > div {
			padding-block: $size-1;
		}

		// Force text elements to inherit the dynamic color
		:where(span, div, label, a) {
			color: inherit;
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
	.timeline-grid,
	.hourly-row {
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

		margin-left: $size-1;
	}

	.current .condition {
		display: flex;
		flex-direction: column;

		margin-right: $size-1;

		justify-content: center;
		font-size: large;
		line-height: 1.2;
	}

	.other-measurements {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1fr;
		column-gap: 1em;

		max-width: 40em;
		width: 100%;
		margin: auto;

		input {
			margin: 0;
		}

		label {
			display: inline;
		}

		/*************************************************************************************/
		/*Based on: https://moderncss.dev/pure-css-custom-checkbox-style/ */
		input[type='checkbox'] {
			--linear-color: linear-gradient(var(--color) 0 0);
			--linear-white: linear-gradient(white 0 0);

			transform: translateY(-0.06em);

			display: inline-grid;
			place-content: center;

			&::before {
				width: inherit;
				height: inherit;

				transform: scale(1);
				transition: 250ms transform ease-in-out;
			}

			&:checked::before {
				transform: scale(0);
			}

			&::before,
			&::after {
				grid-row: 1;
				grid-column: 1;

				content: '';
				border-radius: inherit;

				border: calc(var(--pico-border-radius) / 2) solid transparent;
				background-origin: border-box;
				background-clip: padding-box, border-box;

				background-image: var(--linear-white), var(--linear-color);
			}

			&::after {
				background-image: var(--linear-color), var(--linear-color);
			}

			/*************************************************************************************/

			&[name='temperature'] {
				--gradient: linear-gradient(20deg, blue 20%, red 85%);

				&::before {
					background-image: var(--linear-white), var(--gradient);
				}

				&::after {
					background-image: var(--gradient), var(--gradient);
				}
			}
		}
	}

	@media (width < 768px) {
		.other-measurements {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: 1fr 1fr 1fr 1fr;
			grid-auto-flow: column;

			max-width: 20em;
		}
	}

	// Parent grid container for hourly, map, and daily sections
	.timeline-grid {
		display: grid;
		grid-template-columns: auto auto 1fr;
		grid-row-gap: 0.1em;
		grid-column-gap: 0.2em;
		margin-bottom: 0.2em;
		background: white; // Cover the gradient below daily tiles
	}

	// Hourly row (24hrs) - spans all columns, uses subgrid
	.hourly-row {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: center;
		font-family: Lato, sans-serif;
		margin-top: 0.2em;
		margin-bottom: 0.5em;

		.day-label {
			grid-column: span 2;
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			justify-content: center;
		}

		.timeline {
			grid-column: 3;
		}

		div.day {
			margin: 0 0.1em;
			text-align: right;
		}
	}

	// Map row - spans all columns, map goes in timeline column
	.map-row {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;

		> .map {
			grid-column: 3;
		}
	}

	// Daily rows - span all columns, use subgrid
	.day-row {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		position: relative;
		align-items: center;

		&.past::after {
			content: '';
			position: absolute;
			inset: 0;
			background: white;
			opacity: 0.5;
			pointer-events: none;
			z-index: 10;
		}

		div.day {
			margin: 0 0.1em;
			text-align: right;
		}

		// Daily section uses subgrid for aligned temps
		.day-label {
			display: grid;
			grid-template-columns: subgrid;
			grid-column: span 2;

			.day {
				grid-column: span 2;
			}

			.high-low {
				display: grid;
				grid-template-columns: subgrid;
				grid-column: span 2;

				span {
					text-align: right;
				}
			}
		}
	}

	.day.today {
		font-weight: bold;
	}

	// Shared .day and .high-low styles
	.day-label {
		overflow: visible;

		.day {
			position: relative;
			z-index: 1;
			text-shadow:
				-1px -1px 0 rgba(255, 255, 255, 0.8),
				1px -1px 0 rgba(255, 255, 255, 0.8),
				-1px 1px 0 rgba(255, 255, 255, 0.8),
				1px 1px 0 rgba(255, 255, 255, 0.8);

			.icon.small {
				position: absolute;
				right: -20px;
				top: 50%;
				transform: translateY(-50%);
				z-index: -1;
				height: 40px;
				width: 40px;
				filter: drop-shadow(0 0 10px rgba(135, 206, 235, 0.8));
			}
		}

		.high-low {
			font-size: smaller;
			text-shadow:
				-1px -1px 0 rgba(255, 255, 255, 0.8),
				1px -1px 0 rgba(255, 255, 255, 0.8),
				-1px 1px 0 rgba(255, 255, 255, 0.8),
				1px 1px 0 rgba(255, 255, 255, 0.8);
		}
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

	.map-row .map {
		height: 368px;
	}

	.container {
		display: grid;
	}

	.scroll {
		overflow: auto;
		position: relative;
	}

	.attribution {
		margin-block: 1.5em;
	}

	.debug {
		margin-top: 1em;
		overflow-x: scroll;
	}

	@media (max-width: 768px) {
		.map-row .map {
			height: 290px;
		}
	}

	@media (max-height: 500px) and (orientation: landscape) {
		.sticky-info {
			display: none;
		}
	}

	.small-buttons button {
		padding: 0.25em 0.5em;
		font-size: 0.85em;
	}
</style>
