// Defines nation-state for weather data.

import { getEmitter } from '$lib/emitter';
import { gg } from '$lib/gg';

export type WeatherDataEvents = {
	weatherdata_requestedSetLocation: {
		source: string;
		coords?: Coordinates;
		name?: string;
	};

	weatherdata_updatedRadar: {
		nsWeatherData: NsWeatherData;
	};
};

type Coordinates = {
	latitude: number;
	longitude: number;
	accuracy: number;
};

export type RadarFrame = {
	time: number;
	path: string;
};

type Radar = {
	generated: number;
	host: string;
	frames: RadarFrame[];
};

async function fetchRainviewerData() {
	// Load all the available map frames from RainViewer API.
	const fetched = await fetch('https://api.rainviewer.com/public/weather-maps.json');
	const rainviewerData = await fetched.json();

	const frames = (rainviewerData.radar.past || []).concat(rainviewerData.radar.nowcast || []);

	return {
		generated: rainviewerData.generated,
		host: rainviewerData.host,
		frames
	};
}

const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

export type NsWeatherData = ReturnType<typeof makeNsWeatherData>;

export function makeNsWeatherData() {
	gg('makeNsWeatherData');
	let source: string = $state('???');
	let coords: Coordinates | null = $state(null);
	let name: string | null = $state(null);

	let radar: Radar = $state({ generated: 0, host: '', frames: [] });
	fetchRainviewerData().then((data) => {
		radar = data;
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

		get radar() {
			return radar;
		}
	};

	return nsWeatherData;
}
