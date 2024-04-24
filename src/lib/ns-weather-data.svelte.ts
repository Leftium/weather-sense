// Defines nation-state for weather data.

import { getEmitter } from '$lib/emitter';
import { gg } from '$lib/gg';

export type WeatherDataEvents = {
	weatherdata_requestedSetLocation: {
		source: string;
		coords?: Coordinates;
		name?: string;
	};
};

type Coordinates = {
	latitude: number;
	longitude: number;
	accuracy: number;
};

const { on } = getEmitter<WeatherDataEvents>(import.meta);

export function makeNsWeatherData() {
	let source: string = $state('???');
	let coords: Coordinates | null = $state(null);
	let name: string | null = $state(null);

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
		}
	};

	return nsWeatherData;
}
