<script module lang="ts">
	import { browser } from '$app/environment';

	let adjustedLabelWidths = $state(false);
	let labelWidths: Record<string, number> = $state({});

	// Global toggle for sky visibility through WMO conditions (persisted to localStorage)
	const STORAGE_KEY = 'showSkyThroughWmo';
	let showSkyThroughWmo = $state(browser ? localStorage.getItem(STORAGE_KEY) === 'true' : false);

	function toggleSkyThroughWmo() {
		showSkyThroughWmo = !showSkyThroughWmo;
		if (browser) {
			localStorage.setItem(STORAGE_KEY, String(showSkyThroughWmo));
		}
	}
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
		getSkyColors,
		getWeatherIcon,
		getWmoOverlayGradient,
		MS_IN_10_MINUTES,
		MS_IN_DAY,
		MS_IN_HOUR,
		MS_IN_MINUTE,
		DAY_START_HOUR,
		startOf,
		WMO_CODES,
		precipitationGroup,
		temperatureToColor,
		TEMP_COLOR_HOT,
		TEMP_COLOR_COLD,
		skyPalettes,
	} from '$lib/util';
	import { getSunAltitude } from '$lib/horizon';
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
		debugTrackerMs,
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
		debugTrackerMs?: number;
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
	const skyStripHeight = 10;

	const yDomainTop = 145;
	let yDomainBottom = $derived.by(() => {
		let value = 0;

		if (draw.aqiUs) {
			value -= aqiPlotHeight;
		}

		if (draw.aqiEurope) {
			value -= aqiPlotHeight;
		}

		// Sky strip goes at the very bottom, under AQI bands
		value -= skyStripHeight;

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

	// Sky color slices with full vertical gradient per time sample
	// Optimized: single rects for day/night, fine sampling only during transitions
	let dataSkyColor = $derived.by(() => {
		if (!nsWeatherData.daily?.length) return null;

		type SkySlice = {
			x1: number;
			x2: number;
			colors: string[]; // [horizon, middle, upper sky]
			gradientId: string;
			isNight: boolean; // true for night palette
			isDusk: boolean; // true for dusk transition
			isDay: boolean; // true for daytime
		};

		// Find sunrise/sunset for a given timestamp
		function getSunTimes(ms: number): { sunrise: number; sunset: number } | null {
			const day = nsWeatherData.daily?.find((d) => d.ms <= ms && d.ms + MS_IN_DAY > ms);
			return day ? { sunrise: day.sunrise, sunset: day.sunset } : null;
		}

		// Convert radians to degrees
		function radToDeg(rad: number): number {
			return (rad * 180) / Math.PI;
		}

		// Get sun altitude in degrees at a given time
		function getAltitude(ms: number, sunrise: number, sunset: number): number {
			return radToDeg(getSunAltitude(ms, sunrise, sunset));
		}

		// Binary search to find time when altitude crosses a threshold
		// Returns ms when altitude first goes above/below threshold in the search range
		function findAltitudeCrossing(
			startMs: number,
			endMs: number,
			sunrise: number,
			sunset: number,
			targetAlt: number,
			rising: boolean, // true if looking for altitude going up past threshold
		): number {
			let lo = startMs;
			let hi = endMs;
			while (hi - lo > MS_IN_MINUTE) {
				const mid = Math.floor((lo + hi) / 2);
				const alt = getAltitude(mid, sunrise, sunset);
				if (rising ? alt < targetAlt : alt > targetAlt) {
					lo = mid;
				} else {
					hi = mid;
				}
			}
			return hi;
		}

		const slices: SkySlice[] = [];
		const FINE_INTERVAL = MS_IN_MINUTE;

		// Altitude thresholds from getSkyColors:
		// <= -18°: night
		// -18° to 6°: transition (dawn/dusk)
		// >= 6°: day
		const NIGHT_THRESHOLD = -18;
		const DAY_THRESHOLD = 6;

		// Process each day in the range
		for (const day of nsWeatherData.daily) {
			const { sunrise, sunset, ms: dayStart } = day;
			const dayEnd = dayStart + MS_IN_DAY;

			// Skip days outside our range
			if (dayEnd < msStart || dayStart > msEnd) continue;

			const solarNoon = (sunrise + sunset) / 2;

			// Find key transition times using binary search
			// Dawn: night->day transition (altitude rising from -18° to 6°)
			const dawnStart = findAltitudeCrossing(
				dayStart,
				sunrise,
				sunrise,
				sunset,
				NIGHT_THRESHOLD,
				true,
			);
			const dawnEnd = findAltitudeCrossing(
				sunrise,
				solarNoon,
				sunrise,
				sunset,
				DAY_THRESHOLD,
				true,
			);

			// Dusk: day->night transition (altitude falling from 6° to -18°)
			const duskStart = findAltitudeCrossing(
				solarNoon,
				sunset,
				sunrise,
				sunset,
				DAY_THRESHOLD,
				false,
			);
			const duskEnd = findAltitudeCrossing(sunset, dayEnd, sunrise, sunset, NIGHT_THRESHOLD, false);

			// Helper to add a single solid rect
			function addSolidRect(
				x1: number,
				x2: number,
				palette: string[],
				isNight: boolean,
				isDay: boolean,
			) {
				if (x2 <= x1) return;
				const clampedX1 = Math.max(x1, msStart);
				const clampedX2 = Math.min(x2 + MS_IN_MINUTE, msEnd); // slight overlap to prevent gaps
				if (clampedX2 <= clampedX1) return;

				slices.push({
					x1: clampedX1,
					x2: clampedX2,
					colors: palette,
					gradientId: `sky-solid-${clampedX1}`,
					isNight,
					isDusk: false,
					isDay,
				});
			}

			// Helper to add fine-sampled transition rects
			function addTransitionRects(x1: number, x2: number, isDusk: boolean) {
				const clampedX1 = Math.max(x1, msStart);
				const clampedX2 = Math.min(x2, msEnd);
				if (clampedX2 <= clampedX1) return;

				let ms = clampedX1;
				while (ms < clampedX2) {
					const colors = getSkyColors(ms, sunrise, sunset);
					const nextMs = Math.min(ms + FINE_INTERVAL, clampedX2);
					slices.push({
						x1: ms,
						x2: nextMs + MS_IN_MINUTE, // slight overlap to prevent gaps
						colors,
						gradientId: `sky-slice-${ms}`,
						isNight: false, // transitions are never pure night
						isDusk,
						isDay: false,
					});
					ms = nextMs;
				}
			}

			// Night before dawn (from day start to dawn start)
			addSolidRect(dayStart, dawnStart, skyPalettes.night, true, false);

			// Dawn transition (fine-sampled)
			addTransitionRects(dawnStart, dawnEnd, false);

			// Day (from dawn end to dusk start)
			addSolidRect(dawnEnd, duskStart, skyPalettes.day, false, true);

			// Dusk transition (fine-sampled)
			addTransitionRects(duskStart, duskEnd, true);

			// Night after dusk (from dusk end to day end)
			addSolidRect(duskEnd, dayEnd, skyPalettes.night, true, false);
		}

		// Sort slices by x1 to ensure proper rendering order
		slices.sort((a, b) => a.x1 - b.x1);

		// Fill any gap at the end with night (handles 4am plots extending into next day without data)
		const lastSlice = slices.at(-1);
		if (lastSlice && lastSlice.x2 < msEnd) {
			slices.push({
				x1: lastSlice.x2,
				x2: msEnd,
				colors: skyPalettes.night,
				gradientId: `sky-solid-${lastSlice.x2}`,
				isNight: true,
				isDusk: false,
				isDay: false,
			});
		}

		console.log(
			`Sky slices: ${slices.length} rects (vs ${Math.round((msEnd - msStart) / MS_IN_MINUTE)} minutes in range)`,
		);
		return slices;
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

			// DEBUG: Mock WMO codes for testing sky overlays
			// Only applies to rows starting tomorrow or later (to avoid past fading)
			const MOCK_WMO_CODES = false;
			const tomorrow = +dayjs().add(1, 'day').startOf('day');
			if (MOCK_WMO_CODES && metrics.length > 0 && msStart >= tomorrow) {
				codes.length = 0; // Clear existing codes
				const dayOffset = Math.floor((msStart - tomorrow) / MS_IN_DAY);
				// One code per entire day, cycling through test codes
				const testWmoCodes = [0, 1, 2, 3];
				const wmoCode = testWmoCodes[dayOffset % testWmoCodes.length];

				const solidColor = WMO_CODES[wmoCode].color;
				const fill = `url(#cloud-gradient-${wmoCode}-${msStart})`;
				const { fillText, fillShadow } = getContrastColors(solidColor);
				codes.push({
					ms: msEnd,
					weatherCode: wmoCode,
					isDay: true,
					text: WMO_CODES[wmoCode].description,
					x1: msStart,
					x2: msEnd,
					xMiddle: (msStart + msEnd) / 2,
					fill,
					fillText,
					fillShadow,
					counts: {},
				});
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
		onTopRegionTap: toggleSkyThroughWmo,
		topRegionRatio: 0.3, // Top 30% where the solid WMO label band is
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
				// Add gradient definition for tracker rect
				ig.append('defs').html(`
					<linearGradient id="tracker-rect-gradient" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#FFEE00" stop-opacity="0" />
						<stop offset="100%" stop-color="#FFEE00" stop-opacity="0.5" />
					</linearGradient>
				`);

				ig.append('rect')
					.attr('x', x1)
					.attr('y', y1)
					.attr('width', x2 - x1)
					.attr('height', y2 - y1)
					.attr('fill', 'url(#tracker-rect-gradient)');
			}
		}

		const interval = nsWeatherData.intervals.find((item) => ms >= item.ms && ms <= item.x2);

		const msIntervalStart = interval?.ms ?? ms;
		const length = interval ? interval.x2 - interval.ms : 1;

		// Debug tracker alignment issues - only log when no interval found
		// const formatMs = (t: number) => dayjs(t).tz(nsWeatherData.timezone).format('HH:mm:ss');
		// const debug = createDebugLogger(`Tracker ${formatMs(ms)}`, hours === 24 && !interval);
		// debug.log(`ms: ${formatMs(ms)} (${ms})`);
		// debug.log(`interval found: ${interval ? 'yes' : 'no'}`);
		// if (interval) {
		// 	debug.log(`interval.ms: ${formatMs(interval.ms)} (${interval.ms})`);
		// 	debug.log(`interval.x2: ${formatMs(interval.x2)} (${interval.x2})`);
		// 	debug.log(`length: ${length}ms (${length / MS_IN_MINUTE} min)`);
		// }
		// const nearbyIntervals = nsWeatherData.intervals
		// 	.filter((item) => Math.abs(item.ms - ms) < MS_IN_HOUR * 2)
		// 	.map((item) => `${formatMs(item.ms)}-${formatMs(item.x2)}`);
		// debug.log(`nearby intervals: ${nearbyIntervals.join(', ')}`);
		// debug.finish();

		if (msIntervalStart >= msStart && msIntervalStart < msEnd) {
			drawTracker(ms, msIntervalStart, length, trackerColor, true);
		} else if (ghostTracker) {
			// Calculate time-of-day offset from the day start hour (4 AM), not midnight
			// msStart is already at DAY_START_HOUR, so we need to offset from that
			const dayStartOffsetMs = DAY_START_HOUR * MS_IN_HOUR;
			const msGhost =
				msStart +
				((((ms + nsWeatherData.utcOffsetMs - dayStartOffsetMs) % MS_IN_DAY) + MS_IN_DAY) %
					MS_IN_DAY);
			const msGhostInterval =
				msStart +
				((((msIntervalStart + nsWeatherData.utcOffsetMs - dayStartOffsetMs) % MS_IN_DAY) +
					MS_IN_DAY) %
					MS_IN_DAY);

			drawTracker(msGhost, msGhostInterval, length, 'white', false);
		}

		// DEBUG: Draw debug tracker for displayMs (animated time)
		// if (debugTrackerMs !== undefined) {
		// 	const debugIntervalStart = startOf(debugTrackerMs, 'hour', nsWeatherData.timezone);
		// 	if (debugIntervalStart >= msStart && debugIntervalStart < msEnd) {
		// 		drawTracker(debugTrackerMs, debugIntervalStart, length, 'magenta', true);
		// 	}
		// }
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
			// Bottom border line connecting tick marks (extends left off-screen to cover temp bar)
			Plot.ruleY([yDomainBottom], {
				x1: msStart - MS_IN_DAY,
				x2: msEnd,
				stroke: 'rgba(0, 0, 0, 0.2)',
				strokeWidth: 1,
			}),
		];

		// Sky color gradient as base layer (replaces gray background)
		// Calculate mini skystrip position
		let aqiOffset = 0;
		if (draw.aqiUs) aqiOffset += aqiPlotHeight;
		if (draw.aqiEurope) aqiOffset += aqiPlotHeight;
		const miniSkyY2 = -aqiOffset;
		const miniSkyY1 = miniSkyY2 - skyStripHeight;

		// Total height of merged skystrip (main + mini below y-axis)
		const mainHeight = yDomainTop; // 0 to yDomainTop
		const totalHeight = mainHeight + skyStripHeight + aqiOffset;
		// Percentage where main section ends and mini begins
		const mainEndPercent = (mainHeight / totalHeight) * 100;

		if (dataSkyColor && dataSkyColor.length > 0) {
			// Create all vertical gradient definitions
			marks.push(() => {
				const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

				for (const slice of dataSkyColor) {
					const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
					gradient.setAttribute('id', slice.gradientId);
					gradient.setAttribute('x1', '0');
					gradient.setAttribute('y1', '0');
					gradient.setAttribute('x2', '0');
					gradient.setAttribute('y2', '1'); // Vertical gradient

					// Merged gradient: main sky strip + solid mini strip at bottom
					// skyPalettes format: [top, middle, bottom] matches SVG gradient (0%=top, 100%=bottom)
					const topColor = slice.colors[0];
					const bottomColor = slice.colors[2];

					// Scale original stops to fit in main section (0% to mainEndPercent%)
					const stop0 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
					stop0.setAttribute('offset', '0%');
					stop0.setAttribute('stop-color', topColor);
					gradient.appendChild(stop0);

					const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
					stop1.setAttribute('offset', `${0.3 * mainEndPercent}%`);
					stop1.setAttribute('stop-color', topColor); // Hold top color until 30% of main
					gradient.appendChild(stop1);

					const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
					stop2.setAttribute('offset', `${0.65 * mainEndPercent}%`);
					stop2.setAttribute('stop-color', slice.colors[1]); // Middle
					gradient.appendChild(stop2);

					const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
					stop3.setAttribute('offset', `${mainEndPercent}%`);
					stop3.setAttribute('stop-color', bottomColor);
					gradient.appendChild(stop3);

					// Solid bottom color for mini strip section
					const stop4 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
					stop4.setAttribute('offset', '100%');
					stop4.setAttribute('stop-color', bottomColor);
					gradient.appendChild(stop4);

					defs.appendChild(gradient);
				}

				return defs;
			});

			// Render merged sky strip (main + mini below y-axis)
			marks.push(
				Plot.rectY(dataSkyColor, {
					x1: 'x1',
					x2: 'x2',
					y1: yDomainTop,
					y2: miniSkyY1,
					fill: (d) => `url(#${d.gradientId})`,
				}),
			);
		} else {
			// Fallback gray background if no sky data (merged main + mini)
			marks.push(
				Plot.rectY([0], {
					x1: msStart,
					x2: msEnd,
					y1: yDomainTop,
					y2: miniSkyY1,
					fill: '#efefef',
				}),
			);
		}

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
						y2: 0,
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

					// When toggle is on: fully transparent below label band (top 30%)
					// When toggle is off: fully opaque throughout
					const labelBandPercent = 30;
					const bottomOpacity = showSkyThroughWmo ? 0 : 1;
					marks.push(
						() => htl.svg`<defs>
							<linearGradient id="cloud-gradient-${code}-${msStart}" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stop-color="${topColor}" stop-opacity="1" />
								<stop offset="${labelBandPercent}%" stop-color="${mid}" stop-opacity="1" />
								<stop offset="${labelBandPercent}%" stop-color="${mid}" stop-opacity="${bottomOpacity}" />
								<stop offset="100%" stop-color="${bottomColor}" stop-opacity="${bottomOpacity}" />
							</linearGradient>
						</defs>`,
					);
				}

				// Weather code colored bands (full height)
				marks.push(
					Plot.rectY(dataForecast.codes, {
						x1: 'x1',
						x2: 'x2',
						y: yDomainTop,
						fill: 'fill',
					}),
				);

				// When showSkyThroughWmo is active, add semi-transparent overlays
				// These go on top of the sky strip to simulate cloud coverage / fog / precipitation
				if (showSkyThroughWmo) {
					// Define overlay gradients for all supported WMO codes
					// Codes 1-3: cloudy, 45/48: fog, 51+: all precipitation
					const allWmoCodes = Object.keys(WMO_CODES).map(Number);
					for (const code of allWmoCodes) {
						const overlayStops = getWmoOverlayGradient(code);
						if (overlayStops) {
							marks.push(
								() => htl.svg`<defs>
									<linearGradient id="wmo-overlay-${code}-${msStart}" x1="0" y1="0" x2="0" y2="1">
										${overlayStops.map((stop: { offset: string; color: string }) => htl.svg`<stop offset="${stop.offset}" stop-color="${stop.color}" />`)}
									</linearGradient>
								</defs>`,
							);
						}
					}

					// Render overlay rects for all codes except 0 (clear - pure sky)
					const overlayData = dataForecast.codes.filter((d) => d.weatherCode !== 0);
					if (overlayData.length > 0) {
						marks.push(
							Plot.rectY(overlayData, {
								x1: 'x1',
								x2: 'x2',
								y: yDomainTop,
								fill: (d) => `url(#wmo-overlay-${d.weatherCode}-${msStart})`,
							}),
						);
					}
				}
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

			// Sunrise/sunset indicators removed - sky strip shows this now

			// Past overlay - sepia-tinted top and bottom edges
			const now = Date.now();
			const pastEnd = Math.min(msEnd, Math.max(msStart, now));

			if (now > msStart) {
				marks.push(
					() => htl.svg`<defs>
						<linearGradient id="past-overlay-gradient-${msStart}" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stop-color="rgb(100, 80, 50)" stop-opacity=".6" />
							<stop offset="10%" stop-color="rgb(100, 80, 50)" stop-opacity=".6" />
							<stop offset="30%" stop-color="rgb(100, 80, 50)" stop-opacity="0" />
							<stop offset="100%" stop-color="rgb(100, 80, 50)" stop-opacity="0" />
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

	/* Glow behind temperature line for visibility over WMO code backgrounds */
	div > :global(svg [stroke*='temp-gradient']) {
		filter: drop-shadow(0 0 2px ghostwhite) drop-shadow(0 0 4px ghostwhite);
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
