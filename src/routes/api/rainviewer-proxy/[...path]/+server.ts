import type { RequestHandler } from './$types';

// Transparent 1x1 WebP image (smaller than PNG)
const TRANSPARENT_WEBP = new Uint8Array([
	0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
	0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x00,
]);

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
			// Return transparent WebP for missing tiles to avoid ORB issues
			// Cache for 1 hour to prevent repeated requests for same missing tile
			return new Response(TRANSPARENT_WEBP, {
				status: 200,
				headers: {
					'Content-Type': 'image/webp',
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
		// Return transparent WebP for errors to avoid ORB issues
		// Cache for 1 hour to prevent repeated requests
		return new Response(TRANSPARENT_WEBP, {
			status: 200,
			headers: {
				'Content-Type': 'image/webp',
				'Cache-Control': 'public, max-age=3600',
				'X-Tile-Status': 'error',
			},
		});
	}
};
