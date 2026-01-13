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
	const HEIGHT = 50;
	const MARGIN_LEFT = 4;
	const MARGIN_RIGHT = 4;

	// Derived data
	const dataMinutely = $derived(nsWeatherData.dataMinutely);
	const hasData = $derived(dataMinutely.length > 0);

	// Time range for x-axis (extend msEnd by 1 minute to show last bar fully)
	const msStart = $derived(dataMinutely[0]?.ms ?? Date.now());
	const msEnd = $derived(
		(dataMinutely.at(-1)?.ms ?? Date.now() + 59 * MS_IN_MINUTE) + MS_IN_MINUTE,
	);

	// Max precipitation for y-axis scaling
	const maxPrecip = $derived(
		Math.max(0.5, ...dataMinutely.map((d: MinutelyPoint) => d.precipitation)),
	);

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

	// Plot options
	const plotOptions = $derived({
		width: clientWidth,
		height: HEIGHT,
		marginLeft: MARGIN_LEFT,
		marginRight: MARGIN_RIGHT,
		marginTop: 4,
		marginBottom: 16,
		x: {
			type: 'utc' as const,
			domain: [msStart, msEnd],
			range: [MARGIN_LEFT, clientWidth - MARGIN_RIGHT],
			ticks: 4,
			tickFormat: (ms: number) => nsWeatherData.tzFormat(ms, 'h:mm'),
		},
		y: {
			axis: null,
			domain: [0, maxPrecip],
		},
	});

	// Build plot marks
	const marks = $derived.by(() => {
		if (!hasData) return [];

		// Build bar data - each bar spans 1 minute
		const barData = dataMinutely.map((d: MinutelyPoint, i: number, arr: MinutelyPoint[]) => ({
			x1: d.ms,
			x2: arr[i + 1]?.ms ?? d.ms + MS_IN_MINUTE,
			precipitation: d.precipitation,
		}));

		return [
			// Background
			Plot.rectY([{ x1: msStart, x2: msEnd, y: maxPrecip }], {
				x1: 'x1',
				x2: 'x2',
				y: 'y',
				fill: 'rgba(0, 0, 0, 0.05)',
			}),
			// Precipitation bars
			Plot.rectY(barData, {
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
	<div class="label">60 min</div>
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
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.5em;
		padding: 0.25em 0;
		background: #f8f8ff;

		&.hidden {
			display: none;
		}
	}

	.label {
		font-size: 12px;
		font-weight: 600;
		color: #666;
		writing-mode: vertical-rl;
		text-orientation: mixed;
		transform: rotate(180deg);
		padding-left: 4px;
	}

	.plot-container {
		width: 100%;
		height: 50px;
		overflow: visible;

		:global(svg) {
			overflow: visible;
		}

		:global(svg *) {
			pointer-events: none;
		}
	}
</style>
