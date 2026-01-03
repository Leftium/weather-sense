# RainViewer API Integration

## Overview

RainViewer provides radar imagery for the weather-sense app. The API is free but has undergone significant restrictions starting in 2025, with more changes expected.

### Current Architecture

```
weather-maps.json:  Client → Server (cached 5 min) → RainViewer API
radar tiles:        Client → RainViewer CDN directly (per-user IP rate limit)
```

This is optimal because:

- Metadata (`weather-maps.json`) is global, cacheable, shared across all users
- Tiles are geographic-specific, benefit from per-user IP rate limits

---

## API Status Monitoring

### Why Monitor?

RainViewer has been deprecating API features throughout 2025-2026. Their timeline has sometimes slipped (e.g., nowcast was supposed to end Jan 1, 2026 but still works as of Jan 3). Need to detect when features actually break.

### Key Endpoints to Monitor

| Endpoint                                      | Purpose          | Check                |
| --------------------------------------------- | ---------------- | -------------------- |
| `api.rainviewer.com/public/weather-maps.json` | Frame metadata   | Response structure   |
| Tiles at zoom 10                              | Current max zoom | HTTP 200 vs 403      |
| Tiles at zoom 7                               | Fallback zoom    | HTTP 200             |
| Nowcast frames                                | Forecast radar   | Presence in response |

### Automated Health Check

Create a server-side health check that runs periodically (e.g., daily cron or on-demand):

**File:** `src/routes/api/health/rainviewer/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface RainViewerHealth {
	timestamp: string;
	status: 'healthy' | 'degraded' | 'down';
	checks: {
		metadata: boolean;
		nowcast: boolean;
		zoom10: boolean;
		zoom7: boolean;
	};
	issues: string[];
	recommendations: string[];
}

export const GET: RequestHandler = async () => {
	const health: RainViewerHealth = {
		timestamp: new Date().toISOString(),
		status: 'healthy',
		checks: {
			metadata: false,
			nowcast: false,
			zoom10: false,
			zoom7: false,
		},
		issues: [],
		recommendations: [],
	};

	try {
		// 1. Check metadata endpoint
		const metaRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
		if (metaRes.ok) {
			const data = await metaRes.json();
			health.checks.metadata = true;

			// 2. Check nowcast availability
			if (data.radar?.nowcast?.length > 0) {
				health.checks.nowcast = true;
			} else {
				health.issues.push('Nowcast data no longer available');
				health.recommendations.push('Remove nowcast/forecast frames from radar timeline');
			}

			// 3. Check tile zoom levels using a recent frame
			const recentFrame = data.radar?.past?.[0];
			if (recentFrame) {
				const host = data.host || 'https://tilecache.rainviewer.com';

				// Test zoom 10
				const zoom10Res = await fetch(`${host}${recentFrame.path}/256/10/512/512/8/1_1.webp`);
				health.checks.zoom10 = zoom10Res.ok;
				if (!zoom10Res.ok) {
					health.issues.push(`Zoom 10 tiles returning ${zoom10Res.status}`);
					health.recommendations.push('Reduce maxzoom to 7 in RadarMapLibre.svelte');
				}

				// Test zoom 7
				const zoom7Res = await fetch(`${host}${recentFrame.path}/256/7/64/64/8/1_1.webp`);
				health.checks.zoom7 = zoom7Res.ok;
				if (!zoom7Res.ok) {
					health.issues.push(`Zoom 7 tiles returning ${zoom7Res.status}`);
					health.recommendations.push('CRITICAL: Base zoom level failing, radar may be unusable');
				}
			}
		} else {
			health.issues.push(`Metadata endpoint returned ${metaRes.status}`);
		}
	} catch (error) {
		health.issues.push(`Request failed: ${error}`);
	}

	// Determine overall status
	const checkValues = Object.values(health.checks);
	const passedChecks = checkValues.filter(Boolean).length;

	if (passedChecks === checkValues.length) {
		health.status = 'healthy';
	} else if (passedChecks >= 2) {
		health.status = 'degraded';
	} else {
		health.status = 'down';
	}

	return json(health);
};
```

### Manual Check Script

For quick CLI verification:

```bash
#!/bin/bash
# scripts/check-rainviewer.sh

echo "=== RainViewer API Health Check ==="
echo ""

# Get metadata
META=$(curl -s "https://api.rainviewer.com/public/weather-maps.json")
HOST=$(echo "$META" | jq -r '.host')
FRAME=$(echo "$META" | jq -r '.radar.past[0].path')
NOWCAST_COUNT=$(echo "$META" | jq '.radar.nowcast | length')

echo "Host: $HOST"
echo "Sample frame: $FRAME"
echo "Nowcast frames: $NOWCAST_COUNT"
echo ""

# Check zoom levels
echo "=== Zoom Level Tests ==="
for ZOOM in 7 8 9 10 11 12; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HOST}${FRAME}/256/${ZOOM}/64/64/8/1_1.webp")
    if [ "$STATUS" = "200" ]; then
        echo "Zoom $ZOOM: ✓ OK"
    else
        echo "Zoom $ZOOM: ✗ HTTP $STATUS"
    fi
done

echo ""
echo "=== Nowcast Test ==="
if [ "$NOWCAST_COUNT" -gt 0 ]; then
    NOWCAST_FRAME=$(echo "$META" | jq -r '.radar.nowcast[0].path')
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HOST}${NOWCAST_FRAME}/256/7/64/64/8/1_1.webp")
    echo "Nowcast tiles: HTTP $STATUS"
else
    echo "Nowcast: Not available in API response"
fi
```

