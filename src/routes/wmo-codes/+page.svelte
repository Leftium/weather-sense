<script lang="ts">
	import _ from 'lodash-es';

	import { WMO_CODES } from '$lib/util';
	import { onMount } from 'svelte';

	// Convert Object to array, adding key as `.code` prop.
	const wmoCodes = _.map(WMO_CODES, (value, code) => ({
		code: Number(code),
		...value,
	}));

	let offsetWidth = 0;
	let offsetHeight = 0;

	let mode = '';

	function onclick() {
		mode = mode === 'tall' ? 'wide' : 'tall';
	}

	onMount(() => {
		mode = offsetWidth > 412 || offsetHeight / offsetWidth >= 1.2 ? 'wide' : 'tall';
	});
</script>

<div class="pico container-fluid flex-column {mode}" bind:offsetWidth bind:offsetHeight>
	<center
		><a href="/">Back to WeatherSense</a>
		<button {onclick}>Transpose</button></center
	>

	{#if mode}
		<div class="grid-container">
			<div class="wmo-grid">
				{#each wmoCodes as wmo}
					<article
						style:background-color={wmo.color}
						class="wmo-item group-{wmo.group} level-{wmo.level}"
						class:is-dark-text={wmo.isDarkText}
					>
						<div class="code">{wmo.code}</div>
						<img src={wmo.icon} alt="" />
						<div class="label">
							{wmo.description}
						</div>
						{wmo.picoColor.replace('.', '-')}
					</article>
				{/each}
				<article class="invisible wmo-item group-gap level-2"></article>
				<article class="invisible divider-1 level-2"></article>
				<article class="invisible divider-2 level-2"></article>
				<article class="invisible divider-3 level-2"></article>
				<article class="invisible divider-4 level-2"></article>
			</div>
		</div>
	{/if}
</div>

<style>
	.invisible {
		visibility: hidden;
		margin-bottom: 0;
	}

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

		color: #fff;
		text-shadow: 1px 1px rgb(0 0 0 / 50%);

		.is-dark-text {
			color: #333;
			text-shadow: 1px 1px rgb(255 255 255 / 50%);
		}

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

			grid-template-columns: repeat(4, auto auto auto 4em);

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

			.group-clear {
				grid-column-start: 1;
			}

			.group-cloudy {
				grid-column-start: 2;
			}

			.group-fog {
				grid-column-start: 3;
			}

			.divider-1 {
				grid-column-start: 4;
			}

			.group-drizzle {
				grid-column-start: 5;
			}

			.group-showers {
				grid-column-start: 6;
			}

			.group-rain {
				grid-column-start: 7;
			}

			.divider-2 {
				grid-column-start: 8;
			}

			.group-icy-drizzle {
				grid-column-start: 9;
			}

			.group-gap {
				grid-column-start: 10;
			}

			.group-icy-rain {
				grid-column-start: 11;
			}

			.divider-3 {
				grid-column-start: 12;
			}

			.group-snow-grains {
				grid-column-start: 13;
			}

			.group-snow-showers {
				grid-column-start: 14;
			}

			.group-snow {
				grid-column-start: 15;
			}

			.divider-4 {
				grid-column-start: 16;
			}

			.group-thunderstorm {
				grid-column-start: 17;
			}
		}
	}

	.tall {
		.grid-container {
			margin-bottom: 2em;
		}

		.wmo-grid {
			grid-template-rows: repeat(4, auto auto auto 4em);
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

			.group-clear {
				grid-row-start: 1;
			}

			.group-cloudy {
				grid-row-start: 2;
			}

			.group-fog {
				grid-row-start: 3;
			}

			.divider-1 {
				grid-row-start: 4;
			}

			.group-drizzle {
				grid-row-start: 5;
			}

			.group-showers {
				grid-row-start: 6;
			}

			.group-rain {
				grid-row-start: 7;
			}

			.divider-2 {
				grid-row-start: 8;
			}

			.group-icy-drizzle {
				grid-row-start: 9;
			}

			.group-gap {
				grid-row-start: 10;
			}

			.group-icy-rain {
				grid-row-start: 11;
			}

			.divider-3 {
				grid-row-start: 12;
			}

			.group-snow-grains {
				grid-row-start: 13;
			}

			.group-snow-showers {
				grid-row-start: 14;
			}

			.group-snow {
				grid-row-start: 15;
			}

			.divider-4 {
				grid-row-start: 16;
			}

			.group-thunderstorm {
				grid-row-start: 17;
			}
		}
	}
</style>
