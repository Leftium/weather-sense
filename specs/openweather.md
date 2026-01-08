# OpenWeather One Call API 3.0 Integration

## Overview

Integrate the OpenWeather One Call API 3.0 as an **optional, secondary** weather data source. The primary use case is the `minutely` precipitation forecast for the next 60 minutes, but the API also provides `current`, `hourly`, and `daily` data that can augment or be compared against the existing Open-Meteo data.

### Key Constraints

- **Optional feature**: Only enabled when `OPEN_WEATHER_APPID` is configured
- **Limited free quota**: 1,000 calls/day free (vs Open-Meteo's unlimited free tier)
- **BYOK (Bring Your Own Key)**: Users can provide their own API key
- **Open-Meteo remains primary**: OpenWeather data supplements but never replaces Open-Meteo

---

## BYOK (Bring Your Own Key) System

### Overview

API keys are needed for OpenWeather and RainViewer. The system supports:

1. **Server ENV keys** - Default, shared across all users (limited/no quota)
2. **User-provided keys** - Stored in cookies, unlimited personal use

### Key Resolution Order

```
1. Cookie key (user-provided) → Use if present
2. ENV key (server default)   → Use if cookie absent
3. No key                     → Feature unavailable
```

### Storage: Signed Cookies

Cookies are preferred over localStorage because:

- Automatically sent to server (no client→server plumbing)
- `httpOnly` option prevents JS access (more secure)
- Can be signed to detect tampering

**Cookie names:**

- `openweather_api_key` - OpenWeather One Call API key
- `openweather_uses` - Remaining free uses (signed)

**Note:** RainViewer uses IP-based rate limiting with no API key system, so BYOK is not applicable.

**Server-side key resolution:**

```typescript
// In +server.ts
import { env } from '$env/dynamic/private';

function getApiKey(event: RequestEvent, cookieName: string, envKey: string): string | null {
	// User's own key takes priority
	const userKey = event.cookies.get(cookieName);
	if (userKey) return userKey;

	// Fall back to ENV key
	return env[envKey] || null;
}

// Usage
const apiKey = getApiKey(event, 'openweather_api_key', 'OPEN_WEATHER_APPID');
```

### Progressive Nudge System

To encourage BYOK without blocking functionality entirely, implement a "free rides" system that adds friction after N uses:

#### Stages

```
Stage 1: Free rides (first N uses)
┌─────────────────────────────────────────┐
│      [Feature works normally]           │
│                                         │
│   "3 free views remaining" (subtle)     │
└─────────────────────────────────────────┘

Stage 2: Friction (after N uses, no BYOK)
┌─────────────────────────────────────────┐
│     [Feature hidden - click to load]    │
│                                         │
│  ⚠️ Add your own API key for unlimited  │
│     access → Configure in Settings      │
└─────────────────────────────────────────┘

Stage 3: BYOK configured
┌─────────────────────────────────────────┐
│      [Feature works normally]           │
│           (no friction ever)            │
└─────────────────────────────────────────┘
```

#### Free Usage Limits

| Feature         | Free Uses | Reset | Notes                    |
| --------------- | --------- | ----- | ------------------------ |
| 60-min Forecast | 10        | Never | OpenWeather One Call API |

**Note:** RainViewer (radar) has no BYOK option - it uses IP-based rate limiting (100 req/IP/min as of Jan 2026). The radar feature works without any API key configuration.

#### Server-Side Logic

```typescript
// In +server.ts (e.g., /api/openweather/onecall)
export async function GET(event) {
	const userKey = event.cookies.get('openweather_api_key');

	if (userKey) {
		// BYOK - unlimited, use their key
		return fetchWithKey(userKey);
	}

	// Check signed usage counter
	const usesLeft = parseInt(event.cookies.get('openweather_uses') ?? '10');

	if (usesLeft > 0) {
		// Free ride - use ENV key, decrement counter
		event.cookies.set('openweather_uses', String(usesLeft - 1), {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 24 * 365, // 1 year
			// SvelteKit signs cookies automatically when using cookies.set()
		});
		return fetchWithKey(env.OPEN_WEATHER_APPID);
	}

	// No uses left - return 402 or special status
	return json(
		{
			error: 'quota_exceeded',
			message: 'Free usage limit reached. Add your own API key for unlimited access.',
			settingsUrl: '/settings#openweather',
		},
		{ status: 402 },
	);
}
```

#### Client-Side Handling

```svelte
<!-- MinutelyForecast.svelte (or similar component) -->
<script>
	let quotaExceeded = $state(false);
	let loading = $state(false);

	async function loadMinutelyForecast() {
		loading = true;
		const res = await fetch('/api/openweather/onecall?lat=...&lon=...');

		if (res.status === 402) {
			quotaExceeded = true;
			loading = false;
			return;
		}

		// ... normal forecast loading
	}
</script>

{#if quotaExceeded}
	<div class="forecast-placeholder">
		<button onclick={loadMinutelyForecast}>Click to load forecast</button>
		<p>
			⚠️ Free usage limit reached.
			<a href="/settings#openweather">Add your own API key</a> for unlimited access.
		</p>
	</div>
{:else}
	<!-- Normal 60-min forecast display -->
{/if}
```

#### Signed Cookies for Anti-Gaming

SvelteKit's `cookies.set()` automatically signs cookies, preventing tampering:

```typescript
// Setting a signed cookie (automatic in SvelteKit)
event.cookies.set('openweather_uses', '10', { path: '/' });

// Reading verifies signature (automatic)
const uses = event.cookies.get('openweather_uses'); // null if tampered
```

**Note**: Determined users can still game this (clear cookies, use incognito, etc.). The goal is _nudging_, not DRM. Honest users (99%+) will either:

1. Use free quota normally
2. Get their own key when nudged
3. Accept the click-to-load friction

### Settings Page

Create `/settings` page for managing API keys:

**Route:** `src/routes/settings/+page.svelte`

```
Settings
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## API Keys

API keys are stored in your browser and sent securely to our
server. We never store your keys on our servers.

---

### OpenWeather (optional)                           #openweather
Enables 60-minute precipitation forecast.

**Get a FREE key:**
1. Sign up at [openweathermap.org](https://openweathermap.org/api)
2. Subscribe to "One Call API 3.0" (1,000 calls/day free)
3. Copy your API key and paste below

[____________________________________] [Save] [Clear]

Status: ✓ Valid (tested)  |  ✗ Invalid (401 Unauthorized)  |  ○ Not set

---

ℹ️ Keys are stored as secure cookies. Clear browser data to remove.

Note: RainViewer (radar) requires no API key - it uses IP-based rate limiting.
```

### Settings Page Implementation

```svelte
<!-- src/routes/settings/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';

	let { data } = $props();

	// Track status for OpenWeather
	let owStatus = $state<'valid' | 'invalid' | 'not_set' | 'testing'>('not_set');

	async function testKey(key: string) {
		owStatus = 'testing';

		const res = await fetch(`/api/settings/test-key`, {
			method: 'POST',
			body: JSON.stringify({ provider: 'openweather', key }),
		});

		const result = await res.json();
		owStatus = result.valid ? 'valid' : 'invalid';
	}
</script>

<h1>Settings</h1>

<section id="openweather">
	<h2>OpenWeather</h2>
	<p>Enables 60-minute precipitation forecast.</p>

	<details>
		<summary>How to get a FREE API key</summary>
		<ol>
			<li>
				Sign up at <a href="https://openweathermap.org/api" target="_blank">openweathermap.org</a>
			</li>
			<li>Subscribe to "One Call API 3.0" (1,000 calls/day free)</li>
			<li>Copy your API key and paste below</li>
		</ol>
	</details>

	<form method="POST" action="?/saveKey" use:enhance>
		<input type="hidden" name="provider" value="openweather" />
		<input type="text" name="key" placeholder="Enter API key" />
		<button type="submit">Save</button>
		<button type="submit" formaction="?/clearKey">Clear</button>
	</form>

	<p class="status">
		{#if owStatus === 'valid'}✓ Valid{/if}
		{#if owStatus === 'invalid'}✗ Invalid{/if}
		{#if owStatus === 'not_set'}○ Not set{/if}
		{#if owStatus === 'testing'}⏳ Testing...{/if}
	</p>
</section>
```

### Settings Form Actions

```typescript
// src/routes/settings/+page.server.ts
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	saveKey: async ({ request, cookies }) => {
		const data = await request.formData();
		const key = data.get('key') as string;

		if (!key || key.length < 10) {
			return fail(400, { error: 'Invalid key format' });
		}

		// Validate key by making test API call
		const isValid = await testOpenWeatherKey(key);

		if (!isValid) {
			return fail(400, { error: 'API key is invalid or unauthorized' });
		}

		cookies.set('openweather_api_key', key, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 24 * 365, // 1 year
		});

		return { success: true };
	},

	clearKey: async ({ cookies }) => {
		cookies.delete('openweather_api_key', { path: '/' });
		return { success: true, cleared: true };
	},
};

async function testOpenWeatherKey(key: string): Promise<boolean> {
	try {
		// Test with a simple API call (minimal data)
		const res = await fetch(
			`https://api.openweathermap.org/data/3.0/onecall?lat=0&lon=0&appid=${key}&exclude=minutely,hourly,daily,alerts`,
		);
		return res.ok;
	} catch {
		return false;
	}
}
```

### Navigation to Settings

Add settings link in main layout or when quota exceeded:

```svelte
<!-- In +layout.svelte or nav component -->
<a href="/settings">⚙️ Settings</a>

