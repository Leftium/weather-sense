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

# Implementation results (2026-10-05)

Implemented locally on `chatgpt/sveltekit-3` using Kit 3.0.0, adapter-auto 8.0.0,
Svelte 5.57.1, TypeScript 6.0.3, and load-config 0.2.3. Vite and plugin-svelte
versions remain unchanged. Configuration now lives in `vite.config.ts`; inspector
options are passed directly to `sveltekit`. Package imports include explicit module
extensions, with `#lib` pointing to the existing weather barrel. Missing
`OPEN_WEATHER_APPID` values remain falsy so both API fallback paths still work.

The official `sv@1.1.0 migrate sveltekit-3 --tasks all --confirm --no-install`
ran against an isolated copy of the pre-migration commit. All applicable tasks
were reviewed. The generated inspector nesting required a manual correction.
Both `goto` destinations preserve the current internal pathname and change query
parameters. There is no `invalidateAll` call or dependency on cross-origin dev
assets. API helpers now use `Response.json`. No migration task markers remain
in application source.

| Verification                                      | Result                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Regenerated lockfile and frozen install           | Passed in the worktree and a clean isolated copy                                                         |
| `pnpm check`                                      | Same baseline error: mock WMO item lacks required `CodesItem.group` in `TimeLine.svelte`                 |
| `pnpm lint`                                       | ESLint passed; Prettier reports the same seven baseline files                                            |
| `pnpm knip`                                       | Passed; `src/env.ts` is explicitly registered as an entry                                                |
| Default production build                          | Passed with SSR disabled                                                                                 |
| Vercel production build, `PUBLIC_ENABLE_SSR=true` | Passed; adapter-auto selected adapter-vercel 7.0.0 and emitted `nodejs24.x` functions                    |
| HTTP smoke, both SSR modes                        | Main, WMO, AQI, and radar routes returned 200; SSR mode included rendered page content                   |
| Location and timezone                             | Seoul query resolved to Korean coordinates; default and Vercel-header timezone paths passed              |
| Configured OpenWeather key                        | Reverse geocoding and One Call returned live data                                                        |
| Missing OpenWeather key                           | Reverse geocoding returned Unknown Location; One Call returned `available: false`                        |
| Invalid cookie key and missing coordinates        | Cookie key overrode the configured key and returned 401; missing coordinates returned 400                |
| Svelte autofixer                                  | Migrated import declarations passed; broader existing component suggestions were outside migration scope |
| Browser interaction and responsive layout         | Pending: T3 preview failed to open and then timed out                                                    |

Baseline Prettier failures: `.logo/config.json`, `.logo/favicon.htm`, `README.md`,
`specs/openweather.md`, `src/lib/util.ts`, `src/routes/+page.svelte`, and
`src/routes/TimeLine.svelte`. These and the baseline type error remain unchanged.

GitHub deployment records confirm Vercel is the current deployment provider.
The Vercel build ran in an isolated copy because adapter-auto installs its selected
adapter into the project. No deployment was published from this worktree.

Keep the PR draft until browser smoke and independent review are complete.
