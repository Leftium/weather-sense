import { gg } from '$lib/gg';

export const load = async (loadEvent) => {
	const ipAddress = loadEvent.getClientAddress();
	const { headers } = loadEvent.request;

	let source = 'hardcoded';
	let name = 'Bupyeong-gu, KR';
	let coords = {
		latitude: 37.5087,
		longitude: 126.7219,
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

	if (source === 'hardcoded') {
		const city = headers.get('x-vercel-ip-city');
		const country = headers.get('x-vercel-ip-country');
		const latitude = Number(headers.get('x-vercel-ip-latitude'));
		const longitude = Number(headers.get('x-vercel-ip-longitude'));

		if (city && country && latitude && longitude) {
			source = 'geo-ip';
			name = `${city}, ${country}`;
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
	};
};
