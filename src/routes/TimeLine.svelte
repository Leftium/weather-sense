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
	import { trackable } from '$lib/trackable';
	import { onMount, tick } from 'svelte';
	import {
		AQI_INDEX_EUROPE,
		AQI_INDEX_US,
		aqiEuropeToLabel,
		aqiNotAvailableLabel,
		aqiUsToLabel,
		colors,
		getCloudGradient,
		getContrastColors,
		getWeatherIcon,
		MS_IN_10_MINUTES,
		MS_IN_DAY,
		MS_IN_HOUR,
		MS_IN_MINUTE,
		startOf,
		WMO_CODES,
		precipitationGroup,
		temperatureToColor,
		TEMP_COLOR_HOT,
		TEMP_COLOR_COLD,
	} from '$lib/util';
	import { iconSetStore } from '$lib/iconSet.svelte';
	import type { Markish } from '@observablehq/plot';
	import dayjs from 'dayjs';

	type PlotVisibility = {
		temp: boolean;
		tempRange: boolean;
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
		groupIcons = true,
		tempStats,
	}: {
		nsWeatherData: NsWeatherData;
		plotVisibility: PlotVisibility;
		start?: number;
		hours?: number;
		xAxis?: boolean;
		ghostTracker?: boolean;
		past?: boolean;
		trackerColor?: string;
		groupIcons?: boolean;
		tempStats?: { minTemperatureOnly: number; maxTemperature: number };
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
		tempRange: plotVisibility.tempRange,
		solarEvents: true,
		aqiEurope: plotVisibility.euAqi,
		aqiUs: plotVisibility.usAqi,
	});

	const msStart = $derived(+dayjs.tz(start, nsWeatherData.timezone).startOf('hour'));
	const msEnd = $derived(msStart + hours * MS_IN_HOUR);

	// Unique gradient ID for this TimeLine instance
	const gradientId = $derived(`temp-gradient-${msStart}`);

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

		// Helper to create a fallback entry
		function createFallbackEntry(
			label: { text: string; color: string },
			x1: number,
			x2: number,
		): AqiItem {
			const { fillText, fillShadow } = getContrastColors(label.color);
			return {
				ms: x2,
				aqiUs: null as unknown as number,
				aqiEurope: null as unknown as number,
				text: label.text,
				x1,
				x2,
				xMiddle: (x1 + x2) / 2,
				fill: label.color,
				fillText,
				fillShadow,
			};
		}

		if (nsWeatherData.dataAirQuality.size) {
			// Get max timestamp from AQI data to determine API boundary
			const aqiMaxMs = Math.max(...nsWeatherData.dataAirQuality.keys()) + MS_IN_HOUR;

			const filteredAirQuality = [...nsWeatherData.dataAirQuality.values()].filter((item) => {
				return item.ms >= msStart && item.ms <= msEnd;
			});

			// Generic AQI level grouping function
			function groupAqiLevels(
				getLabelFn: (item: AqiItem) => { text: string; color: string },
				getPrevValueFn: (item: AqiItem) => number,
			) {
				return filteredAirQuality.reduce((accumulator: AqiItem[], currItem) => {
					const prevItem = accumulator.at(-1);
					const prevText = prevItem ? getLabelFn(prevItem).text : '';
					const currLabel = getLabelFn(currItem as unknown as AqiItem);

					const x1 = currItem.ms;
					const x2 = Math.min(currItem.ms + MS_IN_HOUR + 2 * MS_IN_MINUTE, msEnd);
					const xMiddle = (Number(x1) + Number(x2)) / 2;

					if (prevItem && prevText === currLabel.text) {
						prevItem.ms = prevItem.x2 = x2;
						prevItem.xMiddle = (Number(prevItem.x1) + x2) / 2;
					} else {
						const fill = currLabel.color;
						const { fillText, fillShadow } = getContrastColors(fill);

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
			}

			const aqiUsLevels = groupAqiLevels(
				(item) => aqiUsToLabel(item.aqiUs),
				(item) => item.aqiUs,
			);

			const aqiEuropeLevels = groupAqiLevels(
				(item) => aqiEuropeToLabel(item.aqiEurope),
				(item) => item.aqiEurope,
			);

			// Add fallback entries when no AQI data for parts of the time range
			function addFallbackEntries(levels: AqiItem[]): AqiItem[] {
				const result = [...levels];

				// Time range entirely beyond API limit - show "Not Available" for entire range
				if (msStart >= aqiMaxMs) {
					return [createFallbackEntry(aqiNotAvailableLabel(), msStart, msEnd)];
				}

				// If time range starts before any data, add "No Data" at the beginning
				if (levels.length === 0 || levels[0].x1 > msStart) {
					const gapEnd = levels.length > 0 ? levels[0].x1 : Math.min(msEnd, aqiMaxMs);
					if (gapEnd > msStart) {
						result.unshift(createFallbackEntry(aqiUsToLabel(null), msStart, gapEnd));
					}
				}

				// If time range extends beyond API limit, add "Not Available" at the end
				if (msEnd > aqiMaxMs) {
					const notAvailableStart = Math.max(
						aqiMaxMs,
						levels.length > 0 ? levels.at(-1)!.x2 : msStart,
					);
					result.push(createFallbackEntry(aqiNotAvailableLabel(), notAvailableStart, msEnd));
				}

				// If no data at all within the API range, show "No Data"
				if (result.length === 0) {
					result.push(createFallbackEntry(aqiUsToLabel(null), msStart, msEnd));
				}

				return result;
			}

			return {
				aqiUsLevels: addFallbackEntries(aqiUsLevels),
				aqiEuropeLevels: addFallbackEntries(aqiEuropeLevels),
			};
		}

		// Return "Not Available" fallback when source doesn't support AQI at all
		if (draw.aqiUs || draw.aqiEurope) {
			const notAvailableEntry = createFallbackEntry(aqiNotAvailableLabel(), msStart, msEnd);
			return {
				aqiUsLevels: [notAvailableEntry],
				aqiEuropeLevels: [notAvailableEntry],
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
				isDay: boolean;
				text: string;
				x1: number;
				x2: number;
				xMiddle: number;
				fill: string;
				fillText: string;
				fillShadow: string;
				counts: Record<number, number>;
			};

			// Local wrapper that returns unique value per code when groupIcons is disabled
			function getPrecipGroup(code: number) {
				if (!groupIcons) {
					return code; // Prevent grouping by returning unique value
				}
				return precipitationGroup(code);
			}

			function determineNextCode(prevCode: number | undefined, currCode: number) {
				if (prevCode !== undefined) {
					if (getPrecipGroup(prevCode) === getPrecipGroup(currCode)) {
						return WMO_CODES[prevCode].wsCode > WMO_CODES[currCode].wsCode ? prevCode : currCode;
					}
				}
				return currCode;
			}

			const codes = metrics.reduce((accumulator: CodesItem[], current, index, array) => {
				const prevItem = accumulator.at(-1);
				const prevCode = prevItem?.weatherCode;
				const prevPrecipGroup =
					prevCode !== undefined ? getPrecipGroup(prevCode) : getPrecipGroup(current.weatherCode);

				let nextCode = determineNextCode(prevCode, current.weatherCode);
				const counts =
					prevItem !== undefined && prevPrecipGroup === getPrecipGroup(nextCode)
						? prevItem.counts
						: {};
				counts[current.weatherCode] = counts[current.weatherCode] || 0;

				// Don't count final (25th) hour (needed for fence post problem).
				if (index < array.length - 1) {
					counts[current.weatherCode] += 1;
				}

				// For clear/cloudy group (0), pick most common code
				if (getPrecipGroup(nextCode) === 0) {
					nextCode = Number(
						maxBy(Object.keys(counts), (code) => counts[Number(code)] + Number(code) / 100),
					);
				}

				// gg(current.msPretty, WMO_CODES[nextCode].description);

				const x1 = current.ms;
				const x2 = Math.min(current.ms + MS_IN_HOUR + 2 * MS_IN_MINUTE, msEnd);

				// Use gradient for all WMO codes
				const solidColor = WMO_CODES[nextCode].color;
				const fill = `url(#cloud-gradient-${nextCode}-${msStart})`;

				const { fillText, fillShadow } = getContrastColors(solidColor);
				const draftItem = {
					ms: x2,
					weatherCode: nextCode,
					isDay: current.isDay,
					text: WMO_CODES[nextCode].description,
					x1,
					x2,
					xMiddle: (Number(x1) + Number(x2)) / 2,
					fill,
					fillText,
					fillShadow,
					counts,
				};

				if (prevItem && prevPrecipGroup === getPrecipGroup(nextCode)) {
					accumulator[accumulator.length - 1] = {
						...draftItem,
						x1: prevItem.x1,
						xMiddle: (Number(prevItem.x1) + x2) / 2,
						// If any hour in merged segment is day, show day icon
						isDay: prevItem.isDay || current.isDay,
						counts,
					};
				} else {
					accumulator.push(draftItem);
				}
				return accumulator;
			}, [] as CodesItem[]);

			// Second pass: merge short gaps into surrounding precipitation segments
			// A gap is merged if:
			// 1. Its duration is <= MAX_GAP_HOURS hours, AND
			// 2. Its precipitation group is less severe than BOTH surrounding segments
			// Only run when groupIcons is enabled
			// NOTE: Similar logic exists in util.ts getGroupedWmoCode() for daily tile icons
			const MAX_GAP_HOURS = 1;
			const MAX_GAP_MS = MAX_GAP_HOURS * MS_IN_HOUR + 3 * MS_IN_MINUTE; // Add buffer for segment overlap

			// Need at least 3 segments to have a gap between two others
			if (groupIcons && codes.length >= 3) {
				for (let i = codes.length - 2; i >= 1; i--) {
					const gap = codes[i];
					const prev = codes[i - 1];
					const next = codes[i + 1];

					// Safety check - skip if any segment is undefined
					if (!gap || !prev || !next) continue;

					const gapDuration = gap.x2 - gap.x1;
					const gapGroup = getPrecipGroup(gap.weatherCode);
					const prevGroup = getPrecipGroup(prev.weatherCode);
					const nextGroup = getPrecipGroup(next.weatherCode);

					// Merge if gap is short and less severe than both neighbors
					if (gapDuration <= MAX_GAP_MS && gapGroup < prevGroup && gapGroup < nextGroup) {
						// Use the more severe weather code from surrounding segments
						const mergedCode =
							WMO_CODES[prev.weatherCode].wsCode > WMO_CODES[next.weatherCode].wsCode
								? prev.weatherCode
								: next.weatherCode;

						// Use gradient for all WMO codes
						const solidColorMerged = WMO_CODES[mergedCode].color;
						const fillMerged = `url(#cloud-gradient-${mergedCode}-${msStart})`;
						const { fillText, fillShadow } = getContrastColors(solidColorMerged);

						// Merge prev + gap + next into prev
						codes[i - 1] = {
							...prev,
							ms: next.ms,
							x2: next.x2,
							xMiddle: (Number(prev.x1) + Number(next.x2)) / 2,
							weatherCode: mergedCode,
							// If any segment has day, show day icon
							isDay: prev.isDay || gap.isDay || next.isDay,
							text: WMO_CODES[mergedCode].description,
							fill: fillMerged,
							fillText,
							fillShadow,
						};

						// Remove gap and next (they're now merged into prev)
						codes.splice(i, 2);
					}
				}
			}

			// DEBUG: Mock all WMO codes to compare gradients vs solid colors
			// Only applies to rows starting tomorrow or later (to avoid past fading)
			const MOCK_WMO_CODES = false;
			const allWmoCodes = [
				0, 1, 2, 3, 45, 48, 51, 53, 55, 61, 63, 65, 56, 57, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85,
				86, 95, 96, 99,
			];
			const tomorrow = +dayjs().add(1, 'day').startOf('day');
			if (MOCK_WMO_CODES && metrics.length > 0 && msStart >= tomorrow) {
				codes.length = 0; // Clear existing codes
				const segmentDuration = 6 * MS_IN_HOUR; // 6 hours per code
				// Calculate day offset from tomorrow to continue codes across rows
				const dayOffset = Math.floor((msStart - tomorrow) / MS_IN_DAY);
				const codesPerDay = Math.floor((24 * MS_IN_HOUR) / segmentDuration); // 4 codes per day
				const startIndex = (dayOffset * codesPerDay) % allWmoCodes.length;

				for (let i = 0; i < codesPerDay; i++) {
					const wmoCode = allWmoCodes[(startIndex + i) % allWmoCodes.length];
					const x1 = msStart + i * segmentDuration;
					const x2 = x1 + segmentDuration;
					// Only add if segment is within the visible range
					if (x1 < msEnd) {
						const solidColor = WMO_CODES[wmoCode].color;
						const fill = `url(#cloud-gradient-${wmoCode}-${msStart})`;
						const { fillText, fillShadow } = getContrastColors(solidColor);
						codes.push({
							ms: Math.min(x2, msEnd),
							weatherCode: wmoCode,
							isDay: true,
							text: WMO_CODES[wmoCode].description,
							x1,
							x2: Math.min(x2, msEnd),
							xMiddle: (x1 + Math.min(x2, msEnd)) / 2,
							fill,
							fillText,
							fillShadow,
							counts: {},
						});
					}
				}
			}

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

			// Track actual min/max temps (for gradient coloring)
			let actualLowTemp = Number.MAX_VALUE;
			let actualHighTemp = Number.MIN_VALUE;

			// Track positions for dot markers
			let low = {
				ms: 0,
				temperature: Number.MAX_VALUE,
			};

			let high = {
				ms: 0,
				temperature: Number.MIN_VALUE,
			};

			// Find actual min/max temperatures and their positions
			metrics.forEach((item) => {
				if (item.temperature > high.temperature) {
					high = {
						ms: item.ms,
						temperature: item.temperature,
					};
				}
				if (item.temperature > actualHighTemp) {
					actualHighTemp = item.temperature;
				}

				if (item.temperature < low.temperature) {
					low = {
						ms: item.ms,
						temperature: item.temperature,
					};
				}
				if (item.temperature < actualLowTemp) {
					actualLowTemp = item.temperature;
				}
			});

			// For ghostTracker mode, try to place low dot BEFORE high dot
			// (typical daily pattern: coolest in morning → warmest in afternoon)
			// But keep actualLowTemp/actualHighTemp unchanged for gradient coloring
			if (ghostTracker && low.ms > high.ms) {
				// Try to find the lowest temp that occurs before the high
				const itemsBeforeHigh = metrics.filter((item) => item.ms < high.ms);

				if (itemsBeforeHigh.length > 0) {
					// Found items before high - use the lowest one
					const lowBeforeHigh = itemsBeforeHigh.reduce(
						(min, item) => (item.temperature < min.temperature ? item : min),
						itemsBeforeHigh[0],
					);
					low = lowBeforeHigh;
				}
				// Otherwise keep the actual low position (after the high)
			}

			// Calculate local min/max across all temperature-like fields for y-axis scaling
			let localTempMin = Number.MAX_VALUE;
			let localTempMax = Number.MIN_VALUE;

			metrics.forEach((item) => {
				// Include temperature
				if (item.temperature < localTempMin) localTempMin = item.temperature;
				if (item.temperature > localTempMax) localTempMax = item.temperature;

				// Include dew point
				if (item.dewPoint < localTempMin) localTempMin = item.dewPoint;
				if (item.dewPoint > localTempMax) localTempMax = item.dewPoint;

				// Add other temperature-like fields here in the future
			});

			return {
				metrics,
				low,
				high,
				actualLowTemp,
				actualHighTemp,
				localTempMin,
				localTempMax,
				rain,
				precipitationProbability,
				codes,
				solarEvents,
			};
		}
		return null;
	});

	// Convert pointer position to timestamp using d3 and the SVG scale
	function pointerToMs(e: PointerEvent | MouseEvent): number {
		const svgNode = d3.select(div).select('svg').select('g[aria-label=rect]').node();
		if (xScale.invert) {
			const [x] = d3.pointer(e, svgNode);
			return clamp(xScale.invert(x), msStart, msEnd);
		}
		return msStart;
	}

	// Trackable options for this component
	const trackableOptions = {
		getMs: pointerToMs,
		getTrackedElement: () => nsWeatherData.trackedElement,
		onTimeChange: (ms: number) => emit('weatherdata_requestedSetTime', { ms }),
		onTrackingStart: (node: HTMLElement) => emit('weatherdata_requestedTrackingStart', { node }),
		onTrackingEnd: () => emit('weatherdata_requestedTrackingEnd'),
	};

	function makeTransFormPrecipitation(onlyLinear: boolean) {
		// ~80th percentile for snow precipitation (snow reports higher mm/hr than rain)
		const LINEAR_MAX = 3;

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

	function makeTransformTemperature(keyName = 'temperature', localMin?: number, localMax?: number) {
		return function (da: any[]) {
			// Use local (day's) range if provided, otherwise fall back to visible/global
			const stats = tempStats ?? nsWeatherData.temperatureStats;
			const minTemp = localMin ?? stats.minTemperatureOnly;
			const maxTemp = localMax ?? stats.maxTemperature;
			const range = maxTemp - minTemp;
			if (range === 0) return da.map(() => 50); // Flat line in middle if no range
			return da.map((d) => (100 * (d[keyName] - minTemp)) / range);
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
					.attr('fill', '#FFEE00')
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
			// Bottom border line connecting tick marks (extends left off-screen to cover temp bar)
			Plot.ruleY([yDomainBottom], {
				x1: msStart - MS_IN_DAY,
				x2: msEnd,
				stroke: 'rgba(0, 0, 0, 0.2)',
				strokeWidth: 1,
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
				// Define gradients for all WMO codes (vertical with ~17° angle)
				const skyCodes = [0, 1, 2, 3];
				const fogCodes = [45, 48];
				const allWmoCodeKeys = Object.keys(WMO_CODES).map(Number);
				for (const code of allWmoCodeKeys) {
					const isSky = skyCodes.includes(code);
					const isFog = fogCodes.includes(code);
					// Use sky/fog gradients for clear/cloudy/fog, pico gradients for precipitation
					const [dark, mid, light] =
						isSky || isFog ? getCloudGradient(code) : WMO_CODES[code].gradient;
					// For sky: light at top (0%), dark at bottom (100%)
					// For fog/precip: dark at top (0%), light at bottom (100%)
					const topColor = isSky ? light : dark;
					const bottomColor = isSky ? dark : light;
					marks.push(
						() => htl.svg`<defs>
							<linearGradient id="cloud-gradient-${code}-${msStart}" x1="0" y1="0" x2="0.3" y2="1">
								<stop offset="0%" stop-color="${topColor}" />
								<stop offset="50%" stop-color="${mid}" />
								<stop offset="100%" stop-color="${bottomColor}" />
							</linearGradient>
						</defs>`,
					);
				}

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
							return width < ICON_WIDTH
								? null
								: getWeatherIcon(d.weatherCode, iconSetStore.value, d.isDay);
						},
					}),
				);
			}

			// Local (day's) temperature range for y-axis normalization (includes all temp-like fields)
			const localMin = dataForecast.localTempMin;
			const localMax = dataForecast.localTempMax;

			// Calculate gradient colors based on where day's temps fall in visible TEMPERATURE range
			// Use temperature-only range (excludes dew point) so cold days show blue
			// Use actualHighTemp/actualLowTemp (not affected by ghostTracker dot positioning)
			const stats = tempStats ?? nsWeatherData.temperatureStats;
			const { minTemperatureOnly: globalMin, maxTemperature: globalMax } = stats;

			// Colors for temperature high/low based on global temp range
			const colorAtHigh = temperatureToColor(dataForecast.actualHighTemp, globalMin, globalMax);
			const colorAtLow = temperatureToColor(dataForecast.actualLowTemp, globalMin, globalMax);

			// Calculate where temp high/low actually sit on the y-axis (scaled to localMin/localMax)
			// Y-axis: 0% = top = localMax, 100% = bottom = localMin
			const localRange = localMax - localMin;
			const highOffset =
				localRange > 0 ? ((localMax - dataForecast.actualHighTemp) / localRange) * 100 : 0;
			const lowOffset =
				localRange > 0 ? ((localMax - dataForecast.actualLowTemp) / localRange) * 100 : 100;

			// Define gradient before using it
			marks.push(
				() => htl.svg`
                  <defs>
                    <linearGradient id="${gradientId}" gradientTransform="rotate(90)">
                      <stop offset="${highOffset}%" stop-color="${colorAtHigh}" />
                      <stop offset="${lowOffset}%" stop-color="${colorAtLow}" />
                    </linearGradient>
                  </defs>`,
			);

			if (draw.dewPoint) {
				marks.push(
					// The dew point plotted as line:
					Plot.lineY(dataForecast.metrics, {
						curve,

						x: 'ms',
						y: {
							transform: makeTransformTemperature('dewPoint', localMin, localMax),
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
							transform: makeTransformTemperature('temperature', localMin, localMax),
						},
						stroke: `url(#${gradientId})`,
						strokeWidth: 2,
					}),
				);
			}

			if (draw.tempRange) {
				marks.push(
					// High/low temp marks:
					Plot.dot([dataForecast.low], {
						x: 'ms',
						y: {
							transform: makeTransformTemperature('temperature', localMin, localMax),
						},
						fill: TEMP_COLOR_COLD,
					}),
				);

				marks.push(
					Plot.dot([dataForecast.high], {
						x: 'ms',
						y: {
							transform: makeTransformTemperature('temperature', localMin, localMax),
						},
						fill: TEMP_COLOR_HOT,
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

			// Past overlay - mutes portion before current time
			// Vertical gradient: darker at top and bottom, transparent in middle (vignette)
			const now = Date.now();
			const pastEnd = Math.min(msEnd, Math.max(msStart, now));

			if (now > msStart) {
				marks.push(
					() => htl.svg`<defs>
						<linearGradient id="past-overlay-gradient-${msStart}" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stop-color="black" stop-opacity="0.35" />
							<stop offset="100%" stop-color="black" stop-opacity="0" />
						</linearGradient>
					</defs>`,
				);
				marks.push(
					Plot.rectY([0], {
						x1: msStart,
						x2: pastEnd,
						y1: yDomainTop,
						y2: yDomainBottom,
						fill: `url(#past-overlay-gradient-${msStart})`,
					}),
				);
			}
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
		<div bind:this={labelElements['Not Available']}>Not Available</div>
	</div>
{/if}

<div bind:this={div} bind:clientWidth use:trackable={trackableOptions} role="img"></div>

<style>
	div,
	div > :global(svg) {
		overflow: visible !important;
	}

	/* Glow behind weather icons - matches wmo-codes page */
	div > :global(svg image) {
		filter: drop-shadow(0 0 3px rgba(128, 128, 128, 0.6))
			drop-shadow(0 0 6px rgba(128, 128, 128, 0.4)) drop-shadow(0 0 12px rgba(128, 128, 128, 0.3));
	}

	div {
		display: grid;
		align-items: center;
		width: 100%;
		height: 100%;

		user-select: none;
		/* pan-y for native vertical scroll; horizontal gestures captured for scrubbing
		   (touch-action dynamically set to 'none' when scrub detected) */
		touch-action: pan-y;
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
