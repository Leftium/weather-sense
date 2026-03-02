<script lang="ts">
	import { favicon } from '@leftium/logo';
	import { GgConsole } from '@leftium/gg';
	import '../app.scss';

	let { children } = $props();
</script>

<svelte:head>
	<title>WeatherSense</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<GgConsole />
{@render children?.()}
