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
		colors,
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

	const draw: Record<string, boolean | string> = {
		weatherCode: true, // true, 'icon', 'text', 'color'
		humidity: false,
		precipitationProbability: true,
		precipitation: true,
		dewPoint: true,
		temperature: true,
		solarEvents: true,
	};

	const msStart = $derived(+dayjs.tz(start, nsWeatherData.timezone).startOf('hour'));
	const msEnd = $derived(msStart + hours * MS_IN_HOUR);

	let div: HTMLDivElement;
	let clientWidth: number = $state(0);

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
			};

			const now = Date.now();

			const minute0withoutLast = minute0.toSpliced(-1, 1);

			const codes = minute0withoutLast.reduce((accumulator: CodesItem[], current) => {
				const prevItem = accumulator.at(-1);
				const prevCode = prevItem?.weatherCode;
				const nextCode = current.weatherCode;

				const x1 = current.ms;
				const x2 = Math.min(current.ms + MS_IN_HOUR + 2 * MS_IN_MINUTE, msEnd);
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
						ms: d.ms,
						x1bar,
						x2bar,
						x1line: x1bar + 60,
						x2line: x2bar - 60,
						precipitation,
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

	// Svelte action for timeline.
	function trackable(node: HTMLElement) {
		let trackUntilMouseUp = false;
		let mouseIsOver = false;

		function trackToMouseX(e: PointerEvent | MouseEvent) {
			const svgNode = d3.select(div).select('svg').select('g[aria-label=rect]').node();
			if (xScale.invert) {
				const [x] = d3.pointer(e, svgNode);
				const ms = _.clamp(xScale.invert(x), msStart, msEnd);

				emit('weatherdata_requestedSetTime', { ms });
			}
		}

		function handlePointerMove(e: PointerEvent) {
			if (nsWeatherData.trackedElement === node) {
				trackToMouseX(e);
			} else if (mouseIsOver && nsWeatherData.trackedElement === null) {
				trackToMouseX(e);
				emit('weatherdata_requestedTrackingStart', { node });
			}
		}

		function handlePointerDown(e: PointerEvent) {
			gg('handlePointerDown');
			trackUntilMouseUp = true;
			trackToMouseX(e);
			emit('weatherdata_requestedTrackingStart', { node });
		}

		function handlePointerUp(e: PointerEvent) {
			if (nsWeatherData.trackedElement === node) {
				gg('handlePointerUp');
				trackUntilMouseUp = false;
				emit('weatherdata_requestedTrackingEnd');
			}
		}

		function handleMMouseEnter(e: MouseEvent) {
			mouseIsOver = true;
			if (!nsWeatherData.trackedElement) {
				gg('handleMMouseEnter', nsWeatherData.trackedElement);
				trackToMouseX(e);
				emit('weatherdata_requestedTrackingStart', { node });
			}
		}

		function handleMMouseLeave(e: MouseEvent) {
			mouseIsOver = false;
			if (nsWeatherData.trackedElement === node && !trackUntilMouseUp) {
				gg('handleMMouseLeave');
				emit('weatherdata_requestedTrackingEnd');
			}
		}

		const abortController = new AbortController();
		const { signal } = abortController;

		window.addEventListener('pointermove', handlePointerMove, { signal });

		div.addEventListener('pointerdown', handlePointerDown, { signal });
		window.addEventListener('pointerup', handlePointerUp, { signal });

		div.addEventListener('mouseenter', handleMMouseEnter, { signal });
		div.addEventListener('mouseleave', handleMMouseLeave, { signal });

		return {
			destroy() {
				abortController.abort();
			},
		};
	}

	function fadePastValues(d: { ms: number }) {
		const now = Date.now();
		if (d.ms < now) {
			return 0.75;
		}
		return 1;
	}

	function makeTransFormPrecipitation(onlyLinear: boolean) {
		const LINEAR_MAX = 20;

		const LINEAR_SECTION = 70;
		const CAP_BONUS = 3;

		return (da: any[]) => {
			const resultArray = da.map((d) => {
				const p = d.precipitation;

				// Linear scale maxing at 20mm/hr:
				let resultValue =
					LINEAR_MAX > 0 ? (Math.min(p, LINEAR_MAX) / LINEAR_MAX) * LINEAR_SECTION : 0;

				if (!onlyLinear) {
					resultValue += CAP_BONUS; // Add to get 'cap'
					if (p >= LINEAR_MAX) {
						resultValue +=
							(140 - LINEAR_SECTION - CAP_BONUS) * (1 - Math.exp(-(p - LINEAR_MAX) / 200));
					}
				}
				return resultValue;
			});
			if (!onlyLinear) {
				//gg(resultArray);
			}

			return resultArray;
		};
	}

	function makeTransformTemperature(keyName = 'temperature') {
		return function (da: any[]) {
			const { minTemperature, temperatureRange } = nsWeatherData.temperatureStats;
			return da.map((d) => (100 * (d[keyName] - minTemperature)) / temperatureRange);
		};
	}

	const curve = 'catmull-rom';
	const plotOptions = $derived({
		width: clientWidth,
		height: 70,
		marginRight: MARGIN_RIGHT,
		marginLeft: MARGIN_LEFT,
		marginTop: 0,
		marginBottom: 0,
		y: { axis: null, domain: [145, 0], range: [0, 70] },
		x: {
			type: 'utc',
			axis: xAxis ? true : null,
			domain: [msStart, msEnd],
			range: [MARGIN_LEFT, clientWidth - MARGIN_RIGHT],
			tickFormat: (ms: number) => nsWeatherData.tzFormat(ms, 'ha'),
		},
	});

	// @ts-expect-error: x.type is valid.
	const xScale = $derived(Plot.scale({ x: plotOptions.x }));
	const yScale = $derived(Plot.scale({ y: plotOptions.y }));

	function updateRuleX(value: number) {
		const msIntervalStart = Math.floor(Number(value) / 10 / MS_IN_MINUTE) * 10 * MS_IN_MINUTE;
		const interval = nsWeatherData.intervals.find((item) => item.ms === msIntervalStart);
		const length = interval ? interval.x2 - msIntervalStart : MS_IN_HOUR;

		const pg = d3.select(div).select('svg');
		pg.select('.tracker-rect').remove();

		function drawTracker(ms: number, length: number, color: string) {
			const ig = pg.append('g').attr('class', 'tracker-rect');

			const x1 = xScale.apply(ms);
			const x2 = xScale.apply(Math.min(ms + length, msEnd));
			const y1 = yScale.apply(145);
			const y2 = yScale.apply(0);

			ig.append('line')
				.attr('x1', x1)
				.attr('x2', x1)
				.attr('y1', y1)
				.attr('y2', y2)
				.attr('stroke', color)
				.attr('stroke-width', 2);

			ig.append('rect')
				.attr('x', x1)
				.attr('y', y1)
				.attr('width', x2 - x1)
				.attr('height', y2 - y1)
				.attr('fill', color)
				.attr('opacity', 0.6);
		}

		if (msIntervalStart >= msStart && msIntervalStart < msEnd) {
			drawTracker(msIntervalStart, length, 'yellow');
		} else if (ghostTracker) {
			const offset = (msIntervalStart + nsWeatherData.utcOffsetSeconds * MS_IN_SECOND) % MS_IN_DAY;
			const ghostTime = Number(msStart) + offset;
			drawTracker(ghostTime, length, 'white');
		}
	}

	// Generate and place Obervable.Plot from data.
	function plotData() {
		//gg('plotData');

		if (!data?.all?.length) {
			return;
		}

		const labelTextOptions = {
			opacity: fadePastValues,
			fontSize: 14,
			fill: (d: { isDarkText: any }) => (d.isDarkText ? 'black' : 'white'),
			y: 120,
			x: (d) => {
				if (!xScale?.invert || draw.weatherCode === 'text') {
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

		const marks: Markish[] = [
			// Background; also needed for d3.pointer() target.
			Plot.rectY([0], {
				x1: msStart,
				x2: msEnd,
				y: 145,
				fill: '#efefef',
			}),
		];

		if (draw.weatherCode) {
			// Weather code colored bands:
			marks.push(
				Plot.rectY(data.codes, {
					strokeOpacity: fadePastValues,
					x1: 'x1',
					x2: 'x2',
					y: 145,
					fill: 'fill',
				}),
			);
		}

		if (draw.humidity) {
			marks.push(
				// The humidity plotted as area:
				Plot.areaY(data.all, {
					curve,
					opacity: (d) => fadePastValues(d) * 0.2,
					x: 'ms',
					y: 'humidity',
					fill: colors.humidity,
				}),
			);

			marks.push(
				// The humidity plotted as line:
				Plot.lineY(data.all, {
					curve,
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: 'humidity',

					stroke: colors.humidity,
					strokeWidth: 1.5,
				}),
			);
		}

		if (draw.precipitation) {
			// Rain bar 'cap':
			marks.push(
				Plot.rectY(data.rain, {
					opacity: fadePastValues,
					strokeOpacity: fadePastValues,
					x1: 'x1bar',
					x2: 'x2bar',
					y: { transform: makeTransFormPrecipitation(false) },
					fill: '#58FAF9',
				}),
			);

			//Rain bar:
			marks.push(
				Plot.rectY(data.rain, {
					opacity: fadePastValues,
					x1: 'x1bar',
					x2: 'x2bar',
					y: { transform: makeTransFormPrecipitation(true) },
					fill: colors.precipitation,
				}),
			);
		}

		if (draw.precipitationProbability) {
			// The precipitation probability plotted as area:
			marks.push(
				Plot.areaY(data.all, {
					curve,
					opacity: (d) => (d.precipitationProbability <= 0 ? 0 : fadePastValues(d) * 0.2),
					x: 'ms',
					y: 'precipitationProbability',
					fill: colors.precipitationProbability,
				}),
			);

			// The precipitation probability plotted as line:
			marks.push(
				Plot.lineY(data.all, {
					curve,
					strokeOpacity: (d) => (d.precipitationProbability <= 0 ? 0 : fadePastValues(d)),
					x: 'ms',
					y: 'precipitationProbability',
					stroke: colors.precipitationProbability,
					strokeWidth: 1.5,
				}),
			);
		}

		if (draw.weatherCode === true || draw.weatherCode === 'text') {
			// Weather code label shadow text:
			marks.push(
				Plot.text(data.codes, {
					...labelTextOptions,
					fill: (d) => (d.isDarkText ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'),
					dy: 1,
					dx: 1,
				}),
			);

			marks.push(
				// Weather code label text:
				Plot.text(data.codes, labelTextOptions),
			);
		}

		if (draw.weatherCode == true || draw.weatherCode === 'icon') {
			marks.push(
				// Weather code icon:
				Plot.image(data.codes, {
					opacity: fadePastValues,
					width: ICON_WIDTH,
					height: ICON_WIDTH,
					y: 120,
					x: (d) => {
						if (!xScale?.invert || draw.weatherCode === 'icon') {
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
			);
		}

		if (draw.dewPoint) {
			marks.push(
				// The dew point plotted as line:
				Plot.lineY(data?.all, {
					curve,
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: {
						transform: makeTransformTemperature('dewPoint'),
					},

					stroke: colors.dewPoint,
					strokeWidth: 2,
				}),
			);
		}

		if (draw.temperature) {
			marks.push(
				// The temperature plotted as line:
				Plot.lineY(data?.all, {
					curve,
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: {
						transform: makeTransformTemperature(),
					},
					stroke: colors.temperature,
					strokeWidth: 2,
				}),
			);

			marks.push(
				// High/low temp marks:
				Plot.dot([data.low], {
					fillOpacity: fadePastValues,
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: {
						transform: makeTransformTemperature(),
					},
					fill: SOLARIZED_BLUE,
					stroke: colors.temperature,
				}),
			);

			marks.push(
				Plot.dot([data.high], {
					fillOpacity: fadePastValues,
					strokeOpacity: fadePastValues,
					x: 'ms',
					y: {
						transform: makeTransformTemperature(),
					},
					fill: SOLARIZED_RED,
					stroke: colors.temperature,
					strokeWidth: 1,
				}),
			);
		}

		if (draw.solarEvents) {
			marks.push(
				// Plot sunrise as yellow rule and sunset as icons:
				Plot.image(data?.solarEvents, {
					width: 32,
					height: 32,
					opacity: fadePastValues,
					x: 'x',
					y: 10,
					src: (d) => `/icons/meteocons/${d.type}.png`,
				}),
			);
		}

		//@ts-expect-error: x.type is valid.
		const plot = Plot.plot({ ...plotOptions, marks });

		div?.firstChild?.remove(); // First remove old chart, if any.
		div?.append(plot); // Then add the new chart.

		// Render initial tracker.
		updateRuleX(nsWeatherData.ms);
	}

	// Update rule location only (leaving rest of plot intact).
	// Runs every time nsWeatherData.ms changes value.
	$effect(() => {
		//gg('EFFECT');
		updateRuleX(nsWeatherData.ms);
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

<div bind:this={div} bind:clientWidth use:trackable role="img"></div>

<style>
	div,
	div > :global(svg) {
		overflow: visible !important;
	}

	div {
		user-select: none;
		touch-action: none;
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