<!-- In feature area when unavailable -->
{#if !owAvailable}
	<div class="feature-unavailable">
		<p>60-minute forecast unavailable</p>
		<a href="/settings#openweather">Configure API Key →</a>
	</div>
{/if}
```

### Implementation Checklist

- [ ] Create `/settings/+page.svelte` with OpenWeather API key form
- [ ] Create `/settings/+page.server.ts` with form actions (saveKey, clearKey)
- [ ] Create `/api/settings/test-key/+server.ts` for key validation
- [ ] Update `/api/openweather/onecall/+server.ts` to use cookie key with ENV fallback
- [ ] Add usage counter logic with signed cookies for OpenWeather
- [ ] Add quota exceeded UI handling in 60-min forecast component
- [ ] Add settings link to main navigation
- [ ] Add "Configure API Key" prompts where 60-min forecast unavailable

Note: RainViewer requires no BYOK setup (IP-based rate limiting, no API keys).

---

## Phase 1: Data Collection Infrastructure

### 1.1 Environment Configuration

**File**: `.env` / `.env.example`

```env
# Existing
OPEN_WEATHER_APPID=your_api_key_here

# The same key is used for both geo/reverse and One Call API
```

The key already exists for reverse geocoding (`/api/geo/reverse`). Reuse it for One Call API.

### 1.2 API Proxy Endpoint

**Create**: `src/routes/api/openweather/onecall/+server.ts`

Proxy the One Call API server-side to:

1. Hide API key from client
2. Avoid CORS issues
3. Enable response caching if needed later

#### Alternative: SvelteKit Remote Functions

Instead of a `+server.ts` endpoint, consider using [SvelteKit remote functions](https://svelte.dev/docs/kit/remote-functions) (`.remote.ts` files):

| Aspect               | `+server.ts`                       | Remote Functions                                           |
| -------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Maturity             | Stable                             | Experimental (requires `kit.experimental.remoteFunctions`) |
| Codebase consistency | Matches existing `/api/*` patterns | New pattern                                                |
| API key hiding       | Yes                                | Yes (runs server-side)                                     |
| CORS handling        | Yes                                | Yes (auto-generated endpoints)                             |
| Type safety          | Manual                             | Built-in schema validation (Valibot/Zod)                   |
| Caching              | Manual                             | Built-in `.refresh()` and query caching                    |
| Complexity           | Simple fetch proxy                 | More abstraction, better for complex data ops              |

**Recommendation**: Use `+server.ts` for consistency with existing codebase. Consider remote functions if adopting them project-wide or if query caching/refresh semantics become valuable.

```typescript
// Pseudocode structure
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const OPEN_WEATHER_APPID = env.OPEN_WEATHER_APPID;

export async function GET({ url }) {
	// Return empty/null response if no API key configured
	if (!OPEN_WEATHER_APPID) {
		return json({ error: 'API key not configured', available: false });
	}

	const lat = url.searchParams.get('lat');
	const lon = url.searchParams.get('lon');
	const exclude = url.searchParams.get('exclude') || '';

	// Build API URL
	// Use metric units (API default is Kelvin)
	const apiUrl =
		`https://api.openweathermap.org/data/3.0/onecall` +
		`?lat=${lat}&lon=${lon}` +
		`&exclude=${exclude}` +
		`&units=imperial` + // Match Open-Meteo's Fahrenheit setting
		`&appid=${OPEN_WEATHER_APPID}`;

	const response = await fetch(apiUrl);
	const data = await response.json();

	return json({ ...data, available: true });
}
```

**Important**: Return `{ available: false }` when key is missing so client can handle gracefully.

### 1.3 Type Definitions

**Add to**: `src/lib/types.ts` or create `src/lib/types-openweather.ts`

```typescript
// OpenWeather One Call API 3.0 Response Types

export interface OWMinutelyForecast {
	dt: number; // Unix timestamp (seconds)
	precipitation: number; // mm/h
}

export interface OWCurrentWeather {
	dt: number;
	sunrise: number;
	sunset: number;
	temp: number;
	feels_like: number;
	pressure: number;
	humidity: number;
	dew_point: number;
	uvi: number;
	clouds: number;
	visibility: number;
	wind_speed: number;
	wind_deg: number;
	wind_gust?: number;
	weather: OWWeatherCondition[];
	rain?: { '1h': number };
	snow?: { '1h': number };
}

export interface OWHourlyForecast {
	dt: number;
	temp: number;
	feels_like: number;
	pressure: number;
	humidity: number;
	dew_point: number;
	uvi: number;
	clouds: number;
	visibility: number;
	wind_speed: number;
	wind_deg: number;
	wind_gust?: number;
	weather: OWWeatherCondition[];
	pop: number; // Probability of precipitation (0-1)
	rain?: { '1h': number };
	snow?: { '1h': number };
}

export interface OWDailyForecast {
	dt: number;
	sunrise: number;
	sunset: number;
	moonrise: number;
	moonset: number;
	moon_phase: number;
	summary: string;
	temp: {
		day: number;
		min: number;
		max: number;
		night: number;
		eve: number;
		morn: number;
	};
	feels_like: {
		day: number;
		night: number;
		eve: number;
		morn: number;
	};
	pressure: number;
	humidity: number;
	dew_point: number;
	wind_speed: number;
	wind_deg: number;
	wind_gust?: number;
	weather: OWWeatherCondition[];
	clouds: number;
	pop: number;
	rain?: number; // mm
	snow?: number; // mm
	uvi: number;
}

export interface OWWeatherCondition {
	id: number; // Weather condition code
	main: string; // Group (Rain, Snow, etc.)
	description: string;
	icon: string;
}

export interface OWAlert {
	sender_name: string;
	event: string;
	start: number;
	end: number;
	description: string;
	tags: string[];
}

export interface OWOneCallResponse {
	available: boolean; // Custom field: true if API key configured
	lat: number;
	lon: number;
	timezone: string;
	timezone_offset: number;
	current?: OWCurrentWeather;
	minutely?: OWMinutelyForecast[]; // 61 entries (current + 60 minutes)
	hourly?: OWHourlyForecast[]; // 48 entries
	daily?: OWDailyForecast[]; // 8 entries
	alerts?: OWAlert[];
}
```

### 1.4 State Management Updates

**Modify**: `src/lib/ns-weather-data.svelte.ts`

#### Hot vs Cold State

The Nation State pattern distinguishes between:

- **HOT STATE** - Changes frequently (e.g., 15fps during scrubbing). Uses `HotState` class with `$state` fields for fine-grained reactivity without proxy overhead. Avoid using in `$derived`/`$effect`.
- **COLD STATE** - Changes on fetch or user action. Can use `$state({...})` since proxy overhead is negligible for infrequent updates. Safe for reactive binding.

OpenWeather data is **COLD STATE** - it only changes when location changes and data is re-fetched:

```typescript
// COLD STATE - add to cold state section (changes on fetch)
let owOneCall: OWOneCallResponse | null = $state(null);
let owAvailable: boolean = $state(false); // Track if OpenWeather is configured

// Add new fetch function
async function fetchOpenWeatherOneCall() {
	if (!coords) {
		gg('fetchOpenWeatherOneCall: No coordinates available');
		return;
	}

	gg('fetchOpenWeatherOneCall:start');
	console.time('fetchOpenWeatherOneCall');

	try {
		// Request all data sections - let server decide what's available
		const url = `/api/openweather/onecall` + `?lat=${coords.latitude}&lon=${coords.longitude}`;

		const fetched = await fetch(url);
		const json: OWOneCallResponse = await fetched.json();

		owAvailable = json.available;

		if (!json.available) {
			gg('fetchOpenWeatherOneCall: API not configured');
			owOneCall = null;
			return;
		}

		owOneCall = json;

		emit('weatherdata_updatedData');
		gg('fetchOpenWeatherOneCall', { owOneCall: $state.snapshot(owOneCall) });
	} catch (error) {
		gg('fetchOpenWeatherOneCall:error', error);
		owOneCall = null;
	}

	console.timeEnd('fetchOpenWeatherOneCall');
}
```

### 1.5 Parallel Async Data Loading

**Modify**: `weatherdata_requestedSetLocation` handler (around line 562)

```typescript
on('weatherdata_requestedSetLocation', async function (params) {
	// ... existing coords/name handling ...

	// Fetch all data sources in parallel
	// Open-Meteo is required, OpenWeather is optional
	await Promise.all([
		fetchOpenMeteoForecast(), // Required - primary data
		fetchOpenMeteoAirQuality(), // Required - AQI data
		fetchOpenWeatherOneCall(), // Optional - minutely + supplementary
	]);

	// Note: Each fetch function handles its own errors gracefully
	// UI updates happen via emit('weatherdata_updatedData') in each function
});
```

**Key behaviors**:

- All fetches run in parallel for speed
- Each fetch is independent - one failure doesn't block others
- UI updates incrementally as data arrives (each fetch emits `weatherdata_updatedData`)
- OpenWeather failure is silent - just no supplementary data

---

## Data Architecture: Multi-Provider Support

### Design Goals

1. **Raw responses preserved** - Store original API responses for debugging
2. **Unified structure** - Single normalized structure for rendering common data (hourly, daily)
3. **Provider-agnostic UI** - Components read from unified fields, not provider-specific
4. **Graceful gaps** - Handle missing data (e.g., OW has no historical, OM has no minutely)
5. **Provider-exclusive data** - Some data only from one provider (minutely, alerts); expose directly
6. **Extensible** - Easy to add future providers (Pirate Weather, Tomorrow.io, etc.)

### Storage Strategy

All data storage is **COLD STATE** (changes on fetch, not during scrubbing):

```typescript
// Raw responses (COLD STATE - changes on fetch only)
// Using $state({...}) is fine here since proxy overhead is negligible for infrequent updates
let _raw = $state({
	om: null as OMForecastResponse | null, // Open-Meteo
	omAir: null as OMAirQualityResponse | null, // Open-Meteo Air Quality
	ow: null as OWOneCallResponse | null, // OpenWeather
	// Future: pw, vc, etc.
});

// Unified normalized structure (derived from raw - also COLD)
const unified = $derived.by(() => mergeProviderData(_raw));
```

**Note:** For HOT STATE (like `ms` which changes at 15fps during scrubbing), use the `HotState` class pattern with individual `$state` fields for fine-grained reactivity without proxy overhead. See `ns-weather-data.svelte.ts` for the implementation.

### Unified Hourly Structure

Primary fields use Open-Meteo naming (our primary source). Secondary provider data nested under provider keys:

```typescript
type UnifiedHourlyPoint = {
	ms: number;
	msPretty: string;

	// === Primary fields (from Open-Meteo, always present in forecast range) ===
	temperature: number;
	humidity: number;
	dewPoint: number;
	precipitation: number;
	precipitationProbability: number;
	weatherCode: number;

	// === Secondary provider data (null if unavailable) ===
	_ow?: {
		temperature: number;
		feelsLike: number;
		humidity: number;
		dewPoint: number;
		precipitation: number; // rain['1h'] + snow['1h']
		precipitationProbability: number; // pop * 100
		weatherCode: number; // weather[0].id
		uvi: number;
		clouds: number;
		windSpeed: number;
		windDeg: number;
	};

	// Future providers
	_pw?: {
		/* Pirate Weather */
	};
	_vc?: {
		/* Visual Crossing */
	};
};
```

### Unified Daily Structure

```typescript
type UnifiedDailyPoint = {
	ms: number;
	msPretty: string;
	compactDate: string;
	fromToday: number; // Canonical key: -2, -1, 0, 1, 2... (0 = today)

	// === Primary fields (Open-Meteo) ===
	temperatureMax: number;
	temperatureMin: number;
	precipitation: number;
	precipitationProbabilityMax: number;
	weatherCode: number;
	sunrise: number;
	sunset: number;

	// === Secondary provider data ===
	_ow?: {
		temperatureMax: number; // temp.max
		temperatureMin: number; // temp.min
		precipitation: number; // rain + snow
		precipitationProbability: number; // pop * 100
		weatherCode: number;
		summary: string; // OW-specific field
		moonPhase: number; // OW-specific field
		uvi: number;
	};
};
```

### Accessing Daily Data by `fromToday`

Raw API indices vary by provider and configuration:

- **Open-Meteo**: Index depends on `PAST_DAYS` setting (e.g., with `PAST_DAYS=2`, today is index 2)
- **OpenWeather**: Today is always index 0, no past days

To avoid confusion, **always use `fromToday` as the canonical key**, never raw array indices:

```typescript
// In unified structure - provide both array and Map
const unified = $derived.by(() => {
	const daily = mergeDailyData(_raw);

	return {
		daily, // Array for iteration/rendering
		dailyByFromToday: new Map(daily.map((d) => [d.fromToday, d])), // Map for lookup
	};
});

