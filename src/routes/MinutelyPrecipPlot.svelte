<script lang="ts">
	import type { WeatherStore, WeatherDataEvents, MinutelyPoint } from '$lib/weather';
	import { getEmitter } from '$lib/emitter';
	import { trackable } from '$lib/trackable';
	import { colors, MS_IN_MINUTE } from '$lib/util';
	import * as Plot from '@observablehq/plot';
	import * as d3 from 'd3';
	import { clamp } from 'lodash-es';

	const { emit } = getEmitter<WeatherDataEvents>(import.meta);

	type Props = {
		nsWeatherData: WeatherStore;
	};

	let { nsWeatherData }: Props = $props();

	// DOM elements
	let div: HTMLDivElement;
	let clientWidth = $state(300);

	// Layout constants
	// Height tuned to match hourly precipitation bar heights (83px at LINEAR_MAX)
	const HEIGHT = 106;
	const MARGIN_LEFT = 2;
	const MARGIN_RIGHT = 2;

	// Derived data
	const dataMinutely = $derived(nsWeatherData.dataMinutely);
	// Only show if we have data AND at least one non-zero precipitation value
	const hasData = $derived(
		dataMinutely.length > 0 && dataMinutely.some((d) => d.precipitation > 0),
	);

	// Time range for x-axis (extend msEnd by 1 minute to show last bar fully)
	const msStart = $derived(dataMinutely[0]?.ms ?? Date.now());
	const msEnd = $derived(
		(dataMinutely.at(-1)?.ms ?? Date.now() + 59 * MS_IN_MINUTE) + MS_IN_MINUTE,
	);

	// Precipitation scaling constants (identical to TimeLine.svelte for pixel-matching)
	// LINEAR_MAX: ~80th percentile for precipitation (snow reports higher mm/hr than rain)
	const LINEAR_MAX = 3;
	const LINEAR_SECTION = 70; // Percentage of visual range for linear portion

	// Transform precipitation value to scaled visual value (0-140 range, matching hourly)
	// onlyLinear=true: just linear portion (main bar)
	// onlyLinear=false: linear + cap + exponential (cap bar, drawn underneath)
	function transformPrecip(p: number, onlyLinear = false): number {
		if (p === 0) return 0; // No bar for zero precipitation
		// Linear scale up to LINEAR_MAX mm/hr
		let result = LINEAR_MAX > 0 ? (Math.min(p, LINEAR_MAX) / LINEAR_MAX) * LINEAR_SECTION : 0;
		// Cyan cap only for exponential range (heavy rain)
		if (!onlyLinear && p >= LINEAR_MAX) {
			// Divisor 10 maxes ~30-40mm/hr
			result += (140 - LINEAR_SECTION) * (1 - Math.exp(-(p - LINEAR_MAX) / 10));
		}
		return result;
	}

	// Y domain matches hourly plot's precipitation range
	const Y_MAX = 140;

	// X scale for tracker positioning and pointer conversion
	const xScale = $derived(
		Plot.scale({
			x: {
				type: 'utc',
				domain: [msStart, msEnd],
				range: [MARGIN_LEFT, clientWidth - MARGIN_RIGHT],
			},
		}),
	);

	// Trackable options - use getters to always read current derived values
	const trackableOptions = {
		getMs: (e: PointerEvent | MouseEvent): number => {
			const svgNode = d3.select(div).select('svg').node();
			if (svgNode) {
				const [x] = d3.pointer(e, svgNode);
				// Manual conversion: x position to ms
				const plotWidth = clientWidth - MARGIN_LEFT - MARGIN_RIGHT;
				const ratio = (x - MARGIN_LEFT) / plotWidth;
				const ms = msStart + ratio * (msEnd - msStart);
				return clamp(ms, msStart, msEnd);
			}
			return msStart;
		},
		getTrackedElement: () => nsWeatherData.trackedElement,
		onTimeChange: (ms: number) => emit('weatherdata_requestedSetTime', { ms }),
		onTrackingStart: (node: HTMLElement) => emit('weatherdata_requestedTrackingStart', { node }),
		onTrackingEnd: () => emit('weatherdata_requestedTrackingEnd'),
	};

	// Fixed tick values: now, 15, 30, 45, 60 min from start
	const tickValues = $derived([
		msStart,
		msStart + 15 * MS_IN_MINUTE,
		msStart + 30 * MS_IN_MINUTE,
		msStart + 45 * MS_IN_MINUTE,
		msStart + 60 * MS_IN_MINUTE,
	]);

	// Plot options - disable default x-axis labels, we'll add custom two-tone labels
	const plotOptions = $derived({
		width: clientWidth,
		height: HEIGHT,
		marginLeft: MARGIN_LEFT,
		marginRight: MARGIN_RIGHT,
		marginTop: 4,
		marginBottom: 20,
		x: {
			type: 'utc' as const,
			domain: [msStart, msEnd],
			range: [MARGIN_LEFT, clientWidth - MARGIN_RIGHT],
			ticks: tickValues,
			tickFormat: (ms: number) => {
				const minFromStart = Math.round((ms - msStart) / MS_IN_MINUTE);
				const absTime = nsWeatherData.tzFormat(ms, 'h:mma').replace(':00', '').toLowerCase();
				const relTime = minFromStart === 0 ? 'now' : `${minFromStart}min`;
				return `${relTime} ${absTime}`;
			},
		},
		y: {
			axis: null,
			domain: [0, Y_MAX],
		},
	});

	// Build plot marks
	const marks = $derived.by(() => {
		if (!hasData) return [];

		// Build bar data - each bar spans 1 minute
		const barDataCap = dataMinutely.map((d: MinutelyPoint, i: number, arr: MinutelyPoint[]) => ({
			x1: d.ms,
			x2: arr[i + 1]?.ms ?? d.ms + MS_IN_MINUTE,
			precipitation: transformPrecip(d.precipitation, false), // Full height (linear + cap + exponential)
		}));

		const barDataMain = dataMinutely.map((d: MinutelyPoint, i: number, arr: MinutelyPoint[]) => ({
			x1: d.ms,
			x2: arr[i + 1]?.ms ?? d.ms + MS_IN_MINUTE,
			precipitation: transformPrecip(d.precipitation, true), // Linear only
		}));

		return [
			// Background
			Plot.rectY([{ x1: msStart, x2: msEnd, y: Y_MAX }], {
				x1: 'x1',
				x2: 'x2',
				y: 'y',
				fill: 'rgba(0, 0, 0, 0.05)',
			}),
			// Cap bar (underneath) - cyan for exponential region
			Plot.rectY(barDataCap, {
				x1: 'x1',
				x2: 'x2',
				y: 'precipitation',
				fill: '#66AAFF', // cap color (sky blue)
				insetLeft: 0.5,
				insetRight: 0.5,
			}),
			// Main bar (on top) - blue for linear region
			Plot.rectY(barDataMain, {
				x1: 'x1',
				x2: 'x2',
				y: 'precipitation',
				fill: colors.precipitation,
				insetLeft: 0.5,
				insetRight: 0.5,
			}),
		];
	});

	// Render plot when data or dimensions change (NOT on ms change)
	$effect(() => {
		// Track all dependencies explicitly
		const data = dataMinutely;
		const width = clientWidth;
		const opts = plotOptions;
		const m = marks;

		if (!div || data.length === 0) return;

		const plot = Plot.plot({
			...opts,
			marks: m,
		});

		div.replaceChildren(plot);
	});

	// Tracker line element (reused, just moved via transform)
	let trackerLine: d3.Selection<SVGLineElement, unknown, null, undefined> | null = null;

	// Update tracker position (separate effect, runs on ms change)
	$effect(() => {
		if (!div || !hasData) return;

		const ms = nsWeatherData.ms;
		const svg = d3.select(div).select('svg');
		if (svg.empty()) return;

		// Clamp ms to range - show at edge if slightly outside
		const clampedMs = Math.max(msStart, Math.min(msEnd, ms));
		const inRange = ms >= msStart - 2 * MS_IN_MINUTE && ms <= msEnd + 2 * MS_IN_MINUTE;

		if (inRange) {
			const x = xScale.apply(clampedMs);

			// Create tracker line if it doesn't exist
			if (!trackerLine || svg.select('.minutely-tracker').empty()) {
				trackerLine = svg
					.append('line')
					.attr('class', 'minutely-tracker')
					.attr('y1', 0)
					.attr('y2', HEIGHT - 16)
					.attr('stroke', 'yellow')
					.attr('stroke-width', 2)
					.style('filter', 'drop-shadow(0 0 2px rgba(0,0,0,0.5))')
					.style('will-change', 'transform');
			}

			// Move tracker via transform (GPU accelerated)
			trackerLine.attr('transform', `translate(${x}, 0)`);
		} else if (trackerLine) {
			trackerLine.remove();
			trackerLine = null;
		}
	});
</script>

<div class="minutely-precip-plot" class:hidden={!hasData}>
	<div
		bind:this={div}
		bind:clientWidth
		use:trackable={trackableOptions}
		role="img"
		class="plot-container"
	></div>
</div>

<style lang="scss">
	.minutely-precip-plot {
		padding: 0.25em 0;
		background: #f8f8ff;
		overflow: visible;

		&.hidden {
			display: none;
		}
	}

	.plot-container {
		width: 100%;
		height: 106px;
		overflow: visible;

		:global(svg) {
			overflow: visible;
		}

		:global(svg *) {
			pointer-events: none;
		}

		// Style tick labels
		:global(svg g[aria-label='x-axis tick label'] text) {
			font-size: 10px;
			fill: #666;
		}

		// Shift first tick label right to prevent clipping
		:global(svg g[aria-label='x-axis tick label'] text:first-of-type) {
			text-anchor: start;
		}

		// Shift last tick label left to prevent clipping
		:global(svg g[aria-label='x-axis tick label'] text:last-of-type) {
			text-anchor: end;
		}
	}
</style>
