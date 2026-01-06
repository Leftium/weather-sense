# Sky Strip Overlay Visualization Spec

## Overview

Replace the current WMO code-based sky overlays with data-driven overlays using **cloud cover** and **visibility** fields from Open-Meteo. This provides more accurate atmospheric representation than the discrete WMO weather codes.

## Data Sources

### Open-Meteo Hourly Fields

| Field              | Unit   | Description                                                |
| ------------------ | ------ | ---------------------------------------------------------- |
| `cloud_cover`      | %      | Total cloud cover as area fraction (0-100%)                |
| `cloud_cover_low`  | %      | Low clouds and fog up to 3 km altitude                     |
| `cloud_cover_mid`  | %      | Mid level clouds from 3 to 8 km altitude                   |
| `cloud_cover_high` | %      | High level clouds from 8 km altitude                       |
| `visibility`       | meters | Viewing distance, influenced by clouds, humidity, aerosols |

### Questions to Resolve

1. **Which cloud cover field(s) to use?**
   - Option A: Just `cloud_cover` (total) - simplest
   - Option B: Use `cloud_cover_low` primarily (most visible impact on sky appearance)
   - Option C: Combine all three levels with different visual effects
   - **Recommendation**: Start with `cloud_cover` (total). The combined value represents overall sky appearance. Individual layers could be added later for more nuanced effects.

2. **Visibility range considerations**
   - Clear day: 10,000+ meters
   - Light haze: 5,000-10,000 meters
   - Moderate haze/mist: 2,000-5,000 meters
   - Fog: < 1,000 meters
   - Dense fog: < 200 meters

## Overlay Strategy

### Concept: Two-Layer System

**Top region (0-50%)**: Cloud cover overlay

- More opaque = more cloud coverage
- Uses desaturation approach (neutral gray to wash out blue sky)
- Opacity mapped from `cloud_cover` percentage

**Bottom region (50-100%)**: Visibility overlay

- More opaque = lower visibility
- Represents haze/fog near horizon
- Opacity inversely mapped from `visibility` meters

### Mapping Functions

```typescript
// Cloud cover: 0-100% -> 0-0.6 opacity
function cloudCoverToOpacity(cloudCover: number): number {
	// 0% clouds = 0 opacity (clear sky)
	// 100% clouds = 0.6 opacity (overcast, but still see some sky)
	return (cloudCover / 100) * 0.6;
}

// Visibility: meters -> 0-0.8 opacity
function visibilityToOpacity(visibility: number): number {
	// 10000m+ = 0 opacity (clear)
	// 1000m = 0.4 opacity (mist)
	// 200m = 0.8 opacity (dense fog)
	if (visibility >= 10000) return 0;
	if (visibility <= 200) return 0.8;

	// Logarithmic scale for natural feel
	const normalized = Math.log10(visibility / 200) / Math.log10(10000 / 200);
	return 0.8 * (1 - normalized);
}
```

### Gradient Structure

```typescript
function getSkyOverlayGradient(cloudCover: number, visibility: number) {
	const cloudOpacity = cloudCoverToOpacity(cloudCover);
	const visOpacity = visibilityToOpacity(visibility);

	return [
		{ offset: '0%', color: `rgba(160,160,170,${cloudOpacity * 0.8})` }, // top: cloud effect
		{ offset: '40%', color: `rgba(160,160,170,${cloudOpacity})` }, // mid-upper
		{ offset: '60%', color: `rgba(180,180,190,${(cloudOpacity + visOpacity) / 2})` }, // transition
		{ offset: '100%', color: `rgba(200,200,210,${visOpacity})` }, // bottom: visibility effect
	];
}
```

---

## Visualization Modes

### Current Behavior (to be replaced)

The sky strip currently supports two modes via `showSkyThroughWmo` toggle:

1. **Solid WMO bands**: Weather code determines solid color overlay
2. **Transparent WMO bands**: Label band at top, sky shows through below

### New Behavior

Remove the toggle-based approach. Instead, the sky strip always shows:

1. **Base layer**: Time-of-day sky gradient (dawn/day/dusk/night)
2. **Overlay layer**: Cloud cover + visibility gradient (data-driven)

The overlay intensity varies continuously based on actual atmospheric data rather than discrete WMO codes.

---

## Display Options

### Option A: Replace Existing Plots

The sky strip with overlays replaces all existing plot visualizations (temp, precip, WMO code bands). This creates a cleaner, more immersive "looking at the sky" experience.

