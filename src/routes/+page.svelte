<script lang="ts">
	let { data } = $props();
</script>

<div class="container">
	<div class="scroll">
		<pre>data = {JSON.stringify(data, null, 4)}</pre>
	</div>
	<div>
		<input type="text" value={`${data.location.city}, ${data.location.country}`} />
	</div>
</div>

<style>
	.container {
		height: 100vh;
		height: 100dvh;

		display: grid;
		grid-template-rows: 1fr auto;
	}

	.scroll {
		overflow: auto;
	}
</style>
