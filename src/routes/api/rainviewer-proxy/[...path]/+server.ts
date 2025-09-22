import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const path = params.path;
	const rainviewerUrl = `https://tilecache.rainviewer.com/${path}`;

	try {
		const response = await fetch(rainviewerUrl, {
			headers: {
				'User-Agent': 'Weather-Sense-App/1.0',
				Accept: 'image/webp,image/png,*/*',
			},
			// Add timeout to prevent hanging requests
			signal: AbortSignal.timeout(5000),
		});

		if (!response.ok) {
			// Return 204 No Content for missing tiles - browsers cache this and MapLibre handles it gracefully
			// Cache for 1 hour to prevent repeated requests for same missing tile
			return new Response(null, {
				status: 204,
				headers: {
					'Cache-Control': 'public, max-age=3600',
					'X-Tile-Status': 'missing',
				},
			});
		}

		const buffer = await response.arrayBuffer();

		return new Response(buffer, {
			headers: {
				'Content-Type': response.headers.get('Content-Type') || 'image/webp',
				// Longer cache for successful tiles
				'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
				'Cross-Origin-Resource-Policy': 'cross-origin',
			},
		});
	} catch (err) {
		// Return 204 No Content for errors - browsers cache this and MapLibre handles it gracefully
		// Cache for 1 hour to prevent repeated requests
		return new Response(null, {
			status: 204,
			headers: {
				'Cache-Control': 'public, max-age=3600',
				'X-Tile-Status': 'error',
			},
		});
	}
};
