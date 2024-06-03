<script lang="ts">
	import type { NsWeatherData } from '$lib/ns-weather-data.svelte';

	import { gg } from '$lib/gg';
	import * as Plot from '@observablehq/plot';

	let div: HTMLDivElement;
	let clientWidth: number = $state(0);

	let { nsWeatherData }: { nsWeatherData: NsWeatherData } = $props();

	$effect(() => {
		div?.firstChild?.remove(); // remove old chart, if any

		const marks = [
			Plot.frame(),
			Plot.lineY(nsWeatherData.next24 || [], { x: 'time', y: 'temperature' })
		];

		// Add red rule marker for tracker if within range of this timeline:
		if (
			nsWeatherData.next24 &&
			nsWeatherData.time >= nsWeatherData.next24[0].time &&
			nsWeatherData.time <= nsWeatherData.next24[23].time
		) {
			marks.push(
				Plot.ruleX([nsWeatherData.time], {
					stroke: 'red'
				})
			);
		}

		const plot = Plot.plot({
			width: clientWidth,
			height: 160,
			x: {
				type: 'time',
				transform: (t) => t * 1000
			},
			marks
		});

		div?.append(plot); // add the new chart
		gg('EFFECT');
	});
</script>

<div bind:this={div} bind:clientWidth role="img"></div>
