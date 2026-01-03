<script lang="ts">
	import { dev } from '$app/environment';
	import { AQI_INDEX_US, AQI_INDEX_EUROPE } from '$lib/util';
</script>

<div class="container">
	<nav>
		<a href="/">← Back to WeatherSense</a>
	</nav>

	<article>
		<h1>EU AQI</h1>
		<div class="levels">
			{#each AQI_INDEX_EUROPE as aqiLevel}
				<details>
					<!-- svelte-ignore a11y_no_redundant_roles -->
					<summary role="button" style:background-color={aqiLevel.color}>
						<span class="range" style:color={aqiLevel.textColor}>{aqiLevel.range}</span>
						<span class="label" style:color={aqiLevel.textColor}>{aqiLevel.text}</span>
					</summary>
					<div class="description">
						<p>{@html aqiLevel.description}</p>
					</div>
				</details>
			{/each}
		</div>
		<footer>
			Source: <a href="https://airindex.eea.europa.eu/AQI/index.html">
				EEA European Air Quality Index
			</a>
		</footer>
	</article>

	<article>
		<h1>US AQI</h1>
		<div class="levels">
			{#each AQI_INDEX_US as aqiLevel}
				<details>
					<!-- svelte-ignore a11y_no_redundant_roles -->
					<summary role="button" style:background-color={aqiLevel.color}>
						<span class="range" style:color={aqiLevel.textColor}>{aqiLevel.range}</span>
						<span class="label" style:color={aqiLevel.textColor}>{aqiLevel.text}</span>
					</summary>
					<div class="description">
						<p>{@html aqiLevel.description}</p>
					</div>
				</details>
			{/each}
		</div>
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
	@use '../../variables' as *;

	.container {
		padding: 1rem;
	}

	nav {
		margin-bottom: 1.5rem;

		a {
			color: $color-link-hover;
			text-decoration: none;

			&:hover {
				text-decoration: underline;
			}
		}
	}

	article {
		background: $color-ghost-white;
		border-radius: 8px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		color: $color-text-primary;
	}

	.levels {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	details {
		border-radius: 6px;
		overflow: hidden;
	}

	summary {
		display: flex;
		align-items: center;
		padding: 0.75rem 1rem;
		cursor: pointer;
		list-style: none;
		transition: opacity 0.15s;

		&::-webkit-details-marker {
			display: none;
		}

		&:hover {
			opacity: 0.9;
		}

		.range {
			font-weight: bold;
			width: 5em;
			flex-shrink: 0;
		}

		.label {
			flex-grow: 1;
		}
	}

	.description {
		background: $color-ghost-white;
		padding: 1rem;
		border-top: 1px solid $color-border-light;

		p {
			margin: 0;
			font-size: 0.9rem;
			line-height: 1.5;
			color: $color-text-secondary;
		}
	}

	footer {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid $color-border-light;
		font-size: 0.85rem;
		color: $color-text-secondary;

		a {
			color: $color-link-hover;
			text-decoration: none;

			&:hover {
				text-decoration: underline;
			}
		}
	}
</style>
