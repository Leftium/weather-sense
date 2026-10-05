import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_ENABLE_SSR: { public: true, static: true },
	OPEN_WEATHER_APPID: { schema: (input) => input ?? '' },
});