**Pros:**

- Clean, uncluttered view
- More immersive weather visualization
- Sky conditions immediately visible

**Cons:**

- Loses detailed data plots
- May need toggle to switch views

### Option B: Expanded Mini Strip

Expand the existing mini strip at the bottom of the hourly plot. The sky visualization becomes a dedicated band rather than replacing existing data plots.

**Pros:**

- Keeps existing data plots
- Sky info is additive, not replacing
- Less disruptive change

**Cons:**

- Takes more vertical space
- May feel cramped

### Option C: Full-Width Sky Band (Recommended)

Create a new dedicated sky visualization band that can be toggled independently. When active, it shows full sky gradient with overlays. Other plots remain available.

**Pros:**

- Best of both worlds
- User controls what they see
- Progressive enhancement

---

## Additional Plots (Debug/Analysis)

Add optional graph plots for the data fields, using the same plot region as existing plots (temperature, humidity, etc.):

### Cloud Cover Plot

- Line graph showing `cloud_cover` percentage over time
- Optional: stacked area showing low/mid/high breakdown
- Y-axis: 0-100%

### Visibility Plot

- Line graph showing visibility in meters (or km)
- Logarithmic scale may work better for the wide range
- Y-axis: 0-10km (or log scale)

### Wind Speed Plot

- Line graph showing `wind_speed_10m`
- Y-axis: km/h or mph based on user preference

### Pressure Plot

- Line graph showing `pressure_msl` (sea level pressure)
- Y-axis: hPa, typical range 980-1040

These plots would NOT have checkboxes in the main UI initially - they're for analysis and debugging. Could be enabled via:

- Dev mode / debug panel
- Settings page
- URL parameter

---

## API Changes Required

### Open-Meteo Request Updates

Add to hourly parameters in `fetchOpenMeteoForecast()`:

```typescript
const hourlyParams = [
	// ... existing params ...
	'cloud_cover',
	'cloud_cover_low', // optional, for future use
	'cloud_cover_mid', // optional, for future use
	'cloud_cover_high', // optional, for future use
	'visibility',
	'wind_speed_10m', // for wind plot
	'pressure_msl', // for pressure plot
];
```

### Type Updates

Add to `HourlyForecast` type:

```typescript
type HourlyForecast = {
	// ... existing fields ...
	cloudCover: number; // 0-100%
	cloudCoverLow?: number; // 0-100%
	cloudCoverMid?: number; // 0-100%
	cloudCoverHigh?: number; // 0-100%
	visibility: number; // meters
	windSpeed: number; // km/h (or user unit)
	pressureMsl: number; // hPa
};
```

---

## Implementation Phases

### Phase 1: Data Collection

- [ ] Add cloud_cover, visibility, wind_speed_10m, pressure_msl to API request
- [ ] Update type definitions
- [ ] Verify data appears in debug panel

### Phase 2: Overlay Functions

- [ ] Create `cloudCoverToOpacity()` function
- [ ] Create `visibilityToOpacity()` function
- [ ] Create `getSkyOverlayGradient()` that takes cloud cover and visibility
- [ ] Remove/deprecate WMO-based `getWmoOverlayGradient()`

### Phase 3: Sky Strip Integration

- [ ] Update TimeLine.svelte to use data-driven overlays
- [ ] Remove `showSkyThroughWmo` toggle (or repurpose)
- [ ] Test with various weather conditions

### Phase 4: Additional Plots (Optional)

- [ ] Add cloud cover line plot
- [ ] Add visibility line plot
- [ ] Add wind speed line plot
- [ ] Add pressure line plot
- [ ] Add debug/dev mode toggle for these plots

### Phase 5: UI Refinement

- [ ] Decide on display mode (Option A/B/C above)
- [ ] Add user controls if needed
- [ ] Polish visual appearance

---

## Open Questions & Decisions

### 1. Interpolation vs Vertical Gradients

**Question**: Should we interpolate cloud cover/visibility horizontally for smoother gradients across hours?

**Challenge**: If we interpolate horizontally (time axis), can we still have vertical gradients (cloud cover top, visibility bottom)?

**Answer**: Yes, but requires per-pixel or per-slice calculation. Options:

- **Option A**: Hourly slices with stepped changes (current approach for sky strip)
- **Option B**: Horizontal interpolation with single vertical gradient per hour
- **Option C**: Fine-grained slices (e.g., every 10 minutes) interpolating between hourly values

