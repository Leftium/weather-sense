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

	import { clamp, each, forEachRight, maxBy } from 'lodash-es';
	import * as d3 from 'd3';

	import { gg } from '@leftium/gg';
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
		startOf,
		WMO_CODES,
	} from '$lib/util';
	import type { Markish } from '@observablehq/plot';
	import dayjs from 'dayjs';

	type PlotVisibility = {
		temp: boolean;
		dewPoint: boolean;
		humidity: boolean;
		precip: boolean;
		chance: boolean;
		euAqi: boolean;
		usAqi: boolean;
	};

	let {
		nsWeatherData,
		plotVisibility,
		start = Date.now(),
		hours = 24,
		xAxis = true,
		ghostTracker = false,
		past = false,
		trackerColor = 'yellow',
	}: {
		nsWeatherData: NsWeatherData;
		plotVisibility: PlotVisibility;
		start?: number;
		hours?: number;
		xAxis?: boolean;
		ghostTracker?: boolean;
		past?: boolean;
		trackerColor?: string;
	} = $props();

	const labelElements: Record<string, HTMLElement> = $state({});

	const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

	const ICON_WIDTH = 18;
	const GAP_WIDTH = 2;
	const MARGIN_LEFT = 0;
	const MARGIN_RIGHT = 0;
	const ICON_LABEL_PADDING = 16;

	const draw = $derived({
		weatherCode: true as boolean | string, // true, 'icon', 'text', 'color'
		humidity: plotVisibility.humidity,
		precipitationProbability: plotVisibility.chance,
		precipitation: plotVisibility.precip,
		dewPoint: plotVisibility.dewPoint,
		temperature: plotVisibility.temp,
		solarEvents: true,
		aqiEurope: plotVisibility.euAqi,
		aqiUs: plotVisibility.usAqi,
	});

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
				counts: Record<number, number>;
			};

			function precipitationGroup(code: number) {
				if (WMO_CODES[code]?.wsCode !== undefined) {
					return Math.floor(WMO_CODES[code].wsCode / 1000) % 10;
				}
				return -1;
			}

			function determineNextCode(prevCode: number | undefined, currCode: number) {
				if (prevCode !== undefined) {
					if (precipitationGroup(prevCode) === precipitationGroup(currCode)) {
						return WMO_CODES[prevCode].wsCode > WMO_CODES[currCode].wsCode ? prevCode : currCode;
					}
				}
				return currCode;
			}

			const codes = metrics.reduce((accumulator: CodesItem[], current, index, array) => {
				const prevItem = accumulator.at(-1);
				const prevCode = prevItem?.weatherCode;
				const prevPrecipitationGroup =
					prevCode !== undefined
						? precipitationGroup(prevCode)
						: precipitationGroup(current.weatherCode);

				let nextCode = determineNextCode(prevCode, current.weatherCode);
				const counts =
					prevItem !== undefined && prevPrecipitationGroup === precipitationGroup(nextCode)
						? prevItem.counts
						: {};
				counts[current.weatherCode] = counts[current.weatherCode] || 0;

				// Don't count final (25th) hour (needed for fence post problem).
				if (index < array.length - 1) {
					counts[current.weatherCode] += 1;
				}

				if (precipitationGroup(nextCode) === 0) {
					nextCode = Number(
						maxBy(Object.keys(counts), (code) => counts[Number(code)] + Number(code) / 100),
					);
				}

				// gg(current.msPretty, WMO_CODES[nextCode].description);

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
					counts: {},
				};

				if (prevItem && prevPrecipitationGroup === precipitationGroup(nextCode)) {
					accumulator[accumulator.length - 1] = {
						...draftItem,
						x1: prevItem.x1,
						xMiddle: (Number(prevItem.x1) + x2) / 2,
						counts,
					};
				} else {
					accumulator.push(draftItem);
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

			const precipitationProbability = metrics.map((d, index, array) => {
				const precipitationProbability = d.precipitationProbability;
				const nextPrecipitationProbability = array?.[index + 1]?.precipitationProbability;

				const strokeOpacity = precipitationProbability + nextPrecipitationProbability > 0 ? 1 : 0;

				return {
					ms: d.ms,
					opacity: strokeOpacity * 0.2,
					strokeOpacity,
					precipitationProbability,
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
				precipitationProbability,
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

	function makeTransFormPrecipitation(onlyLinear: boolean) {
		// 80th percentile of hourly precipitation (~20% of rainy hours exceed this)
		const LINEAR_MAX = 2;

		const LINEAR_SECTION = 70;
		const CAP_BONUS = 3;

		return (da: any[]) => {
			const resultArray = da.map((d) => {
				const p = d.precipitation;

				// Linear scale maxing at 2mm/hr (80th percentile):
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

	const curve = 'natural';
	const plotOptions = $derived({
		width: clientWidth,
		height: xAxis ? 104 : 64,
		marginRight: MARGIN_RIGHT,
		marginLeft: MARGIN_LEFT,
		marginTop: 0,
		marginBottom: 0,
		y: { axis: null, domain: [yDomainTop, yDomainBottom], range: [0, xAxis ? 104 : 64] },
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

		function drawTracker(
			ms: number,
			msIntervalStart: number,
			length: number,
			lineColor: string,
			showRect: boolean,
		) {
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
				.attr('stroke', lineColor)
				.attr('stroke-width', 2);

			if (showRect) {
				ig.append('rect')
					.attr('x', x1)
					.attr('y', y1)
					.attr('width', x2 - x1)
					.attr('height', y2 - y1)
					.attr('fill', 'yellow')
					.attr('opacity', 0.4);
			}
		}

		const msStartOf10Min = startOf(ms, MS_IN_10_MINUTES);
		const msStartOfHour = startOf(ms, MS_IN_HOUR);
		const interval =
			nsWeatherData.intervals.find((item) => item.ms === msStartOf10Min) ||
			nsWeatherData.intervals.find((item) => item.ms === msStartOfHour);

		const msIntervalStart = interval?.ms ?? ms;
		const length = interval ? interval.x2 - interval.ms : 1;

		if (msIntervalStart >= msStart && msIntervalStart < msEnd) {
			drawTracker(ms, msIntervalStart, length, trackerColor, true);
		} else if (ghostTracker) {
			const msGhost = msStart + ((ms + nsWeatherData.utcOffsetMs) % MS_IN_DAY);
			const msGhostInterval = msStart + ((msIntervalStart + nsWeatherData.utcOffsetMs) % MS_IN_DAY);

			drawTracker(msGhost, msGhostInterval, length, 'white', false);
		}
	}

	// Generate and place Obervable.Plot from data.
	function plotData() {
		//gg('plotData');

		const aqiLabelTextOptions = {
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
						opacity: 0.2,
						x: 'ms',
						y: 'humidity',
						fill: colors.humidity,
					}),
				);

				marks.push(
					// The humidity plotted as line:
					Plot.lineY(dataForecast.metrics, {
						curve,
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
						x1: 'x1bar',
						x2: 'x2bar',
						y: { transform: makeTransFormPrecipitation(false) },
						fill: '#58FAF9',
					}),
				);

				//Rain bar:
				marks.push(
					Plot.rectY(dataForecast.rain, {
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
					Plot.areaY(dataForecast.precipitationProbability, {
						curve,
						opacity: 'opacity',
						x: 'ms',
						y: 'precipitationProbability',
						fill: colors.precipitationProbability,
					}),
				);

				// The precipitation probability plotted as line:
				marks.push(
					Plot.lineY(dataForecast.precipitationProbability, {
						curve,
						strokeOpacity: 'strokeOpacity',
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
						x: 'ms',
						y: {
							transform: makeTransformTemperature(),
						},
						fill: '#268bd2',
					}),
				);

				marks.push(
					Plot.dot([dataForecast.high], {
						x: 'ms',
						y: {
							transform: makeTransformTemperature(),
						},
						fill: '#dc322f',
					}),
				);
			}

			if (draw.solarEvents && xAxis) {
				marks.push(
					// Plot sunrise as yellow rule and sunset as icons:
					Plot.image(dataForecast?.solarEvents, {
						width: 32,
						height: 32,

						x: 'x',
						y: yDomainBottom - 4,
						src: (d) => `/icons/meteocons/${d.type}.png`,
					}),
				);
			}

			// Skip internal past overlay when parent handles it via row overlay
			if (!past) {
				marks.push(
					Plot.rectY([0], {
						x1: msStart,
						x2: Math.min(msEnd, Math.max(msStart, Date.now())),
						y1: yDomainTop,
						y2: yDomainBottom,
						fill: 'white',
						opacity: 0.5,
					}),
				);
			}

			marks.push(
				() => htl.svg`
                  <defs>
                    <linearGradient id="gradient" gradientTransform="rotate(90)">
                      <stop offset="0%" stop-color="#dc322f" />
                      <stop offset="100%" stop-color="#268bd2" />
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

	// Update entire plot when plotVisibility changes.
	$effect(() => {
		// Track the draw object (derived from plotVisibility)
		draw;
		plotData();
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
		display: grid;
		align-items: center;
		height: 100%;

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
