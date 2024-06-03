<script lang="ts">
	import { gg } from '$lib/gg';
	import type { NsWeatherData } from '$lib/ns-weather-data.svelte';
	import * as Plot from '@observablehq/plot';

	let div: HTMLDivElement;
	let clientWidth: number = $state(0);

	let { nsWeatherData }: { nsWeatherData: NsWeatherData } = $props();

	$effect(() => {
		div?.firstChild?.remove(); // remove old chart, if any
		const plot = Plot.plot({
			width: clientWidth,
			x: {
				type: 'time',
				transform: (t) => t * 1000
			},
			marks: [Plot.frame(), Plot.lineY(nsWeatherData.next24 || [], { x: 'time', y: 'temperature' })]
		});
		div?.append(plot); // add the new chart
		gg('EFFECT');
	});
</script>

<div bind:this={div} bind:clientWidth role="img"></div>
