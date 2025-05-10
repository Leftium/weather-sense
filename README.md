# WeatherSense

User-friendly, actionable weather forecasts.

![image](https://github.com/user-attachments/assets/a639a7af-91ed-4c33-b148-26da7311b324)



## Instructions for devs

WeatherSense uses [SvelteKit](https://svelte.dev/docs/kit) as a base.



### API Keys

The main API used is [OpenMeteo](https://open-meteo.com/), where API keys are optional (non-commercial use).

Extra optional API keys:
- https://openweathermap.org/api (For reverse geocoding.)
- https://stadiamaps.com/ (For maps on non-localhost domains.)

Copy `.env.example` to `.env`, add your own keys

### Developing

After installing dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

### Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.
