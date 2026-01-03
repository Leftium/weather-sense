<script lang="ts">
	import { dev } from '$app/environment';
	import rainviewerColorsTable from '$lib/rainviewer_api_colors_table.json';
	import { contrastTextColor, prettyLch } from '$lib/util';
	import Color from 'colorjs.io';

	import tippy from 'tippy.js';
	import 'tippy.js/dist/tippy.css';

	import type { Attachment } from 'svelte/attachments';

	type ColorSchemeName = keyof typeof rainviewerColorsTable;
	const rvColorSchemeNames = Object.keys(rainviewerColorsTable);
	rvColorSchemeNames.shift();

	const rvDbz = rainviewerColorsTable['dBZ / RGBA'].filter((_, i, array) => i < array.length / 2);

	const rvColorSchemes = rvColorSchemeNames.reduce(
		(accumulator, colorSchemeName, currentIndex, array) => {
			const colorsAll = rainviewerColorsTable[colorSchemeName as ColorSchemeName];
			const colorsRain = colorsAll.slice(0, colorsAll.length / 2);
			const colorsSnow = colorsAll.slice(colorsAll.length / 2, colorsAll.length);

			const rain = rvDbz.reduce((obj, k, i) => ({ ...obj, [k]: colorsRain[i] }), {});
			const snow = rvDbz.reduce((obj, k, i) => ({ ...obj, [k]: colorsSnow[i] }), {});

			return {
				...accumulator,
				[colorSchemeName]: { rain, snow },
			};
		},
		{},
	) as Record<string, { rain: string[]; snow: string[] }>;

	const borders: Record<string, { rain: number[] }> = {};

	// prettier-ignore
	{
        borders['headers'] =                   { rain: [    0,   20,   30,      45,         70    ]};
		borders['Original'] =                  { rain: [      10,      30,      45,   60,      75 ]};
		borders['Universal Blue'] =            { rain: [-10,  10,      30,            60          ]};
		borders['Titan'] =                     { rain: [-10,  10,            40,   50,   65       ]};
		borders['The Weather Channel (TWC)'] = { rain: [      10,      30,                        ]};
		borders['Meteored'] =                  { rain: [      10,   25,      40,            70    ]};
		borders['NEXRAD Level III'] =          { rain: [    0,   20,      35,            65       ]};
		borders['Rainbow @ Selex SI'] =        { rain: [      10,      30,            60          ]};
		borders['Dark Sky'] =                  { rain: [    0,         30,      45                ]};
	}

	const intensities: Record<number, string> = {
		5: 'Trace accumulation or mist',
		10: 'Trace accumulation or mist',
		15: 'Trace accumulation',
		20: 'Light rain',
		25: 'Light rain',
		30: 'Light to moderate rain',
		35: 'Moderate rain',
		40: 'Moderate to heavy rain',
		45: 'Heavy rain',
		50: 'Heavy rain, small hail possible',
		55: 'Very heavy rain, hail possible',
		60: 'Very heavy rain, hail likely',
		65: 'Very heavy rain, hail very likely, large hail possible',
	};

	// Marshall-Palmer formula
	function dbzToMm(dbz: number) {
		return Math.round((10 ** (dbz / 10) / 200) ** (5 / 8) * 1000) / 1000;
	}

	const dbzBuckets = [...Array(24).keys()]
		.map((n) => n * 5 - 20)
		.map((dbz) => ({
			dbz,
			r: dbzToMm(dbz),
			intensity: intensities[dbz],
		}));

	const tableHeaders = ['dBZ', 'mm/hr'];

	function tooltip(content: string): Attachment {
		return (element) => {
			const tooltip = tippy(element, { content, placement: 'left' });
			return tooltip.destroy;
		};
	}
</script>

<div class="container-fluid">
	<center>
		<a href="/">Back to WeatherSense</a>
	</center>

	<main>
		<table border="0">
			<thead>
				<tr>
					{#each tableHeaders as header}
						<th>{header}</th>
					{/each}
					{#each rvColorSchemeNames as colorSchemeName, index}
						<th>R{index} {colorSchemeName}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each dbzBuckets as row}
					<tr>
						{#each ['dbz', 'r'] as key}
							<td
								style:border-top={borders.headers.rain.includes(row.dbz) ? '1px solid grey;' : ''}
								style:text-align="right">{row[key as keyof typeof row]}</td
							>
						{/each}

						{#each rvColorSchemeNames as rvColorSchemeName}
							{@const rainColor = rvColorSchemes[rvColorSchemeName].rain[row.dbz]}
							{@const color = contrastTextColor(rainColor)}
							<td
								style:color
								style:background-color={rainColor}
								style:border-top={borders[rvColorSchemeName]?.rain?.includes(row.dbz)
									? '2px dotted grey'
									: ''}
							>
								<div style="display: inline-block; vertical-align: top; line-height: 0;">
									{#each { length: 5 }, index}
										{@const dbz = row.dbz + index}
										{@const bgColor = rvColorSchemes[rvColorSchemeName].rain[dbz]}
										<div
											{@attach tooltip(`${dbz}dBZ ${dbzToMm(dbz)}mm/hr`)}
											style:background-color={bgColor}
											style="height: 7px; width: 35px;"
										></div>
									{/each}
								</div>
								<div style="display: inline-block;">
									{`${prettyLch(new Color(rainColor).to('oklch'))}`
										.replaceAll('oklch', '')
										.replace(' 100a', '')
										.replace(' 100l', '')}
								</div>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</main>

	{#if dev}
		<div hidden>
			<pre>dbzBuckets = {JSON.stringify(dbzBuckets, null, 4)}</pre>
		</div>
		<div hidden>
			<pre>rvDbz = {JSON.stringify(rvDbz, null, 4)}</pre>
		</div>
		<div>
			<pre>rvColorSchemeNames = {JSON.stringify(rvColorSchemeNames, null, 4)}</pre>
		</div>
		<div hidden>
			<pre>rvColorSchemes = {JSON.stringify(rvColorSchemes, null, 4)}</pre>
		</div>

		<div hidden>
			<pre>dbzBuckets = {JSON.stringify(dbzBuckets, null, 4)}</pre>
		</div>
		<div hidden>
			<pre>rainviewer_api_colors_table = {JSON.stringify(rainviewerColorsTable, null, 4)}</pre>
		</div>
	{/if}
</div>

<style lang="scss">
	main {
		position: relative;

		max-height: 100vh;
		overflow: scroll;

		thead {
			position: sticky;
			top: 0;
		}

		td {
			max-width: 8em;
			padding: 0;
			border-bottom: none;

			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
</style>
