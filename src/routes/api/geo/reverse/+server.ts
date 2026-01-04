import { env } from '$env/dynamic/private';
import { json, type RequestHandler } from '@sveltejs/kit';

const FALLBACK_LOCATION = [
	{
		name: 'Unknown Location',
		country: 'Unknown',
		state: null,
	},
];

export const GET: RequestHandler = async ({ url, fetch }) => {
	const lat = url.searchParams.get('latitude') || url.searchParams.get('lat');
	const lon = url.searchParams.get('longitude') || url.searchParams.get('lon');

	const OPEN_WEATHER_APPID = env.OPEN_WEATHER_APPID;

	if (!OPEN_WEATHER_APPID) {
		// Return a fallback response when API key is not available
		return json(FALLBACK_LOCATION);
	}

	try {
		const apiUrl = `http://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&appid=${OPEN_WEATHER_APPID}`;
		const resp = await fetch(apiUrl);

		if (!resp.ok) {
			console.error(`Reverse geocoding failed: ${resp.status} ${resp.statusText}`);
			return json(FALLBACK_LOCATION);
		}

		const data = await resp.json();

		// Ensure we always return a valid array with at least one result
		if (!Array.isArray(data) || data.length === 0) {
			return json(FALLBACK_LOCATION);
		}

		return json(data);
	} catch (error) {
		console.error('Reverse geocoding error:', error);
		return json(FALLBACK_LOCATION);
	}
};
