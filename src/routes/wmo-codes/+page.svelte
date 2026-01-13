<script lang="ts">
	import { map } from 'lodash-es';

	import {
		WMO_CODES,
		getGoogleV2Icon,
		hasUniqueNightIcon,
		getGoogleV1Icon,
		getCloudGradientCSS,
		getCloudGradient,
		getContrastColors,
	} from '$lib/util';
	import { iconSetStore } from '$lib/iconSet.svelte';
	import { wmoGradientStore } from '$lib/wmoGradient.svelte';
	import { onMount } from 'svelte';

	let offsetWidth = $state(0);
	let offsetHeight = $state(0);

	let mounted = $state(false);
	let isVertical = $state(false);
	let isNight = $state(false);

	// mode is derived from isVertical: 'tall' = vertical, 'wide' = horizontal
	const mode = $derived(isVertical ? 'tall' : 'wide');

	// Helper to create CSS gradient from [dark, mid, light] array
	// 135deg = top-left to bottom-right (dark at top-left, light at bottom-right)
	function makePrecipGradient(colors: string[]): string {
		const [dark, mid, light] = colors;
		return `linear-gradient(135deg, ${dark} 0%, ${dark} 15%, ${mid} 50%, ${light} 85%, ${light} 100%)`;
	}

	// Convert Object to array, adding key as `.code` prop.
	const wmoCodesBase = map(WMO_CODES, (value, code) => {
		const codeNum = Number(code);
		const hasUniqueNight = hasUniqueNightIcon(codeNum);
		const isSky = codeNum <= 3;
		const isFog = codeNum === 45 || codeNum === 48;
		const gradientColors = isSky || isFog ? getCloudGradient(codeNum) : value.gradient;
		const midColor = gradientColors[1];
		const { fillText, fillShadow } = getContrastColors(midColor);
		// Sky: 315deg (light at top), Fog/Precip: 135deg (dark at top)
		const getGradientBackground = () => {
			if (isSky) return getCloudGradientCSS(codeNum); // 315deg default
			if (isFog) return getCloudGradientCSS(codeNum, 135); // inverted
			return makePrecipGradient(value.gradient); // 135deg
		};
		return {
			code: codeNum,
			...value,
			hasUniqueNight,
			airyIcon: value.icon,
			gradientBackground: getGradientBackground(),
			solidBackground: midColor,
			// Text colors based on gradient middle color
			textColor: fillText,
			shadowColor: fillShadow,
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

	// Compute displayed icon and background based on current selections
	const wmoCodes = $derived(
		wmoCodesBase.map((wmo) => ({
			...wmo,
			displayIcon:
				iconSetStore.value === 'airy'
					? wmo.airyIcon
					: isNight
						? wmo.googleNightIcon
						: wmo.googleDayIcon,
			background: wmoGradientStore.value ? wmo.gradientBackground : wmo.solidBackground,
		})),
	);

	onMount(() => {
		// Default to vertical on narrow/tall screens
		isVertical = !(offsetWidth > 600 || offsetHeight / offsetWidth < 1.2);
		mounted = true;
	});

	// Divider colors with contrast text
	const dividerColors = [
		{ bg: '#a8d8f0', ...getContrastColors('#a8d8f0') }, // No Precipitation (sky-clear)
		{ bg: '#047878', ...getContrastColors('#047878') }, // Rain (cyan)
		{ bg: '#5a6aad', ...getContrastColors('#5a6aad') }, // Freezing Rain (periwinkle)
		{ bg: '#ed2aac', ...getContrastColors('#ed2aac') }, // Snow (fuchsia)
		{ bg: '#f42c6f', ...getContrastColors('#f42c6f') }, // Thunder Storm (pink)
	];
</script>

<div class="container-fluid flex-column {mode}" bind:offsetWidth bind:offsetHeight>
	<nav>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/">← Back</a>
		<span class="separator">|</span>
		<a href="https://blog.leftium.com/2024/07/wmo-codes.html">About</a>
		<span class="separator">|</span>
		<button onclick={iconSetStore.toggle}
			>{iconSetStore.value === 'airy' ? 'Airy' : 'Google'}</button
		>
		<label><input type="checkbox" bind:checked={wmoGradientStore.value} /> Gradient</label>
		<span class="separator">|</span>
		<span class="nowrap ephemeral-group">
			<label class="ephemeral" class:disabled={iconSetStore.value === 'airy'}
				><input type="checkbox" bind:checked={isNight} disabled={iconSetStore.value === 'airy'} /> Night</label
			>
			<label class="ephemeral"><input type="checkbox" bind:checked={isVertical} /> Vertical</label>
		</span>
	</nav>
	{#if mounted}
		<div class="grids-wrapper">
			<div class="grid-container">
				<div class="wmo-grid">
					{#each wmoCodes as wmo (wmo.code)}
						<article
							style:background={wmo.background}
							class="wmo-item group-{wmo.group} level-{wmo.level}"
							style:color={wmo.textColor}
							style:text-shadow={`1px 1px ${wmo.shadowColor}`}
						>
							<div class="code">{wmo.code}</div>
							<img src={wmo.displayIcon} alt="" />
							<div class="label">
								{wmo.description}
							</div>
						</article>
					{/each}
					{#each ['No Precipitation', 'Rain', 'Freezing Rain', 'Snow', 'Thunder Storm'] as title, index (title)}
						<article
							class="divider divider-{index}"
							style:background-color={dividerColors[index].bg}
							style:color={dividerColors[index].fillText}
							style:text-shadow={`1px 1px ${dividerColors[index].fillShadow}`}
						>
							{title}
						</article>
					{/each}

					{#each Array.from({ length: 11 }, (_, i) => i) as i (i)}
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

		label.disabled {
			opacity: 0.4;
			cursor: not-allowed;
		}

		.ephemeral {
			font-style: italic;
		}

		.nowrap {
			white-space: nowrap;
		}

		.ephemeral-group {
			display: inline-flex;
			gap: 0.5em;
		}
	}

	button {
		padding: 0.15em 0.35em;
		font-size: 0.85em;
		background: $color-link-hover;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.15s;
		min-width: 4.5em;
		text-align: center;

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
				filter: drop-shadow(0 0 3px rgba(128, 128, 128, 0.6))
					drop-shadow(0 0 6px rgba(128, 128, 128, 0.4))
					drop-shadow(0 0 12px rgba(128, 128, 128, 0.3));
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
				font-size: 1.2em;
				font-weight: bold;
				margin-bottom: 0;
				padding: 1em 0;
				writing-mode: vertical-lr;
				grid-row: 1 / 4;
				text-align: center;
				margin-left: 1em;
				border-radius: 6px;
			}

			.divider-0 {
				grid-column-start: 1;
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
				font-size: 1.2em;
				font-weight: bold;
				margin-bottom: 0;
				grid-column: 1 / 4;
				align-self: end;
				width: 100%;
				height: 2em;
				text-align: center;
				margin-top: 2em;
				border-radius: 6px;
				display: flex;
				align-items: center;
				justify-content: center;
			}

			.divider-0 {
				grid-row-start: 1;
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
			}

			.group-thunderstorm {
				grid-row-start: 18;
			}
		}
	}
</style>
