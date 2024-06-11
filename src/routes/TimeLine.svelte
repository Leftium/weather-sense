<script lang="ts">
	import type { NsWeatherData, WeatherDataEvents } from '$lib/ns-weather-data.svelte';

	import _ from 'lodash-es';
	import * as d3 from 'd3';

	import { gg } from '$lib/gg';
	import * as Plot from '@observablehq/plot';
	import { getEmitter } from '$lib/emitter';
	import { onMount, tick } from 'svelte';
	import { WMO_CODES, celcius } from '$lib/util';
	import dateFormat from 'dateformat';
	import type { Markish } from '@observablehq/plot';

	let {
		nsWeatherData,
		startTime = +new Date() / 1000,
		hours = 24,
		xAxis = true,
		ghostTracker = false
	}: {
		nsWeatherData: NsWeatherData;
		startTime?: number;
		hours?: number;
		xAxis?: boolean;
		ghostTracker?: boolean;
	} = $props();

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	let div: HTMLDivElement;
	let clientWidth: number = $state(0);
	let plot: undefined | ReturnType<typeof Plot.plot> = $state();

	const startDate = startTime || +new Date() / 1000;
	const timeHourStart = Math.floor(startDate / 60 / 60) * 60 * 60;
	const timeHourEnd = timeHourStart + hours * 60 * 60;

	let data = $derived.by(() => {
		//gg('data');

		console.time('data');
		if (nsWeatherData.minutely) {
			const filtered = nsWeatherData.minutely.filter((item) => {
				return item.time >= timeHourStart && item.time <= timeHourEnd;
			});

			console.timeEnd('data');
			return filtered;
		}
		console.timeEnd('data');
		return null;
	});

	let dataWithoutLast = $derived(data?.toSpliced(-1, 1));

	let low = $state({
		time: 0,
		temperatureNormalized: Number.MAX_VALUE,
		temperature: 0,
		dx: 0,
		dy: 0
	});

	let high = $state({
		time: 0,
		temperatureNormalized: 0,
		temperature: 0,
		dx: 0,
		dy: 0
	});

	$effect(() => {
		_.forEach(data, (item, index) => {
			let dx = 0;
			if (index < 5) {
				dx = 10 - index;
			} else if (index >= (data?.length || 0) - 6) {
				dx = -10 + ((data?.length || 0) - index);
			}

			const temperatureNormalized = item.temperatureNormalized;

			const dy = item.temperatureNormalized < 0.5 ? -10 : 10;

			if (temperatureNormalized < low.temperatureNormalized) {
				low = {
					time: item.time,
					temperatureNormalized,
					temperature: item.temperature,
					dx,
					dy
				};
			}

			if (temperatureNormalized > high.temperatureNormalized) {
				high = {
					time: item.time,
					temperatureNormalized,
					temperature: item.temperature,
					dx,
					dy
				};
			}
		});
	});

	function fill(d: { time: number; precipitation: number }) {
		if (!d?.time) {
			return 'red';
		}

		let fill = '#B21E4F';
		if (d.precipitation < 2.5) {
			fill = '#9BCCFD'; //'light-rain';
		} else if (d.precipitation < 7.5) {
			fill = '#51B4FF'; //'moderate-rain';
		} else if (d.precipitation < 50) {
			fill = '#029AE8'; //'heavy-rain';
		}
		return fill;
	}

	function fadePastValues(d: { time: number }) {
		const now = +new Date() / 1000;
		if (d.time < now) {
			return 0.2;
		}
		return 1;
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

	function ifMinute0(valueFunction: (d: any) => number) {
		return (d: { isMinute0: any }) => (d.isMinute0 ? valueFunction(d) : null);
	}

	// Generate and place Obervable.Plot from data.
	function plotData() {
		//gg('plotData');

		const plotOptions = {
			width: clientWidth,
			height: 50,
			marginRight: 0,
			marginLeft: 0,
			marginTop: 0,
			marginBottom: 0,
			y: { axis: null }
		};

		if (!data?.length) {
			// Draw simple placeholder for plot.
			plot = Plot.plot(plotOptions);
		} else {
			const marks: Markish[] = [
				//Plot.frame(),

				Plot.rectY(dataWithoutLast, {
					strokeOpacity: fadePastValues,
					x1: (d) => d.time + 0 * 60,
					x2: (d) => Math.min(d.time + 61 * 60, timeHourEnd),
					y: ifMinute0((d) => 1),
					fill: (d) => WMO_CODES[d.hourly.weatherCode].color
				}),

				Plot.rectY(dataWithoutLast, {
					strokeOpacity: fadePastValues,
					x1: (d) => d.time + 5 * 60,
					x2: (d) => Math.min(d.time + 55 * 60, timeHourEnd),
					y: ifMinute0((d) => d.precipitationNormalized),
					fill: 'lightblue'
				}),

				Plot.rect(dataWithoutLast, {
					strokeOpacity: fadePastValues,
					x1: (d) => d.time + 6 * 60,
					x2: (d) => Math.min(d.time + 54 * 60, timeHourEnd),
					y1: ifMinute0((d) => d.precipitationNormalized),
					y2: ifMinute0((d) => d.precipitationNormalized + 0.01),
					stroke: (d) => (d.precipitation ? 'darkcyan' : 'rgba(0,0,0,0)')
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
				Plot.lineY(data, {
					strokeOpacity: fadePastValues,
					x: 'time',
					y: 'temperatureNormalized'
				}),

				// High/low temp marks:
				Plot.dot([low], {
					fillOpacity: fadePastValues,
					x: 'time',
					y: 'temperatureNormalized',
					fill: 'blue'
				}),
				Plot.dot([high], {
					fillOpacity: fadePastValues,
					x: 'time',
					y: 'temperatureNormalized',
					fill: 'red'
				}),

				// High/low temp labels:
				Plot.text([formatTemperature(low.temperature, nsWeatherData.units.temperature)], {
					fillOpacity: fadePastValues,
					x: low.time,
					y: low.temperatureNormalized,
					fill: 'blue',
					dy: low.dy,
					dx: low.dx
				}),
				Plot.text([formatTemperature(high.temperature, nsWeatherData.units.temperature)], {
					fillOpacity: fadePastValues,
					x: high.time,
					y: high.temperatureNormalized,
					fill: 'red',
					dy: high.dy,
					dx: high.dx
				}),

				// Dot that marks value at mouse (hover) position:
				Plot.dot(data, Plot.pointerX({ x: 'time', y: 'temperatureNormalized', fill: 'purple' }))

				/*
				Plot.ruleX(data, Plot.pointerX({ x: 'time', py: 'temperatureNormalized', fill: 'blue' }))
				/**/
			];

			marks.push(
				// A custom ruleX than can be updated from the outside by calling .updateRuleX(value).
				Plot.ruleX([data[0].time], {
					// @ts-expect-error: needed to hide y-axis:
					y: { axis: null },
					render: (i, s, v, d, c, next) => {
						const [timeStart, timeEnd] = Array.from(s.scales.x?.domain || []);

						// @ts-expect-error: add custom property: .updateRuleX
						c.ownerSVGElement.updateRuleX = (value: number) => {
							const timestamp = value * 1000;

							const pg = d3.select(div).select('svg');
							pg.select('.custom-rule').remove();

							function drawTracker(x: number, color: string) {
								const ig = pg.append('g').attr('class', 'custom-rule');
								if (s?.x && s?.y) {
									ig.append('line')
										.attr('x1', s.x(x))
										.attr('x2', s.x(x))
										// @ts-expect-error: use undocumented internal: .range
										.attr('y1', s.y.range()[0])
										// @ts-expect-error: use undocumented internal: .range
										.attr('y2', s.y.range()[1])
										.attr('stroke', color);
								}
							}

							if (timestamp > timeStart && timestamp < timeEnd) {
								drawTracker(timestamp, 'purple');
							} else if (ghostTracker) {
								const date = new Date(timestamp);
								const tzOffset = date.getTimezoneOffset() * 60 * 1000;

								const zRemainder = (timestamp - tzOffset) % (24 * 60 * 60 * 1000);
								const ghostTime = Number(timeStart) + zRemainder;

								drawTracker(ghostTime, 'rgba(128,0,128,.2)');
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

			// Add to hide automatic x axis:
			if (!xAxis) {
				marks.push(Plot.axisX({ ticks: [] }));
			}

			plot = Plot.plot({
				...plotOptions,
				x: {
					type: 'time',
					tickFormat: (d) => dateFormat(d, 'htt'),
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
	on('weatherdata_updatedData', async function () {
		gg('on:weatherdata_updatedData');
		await tick();
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

<style>
	div,
	div > :global(svg) {
		overflow: visible !important;
	}
</style>
