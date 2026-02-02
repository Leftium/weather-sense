export const load = async (loadEvent) => {
	const ipAddress = loadEvent.getClientAddress();
	const { headers } = loadEvent.request;

	let source = 'hardcoded';
	let name = 'St Paul, MN';
	let countryCode: string | null = 'US'; // Default for hardcoded St Paul, MN
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
		// Parse "City, CC" format (like OpenWeather: city name, comma, 2-letter country code)
		let cityName = paramName;
		let parsedCountryCode: string | null = null;

		if (paramName.includes(',')) {
			const parts = paramName.split(',').map((p: string) => p.trim());
			const lastPart = parts[parts.length - 1];

			// Check if last part is a 2-letter country code (ISO-3166-1 alpha2)
			if (lastPart.length === 2 && /^[A-Za-z]{2}$/.test(lastPart)) {
				parsedCountryCode = lastPart.toUpperCase();
				cityName = parts.slice(0, -1).join(', '); // Rejoin remaining parts as city name
			}
		}

		// Build API URL with proper encoding
		const apiUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
		apiUrl.searchParams.set('name', cityName);
		apiUrl.searchParams.set('count', '10'); // Higher count needed for countryCode filter to work reliably
		if (parsedCountryCode) {
			apiUrl.searchParams.set('countryCode', parsedCountryCode);
		}

		const fetched = await fetch(apiUrl);
		const jsoned = await fetched.json();

		//gg(jsoned);

		if (jsoned?.results?.length) {
			source = `geocoded`;
			name = jsoned.results[0].name;
			countryCode = jsoned.results[0].country_code ?? null;
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
			countryCode = country || null; // Vercel IP headers provide 2-letter country code
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
		countryCode,
		coords,
		mapStyle,
		timezone,
	};
};
