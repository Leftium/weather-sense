import { env } from '$env/dynamic/private';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, fetch, cookies }) => {
	const lat = url.searchParams.get('lat');
	const lon = url.searchParams.get('lon');
	const exclude = url.searchParams.get('exclude') || '';

	if (!lat || !lon) {
		return json({ error: 'Missing lat/lon parameters', available: false }, { status: 400 });
	}

	// BYOK: User's cookie key takes priority over ENV key
	const userKey = cookies.get('openweather_api_key');
	const apiKey = userKey || env.OPEN_WEATHER_APPID;

	// Debug info (remove after troubleshooting)
	const debug = {
		hasUserKey: !!userKey,
		hasEnvKey: !!env.OPEN_WEATHER_APPID,
		envKeyLength: env.OPEN_WEATHER_APPID?.length ?? 0,
	};

	if (!apiKey) {
		return json({ error: 'API key not configured', available: false, debug });
	}

	// Track usage for non-BYOK users (nudge system)
	if (!userKey && env.OPEN_WEATHER_APPID) {
		const usesLeft = parseInt(cookies.get('openweather_uses') ?? '10');

		if (usesLeft <= 0) {
			return json(
				{
					error: 'quota_exceeded',
					message: 'Free usage limit reached. Add your own API key for unlimited access.',
					settingsUrl: '/settings#openweather',
					available: false,
				},
				{ status: 402 },
			);
		}

		// Decrement usage counter
		cookies.set('openweather_uses', String(usesLeft - 1), {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 24 * 365, // 1 year
		});
	}

	try {
		// Build API URL
		// Use imperial units to match Open-Meteo's Fahrenheit setting
		const apiUrl =
			`https://api.openweathermap.org/data/3.0/onecall` +
			`?lat=${lat}&lon=${lon}` +
			(exclude ? `&exclude=${exclude}` : '') +
			`&units=imperial` +
			`&appid=${apiKey}`;

		const response = await fetch(apiUrl);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`OpenWeather API error: ${response.status} ${errorText}`);
			return json(
				{
					error: `OpenWeather API error: ${response.status}`,
					available: false,
				},
				{ status: response.status },
			);
		}

		const data = await response.json();

		return json({ ...data, available: true, debug });
	} catch (error) {
		console.error('OpenWeather fetch error:', error);
		return json({ error: 'Failed to fetch OpenWeather data', available: false }, { status: 500 });
	}
};