---

## Handling Restrictions

### Current Restrictions (as of Jan 2026)

| Feature    | Status                                | Impact                         |
| ---------- | ------------------------------------- | ------------------------------ |
| Zoom 11+   | ❌ 403 Forbidden                      | Grainier images when zoomed in |
| Zoom 7-10  | ✓ Working                             | Current max usable zoom        |
| Nowcast    | ✓ Working (was supposed to end Jan 1) | May break anytime              |
| Rate limit | 100 req/IP/min                        | Affects heavy users            |

### Graceful Degradation Strategy

#### 1. Zoom Level Fallback

**Current code** (`RadarMapLibre.svelte` line 144):

```typescript
maxzoom: 10, // Don't fetch tiles above zoom 10 - will overzoom instead
```

**If zoom 10 breaks**, update to:

```typescript
maxzoom: 7, // Fallback after RainViewer restriction
```

Consider making this configurable:

```typescript
// src/lib/config.ts
export const RAINVIEWER_MAX_ZOOM = 10; // Update when restrictions change

// RadarMapLibre.svelte
import { RAINVIEWER_MAX_ZOOM } from '$lib/config';
// ...
maxzoom: RAINVIEWER_MAX_ZOOM,
```

#### 2. Nowcast Removal

If nowcast disappears from API response, the code should handle it gracefully:

```typescript
// In ns-weather-data.svelte.ts or wherever radar data is processed
const frames = [
	...(data.radar?.past ?? []),
	...(data.radar?.nowcast ?? []), // Empty array if missing = no crash
];
```

**UI indication** - when nowcast unavailable:

```svelte
{#if !hasNowcast}
	<div class="radar-notice">Radar forecast unavailable - showing past data only</div>
{/if}
```

#### 3. Rate Limit Handling

Client-side tile requests can hit rate limits. MapLibre will show blank tiles.

**Detection:** Monitor for 429 responses (though RainViewer may just return empty/error tiles)

**Mitigation options:**

- Reduce animation frame rate
- Lazy-load tiles (don't preload all frames)
- Show warning to user

```typescript
// Example: detect tile load failures
map.on('error', (e) => {
	if (e.sourceId?.startsWith('rv-src-') && e.error?.status === 429) {
		console.warn('RainViewer rate limit hit');
		// Could pause animation, show warning, etc.
	}
});
```

---

## Future Contingency: Alternative Providers

If RainViewer becomes unusable, potential alternatives:

| Provider                                                 | Coverage        | Free Tier | Notes                         |
| -------------------------------------------------------- | --------------- | --------- | ----------------------------- |
| [Open-Meteo Radar](https://open-meteo.com/)              | Limited regions | Yes       | Check if they add radar tiles |
| [RainMachine](https://www.rainmachine.com/)              | US only         | ?         | Consumer-focused              |
| [Météo-France](https://donneespubliques.meteofrance.fr/) | France/EU       | Yes       | Government data               |
| [NOAA MRMS](https://mrms.ncep.noaa.gov/)                 | US only         | Yes       | Raw data, needs processing    |
| Tomorrow.io                                              | Global          | Limited   | Commercial, has radar         |

**Migration checklist if switching:**

- [ ] Update tile URL template
- [ ] Update `weather-maps.json` equivalent (frame list source)
- [ ] Adjust color scheme mapping
- [ ] Update zoom level constraints
- [ ] Test coverage for user locations
- [ ] Update attribution

---

## Monitoring Checklist

### Weekly (Automated)

- [ ] Run health check endpoint
- [ ] Log results to monitoring service
- [ ] Alert on status change from 'healthy'

### Monthly (Manual)

- [ ] Check RainViewer API docs for announcements
- [ ] Check RainViewer blog for updates
- [ ] Verify current restrictions match code configuration

### On Alert

- [ ] Run manual check script
- [ ] Identify which feature broke
- [ ] Apply graceful degradation
- [ ] Update `RAINVIEWER_MAX_ZOOM` or remove nowcast if needed
- [ ] Consider notifying users if significant degradation

---

## Reference Links

- [RainViewer API Docs](https://www.rainviewer.com/api.html)
- [API Transition FAQ](https://www.rainviewer.com/api/transition-faq.html)
- [Weather Radar APIs 2025 Overview](https://www.rainviewer.com/blog/weather-radar-apis-2025-overview.html) (their recommended alternatives)
- [Color Schemes](https://www.rainviewer.com/api/color-schemes.html)
- [RainViewer Status Page](https://status.rainviewer.com)

---

## Implementation Checklist

- [ ] Create `/api/health/rainviewer/+server.ts` health check endpoint
- [ ] Create `scripts/check-rainviewer.sh` manual check script
- [ ] Extract `RAINVIEWER_MAX_ZOOM` to config file
- [ ] Add graceful handling for missing nowcast data
- [ ] Add UI notice when radar degraded
- [ ] Set up monitoring/alerting (optional: cron job, uptime service)
