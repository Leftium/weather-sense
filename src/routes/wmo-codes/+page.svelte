<script lang="ts">
	import _ from 'lodash-es';

	import { WMO_CODES } from '$lib/util';

	const wmoCodesByType = _.groupBy(Object.entries(WMO_CODES), ([key, value]) => {
		let type = Number(key);

		// Adjust so logically grouped by type.
		if ([45, 80, 85, 95].includes(type)) {
			type++;
		}

		return Math.floor((type + 9) / 5);
	});
</script>

<div class="pico container">
	{#each Object.entries(wmoCodesByType) as [type, wmoCodeType]}
		<article class="flex space-between">
			{#each wmoCodeType as [code, data]}
				{@const numericCode = Number(code)}
				<div class="flex flex-column">
					<div>
						<span class="code transparent" hidden={numericCode > 9}>0</span><span class="code"
							>{code}</span
						>
						<img src={data.icon} alt="" />
					</div>
					<div class="description">
						<span class:is-dark-text={data.isDarkText} style:background-color={data.color}
							>{data.description}</span
						>
					</div>
				</div>
			{/each}
		</article>
	{/each}
</div>

<style>
	.flex {
		display: flex;
		flex-wrap: wrap;
	}

	.space-between {
		justify-content: space-between;
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

	.description span {
		padding: 0.3em;
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

	article > div {
		width: calc(100% / 3);
	}
</style>
