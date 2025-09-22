import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
			headers: {
				'User-Agent': 'Weather-Sense-App/1.0',
			},
		});

		if (!response.ok) {
			return new Response(JSON.stringify({ error: 'Failed to fetch weather maps' }), {
				status: response.status,
				headers: {
					'Content-Type': 'application/json',
				},
			});
		}

		const data = await response.json();

		return new Response(JSON.stringify(data), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
			},
		});
	} catch (error) {
		console.error('Weather maps API error:', error);
		return new Response(JSON.stringify({ error: 'Internal server error' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}
};
