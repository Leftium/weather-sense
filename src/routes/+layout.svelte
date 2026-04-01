<script lang="ts">
	import { GgConsole } from '@leftium/gg';
	import '../app.scss';

	let { children } = $props();
</script>

<GgConsole />
{@render children?.()}
