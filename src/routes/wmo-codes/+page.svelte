<script lang="ts">
	import { map } from 'lodash-es';

	import { WMO_CODES } from '$lib/util';
	import { onMount } from 'svelte';

	// Convert Object to array, adding key as `.code` prop.
	const wmoCodes = map(WMO_CODES, (value, code) => ({
		code: Number(code),
		...value,
	}));

	let offsetWidth = $state(0);
	let offsetHeight = $state(0);

	let mode = $state('');

	function onclick() {
		mode = mode === 'tall' ? 'wide' : 'tall';
	}

	onMount(() => {
		mode = offsetWidth > 412 || offsetHeight / offsetWidth < 1.2 ? 'wide' : 'tall';
	});
</script>

<div class="pico container-fluid flex-column {mode}" bind:offsetWidth bind:offsetHeight>
	<center
		><a href="/">Back to WeatherSense</a> |
		<a href="https://blog.leftium.com/2024/07/wmo-codes.html">About this Table</a>
		|
		<button class="outline secondary" {onclick}>Transpose</button></center
	>
	{#if mode}
		<div class="grid-container">
			<div class="wmo-grid">
				{#each wmoCodes as wmo}
					<article
						style:background-color={wmo.color}
						class="wmo-item group-{wmo.group} level-{wmo.level}"
						style:color={wmo.colorText}
						style:text-shadow={`1px 1px ${wmo.colorShadow}`}
					>
						<div class="code">{wmo.code}</div>
						<img src={wmo.icon} alt="" />
						<div class="label">
							{wmo.description}
						</div>
						{wmo.picoColor.replace('.', '-')}
					</article>
				{/each}
				{#each ['No Precipitation', 'Rain', 'Freezing Rain', 'Snow', 'Thunder Storm'] as title, index}
					<article class="divider divider-{index}">{title}</article>
				{/each}

				{#each [...Array(11)] as item}
					<article class="wmo-item ghost-item"></article>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style lang="scss">
	@use '@picocss/pico/scss/colors' as *;

	article {
		padding: 0;
	}

	button {
		padding: 0.4em 0.7em;
		line-height: 0.8;
	}

	.container-fluid {
		height: 100vh;
		padding: 0;
	}

	.grid-container {
		overflow-y: scroll;
	}

	.wmo-grid {
		display: grid;

		justify-content: center;

		flex-grow: 1;

		gap: 0.3em;

		.wmo-item {
			position: relative;

			margin: 0;

			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;

			img {
				width: 50%;
			}
		}

		.ghost-item {
			border: 1px dashed #d4d4d4;
			box-shadow: none;
		}

		.code {
			position: absolute;
			top: 0.3em;
			left: 0.5em;

			font-weight: bold;
		}

		.label {
			font-weight: bold;
			text-align: center;
		}
	}

	.wide {
		.grid-container {
			height: 100%;
			overflow: auto;
			margin: 0 0.4em;
		}

		.wmo-grid {
			width: fit-content;
			margin: auto;

			height: calc(88vh);

			font-size: 0.9em;
			padding-top: 2em;

			grid-template-columns: repeat(4, 3em auto auto auto) 3em;

			align-content: center;
			justify-content: start;
		}

		.wmo-item {
			height: calc(88vh / 3);
			aspect-ratio: 1 / 1.62;
		}

		@media (min-width: 376px) {
			/* CSS rules */
			.wmo-grid {
				height: auto;
			}

			.wmo-item {
				height: 180px;
			}
		}

		.grid-container {
			.level-1 {
				grid-row-start: 1;
			}

			.level-2 {
				grid-row-start: 2;
			}

			.level-3 {
				grid-row-start: 3;
			}

			.divider {
				background-color: $amber-200;
				font-size: 1.2em;
				font-weight: bold;
				margin-bottom: 0;

				padding: 1em 0;

				writing-mode: vertical-lr;
				grid-row: 1 / 4;

				text-align: center;
				margin-left: 1em;
			}

			.divider-0 {
				grid-column-start: 1;
				background-color: $grey-450;
			}

			.group-clear {
				grid-column-start: 2;
			}

			.group-cloudy {
				grid-column-start: 3;
			}

			.group-fog {
				grid-column-start: 4;
			}

			.divider-1 {
				grid-column-start: 5;
				background-color: $blue-550;
			}

			.group-drizzle {
				grid-column-start: 6;
			}

			.group-showers {
				grid-column-start: 7;
			}

			.group-rain {
				grid-column-start: 8;
			}

			.divider-2 {
				grid-column-start: 9;
				background-color: $violet-550;
			}

			.group-icy-drizzle {
				grid-column-start: 10;
			}

			.group-gap {
				grid-column-start: 11;
			}

			.group-icy-rain {
				grid-column-start: 12;
			}

			.divider-3 {
				grid-column-start: 13;
				background-color: $fuchsia-450;
			}

			.group-snow-grains {
				grid-column-start: 14;
			}

			.group-snow-showers {
				grid-column-start: 15;
			}

			.group-snow {
				grid-column-start: 16;
			}

			.divider-4 {
				grid-column-start: 17;
				background-color: $pink-450;
			}

			.group-thunderstorm {
				grid-column-start: 18;
			}
		}
	}

	.tall {
		.wmo-grid {
			grid-template-rows: repeat(5, 4em auto auto auto);
			margin: 1em 0em;
			font-size: 0.8em;
		}

		.wmo-item {
			aspect-ratio: 1 / 1.5;
			width: calc(min(90vw, 400px) / 3);
		}

		.grid-container {
			.level-1 {
				grid-column-start: 1;
			}

			.level-2 {
				grid-column-start: 2;
			}

			.level-3 {
				grid-column-start: 3;
			}

			.divider {
				background-color: $amber-200;
				font-size: 1.2em;
				font-weight: bold;
				margin-bottom: 0;

				grid-column: 1 / 4;

				align-self: end;
				width: 100%;
				height: 2em;
				text-align: center;
				margin-top: 2em;
			}

			.divider-0 {
				grid-row-start: 1;
				background-color: $grey-450;
			}

			.group-clear {
				grid-row-start: 2;
			}

			.group-cloudy {
				grid-row-start: 3;
			}

			.group-fog {
				grid-row-start: 4;
			}

			.divider-1 {
				grid-row-start: 5;
				background-color: $blue-550;
			}

			.group-drizzle {
				grid-row-start: 6;
			}

			.group-showers {
				grid-row-start: 7;
			}

			.group-rain {
				grid-row-start: 8;
			}

			.divider-2 {
				grid-row-start: 9;
				background-color: $violet-550;
			}

			.group-icy-drizzle {
				grid-row-start: 10;
			}

			.group-gap {
				grid-row-start: 11;
			}

			.group-icy-rain {
				grid-row-start: 12;
			}

			.divider-3 {
				grid-row-start: 13;
				background-color: $fuchsia-450;
			}

			.group-snow-grains {
				grid-row-start: 14;
			}

			.group-snow-showers {
				grid-row-start: 15;
			}

			.group-snow {
				grid-row-start: 16;
			}

			.divider-4 {
				grid-row-start: 17;
				background-color: $pink-450;
			}

			.group-thunderstorm {
				grid-row-start: 18;
			}
		}
	}
</style>