// Usage examples:
unified.daily.filter((d) => d.fromToday >= 0); // Today and future
unified.dailyByFromToday.get(0); // Today (always works)
unified.dailyByFromToday.get(-1); // Yesterday (if available)
unified.dailyByFromToday.get(3); // 3 days from now

// Helper for null-safe access
function getDaily(fromToday: number): UnifiedDailyPoint | undefined {
	return unified.dailyByFromToday.get(fromToday);
}
```

**Benefits:**

- **Provider-agnostic**: Works regardless of which providers have data
- **Config-independent**: Changing `PAST_DAYS` doesn't break code
- **Intuitive**: `getDaily(0)` is always today, `getDaily(-1)` is always yesterday
- **Graceful gaps**: `getDaily(-1)` returns `undefined` if provider doesn't have yesterday

### Minutely/Sub-Hourly Data (Provider-Exclusive)

Some data types are only available from specific providers. These don't fit the "OM primary + others secondary" model - instead, use the best available source:

| Data Type              | Primary Provider | Fallback | Notes                               |
| ---------------------- | ---------------- | -------- | ----------------------------------- |
| Minutely precipitation | OpenWeather      | None     | 1-min resolution, 60-min, global    |
| UV Index               | OpenWeather      | None     | OM has it but requires separate API |
| Weather alerts         | OpenWeather      | None     | Government alerts                   |
| Air Quality            | Open-Meteo       | None     | Already separate in codebase        |
| Historical (past days) | Open-Meteo       | None     | OW One Call doesn't include         |

#### Sub-Hourly Data Sources

| Provider    | Resolution | Coverage             | Data Available              | Notes                            |
| ----------- | ---------- | -------------------- | --------------------------- | -------------------------------- |
| OpenWeather | 1-min      | Global               | Precipitation only          | Best choice for minutely         |
| Open-Meteo  | 15-min     | US + Central EU only | Full forecast               | Interpolated elsewhere = useless |
| RainViewer  | 10-min     | Global               | Radar imagery (not numeric) | Visual only                      |

**OpenWeather minutely is the primary choice** for the 60-min precipitation forecast:

- True 1-minute resolution globally
- Actually useful for "will it rain in 10 minutes" decisions
- Only limitation: precipitation data only (no temp, etc.)

**Open-Meteo 15-minutely** (`&minutely_15=...`) is **not recommended** for most users:

- Native resolution only in US (NOAA HRRR) and Central Europe (DWD ICON-D2, Météo-France AROME)
- All other regions get interpolated hourly data - no real benefit over hourly
- Only consider as nice-to-have for US/EU users who want additional variables (temp, weather code) at 15-min resolution

**API parameters for OM 15-min** (if implementing for US/EU):

```
&minutely_15=precipitation,temperature_2m,weather_code
&forecast_minutely_15=4   // 4 × 15min = 60min ahead
&past_minutely_15=4       // 4 × 15min = 60min past
```

Only 8 data points - trivial bandwidth if needed.

#### Minutely Data Structure

For the 60-min precipitation plot, keep it simple - OpenWeather only:

```typescript
type MinutelyPoint = {
	ms: number;
	msPretty: string;
	precipitation: number; // mm/h
};