**Recommendation**: Start with Option A (hourly slices). Each hour gets its own vertical gradient based on that hour's cloud cover and visibility. Smoother horizontal interpolation can be added later if desired.

### 2. Night Handling

**Decision**: Defer for now. Visibility at night is naturally lower anyway. Cloud cover at night could affect:

- Star visibility (not currently shown)
- Moonlight diffusion (not currently shown)
- Overall sky brightness (already handled by day/night sky colors)

### 3. Precipitation Interaction

**Expectation**: Cloud cover and visibility fields should naturally correlate with WMO precipitation codes. When it's raining:

- Cloud cover should be high (overcast)
- Visibility should be reduced

If data shows good correlation, no special handling needed. The overlay will naturally become more opaque during precipitation.

### 4. Performance

Gradient creation per hour is lightweight. Current sky strip already creates per-slice gradients. Monitor performance but expect no issues.

---

## Layout Redesign: Day Row Headers

### Current vs Proposed Layout

**Current Layout:**

```
[Temp block] [Day label] [Hi/Lo] | [Plot area with sky strip]
     Left sidebar               |        Main plot
```

**Proposed Layout (MerrySky-inspired):**

```
┌─────────────────────────────────────────────────────┐
│ STICKY HEADER (always visible)                      │
│ [Location] [Current temp] [Icon] [Key stats...]    │
│ [Sky gradient background reflecting scrubbed time]  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ DAY ROW HEADER (static summary for this day)        │
│ [Wed Jan 7] [Icon] [Hi 5° Lo -3°] [Rain 2mm] [Wind 5-10] │
├─────────────────────────────────────────────────────┤
│ PLOT AREA (full width)                              │
│ [Sky strip + temp line + overlays]                  │
└─────────────────────────────────────────────────────┘
```

### Weather-Sense vs MerrySky: Sticky Header Advantage

**MerrySky Approach:**

- Current values shown inline on charts (labels like "1°", "6m/s")
- Values update as you scrub timeline
- **Problem**: Only visible for plots currently on screen
- Scroll down to daily cards → lose sight of current values

**Weather-Sense Approach:**

- Sticky top header always visible
- Values update as timeline is scrubbed
- **Advantage**: Current conditions always visible regardless of scroll position
- Sky gradient in sticky header reflects current time-of-day

### Content Split: Static vs Dynamic

