<script lang="ts">
	import 'iconify-icon';

	let { data } = $props();

	let location: Record<string, any> = $state({
		latitude: data.location.latitude,
		longitude: data.location.longitude
	});

	function onGeolocate() {
		const options = {
			enableHighAccuracy: true
		};

		function success(pos: GeolocationPosition) {
			const crd = pos.coords;

			location = {
				latitude: crd.latitude,
				longitude: crd.longitude,
				accuracy: crd.accuracy,
				source: 'device geolocation'
			};

			console.log('Your current position is:');
			console.log(`Latitude : ${crd.latitude}`);
			console.log(`Longitude: ${crd.longitude}`);
			console.log(`More or less ${crd.accuracy} meters.`);
			console.log(location);
		}

		function error(err: GeolocationPositionError) {
			location = {
				error: err
			};
			console.warn(`ERROR(${err.code}): ${err.message}`);
		}

		navigator.geolocation.getCurrentPosition(success, error, options);
	}
</script>

<div class="container">
	<div class="scroll">
		<pre>data = {JSON.stringify(data, null, 4)}</pre>
		<pre>location = {JSON.stringify(location, null, 4)}</pre>
	</div>

	<div>
		<div role="group">
			<button onclick={onGeolocate}><iconify-icon icon="gis:location-arrow"></iconify-icon></button>
			<input type="text" value={`${location.latitude}, ${location.longitude}`} />
			<button>Search</button>
		</div>
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
