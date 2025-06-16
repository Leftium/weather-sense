<script lang="ts">
	import { AQI_INDEX_US, AQI_INDEX_EUROPE } from '$lib/util';
</script>

<div class="pico container">
	<center>
		<a href="/">Back to WeatherSense</a>
	</center>

	<pre>AQI_INDEX_EUROPE = {JSON.stringify(AQI_INDEX_EUROPE, null, 4)}
        // Ranges from 0-20 (good), 20-40 (fair), 40-60 (moderate), 60-80 (poor), 80-100 (very poor) and exceeds 100 for extremely poor conditions.
    </pre>

	<pre>AQI_INDEX_US = {JSON.stringify(AQI_INDEX_US, null, 4)}
        // Ranges from 0-50 (good), 51-100 (moderate), 101-150 (unhealthy for sensitive groups), 151-200 (unhealthy), 201-300 (very unhealthy) and 301-500 (hazardous).
    </pre>
</div>

<style lang="scss">
	@use '@picocss/pico/scss/colors' as *;
</style>
