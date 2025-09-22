import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const path = params.path;
	const rainviewerUrl = `https://tilecache.rainviewer.com/${path}`;

	try {
		const response = await fetch(rainviewerUrl, {
			headers: {
				'User-Agent': 'Weather-Sense-App/1.0',
				Accept: 'image/webp,image/png,*/*',
			},
		});

		if (!response.ok) {
			console.warn(`RainViewer tile not found: ${rainviewerUrl} (${response.status})`);
			// Return a 1x1 transparent PNG for missing tiles
			const transparentPng = new Uint8Array([
				137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6,
				0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 0, 0, 1, 0,
				1, 0, 24, 221, 139, 176, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
			]);
			return new Response(transparentPng, {
				headers: {
					'Content-Type': 'image/png',
					'Cache-Control': 'public, max-age=60',
				},
			});
		}

		const buffer = await response.arrayBuffer();

		return new Response(buffer, {
			headers: {
				'Content-Type': response.headers.get('Content-Type') || 'image/webp',
				'Cache-Control': 'public, max-age=300',
				'Cross-Origin-Resource-Policy': 'cross-origin',
			},
		});
	} catch (err) {
		console.error('RainViewer proxy error:', err);
		// Return transparent tile on error
		const transparentPng = new Uint8Array([
			137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
			0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 0, 0, 1, 0, 1, 0,
			24, 221, 139, 176, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
		]);
		return new Response(transparentPng, {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'public, max-age=60',
			},
		});
	}
};
