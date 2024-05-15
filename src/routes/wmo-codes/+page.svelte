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
		<article class="flex">
			{#each wmoCodeType as [code, data]}
				{@const numericCode = Number(code)}
				<div class="flex flex-column">
					<div>
						<span class="code transparent" hidden={numericCode > 9}>0</span><span class="code"
							>{code}</span
						>
						<img src="/icons/{data.icon}" alt="" />
					</div>
					<div class="description">{data.description}</div>
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

	article > div {
		width: calc(100% / 3);
	}
</style>
