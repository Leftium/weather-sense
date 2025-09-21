<script lang="ts">
	import { favicon } from '@leftium/logo';
	import '../app.scss';

	let { children } = $props();
</script>

<svelte:head>
	<title>WeatherSense</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}
