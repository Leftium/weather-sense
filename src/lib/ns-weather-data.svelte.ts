// Defines nation-state for weather data.

import haversine from 'haversine-distance';

import { getEmitter } from '$lib/emitter';
import { gg } from '$lib/gg';
import type { Coordinates, Radar } from '$lib/types';

export type WeatherDataEvents = {
	weatherdata_requestedSetLocation: {
		source: string;
		coords?: Coordinates;
		name?: string;
	};

	weatherdata_requestedSetTime: {
		time: number;
	};

	weatherdata_requestedTogglePlay: undefined;

	weatherdata_requestedFetchRainviewerData: undefined;

	weatherdata_updatedRadar: {
		nsWeatherData: NsWeatherData;
	};
};

const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

export type NsWeatherData = ReturnType<typeof makeNsWeatherData>;

export function makeNsWeatherData() {
	gg('makeNsWeatherData');

	// Inputs:
	let coords: Coordinates | null = $state(null);
	let name: string | null = $state(null);
	let source: string = $state('???');

	// The time for which to render weather data:
	let time = $state(+new Date() / 1000);

	let radarPlaying = $state(false);
	let resetRadarOnPlay = $state(true);
	let radar: Radar = $state({ generated: 0, host: '', frames: [] });

	on('weatherdata_requestedFetchRainviewerData', async function () {
		// Load all the available map frames from RainViewer API.
		const fetched = await fetch('https://api.rainviewer.com/public/weather-maps.json');
		const rainviewerData = await fetched.json();

		const frames = (rainviewerData.radar.past || []).concat(rainviewerData.radar.nowcast || []);

		radar = {
			generated: rainviewerData.generated,
			host: rainviewerData.host,
			frames
		};
		emit('weatherdata_updatedRadar', { nsWeatherData });
	});

	on('weatherdata_requestedSetLocation', async function (params) {
		gg('weatherdata_requestedSetLocation', params);

		source = params.source;

		if (params.coords) {
			coords = {
				latitude: params.coords.latitude,
				longitude: params.coords.longitude,
				accuracy: params.coords.accuracy
			};
		} else if (params.name) {
			// coords = GEOCODE(params.name)
		}

		if (params.name) {
			name = params.name;
		} else if (params.coords) {
			name = '...';
			// name = REVERSE_GEOCODE(params.coords)
			const resp = await fetch(
				`/api/geo/reverse?lat=${params.coords.latitude}&lon=${params.coords.longitude}`
			);
			const json = await resp.json();
			const result = json[0];

			name = `${result.name}, ${result.country}`;
		}

		gg({ name, coords, params });
	});

	on('weatherdata_requestedSetTime', function (params) {
		// gg('weatherdata_requestedSetTime', params);

		time = params.time;
		const maxRadarTime = (radar.frames.at(-1)?.time || 0) + 10 * 60;
		if (time > maxRadarTime) {
			radarPlaying = false;
			time = +new Date() / 1000;
			resetRadarOnPlay = true;
		}
	});

	on('weatherdata_requestedTogglePlay', function () {
		radarPlaying = !radarPlaying;

		if (resetRadarOnPlay) {
			time = radar.frames[0].time;
		}
		resetRadarOnPlay = false;
	});

	const nsWeatherData = {
		get source() {
			return source;
		},

		get coords() {
			return coords;
		},

		get name() {
			return name;
		},

		get time() {
			return time;
		},

		get radar() {
			return radar;
		},

		get radarPlaying() {
			return radarPlaying;
		}
	};

	return nsWeatherData;
}