const dataMinutely = $derived.by(() => {
	if (!_raw.ow?.minutely) return [];

	return _raw.ow.minutely.map((item) => ({
		ms: item.dt * MS_IN_SECOND,
		msPretty: formatTime(item.ms),
		precipitation: item.precipitation,
	}));

	return [...points.values()].sort((a, b) => a.ms - b.ms);
});

// Weather alerts (OW-exclusive)
const dataAlerts = $derived.by(() => {
	return _raw.ow?.alerts ?? [];
});
```

### Timeline Granularity & Intervals

The current timeline system uses intervals built from the union of data timestamps:

- **Hourly** (Open-Meteo): 1-hour intervals
- **Radar** (RainViewer): 10-min intervals
- **Scrubbing**: Continuous (pixel-precise), but data lookup snaps to nearest interval

Adding minutely data (60 more intervals for the next hour) works with the existing union approach - no architectural changes needed.

| Data Source | Granularity | Intervals in 1 hour |
| ----------- | ----------- | ------------------- |
| Open-Meteo  | 60 min      | 1                   |
| RainViewer  | 10 min      | 6                   |
| OW Minutely | 1 min       | 60                  |

#### 60-Minute Precipitation Plot

The minutely precipitation plot **syncs automatically** with existing timelines via shared `nsWeatherData.ms`:

- All components emit `weatherdata_requestedSetTime` on scrub
- All components read `nsWeatherData.ms` to render current position
- Radar timeline (2 hrs), hourly plots (24 hrs), daily tiles already sync this way
- Minutely plot just uses same pattern - no special sync logic needed

```typescript
// MinutelyPrecipPlot component - same pattern as RadarTimeline
type MinutelyPrecipPlotProps = {
	nsWeatherData: NsWeatherData;
	width: number;
	height: number; // Compact: ~40-60px
};

