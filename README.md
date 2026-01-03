# WeatherSense

User-friendly, actionable weather forecasts.

![image](https://github.com/user-attachments/assets/e003badb-4832-430d-8f6c-faf9677abb4e)

## Notes for devs

### API Keys

The main API used is [Open-Meteo](https://open-meteo.com/), where API keys are optional (for non-commercial use).

Extra optional API keys:

- https://openweathermap.org/api (For reverse geocoding)

Copy `.env.example` to `.env`, add your own keys

<details>
<summary><b>WeatherSense uses <a href="https://svelte.dev/docs/kit">SvelteKit</a> as a base.</b> (Open for more details...)</summary>
  
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

</details>
