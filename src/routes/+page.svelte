<script lang="ts">
	import type { WeatherDataEvents } from '$lib/ns-weather-data.svelte.js';

	import timeline from '$lib/merry-timeline';

	import TimeLine from './TimeLine.svelte';

	import { humanDistance, tsToTime, wmoCode } from '$lib/util.js';
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

	$effect(function () {
		const merryDataPrev24 = nsWeatherData.prev24?.map(makeMerryData) || [];
		const merryDataNext24 = nsWeatherData.next24?.map(makeMerryData) || [];
		const merryData48 = [...merryDataPrev24, ...merryDataNext24];
		const options = { _timezone: 'America/Chicago' };

		timeline(merryTimelinePrev24Div, merryDataPrev24, options);
		timeline(merryTimelineNext24Div, merryDataNext24, options);
		timeline(merryTimeline48Div, merryData48, options);
	});
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
				{nsWeatherData.format('current.temperature')}
			</div>
		</div>
		<img class="icon" src={wmoCode(nsWeatherData.current?.weatherCode).icon} alt="" />
		<div>
			<div class="condition">
				<span>{wmoCode(nsWeatherData.current?.weatherCode).description}</span>
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
		<span><b>Humidity:</b>{nsWeatherData.current?.humidity}%</span>
		<span><b>Precipitation:</b>{nsWeatherData.current?.precipitation}mm</span>
	</div>
</div>

<div class="container">
	<div class="scroll">
		<div class="map">
			<RadarMap {nsWeatherData} />
		</div>

		<div class="hourly pico">
			<article>
				<TimeLine {nsWeatherData} />
				<div bind:this={merryTimelinePrev24Div} class="past"></div>
				<div bind:this={merryTimelineNext24Div}></div>
				<div bind:this={merryTimeline48Div}></div>
			</article>
		</div>

		<div class="daily pico">
			{#each nsWeatherData.daily || [] as day, index}
				<article class="flex" class:today={day.fromToday === 0} class:past={day.fromToday < 0}>
					<div>
						<img
							class="icon small"
							src={wmoCode(day.weatherCode).icon}
							title={wmoCode(day.weatherCode).description}
							alt=""
						/>
					</div>
					<div>{day.timeCompact}</div>
					<div class="condition">
						<span></span>
					</div>
				</article>
			{/each}
		</div>
	</div>

	<div class="pico debug">
		<pre>nsWeatherData.current = {`${JSON.stringify(nsWeatherData.current, null, 4)}`}</pre>
		<pre>nsWeatherData.hourly = {`${JSON.stringify(nsWeatherData.hourly, null, 4)}`}</pre>
		<pre>nsWeatherData.daily = {`${JSON.stringify(nsWeatherData.daily, null, 4)}`}</pre>
		<pre>nsWeatherData = {`${JSON.stringify(nsWeatherData, null, 4)}`}</pre>
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
		overflow-x: scroll;
	}

	@media (max-width: 768px) {
		.map {
			height: 220px;
		}
	}
</style>
