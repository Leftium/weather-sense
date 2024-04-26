export const load = async (loadEvent) => {
	const ipAddress = loadEvent.getClientAddress();
	const { headers } = loadEvent.request;

	let source = 'hard-coded';
	let name = 'Bupyeong-gu, KR';
	let coords = {
		latitude: 37.5087,
		longitude: 126.7219,
		accuracy: 1_000
	};

	const city = headers.get('x-vercel-ip-city');
	const country = headers.get('x-vercel-ip-country');
	const latitude = Number(headers.get('x-vercel-ip-latitude'));
	const longitude = Number(headers.get('x-vercel-ip-longitude'));

	if (city && country && latitude && longitude) {
		source = 'vercel-headers';
		name = `${city}, ${country}`;
		coords = {
			latitude,
			longitude,
			accuracy: 25_000
		};
	}

	// Load all the available map frames from RainViewer API.
	const fetched = await fetch('https://api.rainviewer.com/public/weather-maps.json');
	const rainviewerData = await fetched.json();

	return {
		ipAddress,
		source,
		name,
		coords,
		rainviewerData
	};
};
