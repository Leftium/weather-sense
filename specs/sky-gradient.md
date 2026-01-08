# Sky Gradient Investigation

## Overview

Investigation into sky gradient palettes and why the interpolated sticky background gradient doesn't match the pure palette colors.

## Sky Palettes

Defined in `src/lib/util.ts`:

| Time      | [0] Top                | [1] Middle             | [2] Bottom         |
| --------- | ---------------------- | ---------------------- | ------------------ |
| **Night** | `#000c26` (dark blue)  | `#2a3a5c` (slate)      | `#7455b8` (purple) |
| **Dawn**  | `#fff0e6` (warm white) | `#ffd93d` (golden)     | `#ff6633` (orange) |
| **Day**   | `#f0f8ff` (white)      | `#a8d8f0` (light blue) | `#6bb3e0` (blue)   |
| **Dusk**  | `#7455b8` (purple)     | `#ff6b6b` (coral)      | `#ffc400` (amber)  |

### Palette Order Rationale

- **Dawn**: Warm white at top transitions smoothly to Day's white top
- **Dusk**: Purple at top transitions smoothly to Night's purple bottom
- **All palettes**: Darker colors at bottom for consistent horizon feel

## Usage Differences

### Sticky Background (`getSkyColorsFullPalette`)

- Uses all 3 colors from palette
- Gradient: `-135deg` (diagonal from top-right to bottom-left)
- Uses `background-attachment: fixed` for seamless appearance with daily tiles

### Sky Strip (`getSkyStripPalette`)

- For **night/day**: Uses all 3 colors unchanged
- For **dawn/dusk**: Uses only 2 colors (`[2]` and `[1]`), calculates middle as 50% mix
  - This omits the white (dawn) and purple (dusk) for a cleaner 2-tone gradient
  - Dawn sky strip: orange top, golden bottom
  - Dusk sky strip: amber top, coral bottom

## Interpolation

Colors transition based on sun altitude:

- **Pure Night**: altitude <= -18deg
- **Night <-> Dawn/Dusk**: -18deg to -6deg
- **Dawn/Dusk <-> Day**: -6deg to 6deg
- **Pure Day**: altitude > 6deg

An `easeInOut` function is applied to make transitions snappier (spend more time near pure palettes).

## The `background-attachment: fixed` Problem

### Symptom

The sticky/tiles background looks "muddy" - doesn't show all 3 distinct palette colors even when the interpolation returns pure palette values.

### Root Cause

With `background-attachment: fixed`, the gradient is painted relative to the **viewport**, not the element. Elements just "window" into different parts of this viewport-sized gradient.

For a 45deg diagonal gradient on a wide viewport (e.g., 2660x900):

- The gradient line goes from bottom-left corner to top-right corner
- This is a very long, shallow diagonal
- The sticky/tiles area (near top of viewport) only sees a narrow horizontal band of the gradient
- Most color variation happens along the diagonal, which is mostly horizontal travel

### Attempted Solutions

1. **Use 90deg horizontal gradient** (like iOS)
   - Works well, shows all 3 colors
   - Loses the diagonal aesthetic

2. **Adjust gradient stops** (e.g., -200% to 300%)
   - Doesn't help because stops are relative to the gradient line length
   - With `fixed`, the gradient spans the viewport diagonal regardless of stops

3. **Use `background-size: 100vw 100vh`**
   - No visible effect - gradient already sized to viewport

4. **Compress stops to upper portion** (e.g., 0%, 25%, 50%, hold to 100%)
   - Helps show more colors in the visible area
   - But can't show both "top" and "bottom" colors because:
     - When map is visible, sticky is ~300px from viewport top
     - When map scrolls off, sticky is at viewport top (0px)
     - Can't have stops that work for both positions

5. **Full-viewport background layer**
   - Works but sticky needs solid background to cover scrolling content

### Conclusion

With `background-attachment: fixed` and a diagonal gradient, it's fundamentally difficult to show all 3 palette colors in the sticky/tiles area because:

1. The viewport aspect ratio makes the diagonal very shallow
2. The sticky position changes as user scrolls
3. There's no single set of gradient stops that works for all scroll positions

### Recommended Options

1. **Accept 90deg horizontal** - cleanest solution, shows all colors
2. **Accept the compromise** - diagonal looks nice but colors are muted
3. **Use JavaScript** - dynamically adjust gradient based on scroll (complex)
4. **Remove `fixed`** - accept seam between sticky and tiles
