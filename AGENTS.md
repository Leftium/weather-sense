# Agent Instructions for WeatherSense

## Debug Logging

For debugging complex issues, use the `createDebugLogger` utility from `$lib/util.ts`:

```typescript
import { createDebugLogger } from '$lib/util';

// Create a logger (only logs when enabled is true)
const shouldDebug = someDayCondition === 'Sun-04'; // example condition
const debug = createDebugLogger('MyComponent', shouldDebug);

// Log messages
debug.log('Processing item: ' + item.id);
debug.log(`Result: ${result}`);

// Store logs in window.debugLog for easy clipboard access
debug.finish();
```

Then in the browser console, run `copy(debugLog)` to copy all logged messages to your clipboard.

This is useful for collecting debug output that would otherwise be hard to copy from the console (e.g., many lines, collapsed objects).
