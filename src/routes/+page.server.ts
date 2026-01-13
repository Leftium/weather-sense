export const load = async (loadEvent) => {
	const ipAddress = loadEvent.getClientAddress();
	const { headers } = loadEvent.request;

	let source = 'hardcoded';
	let name = 'St Paul, MN';
	let coords = {
		latitude: 44.9478656,
		longitude: -93.1856384,
		accuracy: 0,
	};

	const searchParams = loadEvent.url.searchParams;
	const paramName = searchParams.get('name') ?? searchParams.get('n');
	const mapStyle = searchParams.has('gus_massa')
		? 'openstreetmap'
		: searchParams.get('mapstyle') || 'stamen';

	//gg(paramName);

	if (paramName) {
		const fetched = await fetch(
			`https://geocoding-api.open-meteo.com/v1/search?name=${paramName}&count=1`,
		);
		const jsoned = await fetched.json();

		//gg(jsoned);

		if (jsoned?.results?.length) {
			source = `geocoded`;
			name = jsoned.results[0].name;
			coords = {
				latitude: jsoned.results[0].latitude,
				longitude: jsoned.results[0].longitude,
				accuracy: 0,
			};
		}
	}

	// Get timezone from Vercel's IP geolocation (available immediately, before any API calls)
	// Only use IP timezone if no location was passed via query param (otherwise it won't match)
	// Falls back to America/Chicago (matches hardcoded St Paul, MN location for local dev)
	const timezone = paramName ? null : headers.get('x-vercel-ip-timezone') || 'America/Chicago';

	if (source === 'hardcoded') {
		const city = decodeURIComponent(headers.get('x-vercel-ip-city') || '');
		const region = decodeURIComponent(headers.get('x-vercel-ip-country-region') || '');
		const country = decodeURIComponent(headers.get('x-vercel-ip-country') || '');
		const latitude = Number(headers.get('x-vercel-ip-latitude'));
		const longitude = Number(headers.get('x-vercel-ip-longitude'));

		if (city && country && latitude && longitude) {
			source = 'geo-ip';
			name = `${city}, ${country === 'US' ? region : country}`;
			coords = {
				latitude,
				longitude,
				accuracy: 0,
			};
		}
	}

	return {
		ipAddress,
		source,
		name,
		coords,
		mapStyle,
		timezone,
	};
};