**Day Row Header (static - doesn't change with scrub):**

- Day name + date
- Weather icon (dominant for day)
- Daily high/low temperatures
- Daily precipitation total
- Daily wind range (e.g., "5-10 m/s")
- Could include: UV max, sunrise/sunset

**Sticky Header (dynamic - updates with scrub):**

- Current/scrubbed temperature
- Current/scrubbed weather icon + description
- Current/scrubbed wind speed + direction
- Current/scrubbed pressure, humidity, visibility, UV
- Sky gradient background reflecting scrubbed time

### Benefits of This Approach

1. **Full-width plots** - more horizontal space for data visualization
2. **Clear separation** - static day summary vs dynamic current values
3. **Always-visible context** - sticky header shows scrubbed values
4. **Room for more day stats** - wind, precip, UV in day header
5. **Consistent with MerrySky** - proven pattern, but improved with sticky header
6. **Temp gradient block** could move into day header or become plot background

### Migration Path

1. Phase 1: Add day row header above plot (keep left sidebar for now)
2. Phase 2: Move left sidebar content to day header
3. Phase 3: Remove left sidebar, full-width plots
4. Phase 4: Add additional stats to day header (wind, precip, UV)

---

## Additional Weather Variables for Visualization

Based on Open-Meteo available fields and inspiration from apps like Ventusky, Windy, and MerrySky:

### High Priority (Useful for everyday users)

| Variable             | Unit    | Visualization               | Notes                             |
| -------------------- | ------- | --------------------------- | --------------------------------- |
| `wind_speed_10m`     | km/h    | Line plot                   | Essential for outdoor activities  |
| `wind_gusts_10m`     | km/h    | Line plot (with wind speed) | Peak gusts, overlay on wind speed |
| `wind_direction_10m` | degrees | Arrow indicators            | Direction at key points           |
| `uv_index`           | index   | Line plot or color band     | Sun safety                        |
| `pressure_msl`       | hPa     | Line plot                   | Weather trend indicator           |

### Medium Priority (Niche but valuable)

| Variable                | Unit    | Visualization     | Notes                    |
| ----------------------- | ------- | ----------------- | ------------------------ |
| `sunshine_duration`     | seconds | Bar chart or area | Actual vs potential sun  |
| `cape`                  | J/kg    | Line plot         | Thunderstorm potential   |
| `freezing_level_height` | meters  | Line plot         | Snow level for mountains |
| `snow_depth`            | meters  | Area plot         | Accumulated snow         |
| `soil_temperature_0cm`  | °C      | Line plot         | Gardening, frost risk    |

### Low Priority (Specialized)

| Variable                     | Unit   | Visualization | Notes                  |
| ---------------------------- | ------ | ------------- | ---------------------- |
| `et0_fao_evapotranspiration` | mm     | Line plot     | Agriculture/gardening  |
| `vapour_pressure_deficit`    | kPa    | Line plot     | Plant stress indicator |
| `shortwave_radiation`        | W/m²   | Area plot     | Solar energy           |
| `boundary_layer_height`      | meters | Line plot     | Air quality dispersion |

### Cloud Layer Breakdown (Future Enhancement)

If detailed cloud visualization is desired:

| Variable           | Visualization         | Notes                    |
| ------------------ | --------------------- | ------------------------ |
| `cloud_cover_low`  | Stacked area (bottom) | Fog, stratus             |
| `cloud_cover_mid`  | Stacked area (middle) | Altostratus, altocumulus |
| `cloud_cover_high` | Stacked area (top)    | Cirrus, thin clouds      |

Could show as stacked area chart or three separate bands in sky strip.

---

## Inspiration: Weather Visualization Apps

### Ventusky (ventusky.com)

- Map-based with animated overlays
- Layers: Temperature, Wind, Clouds, Pressure, CAPE, Snow, Humidity, Air Quality
- Time slider for forecast animation
- Clean, professional aesthetic

### Windy (windy.com)

- Extremely detailed wind visualization
- Multiple weather models selectable
- Pressure level data (upper atmosphere)
- Aviation-focused features

### MerrySky (merrysky.net)

- Focus on daily/hourly forecast clarity
- Clean, modern UI
- Good use of color coding
- Emphasis on "what matters" for planning

**Detailed Analysis (from screenshot):**

Current Conditions Panel:

- Large temp + icon, feels like, low/high
- Grid of key stats: Precip, Wind (with direction), Pressure, Dew, Humidity, UV, Visibility, Ozone
- Visibility shown prominently (e.g., "3 km")

Next 24 Hours Strip:

- WMO code bands with labels (Fog, Partly Cloudy, etc.)
- Temperature at 2-hour intervals below
- Simple, scannable format

Next 7 Days Chart:

- Temperature line plot with area fill
- Precipitation bars on right axis (dual-axis)
- Day labels below

Daily Forecast Cards:

- Icon + day name + date
- Avg/Low/High temps
- Rain/Snow/Wind summary on right side
- WMO bands showing weather progression through day
- Hourly temps in 2-hour increments

Data Sources:

- Uses Pirate Weather API
- Shows coordinates and data sources in footer

### Key Takeaways for Weather-Sense

1. **Wind is essential** - Most apps prominently feature wind speed/direction
2. **Layered approach** - Allow toggling different data layers
3. **Time animation** - Scrubbing through time is universally expected
4. **Pressure trends** - Rising/falling pressure indicates weather changes
5. **UV index** - Important for outdoor planning
6. **Keep it simple** - Too many layers = overwhelming

### Specific Ideas from MerrySky to Consider

1. **Current conditions panel** - Show visibility, wind direction, pressure, UV prominently
2. **Wind with direction** - "NW at 3-6 m/s" format, not just speed
3. **Ozone display** - Available from Open-Meteo Air Quality API
4. **Dual-axis charts** - Temperature (left) + precipitation (right) is space-efficient
5. **2-hour intervals** - Good granularity for daily temperature display
6. **WMO bands validated** - Their approach similar to ours, confirms it works
7. **Daily card layout** - WMO progression + hourly temps is very effective

---

## References

- Open-Meteo API docs: https://open-meteo.com/en/docs
- Ventusky: https://www.ventusky.com
- Windy: https://www.windy.com
- Related spec: [openweather.md](./openweather.md) - OpenWeather data integration
- Related spec: [rainviewer.md](./rainviewer.md) - Radar visualization
