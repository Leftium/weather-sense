<script lang="ts">
	import type {
		MinutelyWeather,
		NsWeatherData,
		WeatherDataEvents
	} from '$lib/ns-weather-data.svelte';

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

	let data = $derived.by(() => {
		//gg('data');

		const startDate = startTime || +new Date() / 1000;
		const timeStart = Math.floor(startDate / 60 / 60) * 60 * 60;
		const timeEnd = timeStart + hours * 60 * 60;

		if (nsWeatherData.minutely) {
			const filtered = nsWeatherData.minutely.filter((item) => {
				return item.time >= timeStart && item.time <= timeEnd;
			});

			const minute0 = filtered.filter((d) => d.minute == 0);

			type CodesItem = {
				weatherCode: number;
				text: string;
				x1: number;
				x2: number;
				xMiddle: number;
				fill: string;
				opacity: number;
			};

			const now = +new Date() / 1000;

			const codes = minute0.reduce((accumulator: CodesItem[], current: MinutelyWeather) => {
				const prevItem = accumulator.at(-1);
				const prevCode = prevItem?.weatherCode;
				const nextCode = current.hourly?.weatherCode;

				const x1 = current.time;
				const x2 = Math.min(current.time + 60 * 60, timeEnd);

				if (prevItem && prevCode == nextCode && prevCode != undefined) {
					prevItem.x2 = x2;
					prevItem.xMiddle = (Number(prevItem.x1) + x2) / 2;
				} else {
					if (nextCode != undefined) {
						accumulator.push({
							weatherCode: nextCode,
							text: WMO_CODES[nextCode].description,
							x1,
							x2,
							xMiddle: (Number(x1) + Number(x2)) / 2,
							fill: WMO_CODES[nextCode].color,
							opacity: current.time < now ? 0.2 : 1
						});
					}
				}
				return accumulator;
			}, [] as CodesItem[]);

			const rain = minute0
				.filter((d) => d.precipitation > 0)
				.map((d) => {
					const x1bar = d.time + 5 * 60;
					const x2bar = Math.min(d.time + 55 * 60, timeEnd);
					const y = d.precipitationNormalized;

					return {
						x1bar,
						x2bar,
						x1line: x1bar + 60,
						x2line: x2bar - 60,
						y,
						y2: y + 0.01,
						opacity: d.time < now ? 0.2 : 1
					};
				});

			let low = {
				time: 0,
				temperatureNormalized: Number.MAX_VALUE,
				temperature: 0,
				dx: 0,
				dy: 0
			};

			let high = {
				time: 0,
				temperatureNormalized: 0,
				temperature: 0,
				dx: 0,
				dy: 0
			};

			_.forEach(filtered, (item, index) => {
				let dx = 0;
				if (index < 5) {
					dx = 10 - index;
				} else if (index >= (filtered.length || 0) - 6) {
					dx = -10 + ((filtered.length || 0) - index);
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

			return {
				all: filtered,
				timeStart,
				timeEnd,
				low,
				high,
				rain,
				codes
			};
		}
		return null;
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

		if (!data?.all?.length) {
			// Draw simple placeholder for plot.
			plot = Plot.plot(plotOptions);
		} else {
			const marks: Markish[] = [
				//Plot.frame(),

				Plot.rectY(data.codes, {
					strokeOpacity: 'opacity',
					x1: 'x1',
					x2: 'x2',
					y: 1,
					fill: 'fill'
				}),

				Plot.rectY(data.rain, {
					strokeOpacity: 'opacity',
					x1: 'x1bar',
					x2: 'x2bar',
					y: 'y',
					fill: 'lightblue'
				}),

				Plot.rect(data.rain, {
					strokeOpacity: 'opacity',
					x1: 'x1line',
					x2: 'x2line',
					y1: 'y',
					y2: 'y2',
					stroke: 'darkcyan'
				}),

				Plot.text(data.codes, {
					x: 'xMiddle',
					y: 0.8,
					textAnchor: 'middle',
					text: (d) => {
						const ox1 = plot?.scale('x')?.apply(d.x1 * 1000);
						const ox2 = plot?.scale('x')?.apply(d.x2 * 1000);
						const text = ox2 - ox1 > 80 ? d.text : null;
						return text;
					}
				}),

				// The temperature plotted as line:
				Plot.lineY(data?.all, {
					strokeOpacity: fadePastValues,
					x: 'time',
					y: 'temperatureNormalized'
				}),

				// High/low temp marks:
				Plot.dot([data.low], {
					fillOpacity: fadePastValues,
					x: 'time',
					y: 'temperatureNormalized',
					fill: 'blue'
				}),
				Plot.dot([data.high], {
					fillOpacity: fadePastValues,
					x: 'time',
					y: 'temperatureNormalized',
					fill: 'red'
				}),

				// High/low temp labels:
				Plot.text([formatTemperature(data.low.temperature, nsWeatherData.units.temperature)], {
					fillOpacity: fadePastValues,
					x: data.low.time,
					y: data.low.temperatureNormalized,
					fill: 'blue',
					dy: data.low.dy,
					dx: data.low.dx
				}),
				Plot.text([formatTemperature(data.high.temperature, nsWeatherData.units.temperature)], {
					fillOpacity: fadePastValues,
					x: data.high.time,
					y: data.high.temperatureNormalized,
					fill: 'red',
					dy: data.high.dy,
					dx: data.high.dx
				}),

				// Dot that marks value at mouse (hover) position:
				Plot.dot(
					data?.all,
					Plot.pointerX({ x: 'time', y: 'temperatureNormalized', fill: 'purple' })
				)

				/*
				Plot.ruleX(data, Plot.pointerX({ x: 'time', py: 'temperatureNormalized', fill: 'blue' }))
				/**/
			];

			marks.push(
				// A custom ruleX than can be updated from the outside by calling .updateRuleX(value).
				Plot.ruleX([data?.all[0].time], {
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