// Component reads nsWeatherData.ms and highlights corresponding minute
// Component emits weatherdata_requestedSetTime on scrub
// Automatically syncs with radar, hourly timeline, daily tiles
```

**Interval lookup update**: The `intervals` derived state (used for highlight rectangles) will need to include minutely timestamps when in the 60-min range. Current logic already unions timestamps from multiple sources:

```typescript
// Current: hourly + radar frames
omForecast.hourly.forEach((item) => msIntervals.push(item.ms));
radar.frames.forEach((item) => msIntervals.push(item.ms));

// Add: minutely timestamps (when scrubbing in next-60-min range)
if (_raw.ow?.minutely) {
	_raw.ow.minutely.forEach((item) => msIntervals.push(item.dt * MS_IN_SECOND));
}
```

**Future consideration**: If multiple providers offer minutely data, merge strategy:

1. Prefer higher resolution (1-min over 15-min)
2. For precipitation: take max value (worst-case) when sources disagree
3. Track provenance for debugging

### Merge Function

```typescript
function mergeProviderData(raw: RawResponses): UnifiedData {
	const hourlyMap = new Map<number, UnifiedHourlyPoint>();

	// 1. Process Open-Meteo first (primary source, defines the time range)
	if (raw.om?.hourly) {
		for (const item of raw.om.hourly) {
			hourlyMap.set(item.ms, {
				ms: item.ms,
				msPretty: formatTime(item.ms),
				temperature: item.temperature,
				humidity: item.relativeHumidity,
				dewPoint: item.dewPoint,
				precipitation: item.precipitation,
				precipitationProbability: item.precipitationProbability,
				weatherCode: item.weatherCode,
			});
		}
	}

	// 2. Merge OpenWeather data where timestamps align
	if (raw.ow?.hourly) {
		for (const item of raw.ow.hourly) {
			const ms = item.dt * MS_IN_SECOND;
			const existing = hourlyMap.get(ms);

			if (existing) {
				// Add OW data to existing point
				existing._ow = {
					temperature: item.temp,
					feelsLike: item.feels_like,
					humidity: item.humidity,
					dewPoint: item.dew_point,
					precipitation: (item.rain?.['1h'] ?? 0) + (item.snow?.['1h'] ?? 0),
					precipitationProbability: item.pop * 100,
					weatherCode: item.weather[0]?.id ?? 0,
					uvi: item.uvi,
					clouds: item.clouds,
					windSpeed: item.wind_speed,
					windDeg: item.wind_deg,
				};
			}
			// Note: Don't create new points for OW-only times (outside OM range)
		}
	}

	// 3. Future: Merge other providers similarly

	const daily = mergeDailyData(raw);

	return {
		hourly: [...hourlyMap.values()].sort((a, b) => a.ms - b.ms),
		daily,
		dailyByFromToday: new Map(daily.map((d) => [d.fromToday, d])),
		minutely: raw.ow?.minutely ?? [],
	};
}
```

### Helper: Worst-Case Values

For UI that wants to show "worst case" from all providers:

```typescript
function getWorstCase(point: UnifiedHourlyPoint) {
	const temps = [point.temperature, point._ow?.temperature].filter(Boolean);
	const precips = [point.precipitation, point._ow?.precipitation].filter(Boolean);
	const probs = [point.precipitationProbability, point._ow?.precipitationProbability].filter(
		Boolean,
	);

	return {
		temperatureHigh: Math.max(...temps),
		temperatureLow: Math.min(...temps),
		precipitationMax: Math.max(...precips),
		precipitationProbabilityMax: Math.max(...probs),
	};
}
```

### Debug: Raw Response Access

Expose raw responses for debug panel:

```typescript
const nsWeatherData = {
	// ... existing getters ...

	// Raw responses for debugging
	get _raw() {
		return _raw;
	},

	// Unified data for rendering
	get unified() {
		return unified;
	},
};
```

### Migration Path

1. **Phase 1**: Add `_raw` storage, keep existing `omForecast`/`owOneCall` working
2. **Phase 2**: Build `unified` derived state alongside existing structures
3. **Phase 3**: Migrate UI components to use `unified` where beneficial
4. **Phase 4**: Deprecate direct `omForecast`/`owOneCall` access in UI

This approach allows incremental adoption without breaking existing functionality.

---

## Phase 2: Derived Data & Transformations

With the unified data architecture above, Phase 2 focuses on:

1. **Implement `_raw` storage** - Store raw responses from each provider
2. **Implement `mergeProviderData()`** - Build unified hourly/daily structures
3. **Expose `dataMinutely`** - OpenWeather-only minutely precipitation
4. **Expose `getWorstCase()` helper** - For pessimistic forecasting UI

See "Data Architecture" section above for implementation details.

---

## Phase 3: Debug Display

### 3.1 Add Debug Section

**Modify**: `src/routes/+page.svelte` debug section (around line 762)

```svelte
{#if dev}
	<div class="debug">
		<h3>Debug</h3>

		<!-- Existing debug items... -->

		<!-- Data Providers Status -->
		<div class="debug-item">
			<span class="debug-label">OpenWeather</span>
			<span>{nsWeatherData._raw.ow ? 'Loaded' : 'Not configured'}</span>
		</div>

		<!-- Raw Responses (per provider) -->
		<details>
			<summary>_raw.om (Open-Meteo)</summary>
			<pre>{jsonPretty(summarize(nsWeatherData._raw.om))}</pre>
		</details>

		{#if nsWeatherData._raw.ow}
			<details>
				<summary>_raw.ow (OpenWeather)</summary>
				<pre>{jsonPretty(summarize(nsWeatherData._raw.ow))}</pre>
			</details>
		{/if}

		<!-- Unified Data -->
		<details>
			<summary>unified.hourly (merged)</summary>
			<pre>{jsonPretty(summarize(nsWeatherData.unified.hourly))}</pre>
		</details>

		<details>
			<summary>unified.daily (merged)</summary>
			<pre>{jsonPretty(summarize(nsWeatherData.unified.daily))}</pre>
		</details>

		{#if nsWeatherData.dataMinutely.length}
			<details>
				<summary>dataMinutely (60-min precipitation)</summary>
				<pre>{jsonPretty(summarize(nsWeatherData.dataMinutely))}</pre>
			</details>
		{/if}

		{#if nsWeatherData._raw.ow?.alerts?.length}
			<details>
				<summary>Weather Alerts</summary>
				<pre>{jsonPretty(nsWeatherData._raw.ow.alerts)}</pre>
			</details>
		{/if}
	</div>
{/if}
```

### 3.2 Expose Data via nsWeatherData Object

**Add getters** to the returned `nsWeatherData` object:

```typescript
const nsWeatherData = {
	// ... existing getters ...

	// Raw responses (for debugging)
	get _raw() {
		return _raw;
	},

	// Unified merged data (for rendering)
	get unified() {
		return unified;
	},

	// Minutely precipitation (OpenWeather only)
	get dataMinutely() {
		return dataMinutely;
	},

	// Provider availability flags
	get owAvailable() {
		return _raw.ow !== null;
	},
};
```

---

## Phase 4: Future Visualization (Out of Scope for Initial Implementation)

These are noted for future reference but NOT part of the initial implementation:

### 4.1 60-Minute Precipitation Plot

- Add precipitation intensity chart to radar timeline area
- Show minute-by-minute expected rain intensity
- Use similar styling to existing precipitation visualization

### 4.2 Comparison Plots

- Overlay OM vs OW temperature forecasts on timeline
- Show precipitation probability comparison
- Allow toggling between data sources

### 4.3 Weather Alerts Display

- Show government weather alerts from OpenWeather
- Display in prominent location when active
- Include severity indicators

### 4.4 "Worst Case" Mode

- Toggle to show maximum predicted values from either source
- Useful for planning when uncertain about weather

---

## API Response Format Reference

### OpenWeather One Call 3.0 Example Response

```json
{
	"lat": 33.44,
	"lon": -94.04,
	"timezone": "America/Chicago",
	"timezone_offset": -18000,
	"current": {
		"dt": 1684929490,
		"sunrise": 1684926645,
		"sunset": 1684977332,
		"temp": 292.55,
		"feels_like": 292.87,
		"pressure": 1014,
		"humidity": 89,
		"dew_point": 290.69,
		"uvi": 0.16,
		"clouds": 53,
		"visibility": 10000,
		"wind_speed": 3.13,
		"wind_deg": 93,
		"wind_gust": 6.71,
		"weather": [
			{
				"id": 803,
				"main": "Clouds",
				"description": "broken clouds",
				"icon": "04d"
			}
		]
	},
	"minutely": [
		{ "dt": 1684929540, "precipitation": 0 },
		{ "dt": 1684929600, "precipitation": 0 }
		// ... 61 total entries (current minute + 60 minutes)
	],
	"hourly": [
		{
			"dt": 1684926000,
			"temp": 292.01,
			"feels_like": 292.33,
			"pressure": 1014,
			"humidity": 91,
			"dew_point": 290.51,
			"uvi": 0,
			"clouds": 54,
			"visibility": 10000,
			"wind_speed": 2.58,
			"wind_deg": 86,
			"wind_gust": 5.88,
			"weather": [{ "id": 803, "main": "Clouds", "description": "broken clouds", "icon": "04n" }],
			"pop": 0.15
		}
		// ... 48 total entries
	],
	"daily": [
		{
			"dt": 1684951200,
			"sunrise": 1684926645,
			"sunset": 1684977332,
			"moonrise": 1684941060,
			"moonset": 1684905480,
			"moon_phase": 0.16,
			"summary": "Expect a day of partly cloudy with rain",
			"temp": {
				"day": 299.03,
				"min": 290.69,
				"max": 300.35,
				"night": 291.45,
				"eve": 297.51,
				"morn": 292.55
			},
			"feels_like": { "day": 299.21, "night": 291.37, "eve": 297.86, "morn": 292.87 },
			"pressure": 1016,
			"humidity": 59,
			"dew_point": 290.48,
			"wind_speed": 3.98,
			"wind_deg": 76,
			"wind_gust": 8.92,
			"weather": [{ "id": 500, "main": "Rain", "description": "light rain", "icon": "10d" }],
			"clouds": 92,
			"pop": 0.47,
			"rain": 0.15,
			"uvi": 9.23
		}
		// ... 8 total entries
	],
	"alerts": [
		{
			"sender_name": "NWS Philadelphia",
			"event": "Small Craft Advisory",
			"start": 1684952747,
			"end": 1684988747,
			"description": "...",
			"tags": []
		}
	]
}
```

### Unit Notes

When using `units=imperial`:

- Temperature: Fahrenheit
- Wind speed: miles/hour
- Precipitation: **always mm/h** (not affected by units parameter)
- Pressure: hPa
- Visibility: meters

---

## Alternative Weather Providers (Future Consideration)

The One Call API format is a de facto standard. These providers offer compatible APIs:

| Provider                                           | API Compatibility   | Free Tier       | Notes                               |
| -------------------------------------------------- | ------------------- | --------------- | ----------------------------------- |
| [Pirate Weather](https://pirateweather.net/)       | Dark Sky compatible | 20k calls/month | Community project, good alternative |
| [Visual Crossing](https://www.visualcrossing.com/) | Different format    | 1k calls/day    | Good historical data                |
| [Tomorrow.io](https://www.tomorrow.io/)            | Different format    | 500 calls/day   | ML-based forecasting                |
| [Open-Meteo](https://open-meteo.com/)              | Different format    | Unlimited       | Already primary source              |

Consider abstracting the secondary weather provider interface to support multiple backends:

```typescript
interface SecondaryWeatherProvider {
	name: string;
	fetchForecast(coords: Coordinates): Promise<NormalizedForecast>;
	isConfigured(): boolean;
}
```

---

## Reference: UltraWeather (Previous Project)

**Location**: `/Volumes/p/_clean/ultra-weather`
**Live Demo**: https://uw.leftium.com

UltraWeather is a previous project that already implements multi-provider weather data fetching and normalization. Key reference material for weather-sense integration.

### Architecture Overview

UltraWeather uses a **Netlify serverless function** (`functions/serverless.js`) that:

1. **Fetches from multiple providers** (Dark Sky, OpenWeather, Visual Crossing) in priority order
2. **Normalizes responses** into a common format for rendering
3. **Handles historical data** (yesterday, day before) via separate API calls with timestamp offsets
4. **Includes mock data** for each provider (useful for testing without API keys)

### Normalization Pattern

Each provider has a dedicated normalizer function that extracts common fields:

```javascript
// Normalized daily data structure (Dark Sky format as baseline)
{
  time: number,              // Unix timestamp
  summary: string,           // Weather description
  icon: string,              // Dark Sky icon names (clear-day, rain, etc.)
  precipProbability: number, // 0-1
  precipIntensityMax: number, // mm/hr (converted from inches)
  temperature: number,       // Current temp (hourly)
  apparentTemperature: number,
  temperatureMin: number,    // Daily low
  temperatureMax: number,    // Daily high
  apparentTemperatureMin: number,
  apparentTemperatureMax: number,
}
```

### OpenWeather Normalizer (`extractFieldsOw`)

Useful reference for converting OW response to normalized format:

```javascript
extractFieldsOw = function (data) {
	// Handle feels_like as object (daily) vs number (hourly)
	if (typeof data.feels_like === 'object') {
		const { day, night, eve, morn } = data.feels_like;
		apparentTemperatureMin = Math.min(day, night, eve, morn);
		apparentTemperatureMax = Math.max(day, night, eve, morn);
	}

	// Capitalize description
	summary = data.weather[0].description;
	summary = summary[0].toUpperCase() + summary.slice(1);

	return {
		time: data.dt,
		summary: summary,
		icon: darkskyIcon(data.weather[0].icon), // Map OW icons to Dark Sky names
		precipProbability: data.pop, // 0-1
		temperature: data.temp, // May be object {day,night,eve,morn}
		temperatureMin: data.temp?.min,
		temperatureMax: data.temp?.max,
		apparentTemperatureMin,
		apparentTemperatureMax,
	};
};
```

### Icon Mapping (OW → Dark Sky)

```javascript
darkskyIcon = function (icon) {
	switch (icon) {
		case '01d':
			return 'clear-day';
		case '01n':
			return 'clear-night';
		case '02d':
		case '03d':
			return 'partly-cloudy-day';
		case '02n':
		case '03n':
			return 'partly-cloudy-night';
		case '04d':
		case '04n':
			return 'cloudy';
		case '09d':
		case '10d':
		case '11d':
		case '09n':
		case '10n':
		case '11n':
			return 'rain';
		case '13d':
		case '13n':
			return 'snow';
		case '50d':
		case '50n':
			return 'fog';
	}
};
```

### Historical Data Aggregation (`extractFieldsOwHistorical`)

For historical days (OW hourly data → daily summary):

```javascript
// Aggregate hourly data to daily
for (hour of data.hourly) {
	minTemp = Math.min(minTemp, hour.temp);
	maxTemp = Math.max(maxTemp, hour.temp);
	minFeel = Math.min(minFeel, hour.feels_like);
	maxFeel = Math.max(maxFeel, hour.feels_like);

	// Accumulate precipitation
	rain = hour.rain?.['1h'] || 0;
	snow = hour.snow?.['1h'] || 0;
	totalRain += rain;
	totalSnow += snow;

	// Track most common description/icon (weighted by precipitation)
	if (totalRain + totalSnow > 2 && (rain || snow)) {
		weight = 100; // Heavy weight for precipitation hours
	} else {
		weight = 1;
	}
	descriptions[hour.weather[0].description] += weight;
}

// Pick most common summary
precipProbability = (totalRain + totalSnow) / 100;
```

### API Priority System

```javascript
// Fallback chain: try APIs in order until one succeeds
preferredApis = ['darksky', 'openweather', 'visualcrossing', 'mockdarksky'];

for (api of preferredApis) {
	data = await getDataFromApi(API_SETTINGS[api]);
	apiData[api] = data;
	normalized[api] = API_SETTINGS[api].normalizer(data, api);

	if (!debug && data && !data.error) {
		break; // Stop at first successful API
	}
}

// Payload includes which API was used
payload.use = sortedResults[0]; // First successful API
```

### Mock Data for Testing

UltraWeather includes full mock responses for each provider in `src/functions/json/`:

- `mock-data-darksky.json`
- `mock-data-openweather.json` (3 responses: today, yesterday, day-before)
- `mock-data-visualcrossing.json`

**Useful for weather-sense**: Copy mock data structure for testing unified data architecture without hitting real APIs.

### Key Differences from Weather-Sense

| Aspect         | UltraWeather                       | Weather-Sense (Planned)        |
| -------------- | ---------------------------------- | ------------------------------ |
| Primary source | Dark Sky (defunct)                 | Open-Meteo                     |
| Fallback       | Sequential (first success wins)    | Parallel (merge all available) |
| Historical     | Separate API calls with timestamps | OM provides in single call     |
| Minutely       | Not implemented                    | OW-only, 60-min precipitation  |
| Data storage   | Normalized only                    | Raw + Unified derived          |
| Framework      | Svelte (v3) + Netlify Functions    | SvelteKit + API routes         |

### Reusable Code

Consider copying/adapting:

1. **Icon mapping function** - OW icons → our WMO-based icons
2. **Description capitalizer** - `summary[0].toUpperCase() + summary.slice(1)`
3. **Mock data structure** - For testing without API keys
4. **Hourly → Daily aggregation** - If we need to compute daily summaries from hourly

---

## Implementation Checklist

### Phase 1: Data Collection

- [ ] Create `/api/openweather/onecall/+server.ts` proxy endpoint
- [ ] Add TypeScript types for OpenWeather response (`OWOneCallResponse`, etc.)
- [ ] Implement `fetchOpenWeatherOneCall()` function
- [ ] Integrate into parallel fetch in `weatherdata_requestedSetLocation`
- [ ] Handle missing API key gracefully (return `{ available: false }`)

### Phase 2: Data Architecture

- [ ] Add `_raw` state object to store raw responses per provider
- [ ] Refactor existing `omForecast` into `_raw.om`
- [ ] Store OpenWeather response in `_raw.ow`
- [ ] Define `UnifiedHourlyPoint` and `UnifiedDailyPoint` types
- [ ] Implement `mergeProviderData()` function
- [ ] Create `unified` derived state
- [ ] Define `MinutelyPoint` type (OW minutely precipitation)
- [ ] Implement `dataMinutely` derived state
- [ ] Add `getWorstCase()` helper function

### Phase 3: Debug Display

- [ ] Update debug panel to show `_raw` per provider
- [ ] Add unified data display
- [ ] Show minutely data when available
- [ ] Show weather alerts when available
- [ ] Test with/without API key configured

### Phase 4: Migration (Optional)

- [ ] Migrate existing UI to use `unified` structure
- [ ] Deprecate direct `omForecast` access in components
- [ ] Update `dataForecast` to derive from `unified`

### Future Phases (Not in Initial Scope)

- [ ] 60-minute precipitation plot component (uses same sync pattern as radar)
- [ ] Add minutely timestamps to `intervals` derived state
- [ ] Provider comparison visualization (side-by-side temps, etc.)
- [ ] Weather alerts display component
- [ ] "Worst case" toggle mode in UI
- [ ] Abstract provider interface for adding new backends
- [ ] OM 15-minutely for US/EU users (nice-to-have, limited coverage)

---

## Reference: Apple WeatherKit REST API

Apple WeatherKit is included here for reference and potential future inspiration. While **not planned for implementation** (requires Apple Developer Program membership, complex JWT auth), it has interesting design patterns worth noting.

### Overview

- **Powered by**: Apple Weather service (formerly Dark Sky acquisition)
- **Authentication**: JWT signed with Apple-issued key (complex setup vs simple API key)
- **Pricing**: 500k calls/month free with Apple Developer Program ($99/year), then tiered
- **Attribution**: Required - must display "Weather" trademark and link to data sources

### API Endpoint

```
GET https://weatherkit.apple.com/api/v1/weather/{language}/{latitude}/{longitude}
    ?dataSets=currentWeather,forecastDaily,forecastHourly,forecastNextHour,weatherAlerts
    &timezone={timezone}
    &countryCode={ISO-2}
```

### Data Sets Available

| DataSet            | Description                       | Equivalent in OW/OM        |
| ------------------ | --------------------------------- | -------------------------- |
| `currentWeather`   | Current conditions                | OW `current`, OM `current` |
| `forecastDaily`    | 10-day daily forecast             | OW `daily`, OM `daily`     |
| `forecastHourly`   | Hourly forecast (up to 240 hours) | OW `hourly`, OM `hourly`   |
| `forecastNextHour` | Minute-by-minute for next hour    | OW `minutely` (global)     |
| `weatherAlerts`    | Government severe weather alerts  | OW `alerts`                |

### Interesting Design Patterns

#### 1. Explicit Metadata Per Data Set

Each data set includes rich metadata:

```typescript
interface Metadata {
	attributionURL: string; // Legal attribution link
	expireTime: string; // When data becomes stale
	language: string; // ISO language code
	latitude: number;
	longitude: number;
	providerLogo?: string; // Data provider logo URL
	providerName?: string; // Data provider name
	readTime: string; // When data was fetched
	reportedTime?: string; // When provider reported it
	temporarilyUnavailable?: boolean; // Service degradation flag
	units: 'm'; // Always metric
	version: number; // API version
}
```

**Inspiration**: The `temporarilyUnavailable` flag is a nice touch for graceful degradation. Could add similar status flags to our unified structure.

#### 2. Day Part Forecasts

Daily forecasts include separate `daytimeForecast` (7AM-7PM) and `overnightForecast` (7PM-7AM):

```typescript
interface DayWeatherConditions {
	// ... standard daily fields ...
	daytimeForecast?: DayPartForecast;
	overnightForecast?: DayPartForecast;
}

interface DayPartForecast {
	cloudCover: number;
	conditionCode: string;
	forecastStart: string;
	forecastEnd: string;
	humidity: number;
	precipitationAmount: number;
	precipitationChance: number;
	precipitationType: PrecipitationType;
	snowfallAmount: number;
	windDirection: number;
	windSpeed: number;
}
```

**Inspiration**: Splitting day/night forecasts is useful for UX like "Tonight: 30% chance of rain, Tomorrow: Sunny". OM has similar granularity but not as cleanly separated.

#### 3. Rich Astronomical Data

Daily forecasts include multiple sunrise/sunset variants:

```typescript
{
	sunrise: string; // Top edge of sun at horizon
	sunriseAstronomical: string; // Sun 18° below horizon (darkest)
	sunriseCivil: string; // Sun 6° below (readable light)
	sunriseNautical: string; // Sun 12° below (horizon visible)
	// ... same for sunset ...
	solarMidnight: string; // Sun at lowest point
	solarNoon: string; // Sun at highest point
	moonrise: string;
	moonset: string;
	moonPhase: MoonPhase; // Enum: new, waxingCrescent, firstQuarter, etc.
}
```

**Inspiration**: Civil twilight times are useful for photography apps, outdoor activity planning. OM provides basic sunrise/sunset; could add more with external calculation if needed.

#### 4. Next Hour Forecast Structure

The minutely precipitation forecast (`forecastNextHour`) includes summaries:

```typescript
interface NextHourForecast {
	metadata: Metadata;
	forecastStart: string;
	forecastEnd: string;
	minutes: ForecastMinute[]; // 60 minute-by-minute entries
	summary: ForecastPeriodSummary[]; // Aggregated periods
}

interface ForecastPeriodSummary {
	condition: PrecipitationType; // rain, snow, sleet, etc.
	startTime: string;
	endTime?: string;
	precipitationChance: number;
	precipitationIntensity: number;
}
```

**Inspiration**: The `summary` array groups continuous precipitation events (e.g., "Rain 2:15-2:45 PM"). This is better UX than showing 60 individual minutes. Could derive similar summaries from OW minutely data.

#### 5. Weather Alert Structure

Alerts include severity, certainty, urgency, and recommended responses:

```typescript
interface WeatherAlertSummary {
	id: string; // UUID
	areaId?: string; // Official area designation
	areaName?: string; // Human-readable area
	certainty: 'observed' | 'likely' | 'possible' | 'unlikely' | 'unknown';
	severity: 'extreme' | 'severe' | 'moderate' | 'minor' | 'unknown';
	urgency: 'immediate' | 'expected' | 'future' | 'past' | 'unknown';
	responses: ResponseType[]; // 'shelter', 'evacuate', 'prepare', etc.
	effectiveTime: string;
	expireTime: string;
	eventOnsetTime?: string; // When weather event starts
	eventEndTime?: string; // When weather event ends
	detailsUrl: string; // Link to full alert
	source: string; // Issuing agency
	description?: string;
}

type ResponseType =
	| 'shelter'
	| 'evacuate'
	| 'prepare'
	| 'execute'
	| 'avoid'
	| 'monitor'
	| 'assess'
	| 'allClear'
	| 'none';
```

**Inspiration**: The structured severity/urgency/certainty fields and recommended `responses` array are much richer than OW's flat alert structure. Could normalize OW alerts to this structure for consistent handling.

#### 6. Condition Codes

WeatherKit uses string-based condition codes similar to WMO but with Apple-specific naming. The codes are designed to be localizable and map well to SF Symbols.

**Our approach**: We already use WMO codes (numeric) from Open-Meteo. WeatherKit's string codes would need mapping, but the concept of using symbolic codes that map to icons is the same pattern.

### Why Not WeatherKit for This Project?

1. **Complex authentication**: Requires JWT generation with Apple-issued private key, not a simple API key
2. **Apple Developer Program required**: $99/year membership just to access the API
3. **Limited free tier relative to cost**: 500k/month sounds good, but need the $99 membership first
4. **No benefit over OpenWeather**: Both have minutely precipitation globally, OW is simpler
5. **Attribution requirements**: More restrictive than OpenWeather

### Potential Future Use Cases

- iOS native app using WeatherKit Swift SDK (no REST API auth complexity)
- Apple Watch complications
- If Apple opens up the API with simpler auth

### References

- [WeatherKit Get Started](https://developer.apple.com/weatherkit/get-started/)
- [WeatherKit REST API Docs](https://developer.apple.com/documentation/weatherkitrestapi)
- [OpenAPI Spec (Community)](https://github.com/vanshg/WeatherKit-OpenAPI) - Full schema definitions
- [WWDC22: Meet WeatherKit](https://developer.apple.com/videos/play/wwdc2022/10003/)

---

## Testing Notes

1. **Without API key**: Verify graceful degradation - no errors, just missing OW data
2. **With API key**: Verify all data sections populate correctly
3. **Network failure**: Verify OW failure doesn't break OM data loading
4. **Timezone handling**: Verify OW timestamps convert correctly to local timezone
5. **Unit conversion**: Verify temperature displays correctly in F/C toggle
