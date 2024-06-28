<script lang="ts">
	import type {
		DailyWeather,
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
	import {
		MS_IN_DAY,
		MS_IN_HOUR,
		MS_IN_MINUTE,
		MS_IN_SECOND,
		SOLARIZED_BLUE,
		SOLARIZED_RED,
		WMO_CODES
	} from '$lib/util';
	import type { Markish } from '@observablehq/plot';
	import dayjs from 'dayjs';

	let {
		nsWeatherData,
		start = Date.now(),
		hours = 24,
		xAxis = true,
		ghostTracker = false
	}: {
		nsWeatherData: NsWeatherData;
		start?: number;
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

		// const msStart = +dayjs(start).startOf('hour');
		const msStart = Math.floor(start / MS_IN_HOUR) * MS_IN_HOUR;
		const msEnd = msStart + hours * MS_IN_HOUR;

		type SolarEventItem = {
			x: number;
			type: string;
		};

		const solarEvents = nsWeatherData.daily?.reduce(
			(accumulator: SolarEventItem[], current: DailyWeather) => {
				if (current.sunrise > msStart && current.sunrise < msEnd) {
					accumulator.push({
						x: current.sunrise,
						type: 'sunrise'
					});
				}
				if (current.sunset > msStart && current.sunset < msEnd) {
					accumulator.push({
						x: current.sunset,
						type: 'sunset'
					});
				}
				return accumulator;
			},
			[] as SolarEventItem[]
		);

		if (nsWeatherData.minutely) {
			const filtered = nsWeatherData.minutely.filter((item) => {
				return item.ms >= msStart && item.ms <= msEnd;
			});

			const minute0 = filtered.filter((d) => d.minute == 0);

			type CodesItem = {
				weatherCode: number;
				text: string;
				x1: number;
				x2: number;
				xMiddle: number;
				fill: string;
				isDarkText: boolean;
				opacity: number;
			};

			const now = Date.now();

			const minute0withoutLast = minute0.toSpliced(-1, 1);

			const codes = minute0withoutLast.reduce(
				(accumulator: CodesItem[], current: MinutelyWeather) => {
					const prevItem = accumulator.at(-1);
					const prevCode = prevItem?.weatherCode;
					const nextCode = current.hourly?.weatherCode;

					const x1 = current.ms;
					const x2 = Math.min(current.ms + MS_IN_HOUR, msEnd);

					if (prevItem && prevCode == nextCode && prevCode != undefined) {
						prevItem.x2 = x2;
						prevItem.xMiddle = (Number(prevItem.x1) + x2) / 2;
					} else {
						if (nextCode != undefined) {
							accumulator.push({
								weatherCode: nextCode,
								text: WMO_CODES[nextCode].description,
								icon: WMO_CODES[nextCode].icon,
								x1,
								x2,
								xMiddle: (Number(x1) + Number(x2)) / 2,
								fill: WMO_CODES[nextCode].color,
								isDarkText: WMO_CODES[nextCode].isDarkText,
								opacity: current.ms < now ? 0.2 : 1
							});
						}
					}
					return accumulator;
				},
				[] as CodesItem[]
			);

			const rain = minute0withoutLast
				.filter((d) => d.precipitation > 0)
				.map((d) => {
					const x1bar = d.ms + 5 * MS_IN_MINUTE;
					const x2bar = Math.min(d.ms + 55 * MS_IN_MINUTE, msEnd);
					const y = d.precipitationNormalized;

					return {
						x1bar,
						x2bar,
						x1line: x1bar + 60,
						x2line: x2bar - 60,
						y,
						y2: y + 0.01,
						opacity: d.ms < now ? 0.2 : 1
					};
				});

			let low = {
				ms: 0,
				temperatureNormalized: Number.MAX_VALUE,
				temperature: Number.MAX_VALUE,
				dx: 0,
				dy: 0
			};

			let high = {
				ms: 0,
				temperatureNormalized: 0,
				temperature: 0,
				dx: 0,
				dy: 0
			};

			_.forEachRight(filtered, (item, index) => {
				let dx = 0;
				if (index < 5) {
					dx = 10 - index;
				} else if (index >= (filtered.length || 0) - 6) {
					dx = -10 + ((filtered.length || 0) - index);
				}

				const temperatureNormalized = item.temperatureNormalized;

				const dy = item.temperatureNormalized < 0.5 ? -10 : 10;

				if (item.temperature > high.temperature) {
					high = {
						ms: item.ms,
						temperatureNormalized,
						temperature: item.temperature,
						dx,
						dy
					};
				}

				if (item.temperature < low.temperature || (ghostTracker && low.ms >= high.ms)) {
					low = {
						ms: item.ms,
						temperatureNormalized,
						temperature: item.temperature,
						dx,
						dy
					};
				}
			});

			return {
				all: filtered,
				low,
				high,
				rain,
				codes,
				solarEvents
			};
		}
		return null;
	});

	function fadePastValues(d: { ms: number }) {
		const now = Date.now();
		if (d.ms < now) {
			return 0.5;
		}
		return 1;
	}

	const curve = 'catmull-rom';

	// Generate and place Obervable.Plot from data.
	function plotData() {
		//gg('plotData');

		const plotOptions = {
			width: clientWidth,
			height: 70,
			marginRight: 12,
			marginLeft: 12,
			marginTop: 0,
			marginBottom: 0,
			y: { axis: null }
		};

		if (!data?.all?.length) {
			plot = undefined;
		} else {
			const marks: Markish[] = [
				//Plot.frame(),

				// Weather code colored bands:
				Plot.rectY(data.codes, {
					strokeOpacity: 'opacity',
					x1: 'x1',
					x2: 'x2',
					y: 1.45,
					fill: 'fill'
				}),

				// The humidity plotted as area:
				Plot.areaY(data?.all, {
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: 'humidityNormalized',
					curve,
					stroke: '#2aa198',
					strokeWidth: 1.5,
					fill: 'rgba(42, 161, 152, .3)'
				}),

				// The precipitation probability plotted as area:
				Plot.areaY(data?.all, {
					strokeOpacity: (d) => (d.precipitationProbabilityNormalized <= 0 ? 0 : fadePastValues(d)),
					x: 'ms',
					y: 'precipitationProbabilityNormalized',
					curve,
					stroke: 'blue',
					strokeWidth: 1.5,
					fill: 'rgba(0, 0, 255, .3)'
				}),

				// Rain bar:
				Plot.rectY(data.rain, {
					strokeOpacity: 'opacity',
					x1: 'x1bar',
					x2: 'x2bar',
					y: 'y',
					fill: 'lightblue'
				}),

				// Rain bar 'cap':
				Plot.rect(data.rain, {
					strokeOpacity: 'opacity',
					x1: 'x1line',
					x2: 'x2line',
					y1: 'y',
					y2: 'y2',
					stroke: 'darkcyan'
				}),

				/*
				// Weather code label shadow text:
				Plot.text(data.codes, {
					fontSize: 14,
					x: 'xMiddle',
					y: 1.2,
					dx: 1,
					dy: 1,
					textAnchor: 'middle',
					text: (d) => {
						const ox1 = plot?.scale('x')?.apply(d.x1);
						const ox2 = plot?.scale('x')?.apply(d.x2);
						const text = ox2 - ox1 > 80 ? d.text : null;
						return text;
					},
					fill: (d) => (d.isDarkText ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)')
				}),

				// Weather code label text:
				Plot.text(data.codes, {
					fontSize: 14,
					x: 'xMiddle',
					y: 1.2,
					textAnchor: 'middle',
					text: (d) => {
						const ox1 = plot?.scale('x')?.apply(d.x1);
						const ox2 = plot?.scale('x')?.apply(d.x2);
						const text = ox2 - ox1 > 80 ? d.text : null;
						return text;
					},
					fill: (d) => (d.isDarkText ? 'black' : 'white')
				}),
                */

				// Weather code icon:
				Plot.image(data.codes, {
					x: 'xMiddle',
					y: 1,
					dy: -6,
					width: 18,
					height: 18,
					src: 'icon'
				}),

				// The dew point plotted as line:
				Plot.lineY(data?.all, {
					x: 'ms',
					y: 'dewPointNormalized',
					curve,
					stroke: '#268bd2',
					strokeWidth: 2,
					strokeOpacity: fadePastValues
				}),

				// The temperature plotted as line:
				Plot.lineY(data?.all, {
					x: 'ms',
					y: 'temperatureNormalized',
					curve,
					stroke: 'black',
					strokeWidth: 2,
					strokeOpacity: fadePastValues
				}),

				// High/low temp marks:
				Plot.dot([data.low], {
					fillOpacity: fadePastValues,
					x: 'ms',
					y: 'temperatureNormalized',
					fill: SOLARIZED_BLUE
				}),
				Plot.dot([data.high], {
					fillOpacity: fadePastValues,
					x: 'ms',
					y: 'temperatureNormalized',
					fill: SOLARIZED_RED
				}),

				/*
				// Plot sunrise as yellow rule and sunset as orange rule:
				Plot.ruleX(data?.solarEvents, {
					x: 'x',
					y1: 0,
					y2: 1.5,
					stroke: (d) => (d.type === 'sunrise' ? 'yellow' : 'orange')
				}),
                */

				// Plot sunrise as yellow rule and sunset as icons:
				Plot.image(data?.solarEvents, {
					x: 'x',
					y: 0,
					dy: -6,
					width: 32,
					height: 32,
					src: (d) => `/icons/meteocons/${d.type}.png`
				}),

				// Dot that marks value at mouse (hover) position:
				Plot.dot(data?.all, Plot.pointerX({ x: 'ms', y: 'temperatureNormalized', fill: 'purple' }))
			];

			marks.push(
				// A custom ruleX than can be updated from the outside by calling .updateRuleX(value).
				Plot.ruleX([data?.all[0].ms], {
					// @ts-expect-error: needed to hide y-axis:
					y: { axis: null },
					render: (i, s, v, d, c, next) => {
						const [msStart, msEnd] = Array.from(s.scales.x?.domain || []);

						// @ts-expect-error: add custom property: .updateRuleX
						c.ownerSVGElement.updateRuleX = (value: number) => {
							const msValue = Math.floor(Number(value) / 10 / MS_IN_MINUTE) * 10 * MS_IN_MINUTE;

							const pg = d3.select(div).select('svg');
							pg.select('.tracker-rect').remove();

							function drawTracker(ms: number, length: number, color: string) {
								const ig = pg.append('g').attr('class', 'tracker-rect');
								if (s.scales.x && s.scales.y) {
									const x = s.scales.x.apply(ms);
									const y = s.scales.y?.apply(1.45);

									const width = s.scales.x.apply(ms + length) - x;
									const height = s.scales.y?.apply(0) - y;

									ig.append('rect')
										.attr('x', x)
										.attr('width', width)
										.attr('y', y)
										.attr('height', height)
										.attr('stroke', color)
										.attr('fill', 'rgba(0,0,0,0)');
								}
							}

							const interval = nsWeatherData.intervals.find((item) => item.ms === msValue);
							const length = interval ? interval.x2 - msValue : MS_IN_HOUR;

							/*
							gg(
								'msValue',
								msValue,
								nsWeatherData.tzFormat(msValue),
								length / MS_IN_MINUTE,
								interval,
								$state.snapshot(nsWeatherData.intervals)
							);
                            */

							if (msValue >= msStart && msValue < msEnd) {
								drawTracker(msValue, length, 'purple');
							} else if (ghostTracker) {
								let offset = (msValue + nsWeatherData.utcOffsetSeconds * MS_IN_SECOND) % MS_IN_DAY;
								const ghostTime = Number(msStart) + offset;

								drawTracker(ghostTime, length, 'rgba(128,0,128,.2)');
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
					type: 'utc',
					tickFormat: (ms) => nsWeatherData.tzFormat(ms, 'ha')
				},
				marks
			});
		}

		const placeholderPlot = Plot.plot(plotOptions);
		div?.firstChild?.remove(); // remove old chart, if any
		div?.append(plot || placeholderPlot); // add the new chart

		if (plot) {
			plot.addEventListener('input', (event) => {
				//gg($state.snapshot(plot.value), event);

				if (plot?.value?.ms) {
					emit('weatherdata_requestedSetTime', { ms: plot?.value?.ms });
				}
			});
		}
	}

	// Update rule location only (leaving rest of plot intact).
	// Runs every time nsWeatherData.ms changes value.
	$effect(() => {
		//gg('EFFECT');

		// @ts-expect-error: use custom property: .updateRuleX
		if (plot?.updateRuleX) {
			// @ts-expect-error: use custom property: .updateRuleX
			plot.updateRuleX(nsWeatherData.ms);
		}
	});

	// Update entire plot.
	// Runs on weatherdata_updatedData event from nsWeatherData.
	async function callPlotData() {
		await tick();
		if (!plot) {
			// Hack: force extra render so plot.scale() is available.
			plotData();
		}
		plotData();
	}
	on('weatherdata_updatedData', callPlotData);
	on('weatherdata_updatedRadar', callPlotData);

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

	div {
		user-select: none;
	}
</style>
