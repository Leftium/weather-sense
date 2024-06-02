<script lang="ts">
	import { gg } from '$lib/gg';
	import * as Plot from '@observablehq/plot';

	let div: HTMLDivElement;
	let clientWidth: number;

	$effect(() => {
		div?.firstChild?.remove(); // remove old chart, if any
		const plot = Plot.plot({
			width: clientWidth,
			marks: [Plot.frame(), Plot.text(['Hello, world!'], { frameAnchor: 'middle' })]
		});
		div?.append(plot); // add the new chart
		gg('EFFECT');
	});
</script>

<div bind:this={div} bind:clientWidth role="img"></div>
