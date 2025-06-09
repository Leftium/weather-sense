<script module lang="ts">
	let adjustedLabelWidths = $state(false);
	let labelWidths: Record<string, number> = $state({});
</script>

<script lang="ts">
	import type {
		DailyForecast,
		NsWeatherData,
		WeatherDataEvents,
	} from '$lib/ns-weather-data.svelte';

	import { clamp, each, forEachRight } from 'lodash-es';
	import * as d3 from 'd3';

	import { gg } from '$lib/gg';
	import * as Plot from '@observablehq/plot';
	import * as htl from 'htl';
	import { getEmitter } from '$lib/emitter';
	import { onMount, tick } from 'svelte';
	import {
		AQI_INDEX_EUROPE,
		AQI_INDEX_US,
		aqiEuropeToLabel,
		aqiUsToLabel,
		colors,
		contrastTextColor,
		MS_IN_10_MINUTES,
		MS_IN_DAY,
		MS_IN_HOUR,
		MS_IN_MINUTE,
		SOLARIZED_BLUE,
		SOLARIZED_RED,
		startOf,
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

	const labelElements: Record<string, HTMLElement> = $state({});

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
		aqiEurope: true,
		aqiUs: false,
	};

	const msStart = $derived(+dayjs.tz(start, nsWeatherData.timezone).startOf('hour'));
	const msEnd = $derived(msStart + hours * MS_IN_HOUR);

	let div: HTMLDivElement;
	let clientWidth: number = $state(0);

	const aqiPlotHeight = 20;

	const yDomainTop = 145;
	let yDomainBottom = $derived.by(() => {
		let value = 0;

		if (draw.aqiUs) {
			value -= aqiPlotHeight;
		}

		if (draw.aqiEurope) {
			value -= aqiPlotHeight;
		}

		return value;
	});

	let dataAirQuality = $derived.by(() => {
		//gg('data');

		if (nsWeatherData.dataAirQuality.size) {
			const filteredAirQuality = [...nsWeatherData.dataAirQuality.values()].filter((item) => {
				return item.ms >= msStart && item.ms <= msEnd;
			});

			type AqiItem = {
				ms: number;
				aqiUs: number;
				aqiEurope: number;

				text: string;
				x1: number;
				x2: number;
				xMiddle: number;
				fill: string;
				fillText: string;
				fillShadow: string;
			};

			const aqiUsLevels = filteredAirQuality.reduce((accumulator: AqiItem[], currItem) => {
				const prevItem = accumulator.at(-1);

				const prevText = prevItem ? aqiUsToLabel(prevItem.aqiUs).text : '';

				const currLabel = aqiUsToLabel(currItem.aqiUs);

				const x1 = currItem.ms;
				const x2 = Math.min(currItem.ms + MS_IN_HOUR + 2 * MS_IN_MINUTE, msEnd);
				const xMiddle = (Number(x1) + Number(x2)) / 2;

				if (prevItem && prevText === currLabel.text) {
					prevItem.ms = prevItem.x2 = x2;
					prevItem.xMiddle = (Number(prevItem.x1) + x2) / 2;
				} else {
					const fill = currLabel.color;
					const fillText = contrastTextColor(fill);
					const fillShadow = contrastTextColor(
						fill,
						true,
						`rgba(255 255 255 / 50%)`,
						`rgba(51 51 51 / 50%)`,
					);

					accumulator.push({
						ms: x2,
						aqiUs: currItem.aqiUs,
						aqiEurope: currItem.aqiEurope,
						text: currLabel.text,
						x1,
						x2,
						xMiddle,
						fill,
						fillText,
						fillShadow,
					});
				}
				return accumulator;
			}, [] as AqiItem[]);

			const aqiEuropeLevels = filteredAirQuality.reduce((accumulator: AqiItem[], currItem) => {
				const prevItem = accumulator.at(-1);

				const prevText = prevItem ? aqiEuropeToLabel(prevItem.aqiEurope).text : '';

				const currLabel = aqiEuropeToLabel(currItem.aqiEurope);

				const x1 = currItem.ms;
				const x2 = Math.min(currItem.ms + MS_IN_HOUR + 2 * MS_IN_MINUTE, msEnd);
				const xMiddle = (Number(x1) + Number(x2)) / 2;

				if (prevItem && prevText === currLabel.text) {
					prevItem.x2 = x2;
					prevItem.ms = prevItem.xMiddle = (Number(prevItem.x1) + x2) / 2;
				} else {
					const fill = currLabel.color;
					const fillText = contrastTextColor(fill);
					const fillShadow = contrastTextColor(
						fill,
						true,
						`rgba(255 255 255 / 50%)`,
						`rgba(51 51 51 / 50%)`,
					);

					accumulator.push({
						ms: x2,
						aqiUs: currItem.aqiUs,
						aqiEurope: currItem.aqiEurope,
						text: currLabel.text,
						x1,
						x2,
						xMiddle,
						fill,
						fillText,
						fillShadow,
					});
				}
				return accumulator;
			}, [] as AqiItem[]);

			return {
				aqiUsLevels,
				aqiEuropeLevels,
			};
		}
		return null;
	});

	let dataForecast = $derived.by(() => {
		//gg('data');

		type SolarEventItem = {
			ms: number;
			x: number;
			type: string;
		};

		const solarEvents = nsWeatherData.daily?.reduce(
			(accumulator: SolarEventItem[], current: DailyForecast) => {
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

		if (nsWeatherData.dataForecast.size) {
			const metrics = [...nsWeatherData.dataForecast.values()].filter((item) => {
				return item.ms >= msStart && item.ms <= msEnd;
			});

			type CodesItem = {
				ms: number;
				weatherCode: number;
				text: string;
				icon: string;
				x1: number;
				x2: number;
				xMiddle: number;
				fill: string;
				fillText: string;
				fillShadow: string;
			};

			function consolidatedWeatherCode(code: number) {
				if ([0, 1, 2, 3, 45, 48].includes(code)) {
					return 48;
				}
				if ([51, 53, 55, 80, 81, 82, 61, 63, 65].includes(code)) {
					return 65;
				}
				if ([56, 57, 66, 67].includes(code)) {
					return 67;
				}
				if ([77, 85, 86, 71, 73, 75].includes(code)) {
					return 75;
				}
				if ([95, 96, 99].includes(code)) {
					return 99;
				}
				return -1;
			}

			const codes = metrics.reduce((accumulator: CodesItem[], current) => {
				const currCodeConsolidated = consolidatedWeatherCode(current.weatherCode);

				const prevItem = accumulator.at(-1);
				const prevCode = prevItem?.weatherCode;
				const prevCodeConsolidated = prevCode
					? consolidatedWeatherCode(prevCode)
					: currCodeConsolidated;

				const nextCode =
					prevCode && prevCodeConsolidated === currCodeConsolidated
						? Math.max(prevCode, current.weatherCode)
						: current.weatherCode;
				const nextCodeConsolidated = consolidatedWeatherCode(nextCode);

				const x1 = current.ms;
				const x2 = Math.min(current.ms + MS_IN_HOUR + 2 * MS_IN_MINUTE, msEnd);

				const fill = WMO_CODES[nextCode].color;

				const draftItem = {
					ms: x2,
					weatherCode: nextCode,
					text: WMO_CODES[nextCode].description,
					icon: WMO_CODES[nextCode].icon,
					x1,
					x2,
					xMiddle: (Number(x1) + Number(x2)) / 2,
					fill: WMO_CODES[nextCode].color,
					fillText: contrastTextColor(fill),
					fillShadow: contrastTextColor(
						fill,
						true,
						`rgba(255 255 255 / 50%)`,
						`rgba(51 51 51 / 50%)`,
					),
				};

				if (prevItem && prevCodeConsolidated === nextCodeConsolidated) {
					accumulator[accumulator.length - 1] = {
						...draftItem,
						x1: prevItem.x1,
						xMiddle: (Number(prevItem.x1) + x2) / 2,
					};
				} else {
					if (nextCode != undefined) {
						accumulator.push(draftItem);
					}
				}
				return accumulator;
			}, [] as CodesItem[]);

			const rain = metrics
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

			forEachRight(metrics, (item, index) => {
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
				metrics,
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
				const ms = clamp(xScale.invert(x), msStart, msEnd);

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
			return 0.5;
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
		y: { axis: null, domain: [yDomainTop, yDomainBottom], range: [0, 70] },
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

	function updateTracker(ms: number) {
		const pg = d3.select(div).select('svg');
		pg.select('.tracker-rect').remove();

		function drawTracker(ms: number, msIntervalStart: number, length: number, color: string) {
			const ig = pg.append('g').attr('class', 'tracker-rect');

			const x = xScale.apply(ms);
			const x1 = xScale.apply(msIntervalStart);
			const x2 = xScale.apply(Math.min(msIntervalStart + length, msEnd));
			const y1 = yScale.apply(yDomainTop);
			const y2 = yScale.apply(yDomainBottom);

			ig.append('line')
				.attr('x1', x)
				.attr('x2', x)
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
				.attr('opacity', 0.4);
		}

		const msStartOf10Min = startOf(ms, MS_IN_10_MINUTES);
		const msStartOfHour = startOf(ms, MS_IN_HOUR);
		const interval =
			nsWeatherData.intervals.find((item) => item.ms === msStartOf10Min) ||
			nsWeatherData.intervals.find((item) => item.ms === msStartOfHour);

		const msIntervalStart = interval?.ms ?? ms;
		const length = interval ? interval.x2 - interval.ms : 1;

		if (msIntervalStart >= msStart && msIntervalStart < msEnd) {
			drawTracker(ms, msIntervalStart, length, 'yellow');
		} else if (ghostTracker) {
			const msGhost = msStart + ((ms + nsWeatherData.utcOffsetMs) % MS_IN_DAY);
			const msGhostInterval = msStart + ((msIntervalStart + nsWeatherData.utcOffsetMs) % MS_IN_DAY);

			drawTracker(msGhost, msGhostInterval, length, 'white');
		}
	}

	// Generate and place Obervable.Plot from data.
	function plotData() {
		//gg('plotData');

		const aqiLabelTextOptions = {
			opacity: fadePastValues,
			fontSize: 10,
			fill: 'fillText',
			y: -75,
			x: (d) => d.xMiddle,
			text: (d) => {
				const labelWidth: number = labelWidths[d.text];
				const width = xScale?.apply(d.x2) - xScale?.apply(d.x1);
				return width < labelWidth ? null : d.text;
			},
		} as Plot.TextOptions;

		const codeLabelTextOptions = {
			opacity: fadePastValues,
			fontSize: 13,
			fill: 'fillText',
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
				const labelWidth: number = labelWidths[d.text];
				const width = xScale?.apply(d.x2) - xScale?.apply(d.x1) - ICON_LABEL_PADDING;
				return width < labelWidth + ICON_WIDTH + GAP_WIDTH ? null : d.text;
			},
		} as Plot.TextOptions;

		const marks: Markish[] = [
			// Background; also needed for d3.pointer() target.
			Plot.rectY([0], {
				x1: msStart,
				x2: msEnd,
				y: yDomainTop,
				fill: '#efefef',
			}),
		];

		if (dataAirQuality) {
			if (draw.aqiUs) {
				// AQI code colored bands:
				marks.push(
					Plot.rectY(dataAirQuality.aqiUsLevels, {
						opacity: fadePastValues,
						x1: 'x1',
						x2: 'x2',

						y1: aqiPlotHeight * (draw.aqiEurope ? -2 : -1),
						y2: aqiPlotHeight * (draw.aqiEurope ? -1 : 0),
						fill: 'fill',
					}),
				);

				// AQI label shadow text:
				marks.push(
					Plot.text(dataAirQuality.aqiUsLevels, {
						...aqiLabelTextOptions,
						fill: 'fillShadow',
						dy: 1,
						dx: 1,
						y: aqiPlotHeight * (draw.aqiEurope ? -1.5 : -0.5),
					}),
				);

				marks.push(
					// Weather code label text:
					Plot.text(dataAirQuality.aqiUsLevels, {
						...aqiLabelTextOptions,
						y: aqiPlotHeight * (draw.aqiEurope ? -1.5 : -0.5),
					}),
				);
			}

			if (draw.aqiEurope) {
				// AQI code colored bands:
				marks.push(
					Plot.rectY(dataAirQuality.aqiEuropeLevels, {
						opacity: fadePastValues,
						x1: 'x1',
						x2: 'x2',
						y1: -aqiPlotHeight,
						y2: -0,
						fill: 'fill',
					}),
				);

				// AQI label shadow text:
				marks.push(
					Plot.text(dataAirQuality.aqiEuropeLevels, {
						...aqiLabelTextOptions,
						fill: 'fillShadow',
						y: -aqiPlotHeight / 2,
						dy: 1,
						dx: 1,
					}),
				);

				marks.push(
					// Weather code label text:
					Plot.text(dataAirQuality.aqiEuropeLevels, {
						...aqiLabelTextOptions,
						y: -aqiPlotHeight / 2,
					}),
				);
			}
		}

		if (dataForecast) {
			if (draw.weatherCode) {
				// Weather code colored bands:
				marks.push(
					Plot.rectY(dataForecast.codes, {
						opacity: fadePastValues,
						x1: 'x1',
						x2: 'x2',
						y: yDomainTop,
						fill: 'fill',
					}),
				);
			}

			if (draw.humidity) {
				marks.push(
					// The humidity plotted as area:
					Plot.areaY(dataForecast.metrics, {
						curve,
						opacity: (d) => fadePastValues(d) * 0.2,
						x: 'ms',
						y: 'humidity',
						fill: colors.humidity,
					}),
				);

				marks.push(
					// The humidity plotted as line:
					Plot.lineY(dataForecast.metrics, {
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
					Plot.rectY(dataForecast.rain, {
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
					Plot.rectY(dataForecast.rain, {
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
					Plot.areaY(dataForecast.metrics, {
						curve,
						opacity: (d) => (d.precipitationProbability <= 0 ? 0 : fadePastValues(d) * 0.2),
						x: 'ms',
						y: 'precipitationProbability',
						fill: colors.precipitationProbability,
					}),
				);

				// The precipitation probability plotted as line:
				marks.push(
					Plot.lineY(dataForecast.metrics, {
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
					Plot.text(dataForecast.codes, {
						...codeLabelTextOptions,
						fill: 'fillShadow',
						dx: 1,
						dy: 1,
					}),
				);

				marks.push(
					// Weather code label text:
					Plot.text(dataForecast.codes, codeLabelTextOptions),
				);
			}

			if (draw.weatherCode == true || draw.weatherCode === 'icon') {
				marks.push(
					// Weather code icon:
					Plot.image(dataForecast.codes, {
						opacity: fadePastValues,
						width: ICON_WIDTH,
						height: ICON_WIDTH,
						y: 120,
						x: (d) => {
							if (!xScale?.invert || draw.weatherCode === 'icon') {
								return d.xMiddle;
							}

							const labelWidth: number = labelWidths[d.text];
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
					Plot.lineY(dataForecast.metrics, {
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
					Plot.lineY(dataForecast.metrics, {
						curve,
						strokeOpacity: 1,
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
					Plot.dot([dataForecast.low], {
						fillOpacity: fadePastValues,
						strokeOpacity: fadePastValues,
						x: 'ms',
						y: {
							transform: makeTransformTemperature(),
						},
						fill: 'blue',
					}),
				);

				marks.push(
					Plot.dot([dataForecast.high], {
						fillOpacity: fadePastValues,
						strokeOpacity: fadePastValues,
						x: 'ms',
						y: {
							transform: makeTransformTemperature(),
						},
						fill: 'red',
					}),
				);
			}

			if (draw.solarEvents) {
				marks.push(
					// Plot sunrise as yellow rule and sunset as icons:
					Plot.image(dataForecast?.solarEvents, {
						width: 32,
						height: 32,
						opacity: fadePastValues,
						x: 'x',
						y: 10,
						src: (d) => `/icons/meteocons/${d.type}.png`,
					}),
				);
			}
			marks.push(
				() => htl.svg`
                  <defs>
                    <linearGradient id="gradient" gradientTransform="rotate(90)">
                      <stop offset="0%" stop-color="red" />
                      <stop offset="100%" stop-color="blue" />
                    </linearGradient>
                  </defs>`,
			);
		}

		//@ts-expect-error: x.type is valid.
		const plot = Plot.plot({ ...plotOptions, marks });

		div?.firstChild?.remove(); // First remove old chart, if any.
		div?.append(plot); // Then add the new chart.

		// Render initial tracker.
		updateTracker(nsWeatherData.ms);
	}

	// Update rule location only (leaving rest of plot intact).
	// Runs every time nsWeatherData.ms changes value.
	$effect(() => {
		//gg('EFFECT');
		updateTracker(nsWeatherData.ms);
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

			each(labelElements, (element, text) => {
				labelWidths[text] = element.clientWidth;
			});
		}

		// TODO: cleanup with resizeObserver.unobserve()?
	});
</script>

{#if !adjustedLabelWidths}
	<div class="labels-for-widths">
		{#each Object.values(WMO_CODES) as props}
			<div bind:this={labelElements[props.description]}>{props.description}</div>
		{/each}

		{#each [...AQI_INDEX_US, ...AQI_INDEX_EUROPE] as { text }}
			<div bind:this={labelElements[text]}>{text}</div>
		{/each}

		<div bind:this={labelElements['No Data']}>No Data</div>
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
