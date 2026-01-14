<script module lang="ts">
	import { browser } from '$app/environment';

	let adjustedLabelWidths = $state(false);
	let labelWidths: Record<string, number> = $state({});

	// Global toggle for sky visibility through WMO conditions (persisted to localStorage)
	const STORAGE_KEY = 'showSkyThroughWmo';
	let showSkyThroughWmo = $state(browser ? localStorage.getItem(STORAGE_KEY) === 'true' : false);

	// TODO: expose toggle in UI
	// function toggleSkyThroughWmo() {
	// 	showSkyThroughWmo = !showSkyThroughWmo;
	// 	if (browser) {
	// 		localStorage.setItem(STORAGE_KEY, String(showSkyThroughWmo));
	// 	}
	// }
</script>

<script lang="ts">
	import {
		getTemperatureStats,
		getIntervals,
		type TemperatureStats,
		type WeatherStore,
		type WeatherDataEvents,
		type DailyForecast,
	} from '$lib/weather';

	import { clamp, each, maxBy } from 'lodash-es';
	import * as d3 from 'd3';

	import { gg } from '@leftium/gg';
	import * as Plot from '@observablehq/plot';
	import * as htl from 'htl';
	import { getEmitter } from '$lib/emitter';
	import { trackable } from '$lib/trackable';
	import { onMount, tick, untrack } from 'svelte';
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
		MS_IN_DAY,
		MS_IN_HOUR,
		MS_IN_MINUTE,
		MS_IN_SECOND,
		DAY_START_HOUR,
		WMO_CODES,
		precipitationGroup,
		temperatureToColor,
		TEMP_COLOR_HOT,
		TEMP_COLOR_COLD,
		skyPalettes,
	} from '$lib/util';
	import { getSunAltitude } from '$lib/horizon';
	import { iconSetStore } from '$lib/iconSet.svelte';
	import { wmoGradientStore } from '$lib/wmoGradient.svelte';
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
		extendTracker = false,
		trackerColor = 'yellow',
		groupIcons = true,
		tempStats,
		debugTrackerMs,
	}: {
		nsWeatherData: WeatherStore;
		plotVisibility: PlotVisibility;
		start?: number;
		hours?: number;
		xAxis?: boolean;
		ghostTracker?: boolean;
		extendTracker?: boolean;
		trackerColor?: string;
		groupIcons?: boolean;
		tempStats?: TemperatureStats | null;
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

	// Fallback temperature stats computed from dataForecast
	const defaultTempStats = $derived(getTemperatureStats(nsWeatherData.dataForecast));

	// Time intervals for tracker (combined hourly + radar frames)
	const intervals = $derived(getIntervals(nsWeatherData.hourly, nsWeatherData.radar?.frames));

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
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				_getPrevValueFn: (item: AqiItem) => number,
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

		// Find sunrise/sunset for a given timestamp (unused, kept for potential future use)
		// function getSunTimes(ms: number): { sunrise: number; sunset: number } | null {
		// 	const day = nsWeatherData.daily?.find((d) => d.ms <= ms && d.ms + MS_IN_DAY > ms);
		// 	return day ? { sunrise: day.sunrise, sunset: day.sunset } : null;
		// }

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

				// Use gradient or solid color based on preference
				const solidColor = WMO_CODES[nextCode].color;
				const fill = wmoGradientStore.value
					? `url(#cloud-gradient-${nextCode}-${msStart})`
					: solidColor;

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

						// Use gradient or solid color based on preference
						const solidColorMerged = WMO_CODES[mergedCode].color;
						const fillMerged = wmoGradientStore.value
							? `url(#cloud-gradient-${mergedCode}-${msStart})`
							: solidColorMerged;
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
				const fill = wmoGradientStore.value
					? `url(#cloud-gradient-${wmoCode}-${msStart})`
					: solidColor;
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
		onTopRegionTap: wmoGradientStore.toggle,
		topRegionRatio: 0.3, // Top 30% where the solid WMO label band is
	};

	function makeTransFormPrecipitation(onlyLinear: boolean) {
		// ~80th percentile for snow precipitation (snow reports higher mm/hr than rain)
		const LINEAR_MAX = 3;

		const LINEAR_SECTION = 70;

		return (da: { precipitation: number }[]) => {
			const resultArray = da.map((d) => {
				const p = d.precipitation;

				// Linear scale maxing at 2mm/hr (80th percentile):
				let resultValue =
					LINEAR_MAX > 0 ? (Math.min(p, LINEAR_MAX) / LINEAR_MAX) * LINEAR_SECTION : 0;

				// Cyan cap only for exponential range (heavy rain)
				if (!onlyLinear && p >= LINEAR_MAX) {
					// Divisor 10 maxes ~30-40mm/hr
					resultValue += (140 - LINEAR_SECTION) * (1 - Math.exp(-(p - LINEAR_MAX) / 10));
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
		return function (da: Record<string, number>[]) {
			// Use local (day's) range if provided, otherwise fall back to visible/global
			const stats = tempStats ?? defaultTempStats;
			const minTemp = localMin ?? stats?.minTemperatureOnly ?? 0;
			const maxTemp = localMax ?? stats?.maxTemperature ?? 100;
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

	// All UI state that should trigger a plot re-render (centralized for easy maintenance)
	// NOTE: Data changes (nsWeatherData) trigger via events, not here
	const plotTriggers = $derived({
		draw, // plotVisibility checkboxes
		showSkyThroughWmo, // WMO label band tap toggle
		groupIcons, // Summary icon click (group/ungroup WMO codes)
		wmoGradient: wmoGradientStore.value, // Gradient vs solid WMO backgrounds
	});

	// @ts-expect-error: x.type is valid.
	const xScale = $derived(Plot.scale({ x: plotOptions.x }));
	const yScale = $derived(Plot.scale({ y: plotOptions.y }));

	// Cache tracker elements to avoid DOM churn on mouse move
	let trackerGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
	let trackerLine: d3.Selection<SVGLineElement, unknown, null, undefined> | null = null;
	let trackerLineExtended: d3.Selection<SVGLineElement, unknown, null, undefined> | null = null;
	let trackerRect: d3.Selection<SVGRectElement, unknown, null, undefined> | null = null;
	let lastTrackerMode: 'normal' | 'ghost' | null = null;
	let lastRectWidth: number = 0;

	// Debug tracker - shows displayMs (eased animation progress)
	let debugTrackerLine: d3.Selection<SVGLineElement, unknown, null, undefined> | null = null;

	function ensureTrackerElements(
		pg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
		isGhost: boolean,
	) {
		const mode = isGhost ? 'ghost' : 'normal';
		const y1 = yScale.apply(yDomainTop);
		const y2 = yScale.apply(yDomainBottom);

		// If mode changed or elements don't exist, recreate
		if (mode !== lastTrackerMode || !trackerGroup) {
			// Remove old tracker
			pg.select('.tracker-rect').remove();
			trackerGroup = null;
			trackerLine = null;
			trackerLineExtended = null;
			trackerRect = null;

			// Create new group - use will-change for GPU compositing
			// pointer-events: none allows clicks to pass through to container for tap detection
			trackerGroup = pg
				.append('g')
				.attr('class', 'tracker-rect')
				.style('will-change', 'transform')
				.style('pointer-events', 'none');

			// Create extended line first (behind) - white line for ghost trackers below
			if (extendTracker && !isGhost) {
				trackerLineExtended = trackerGroup
					.append('line')
					.attr('x1', 0)
					.attr('x2', 0)
					.attr('y1', y2) // Start where main tracker ends
					.attr('y2', 2000) // Extend far down
					.attr('stroke', 'rgba(255, 255, 255, 0.6)')
					.attr('stroke-width', 2);
			}

			// Create main tracker line (on top)
			trackerLine = trackerGroup
				.append('line')
				.attr('x1', 0)
				.attr('x2', 0)
				.attr('y1', y1)
				.attr('y2', y2)
				.attr('stroke-width', 2)
				.style(
					'filter',
					'drop-shadow(0 0 3px rgba(0,0,0,0.3)) drop-shadow(0 0 6px rgba(0,0,0,0.2))',
				);

			// Create rect only for normal mode
			if (!isGhost) {
				// Add gradient definition
				trackerGroup.append('defs').html(`
					<linearGradient id="tracker-rect-gradient" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#FFEE00" stop-opacity="0" />
						<stop offset="100%" stop-color="#FFEE00" stop-opacity="0.5" />
					</linearGradient>
				`);

				// Rect starts at x=0, positioned via transform, width updated only when needed
				trackerRect = trackerGroup
					.append('rect')
					.attr('x', 0)
					.attr('y', y1)
					.attr('height', y2 - y1)
					.attr('fill', 'url(#tracker-rect-gradient)');
				lastRectWidth = 0;
			}

			lastTrackerMode = mode;
		}
	}

	function updateTrackerPosition(
		ms: number,
		msIntervalStart: number,
		length: number,
		lineColor: string,
	) {
		if (!trackerGroup || !trackerLine) return;

		const x = xScale.apply(ms);
		const x1 = xScale.apply(msIntervalStart);
		const x2 = xScale.apply(Math.min(msIntervalStart + length, msEnd));
		const rectWidth = x2 - x1;

		// Use CSS transform for position (GPU-accelerated, no layout)
		trackerGroup.style('transform', `translateX(${x1}px)`);

		// Line position relative to group (line at tracker position within rect)
		const lineOffset = x - x1;
		trackerLine.attr('x1', lineOffset).attr('x2', lineOffset).attr('stroke', lineColor);

		// Update extended line position too
		if (trackerLineExtended) {
			trackerLineExtended.attr('x1', lineOffset).attr('x2', lineOffset);
		}

		// Update rect width only if changed (width change triggers layout, but is rare)
		if (trackerRect && Math.abs(rectWidth - lastRectWidth) > 0.5) {
			trackerRect.attr('width', rectWidth);
			lastRectWidth = rectWidth;
		}
	}

	function hideTracker() {
		if (trackerGroup) {
			trackerGroup.style('opacity', '0');
		}
	}

	function showTracker() {
		if (trackerGroup) {
			trackerGroup.style('opacity', '1');
		}
	}

	function updateTracker(ms: number) {
		const pg = d3.select(div).select<SVGSVGElement>('svg');
		if (pg.empty()) return;

		const interval = intervals.find((item) => ms >= item.ms && ms <= item.x2);

		const msIntervalStart = interval?.ms ?? ms;
		const length = interval ? interval.x2 - interval.ms : 1;

		if (msIntervalStart >= msStart && msIntervalStart < msEnd) {
			// Normal tracker
			ensureTrackerElements(pg, false);
			showTracker();
			updateTrackerPosition(ms, msIntervalStart, length, trackerColor);
		} else if (ghostTracker) {
			// Ghost tracker: Calculate time-of-day offset from the day start hour (4 AM)
			const dayStartOffsetMs = DAY_START_HOUR * MS_IN_HOUR;
			const msGhost =
				msStart +
				((((ms + nsWeatherData.utcOffsetSeconds * MS_IN_SECOND - dayStartOffsetMs) % MS_IN_DAY) +
					MS_IN_DAY) %
					MS_IN_DAY);
			const msGhostInterval =
				msStart +
				((((msIntervalStart + nsWeatherData.utcOffsetSeconds * MS_IN_SECOND - dayStartOffsetMs) %
					MS_IN_DAY) +
					MS_IN_DAY) %
					MS_IN_DAY);

			ensureTrackerElements(pg, true);
			showTracker();
			updateTrackerPosition(msGhost, msGhostInterval, length, 'white');
		} else {
			hideTracker();
		}
	}

	// Reset tracker cache when plot is redrawn
	function resetTrackerCache() {
		trackerGroup = null;
		trackerLine = null;
		trackerLineExtended = null;
		trackerRect = null;
		lastTrackerMode = null;
		lastRectWidth = 0;
		debugTrackerLine = null;
	}

	// Update debug tracker position (dashed line showing displayMs / eased animation)
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function updateDebugTracker(_ms: number) {
		if (!debugTrackerMs) return;

		const pg = d3.select(div).select<SVGSVGElement>('svg');
		if (pg.empty()) return;

		const y1 = yScale.apply(yDomainTop);
		const y2 = yScale.apply(yDomainBottom);

		// Create debug line if it doesn't exist
		if (!debugTrackerLine) {
			debugTrackerLine = pg
				.append('line')
				.attr('class', 'debug-tracker')
				.attr('y1', y1)
				.attr('y2', y2)
				.attr('stroke', 'magenta')
				.attr('stroke-width', 2)
				.attr('stroke-dasharray', '4,4')
				.style('pointer-events', 'none');
		}

		// Position the debug line
		const x = xScale.apply(debugTrackerMs);
		if (debugTrackerMs >= msStart && debugTrackerMs <= msEnd) {
			debugTrackerLine.attr('x1', x).attr('x2', x).style('opacity', '1');
		} else if (ghostTracker) {
			// Ghost position for debug tracker too
			const dayStartOffsetMs = DAY_START_HOUR * MS_IN_HOUR;
			const msGhost =
				msStart +
				((((debugTrackerMs + nsWeatherData.utcOffsetSeconds * MS_IN_SECOND - dayStartOffsetMs) %
					MS_IN_DAY) +
					MS_IN_DAY) %
					MS_IN_DAY);
			const xGhost = xScale.apply(msGhost);
			debugTrackerLine.attr('x1', xGhost).attr('x2', xGhost).style('opacity', '0.5');
		} else {
			debugTrackerLine.style('opacity', '0');
		}
	}

	// Generate and place Obervable.Plot from data.
	function plotData() {
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
				// Hourly rain bar 'cap':
				marks.push(
					Plot.rectY(dataForecast.rain, {
						x1: 'x1bar',
						x2: 'x2bar',
						y: { transform: makeTransFormPrecipitation(false) },
						fill: '#78E8E8', // cap color (soft cyan)
					}),
				);

				// Hourly rain bar:
				marks.push(
					Plot.rectY(dataForecast.rain, {
						x1: 'x1bar',
						x2: 'x2bar',
						y: { transform: makeTransFormPrecipitation(true) },
						fill: colors.precipitation, // dark navy
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
			const stats = tempStats ?? defaultTempStats;
			const globalMin = stats?.minTemperatureOnly ?? 0;
			const globalMax = stats?.maxTemperature ?? 100;

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

			// Define gradient for temperature line (filters are defined globally in template)
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

		/* eslint-disable svelte/no-dom-manipulating -- Observable Plot requires direct DOM manipulation */
		div?.firstChild?.remove(); // First remove old chart, if any.
		div?.append(plot); // Then add the new chart.
		/* eslint-enable svelte/no-dom-manipulating */

		// Apply SVG filters to plot elements (more reliable than CSS filters on iOS)
		// Filters are defined globally in template, referenced here by ID
		const svg = div?.querySelector('svg');
		if (svg) {
			// Apply embossed glow to plot lines
			svg.querySelectorAll('g[aria-label="line"] path').forEach((path) => {
				(path as SVGPathElement).style.filter = 'url(#emboss-glow)';
			});
			// Apply gray glow to WMO icons
			svg.querySelectorAll('g[aria-label="image"] image').forEach((img) => {
				(img as SVGImageElement).style.filter = 'url(#icon-glow)';
			});

			// Allow tracker to overflow for extended ghost tracker line
			if (extendTracker) {
				svg.style.overflow = 'visible';
			}
		}

		// Reset tracker cache since DOM was replaced, then render initial tracker
		resetTrackerCache();
		updateTracker(nsWeatherData.ms);
	}

	// Update rule location only (leaving rest of plot intact).
	// Listen for frameTick event for synchronized tracker updates across all plots
	let lastTrackerMs: number | null = null;
	on('weatherdata_frameTick', ({ ms }) => {
		// Skip DOM updates if position hasn't changed (reduces GPU work when idle)
		if (ms === lastTrackerMs) return;
		lastTrackerMs = ms;
		updateTracker(ms);
	});

	// Update debug tracker reactively when debugTrackerMs prop changes
	$effect(() => {
		if (debugTrackerMs !== undefined) {
			updateDebugTracker(debugTrackerMs);
		}
	});

	// Update entire plot when UI state changes (plotTriggers centralizes all dependencies)
	$effect(() => {
		void plotTriggers; // Read to track dependency
		untrack(() => plotData());
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
		const resizeObserver = new ResizeObserver(() => {
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
		{#each Object.values(WMO_CODES) as props (props.description)}
			<div bind:this={labelElements[props.description]}>{props.description}</div>
		{/each}

		{#each [...AQI_INDEX_US, ...AQI_INDEX_EUROPE] as { text }, i (i)}
			<div bind:this={labelElements[text]}>{text}</div>
		{/each}

		<div bind:this={labelElements['No Data']}>No Data</div>
		<div bind:this={labelElements['Not Available']}>Not Available</div>
	</div>
{/if}

<!-- Global SVG filter definitions (shared across all plots, avoids duplication) -->
<svg class="global-filters">
	<defs>
		<!-- Embossed glow filter for plot lines (iOS-compatible) -->
		<filter id="emboss-glow" x="-50%" y="-50%" width="200%" height="200%">
			<!-- Light shadow (top-left) -->
			<feDropShadow
				dx="-1"
				dy="-1"
				stdDeviation="1"
				flood-color="white"
				flood-opacity="0.5"
				result="light"
			/>
			<!-- Dark shadow (bottom-right) -->
			<feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="black" flood-opacity="0.4" />
		</filter>

		<!-- Gray glow filter for WMO icons -->
		<filter id="icon-glow" x="-50%" y="-50%" width="200%" height="200%">
			<feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="gray" flood-opacity="0.6" />
			<feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="gray" flood-opacity="0.4" />
			<feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="gray" flood-opacity="0.3" />
		</filter>

		<!-- White glow filter for precipitation bars (top-right edge) -->
		<!-- Constrain left, right, and top for line-like effect -->
		<filter id="precip-glow" x="5%" y="0%" width="97%" height="100%">
			<!-- Glow offset upward and right -->
			<feDropShadow dx="2" dy="-2" stdDeviation="1" flood-color="white" flood-opacity="0.9" />
		</filter>

		<!-- Gradient for minutely precipitation bars (white top edge) -->
		<linearGradient id="precip-minutely-gradient" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color="white" stop-opacity="0.9" />
			<stop offset="15%" stop-color="#2244AA" />
			<stop offset="100%" stop-color="#2244AA" />
		</linearGradient>
	</defs>
</svg>

<div
	bind:this={div}
	bind:clientWidth
	use:trackable={trackableOptions}
	role="img"
	class:extend-tracker={extendTracker}
></div>

<style>
	div,
	div > :global(svg) {
		overflow: visible !important;
	}

	/* Extended tracker - position relative for stacking, but no z-index to avoid clipping icons */
	div.extend-tracker {
		position: relative;
	}

	/* Disable hit-testing on all SVG children to reduce GPU usage when hovering.
	   All interaction is handled at the container level by the trackable action. */
	div > :global(svg *) {
		pointer-events: none;
	}

	/* Shift last tick label left to prevent clipping */
	div > :global(svg g[aria-label='x-axis tick label'] text:last-of-type) {
		text-anchor: end;
	}

	/* Global SVG filters (hidden, only contains filter definitions) */
	.global-filters {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
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
