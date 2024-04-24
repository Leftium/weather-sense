import { OPEN_WEATHER_APPID } from '$env/static/private';

export const GET = async ({ url, fetch }) => {
	const lat = url.searchParams.get('latitude') || url.searchParams.get('lat');
	const lon = url.searchParams.get('longitude') || url.searchParams.get('lon');

	const apiUrl = `http://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&appid=${OPEN_WEATHER_APPID}`;

	const resp = fetch(apiUrl);

	return resp;
};
