export const load = async (loadEvent) => {
	const ipAddress = loadEvent.getClientAddress();
	const { headers } = loadEvent.request;

	const city = headers.get('x-vercel-ip-city');
	const country = headers.get('x-vercel-ip-country');
	const region = headers.get('x-vercel-ip-country-region');
	const latitude = headers.get('x-vercel-ip-latitude');
	const longitude = headers.get('x-vercel-ip-longitude');
	const timezone = headers.get('x-vercel-ip-timezone');

	const location =
		city && country && region && latitude && longitude && timezone
			? {
					city,
					country,
					region,
					latitude,
					longitude,
					timezone,
					source: 'vercel-headers'
				}
			: {
					city: 'Bupyeong-gu',
					country: 'KR',
					region: '28',
					latitude: '37.5087',
					longitude: '126.7219',
					timezone: 'Asia/Seoul',
					source: 'hard-coded'
				};

	return {
		ipAddress,
		location
	};
};
