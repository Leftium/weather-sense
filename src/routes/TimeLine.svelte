<script lang="ts">
	import { gg } from '$lib/gg';
	import * as Plot from '@observablehq/plot';

	let div: HTMLDivElement;

	$effect(() => {
		div?.firstChild?.remove(); // remove old chart, if any
		const plot = Plot.plot({
			marks: [Plot.frame(), Plot.text(['Hello, world!'], { frameAnchor: 'middle' })]
		});
		div?.append(plot); // add the new chart
		gg('EFFECT');
	});
</script>

<div bind:this={div} role="img"></div>
