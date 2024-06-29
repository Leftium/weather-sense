<script context="module" lang="ts">
	let adjustedLabelWidths = $state(false);
</script>

<script lang="ts">
	import type { DailyWeather, NsWeatherData, WeatherDataEvents } from '$lib/ns-weather-data.svelte';

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
		WMO_CODES,
	} from '$lib/util';
	import type { Markish } from '@observablehq/plot';
	import dayjs from 'dayjs';

	let {
		nsWeatherData,
		start = Date.now(),
		hours = 24,
		xAxis = true,
		ghostTracker = false,
	}: {
		nsWeatherData: NsWeatherData;
		start?: number;
		hours?: number;
		xAxis?: boolean;
		ghostTracker?: boolean;
	} = $props();

	const wmoLabelElements: HTMLElement[] = $state([]);

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	const ICON_WIDTH = 18;
	const GAP_WIDTH = 2;
	const MARGIN_LEFT = 12;
	const MARGIN_RIGHT = 12;
	const ICON_LABEL_PADDING = 16;

	// const msStart = +dayjs(start).startOf('hour');
	const msStart = Math.floor(start / MS_IN_HOUR) * MS_IN_HOUR;
	const msEnd = msStart + hours * MS_IN_HOUR;

	let div: HTMLDivElement;
	let clientWidth: number = $state(0);
	let plot: undefined | ReturnType<typeof Plot.plot> = $state();

	let data = $derived.by(() => {
		//gg('data');

		type SolarEventItem = {
			ms: number;
			x: number;
			type: string;
		};

		const solarEvents = nsWeatherData.daily?.reduce(
			(accumulator: SolarEventItem[], current: DailyWeather) => {
				if (current.sunrise > msStart && current.sunrise < msEnd) {
					const ms = current.sunrise;
					accumulator.push({
						ms,
						x: ms,
						type: 'sunrise',
					});
				}
				if (current.sunset > msStart && current.sunset < msEnd) {
					const ms = current.sunset;
					accumulator.push({
						ms,
						x: ms,
						type: 'sunset',
					});
				}
				return accumulator;
			},
			[] as SolarEventItem[],
		);

		const dataValues = [...nsWeatherData.data.values()];
		if (dataValues) {
			const filtered = dataValues.filter((item) => {
				return item.ms >= msStart && item.ms <= msEnd;
			});

			const minute0 = filtered;

			type CodesItem = {
				ms: number;
				weatherCode: number;
				text: string;
				icon: string;
				x1: number;
				x2: number;
				xMiddle: number;
				fill: string;
				isDarkText: boolean;
				opacity: number;
			};

			const now = Date.now();

			const minute0withoutLast = minute0.toSpliced(-1, 1);

			const codes = minute0withoutLast.reduce((accumulator: CodesItem[], current) => {
				const prevItem = accumulator.at(-1);
				const prevCode = prevItem?.weatherCode;
				const nextCode = current.weatherCode;

				const x1 = current.ms;
				const x2 = Math.min(current.ms + MS_IN_HOUR, msEnd);
				const xMiddle = (Number(x1) + Number(x2)) / 2;

				if (prevItem && prevCode == nextCode && prevCode != undefined) {
					prevItem.x2 = x2;
					prevItem.xMiddle = (Number(prevItem.x1) + x2) / 2;
				} else {
					if (nextCode != undefined) {
						accumulator.push({
							ms: xMiddle,
							weatherCode: nextCode,
							text: WMO_CODES[nextCode].description,
							icon: WMO_CODES[nextCode].icon,
							x1,
							x2,
							xMiddle,
							fill: WMO_CODES[nextCode].color,
							isDarkText: WMO_CODES[nextCode].isDarkText,
							opacity: current.ms < now ? 0.2 : 1,
						});
					}
				}
				return accumulator;
			}, [] as CodesItem[]);

			const rain = minute0withoutLast
				.filter((d) => d.precipitation > 0)
				.map((d) => {
					const x1bar = d.ms + 5 * MS_IN_MINUTE;
					const x2bar = Math.min(d.ms + 55 * MS_IN_MINUTE, msEnd);
					const precipitation = d.precipitation;

					return {
						x1bar,
						x2bar,
						x1line: x1bar + 60,
						x2line: x2bar - 60,
						precipitation,
						opacity: d.ms < now ? 0.2 : 1,
					};
				});

			let low = {
				ms: 0,
				temperature: Number.MAX_VALUE,
			};

			let high = {
				ms: 0,
				temperature: 0,
			};

			_.forEachRight(filtered, (item, index) => {
				if (item.temperature > high.temperature) {
					high = {
						ms: item.ms,
						temperature: item.temperature,
					};
				}

				if (item.temperature < low.temperature || (ghostTracker && low.ms >= high.ms)) {
					low = {
						ms: item.ms,
						temperature: item.temperature,
					};
				}
			});

			return {
				all: filtered,
				low,
				high,
				rain,
				codes,
				solarEvents,
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

	function makeTransformPercentage(keyName: string) {
		return (da: any[]) => da.map((d) => d[keyName] / 100);
	}

	function makeTransFormPrecipitation() {
		return (da: any[]) => da.map((d) => 1 - Math.exp(-d.precipitation / 2));
	}

	function makeTransformTemperature(keyName = 'temperature') {
		return function (da: any[]) {
			const { minTemperature, temperatureRange } = nsWeatherData.temperatureStats;
			return da.map((d) => (d[keyName] - minTemperature) / temperatureRange);
		};
	}

	const curve = 'catmull-rom';

	// Generate and place Obervable.Plot from data.
	function plotData() {
		//gg('plotData');

		const plotOptions = {
			width: clientWidth,
			height: 70,
			marginRight: MARGIN_RIGHT,
			marginLeft: MARGIN_LEFT,
			marginTop: 0,
			marginBottom: 0,
			y: { axis: null },
			x: {
				type: 'utc',
				domain: [msStart, msEnd],
				range: [MARGIN_LEFT, clientWidth - MARGIN_RIGHT],
				tickFormat: (ms: number) => nsWeatherData.tzFormat(ms, 'ha'),
			},
		};

		if (!xAxis) {
			//@ts-expect-error: axis is valid prop.
			plotOptions.x.axis = null;
		}

		// @ts-expect-error: x.type is valid.
		const xScale = Plot.scale(plotOptions);

		const labelTextOptions = {
			opacity: fadePastValues,
			fontSize: 14,
			fill: (d: { isDarkText: any }) => (d.isDarkText ? 'black' : 'white'),
			y: 1.2,
			x: (d) => {
				if (!xScale?.invert) {
					return d.xMiddle;
				}

				const iconWidthMs = xScale.invert(ICON_WIDTH + MARGIN_LEFT) - msStart;
				const gapWidthMs = xScale.invert(GAP_WIDTH / 2 + MARGIN_LEFT) - msStart;

				return d.xMiddle + (iconWidthMs + gapWidthMs) / 2;
			},
			text: (d) => {
				const labelWidth: number = WMO_CODES[d.weatherCode].width;
				const width = xScale?.apply(d.x2) - xScale?.apply(d.x1) - ICON_LABEL_PADDING;
				return width < labelWidth + ICON_WIDTH + GAP_WIDTH ? null : d.text;
			},
		} as Plot.TextOptions;

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
					fill: 'fill',
				}),

				/*
				// The humidity plotted as area:
				Plot.areaY(data?.all, {
					curve,
					opacity: fadePastValues,
					x: 'ms',
					y: { transform: makeTransformPercentage('humidity') },
					fill: 'rgba(42, 161, 152, .2)',
				}),

				// The humidity plotted as line:
				Plot.lineY(data?.all, {
					curve,
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: { transform: makeTransformPercentage('humidity') },

					stroke: '#2aa198',
					strokeWidth: 1.5,
				}),
                */

				// The precipitation probability plotted as area:
				Plot.areaY(data?.all, {
					curve,
					opacity: (d) => (d.precipitationProbability <= 0 ? 0 : fadePastValues(d)),
					x: 'ms',
					y: { transform: makeTransformPercentage('precipitationProbability') },
					fill: 'rgba(0, 0, 255, .2)',
				}),

				// The precipitation probability plotted as line:
				Plot.lineY(data?.all, {
					curve,
					strokeOpacity: (d) => (d.precipitationProbability <= 0 ? 0 : fadePastValues(d)),
					x: 'ms',
					y: { transform: makeTransformPercentage('precipitationProbability') },
					stroke: 'blue',
					strokeWidth: 1.5,
				}),

				// Rain bar:
				Plot.rectY(data.rain, {
					strokeOpacity: 'opacity',
					x1: 'x1bar',
					x2: 'x2bar',
					y: { transform: makeTransFormPrecipitation() },
					fill: 'lightblue',
				}),

				// Rain bar 'cap':
				Plot.ruleY(data.rain, {
					strokeOpacity: 'opacity',
					x1: 'x1line',
					x2: 'x2line',
					y: { transform: makeTransFormPrecipitation() },
					stroke: 'darkcyan',
					strokeWidth: 2,
				}),

				// Weather code label shadow text:
				Plot.text(data.codes, {
					...labelTextOptions,
					fill: (d) => (d.isDarkText ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'),
					dy: 1,
					dx: 1,
				}),

				// Weather code label text:
				Plot.text(data.codes, labelTextOptions),

				// Weather code icon:
				Plot.image(data.codes, {
					opacity: fadePastValues,
					width: ICON_WIDTH,
					height: ICON_WIDTH,
					y: 1.2,
					x: (d) => {
						if (!xScale?.invert) {
							return d.xMiddle;
						}

						const labelWidth: number = WMO_CODES[d.weatherCode].width;
						const labelWidthMs = xScale.invert(labelWidth + MARGIN_LEFT) - msStart;
						const gapWidthMS = xScale.invert(GAP_WIDTH / 2 + MARGIN_LEFT) - msStart;

						const width = xScale.apply(d.x2) - xScale.apply(d.x1) - ICON_LABEL_PADDING;
						const isTooWide = width < labelWidth + ICON_WIDTH + GAP_WIDTH;

						return d.xMiddle - (isTooWide ? 0 : (labelWidthMs + gapWidthMS) / 2);
					},
					src: (d) => {
						const width = xScale?.apply(d.x2) - xScale?.apply(d.x1);
						return width < ICON_WIDTH ? null : d.icon;
					},
				}),

				// The dew point plotted as line:
				Plot.lineY(data?.all, {
					curve,
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: {
						transform: makeTransformTemperature('dewPoint'),
					},

					stroke: '#268bd2',
					strokeWidth: 2,
				}),

				// The temperature plotted as line:
				Plot.lineY(data?.all, {
					curve,
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: {
						transform: makeTransformTemperature(),
					},
					stroke: 'black',
					strokeWidth: 2,
				}),

				// High/low temp marks:
				Plot.dot([data.low], {
					fillOpacity: fadePastValues,
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: {
						transform: makeTransformTemperature(),
					},
					fill: SOLARIZED_BLUE,
					stroke: 'black',
				}),
				Plot.dot([data.high], {
					fillOpacity: fadePastValues,
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: {
						transform: makeTransformTemperature(),
					},
					fill: SOLARIZED_RED,
					stroke: 'black',
					strokeWidth: 1,
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
					width: 32,
					height: 32,
					opacity: fadePastValues,
					x: 'x',
					y: 0.1,
					src: (d) => `/icons/meteocons/${d.type}.png`,
				}),

				// Dot that marks value at mouse (hover) position:
				Plot.dot(
					data?.all,
					Plot.pointerX({
						x: 'ms',
						y: {
							transform: makeTransformTemperature(),
						},
						fill: 'purple',
					}),
				),
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
									const x1 = s.scales.x.apply(ms);
									const x2 = s.scales.x.apply(ms + length);
									const y = s.scales.y?.apply(0);

									ig.append('line')
										.attr('x1', x1)
										.attr('x2', x2)
										.attr('y1', y)
										.attr('y2', y)
										.attr('stroke', color)
										.attr('stroke-width', 4)
										.attr('stroke-linecap', 'round');
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
								drawTracker(msValue, length, 'red');
							} else if (ghostTracker) {
								let offset = (msValue + nsWeatherData.utcOffsetSeconds * MS_IN_SECOND) % MS_IN_DAY;
								const ghostTime = Number(msStart) + offset;

								drawTracker(ghostTime, length, 'rgba(256,0,0,0.3)');
							}
						};

						// Render next marks.
						if (next) {
							return next(i, s, v, d, c);
						}
						return null;
					},
				}),
			);

			//@ts-expect-error: x.type is valid.
			plot = Plot.plot({ ...plotOptions, marks });
		}

		div?.firstChild?.remove(); // remove old chart, if any
		if (plot) {
			div?.append(plot); // add the new chart
		}

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

		if (!adjustedLabelWidths) {
			adjustedLabelWidths = true;
			gg('getLabelWidths');
			wmoLabelElements.forEach((element) => {
				const code = Number(element.dataset.code);
				//gg(code);
				const width = element.clientWidth;
				WMO_CODES[code].width = width;
			});
		}

		// TODO: cleanup with resizeObserver.unobserve()?
	});
</script>

{#if !adjustedLabelWidths}
	<div class="labels-for-widths">
		{#each Object.entries(WMO_CODES) as [code, props], index}
			<div bind:this={wmoLabelElements[index]} data-code={code}>{props.description}</div>
		{/each}
	</div>
{/if}

<div bind:this={div} bind:clientWidth role="img"></div>

<style>
	div,
	div > :global(svg) {
		overflow: visible !important;
	}

	div {
		user-select: none;
	}

	.labels-for-widths {
		visibility: hidden;
		height: 0;

		display: flex;

		font-size: 14px;
		font-family: system-ui, sans-serif;

		font-weight: 400;
		white-space: nowrap;
	}
</style>
