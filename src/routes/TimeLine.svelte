<script lang="ts">
	import type { NsWeatherData, WeatherDataEvents } from '$lib/ns-weather-data.svelte';

	import _ from 'lodash-es';
	import * as d3 from 'd3';

	import { gg } from '$lib/gg';
	import * as Plot from '@observablehq/plot';
	import { getEmitter } from '$lib/emitter';
	import { onMount } from 'svelte';
	import { WMO_CODES, celcius } from '$lib/util';

	let { nsWeatherData }: { nsWeatherData: NsWeatherData } = $props();

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	let div: HTMLDivElement;
	let clientWidth: number = $state(0);
	let plot: undefined | ReturnType<typeof Plot.plot> = $state();

	let low = $state({
		time: 0,
		temperature: Number.MAX_VALUE,
		degreesTemperature: 0
	});

	let high = $state({
		time: 0,
		temperature: 0,
		degreesTemperature: 0
	});

	let data = $derived.by(() => {
		if (nsWeatherData.minutely) {
			const filtered = nsWeatherData.minutely.filter((item) => {
				const hoursFromNow = item.hourly?.fromNow ?? -99;
				return hoursFromNow >= -2 && hoursFromNow < 22;
			});

			// Normalize temperatures to scale: [0, 1].
			const minTemperature = _.minBy(filtered, 'temperature')?.temperature ?? 0;
			const maxTemperature = _.maxBy(filtered, 'temperature')?.temperature ?? 0;
			const temperatureRange = maxTemperature - minTemperature;

			let previousWeatherCode: undefined | number = undefined;
			const normalized = _.map(filtered, (item) => {
				const temperature = ((item.temperature - minTemperature) / temperatureRange) * 0.8 + 0.1;

				const mmPrecipitation = item.precipitation;
				const precipitation = 1 - Math.exp(-mmPrecipitation / 2);

				if (temperature < low.temperature) {
					low = {
						time: item.time,
						temperature,
						degreesTemperature: item.temperature
					};
				}

				if (temperature > high.temperature) {
					high = {
						time: item.time,
						temperature,
						degreesTemperature: item.temperature
					};
				}

				// Mark if weather code is different from previous code:
				const isNewWeatherCode = item.hourly?.weatherCode !== previousWeatherCode;
				previousWeatherCode = item.hourly?.weatherCode;

				return {
					...item,
					temperature,
					precipitation,
					mmPrecipitation,
					isNewWeatherCode
				};
			});

			//gg({ minTemperature, maxTemperature });

			return normalized;
		}
		return null;
	});

	function fill(d: { time: number; mmPrecipitation: number }) {
		if (!d?.time) {
			return 'red';
		}

		let fill = '#B21E4F';
		if (d.mmPrecipitation < 2.5) {
			fill = '#9BCCFD'; //'light-rain';
		} else if (d.mmPrecipitation < 7.5) {
			fill = '#51B4FF'; //'moderate-rain';
		} else if (d.mmPrecipitation < 50) {
			fill = '#029AE8'; //'heavy-rain';
		}
		return fill;
	}

	function formatTemperature(n: number, unit: string) {
		if (unit === 'F') {
			let formatted = `${Math.round(n)}°`;
			return formatted;
		}
		if (unit === 'C') {
			let formatted = `${celcius(n)?.toFixed(1)}°`;
			return formatted;
		}
	}

	// Generate and place Obervable.Plot from data.
	function plotData() {
		//gg('plotData');

		const plotOptions = {
			width: clientWidth,
			height: 100
		};

		if (!data?.length) {
			// Draw simple placeholder for plot.
			plot = Plot.plot(plotOptions);
		} else {
			const marks = [
				// Rectangular frame around plot:
				Plot.frame(),

				Plot.areaY(data, {
					x: 'time',
					y: 1,
					fill: (d) => WMO_CODES[d.hourly.weatherCode].color
				}),

				Plot.areaY(data, {
					x: 'time',
					y: (d) => {
						const date = new Date(d.time * 1000);
						const minutes = date.getMinutes();
						return minutes < 4 || minutes > 56 ? NaN : d.precipitation;
					},
					fill: 'lightblue'
				}),

				Plot.lineY(data, {
					x: 'time',
					y: (d) => {
						const date = new Date(d.time * 1000);
						const minutes = date.getMinutes();
						return minutes < 5 || minutes > 55 ? NaN : d.precipitation;
					},
					stroke: 'darkcyan'
				}),

				/*
				Plot.text(data, {
					x: 'time',
					y: 0.8,
					textAnchor: 'start',
					filter: (d) => {
						//gg(d);
						return d.isNewWeatherCode;
					},
					text: function (d) {
						return WMO_CODES[d.hourly.weatherCode].description;
					}
				}),
                */

				// The temperature plotted as line:
				Plot.lineY(data, { x: 'time', y: 'temperature' }),

				Plot.dot(data, { x: low.time, y: low.temperature, stroke: 'blue' }),

				Plot.text([formatTemperature(low.degreesTemperature, nsWeatherData.units.temperature)], {
					x: low.time,
					y: low.temperature + 0.2,
					fill: 'blue',
					strokeWidth: 1
				}),

				Plot.text([formatTemperature(high.degreesTemperature, nsWeatherData.units.temperature)], {
					x: high.time,
					y: high.temperature - 0.2,
					fill: 'red',
					strokeWidth: 1
				}),

				Plot.dot(data, { x: high.time, y: high.temperature, stroke: 'red' }),

				// Dot that marks value at mouse (hover) position:
				Plot.dot(data, Plot.pointerX({ x: 'time', y: 'temperature', stroke: 'purple' }))

				/*
				Plot.ruleX(data, Plot.pointerX({ x: 'time', py: 'temperature', stroke: 'blue' }))
				/**/
			];

			marks.push(
				// A custom ruleX than can be updated from the outside by calling .updateRuleX(value).
				Plot.ruleX([data[0].time], {
					render: (i, s, v, d, c, next) => {
						const [timeStart, timeEnd] = Array.from(s.scales.x?.domain || []);

						//gg('render', { timeStart, timeEnd, i, s, v, d, c, next });

						// @ts-expect-error: add custom property: .updateRuleX
						c.ownerSVGElement.updateRuleX = (value: number) => {
							const timestamp = value * 1000;

							const pg = d3.select(div).select('svg');
							pg.select('.custom-rule').remove();

							if (timestamp > timeStart && timestamp < timeEnd) {
								const ig = pg.append('g').attr('class', 'custom-rule');

								if (s?.x && s?.y) {
									ig.append('line')
										.attr('x1', s.x(timestamp))
										.attr('x2', s.x(timestamp))
										// @ts-expect-error: use undocumented internal: .range
										.attr('y1', s.y.range()[0])
										// @ts-expect-error: use undocumented internal: .range
										.attr('y2', s.y.range()[1])
										.attr('stroke', 'purple');
								}
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

			const value = plot?.value;
			const time = value?.time;

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

	on('weatherData_ToggledUnits', function () {
		plotData();
	});

	onMount(() => {
		// Update entire plot.
		// Runs when parent div is resized.
		const resizeObserver = new ResizeObserver((entries) => {
			plotData();
		});
		resizeObserver.observe(div);

		div.addEventListener('mouseenter', function () {
			emit('weatherdata_requestedTrackingStart');
		});

		div.addEventListener('mouseleave', async function () {
			emit('weatherdata_requestedTrackingEnd');
		});

		// TODO: cleanup with resizeObserver.unobserve()?
	});
</script>

<div bind:this={div} bind:clientWidth role="img"></div>
