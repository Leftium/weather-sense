<script lang="ts">
	import _ from 'lodash-es';

	import { WMO_CODES } from '$lib/util';

	const wmoCodeGroups = {
		clear: [0, 0],
		cloud: [1, 3],
		fog: [45, 48],
		drizzle: [51, 55],
		showers: [80, 82],
		rain: [61, 65],
		freezingDrizzle: [56, 57],
		freezingRain: [66, 67],
		snowGrains: [77, 77],
		snowShowers: [85, 86],
		snow: [71, 75],
		thunderstorm: [95, 99],
	};

	// Convert Object to array, adding key as `.code` prop.
	const wmoCodes = _.map(WMO_CODES, (value, code) => ({
		code: Number(code),
		...value,
	}));

	const wmoCodesByType = _.map(wmoCodeGroups, ([firstIndex, lastIndex]) =>
		_.filter(wmoCodes, (value) => {
			return value.code >= firstIndex && value.code <= lastIndex;
		}),
	);
</script>

<div class="pico container">
	{#each wmoCodesByType as wmoCodeType}
		<div class="code-group flex space-between">
			{#each wmoCodeType as data}
				<article class="code flex flex-column align-center">
					<div>
						<span class="code transparent" hidden={data.code > 9}>0</span><span class="code"
							>{data.code}</span
						>
						<img src={data.icon} alt="" />
					</div>
					<div class="description">
						<span class:is-dark-text={data.isDarkText} style:background-color={data.color}>
							<img src={data.icon} alt="" /> {data.description}</span
						>
					</div>
				</article>
			{/each}
		</div>
	{/each}
</div>

<style>
	.container {
		padding: 0.1em;
	}

	.flex {
		display: flex;
		flex-wrap: wrap;
	}

	.space-between {
		justify-content: space-between;
	}

	.align-center {
		align-items: center;
	}

	.flex-column {
		flex-direction: column;
	}

	.code {
		font-size: larger;
		font-weight: 900;
		vertical-align: bottom;
	}

	.transparent {
		opacity: 0;
	}

	.description {
		font-size: small;
	}

	.description img {
		height: 22px;
		width: 22px;
	}

	.description span {
		padding: 0.6em;
		border-radius: 0.3em;
		line-height: 40px;
		font-size: 13px;
		font-weight: 400;

		color: #fff;
		text-shadow: 1px 0 rgb(0 0 0 / 50%);
	}

	.description .is-dark-text {
		color: #333;
		text-shadow: 1px 0 rgb(255 255 255 / 50%);
	}

	.code-group > .code {
		width: calc(97% / 3);
		margin: 0.5%;
		padding: 0.2em;
	}
</style>
