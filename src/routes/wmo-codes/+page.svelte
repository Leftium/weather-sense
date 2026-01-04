<script lang="ts">
	import { map } from 'lodash-es';

	import { WMO_CODES, getGoogleV2Icon, hasUniqueNightIcon, getGoogleV1Icon } from '$lib/util';
	import { onMount } from 'svelte';

	// Convert Object to array, adding key as `.code` prop.
	const wmoCodesBase = map(WMO_CODES, (value, code) => {
		const codeNum = Number(code);
		const hasUniqueNight = hasUniqueNightIcon(codeNum);
		return {
			code: codeNum,
			...value,
			hasUniqueNight,
			airyIcon: value.icon,
			// Day grid: use v2 day if unique day/night, otherwise v1 day
			googleDayIcon: hasUniqueNight
				? getGoogleV2Icon(codeNum, true)
				: getGoogleV1Icon(codeNum, true),
			// Night grid: use v2 night if unique day/night, otherwise v1 night
			googleNightIcon: hasUniqueNight
				? getGoogleV2Icon(codeNum, false)
				: getGoogleV1Icon(codeNum, false),
		};
	});

	// Compute displayed icon based on current selections
	const wmoCodes = $derived(
		wmoCodesBase.map((wmo) => ({
			...wmo,
			displayIcon:
				iconSet === 'airy' ? wmo.airyIcon : isNight ? wmo.googleNightIcon : wmo.googleDayIcon,
		})),
	);

	let offsetWidth = $state(0);
	let offsetHeight = $state(0);

	let mode = $state('');
	let iconSet = $state<'airy' | 'google'>('google');
	let isNight = $state(false);

	function toggleMode() {
		mode = mode === 'tall' ? 'wide' : 'tall';
	}

	function toggleIconSet() {
		iconSet = iconSet === 'airy' ? 'google' : 'airy';
	}

	function toggleTime() {
		isNight = !isNight;
	}

	onMount(() => {
		mode = offsetWidth > 600 || offsetHeight / offsetWidth < 1.2 ? 'wide' : 'tall';
	});
</script>

<div class="container-fluid flex-column {mode}" bind:offsetWidth bind:offsetHeight>
	<nav>
		<a href="/">← Back</a>
		<span class="separator">|</span>
		<a href="https://blog.leftium.com/2024/07/wmo-codes.html">About</a>
		<span class="separator">|</span>
		<button onclick={toggleIconSet}>{iconSet === 'airy' ? 'Airy' : 'Google'}</button>
		<button onclick={toggleTime} disabled={iconSet === 'airy'}>{isNight ? 'Night' : 'Day'}</button>
		<button onclick={toggleMode}>Transpose</button>
	</nav>
	{#if mode}
		<div class="grids-wrapper">
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
							<img src={wmo.displayIcon} alt="" />
							<div class="label">
								{wmo.description}
							</div>
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
		</div>
	{/if}
</div>

<style lang="scss">
	@use 'sass:color';
	@use '../../variables' as *;

	// Color values for dividers
	$amber-200: #ffbf00;
	$grey-450: #808080;
	$blue-550: #2060df;
	$violet-550: #8352c5;
	$fuchsia-450: #ed2aac;
	$pink-450: #f42c6f;

	.grids-wrapper {
		overflow-y: auto;
		flex: 1;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 0.5em;
		padding: 0.75rem 1rem;
		background: $color-ghost-white;
		border-bottom: 1px solid $color-border-light;

		a {
			color: $color-link-hover;
			text-decoration: none;

			&:hover {
				text-decoration: underline;
			}
		}

		.separator {
			color: $color-border-light;
		}

		button:disabled {
			opacity: 0.4;
			cursor: not-allowed;
		}
	}

	button {
		padding: 0.4em 0.8em;
		font-size: 0.9em;
		background: $color-link-hover;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.15s;

		&:hover {
			background: color.adjust($color-link-hover, $lightness: -10%);
		}
	}

	.container-fluid {
		height: 100vh;
		max-width: none;
		padding: 0;
		background: $color-ghost-white;
	}

	.grid-container {
		// overflow handled by .grids-wrapper
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
			border-radius: 6px;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);

			img {
				width: 50%;
			}
		}

		.ghost-item {
			border: 1px dashed #d4d4d4;
			box-shadow: none;
			background: transparent;
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
			padding: 0 0.25em;
			font-size: 0.85em;
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
				color: white;
				border-radius: 6px;
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
				color: white;
				border-radius: 6px;
				display: flex;
				align-items: center;
				justify-content: center;
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
