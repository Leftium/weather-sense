# Goal

Migrate WeatherSense from SvelteKit 2 to stable SvelteKit 3 without changing product behavior.

Closes #1.

# Baseline

- `@sveltejs/kit ^2.70.3`
- `@sveltejs/adapter-auto ^7.0.1`
- `@sveltejs/vite-plugin-svelte ^7.3.0`
- Svelte `^5.56.10`
- TypeScript `^5.9.3`
- Vite `^8.2.2`
- Kit/Svelte config still lives in `svelte.config.js`
- no automated test suite

# Scope

1. Upgrade Kit to 3.x and adapter-auto to 8.x; raise Svelte and TypeScript to the Kit 3 peer minimums while keeping the existing Vite 8/plugin-svelte 7 baseline.
2. Move SvelteKit/Svelte config into `vite.config.ts`, preserving:
   - `vitePreprocess()`
   - adapter-auto
   - inspector settings
   - `vite-plugin-devtools-json`
   - `@leftium/gg` Vite plugins
   - SCSS `silenceDeprecations`
3. Update ESLint to load the moved Svelte config with `@sveltejs/load-config`.
4. Migrate `tsconfig.json` to `$app/tsconfig`.
5. Add package imports for `#lib` / `#lib/*` and migrate source imports from `$lib`.
6. Migrate removed/deprecated Kit APIs used by the app:
   - `$app/environment` -> `$app/env`
   - review `$app/paths.resolve` calls for Kit 3 path/route-ID semantics
   - migrate API response helpers where required
7. Replace `$env/*` access with explicit `src/env.ts` declarations:
   - `PUBLIC_ENABLE_SSR`: public + static
   - `OPEN_WEATHER_APPID`: private runtime variable
8. Run the official `sv migrate sveltekit-3 --tasks all --confirm` migration against the pre-migration baseline for comparison and resolve every applicable migration task.
9. Keep unrelated product/refactor work out of this PR.

# Preserve

- forecast/weather calculations and display behavior
- query/location state and geolocation behavior
- radar/WMO/AQI auxiliary pages
- reverse-geocoding and OpenWeather fallback behavior
- `PUBLIC_ENABLE_SSR` semantics
- existing Vercel-header timezone fallback unless current deployment architecture requires otherwise

# Verify

- regenerated lockfile + frozen install
- `pnpm check`
- `pnpm lint`
- `pnpm knip`
- production build
- browser smoke for main forecast, location/query state, radar, WMO/AQI, and responsive layout
- server/API smoke for reverse geocoding and OpenWeather configured/unconfigured paths
- SSR-disabled default plus `PUBLIC_ENABLE_SSR=true` where practical
- active deployment target/runtime, determined from current repo/deployment state rather than historical assumptions
- document baseline failures separately from migration regressions

Do not merge as part of implementation. Mark Ready only after verification is complete so ChatGPT can perform independent review.
