<script lang="ts">
	import type {
		HourlyWeather,
		NsWeatherData,
		WeatherDataEvents
	} from '$lib/ns-weather-data.svelte';

	import * as d3 from 'd3';

	import { gg } from '$lib/gg';
	import * as Plot from '@observablehq/plot';
	import { getEmitter } from '$lib/emitter';
	import { onMount } from 'svelte';

	let { nsWeatherData }: { nsWeatherData: NsWeatherData } = $props();

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	let div: HTMLDivElement;
	let clientWidth: number = $state(0);
	let plot: undefined | ReturnType<typeof Plot.plot> = $state();

	// Convert hourly data into minutely data with linear interpolation.
	// So ruleX can be incremented by minutes.
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

	// Generate and place Obervable.Plot from data.
	function plotData() {
		//gg('plotData');

		const plotOptions = {
			width: clientWidth,
			height: 160
		};

		if (!data.length) {
			// Draw simple placeholder for plot.
			plot = Plot.plot(plotOptions);
		} else {
			const marks = [
				// Rectangular frame around plot:
				Plot.frame(),
				// The temperature plotted as line:
				Plot.lineY(data, { x: 'time', y: 'temperature' }),
				// Dot that marks value at mouse (hover) position:
				Plot.dot(data, Plot.pointerX({ x: 'time', y: 'temperature', stroke: 'red' }))
			];

			marks.push(
				// A custom ruleX than can be updated from the outside by calling .updateRuleX(value).
				Plot.ruleX([data[0].time], {
					render: (i, s, v, d, c, next) => {
						//gg('render', { i, s, v, d, c, next });

						// @ts-expect-error: add custom property: .updateRuleX
						c.ownerSVGElement.updateRuleX = (value: number) => {
							const pg = d3.select(div).select('g');
							pg.select('.custom-rule').remove();

							const ig = pg.append('g').attr('class', 'custom-rule');

							if (s?.x && s?.y) {
								ig.append('line')
									.attr('x1', s.x(value * 1000))
									.attr('x2', s.x(value * 1000))
									// @ts-expect-error: use undocumented internal: .range
									.attr('y1', s.y.range()[0])
									// @ts-expect-error: use undocumented internal: .range
									.attr('y2', s.y.range()[1])
									.attr('stroke', 'red');
							}
						};

						// Render next marks.
						if (next) {
							return next(i, s, v, d, c);
						}
						return null;
					}
				})
			);

			plot = Plot.plot({
				...plotOptions,
				x: {
					type: 'time',
					transform: (t) => t * 1000
				},
				marks
			});
		}

		div?.firstChild?.remove(); // remove old chart, if any
		div?.append(plot); // add the new chart

		plot.addEventListener('input', (event) => {
			//gg($state.snapshot(plot.value));

			const time = plot?.value?.time;

			if (time) {
				emit('weatherdata_requestedSetTime', { time });
			}
		});
	}

	// Update rule location only (leaving rest of plot intact).
	// Runs every time nsWeatherData.time changes value.
	$effect(() => {
		//gg('EFFECT');

		// @ts-expect-error: use custom property: .updateRuleX
		if (plot?.updateRuleX) {
			// @ts-expect-error: use custom property: .updateRuleX
			plot.updateRuleX(nsWeatherData.time);
		}
	});

	// Update entire plot.
	// Runs on weatherdata_updatedData event from nsWeatherData.
	on('weatherdata_updatedData', function () {
		plotData();
	});

	onMount(() => {
		// Update entire plot.
		// Runs when parent div is resized.
		const resizeObserver = new ResizeObserver((entries) => {
			plotData();
		});
		resizeObserver.observe(div);

		// TODO: cleanup with resizeObserver.unobserve()?
	});
</script>

<div bind:this={div} bind:clientWidth role="img"></div>
