import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

export const GET = async ({ url, fetch }) => {
	const lat = url.searchParams.get('latitude') || url.searchParams.get('lat');
	const lon = url.searchParams.get('longitude') || url.searchParams.get('lon');

	const OPEN_WEATHER_APPID = env.OPEN_WEATHER_APPID;

	if (!OPEN_WEATHER_APPID) {
		// Return a fallback response when API key is not available
		return json([
			{
				name: 'Unknown Location',
				country: 'Unknown',
				state: null,
			},
		]);
	}

	const apiUrl = `http://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&appid=${OPEN_WEATHER_APPID}`;

	const resp = fetch(apiUrl);

	return resp;
};
