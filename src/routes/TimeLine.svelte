<script lang="ts">
	import type {
		HourlyWeather,
		NsWeatherData,
		WeatherDataEvents
	} from '$lib/ns-weather-data.svelte';

	import { gg } from '$lib/gg';
	import * as Plot from '@observablehq/plot';
	import { getEmitter } from '$lib/emitter';

	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	let div: HTMLDivElement;
	let clientWidth: number = $state(0);

	let { nsWeatherData }: { nsWeatherData: NsWeatherData } = $props();

	let data = $derived.by(() => {
		let theData: Partial<HourlyWeather>[] = [];

		if (nsWeatherData.next24) {
			nsWeatherData.next24.forEach((item, index) => {
				theData.push(item);

				if (nsWeatherData.next24) {
					if (index < nsWeatherData.next24.length - 1) {
						const nextTemperature = nsWeatherData.next24[index + 1].temperature;

						for (let x = 1; x < 60; x++) {
							theData.push({
								time: item.time + x * 60,
								temperature: (item.temperature * (60 - x)) / 60 + (nextTemperature * x) / 60
							});
						}
					}
				}
			});
		}

		return theData;
	});

	$effect(() => {
		//gg('EFFECT');
		div?.firstChild?.remove(); // remove old chart, if any

		const marks = [
			Plot.frame(),
			Plot.lineY(data, { x: 'time', y: 'temperature' }),
			Plot.dot(data, Plot.pointerX({ x: 'time', y: 'temperature', stroke: 'red' }))
			// Plot.ruleX(data, Plot.pointerX({ x: 'time', py: 'temperature', stroke: 'purple' }))
		];

		/**/
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
		/**/

		const plot = Plot.plot({
			width: clientWidth,
			height: 160,
			x: {
				type: 'time',
				transform: (t) => t * 1000
			},
			marks
		});

		plot.addEventListener('input', (event) => {
			// gg($state.snapshot(plot.value));

			const time = plot.value?.time;

			if (time) {
				emit('weatherdata_requestedSetTime', { time });
			}
		});

		div?.append(plot); // add the new chart
	});
</script>

<div bind:this={div} bind:clientWidth role="img"></div>
