<script lang="ts">
	import { dev } from '$app/environment';
	import { AQI_INDEX_US, AQI_INDEX_EUROPE } from '$lib/util';
</script>

<div class="pico container">
	<center>
		<a href="/">Back to WeatherSense</a>
	</center>

	<article>
		<header><h1>EU AQI</h1></header>
		{#each AQI_INDEX_EUROPE as aqiLevel}
			<details>
				<!-- svelte-ignore a11y_no_redundant_roles -->
				<summary role="button" style:background-color={aqiLevel.color}>
					<span style:color={aqiLevel.textColor}>{aqiLevel.range}</span>
					<span style:color={aqiLevel.textColor}>{aqiLevel.text}</span>
				</summary>
				<p>{@html aqiLevel.description}</p>
			</details>
		{/each}
		<footer>
			Source: <a href="https://airindex.eea.europa.eu/AQI/index.html">
				EEA European Air Quality Index
			</a>
		</footer>
	</article>

	<article>
		<header><h1>US AQI</h1></header>
		{#each AQI_INDEX_US as aqiLevel}
			<details>
				<!-- svelte-ignore a11y_no_redundant_roles -->
				<summary role="button" style:background-color={aqiLevel.color}>
					<span style:color={aqiLevel.textColor}>{aqiLevel.range}</span>
					<span style:color={aqiLevel.textColor}>{aqiLevel.text}</span>
				</summary>
				<p>{@html aqiLevel.description}</p>
			</details>
		{/each}
		<footer>
			Source: <a href="https://www.airnow.gov/aqi/aqi-basics/">Air Quality Index (AQI) Basics</a>
		</footer>
	</article>

	{#if dev}
		<div hidden>
			<pre>AQI_INDEX_EUROPE = {JSON.stringify(AQI_INDEX_EUROPE, null, 4)}</pre>
			<pre>AQI_INDEX_US = {JSON.stringify(AQI_INDEX_US, null, 4)}</pre>
		</div>
	{/if}
</div>

<style lang="scss">
	@use '@picocss/pico/scss/colors' as *;

	summary {
		span:first-child {
			display: inline-block;
			width: 5em;
			font-weight: bold;
		}
	}
</style>
