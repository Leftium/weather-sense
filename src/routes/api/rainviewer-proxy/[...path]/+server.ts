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
			// Return 404 for missing tiles (faster than generating transparent image)
			return new Response(null, { status: 404 });
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
		// Return 404 for errors (map library will handle gracefully)
		return new Response(null, { status: 404 });
	}
};
