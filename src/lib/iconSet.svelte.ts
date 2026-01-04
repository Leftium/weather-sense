// Shared store for icon set preference (Airy vs Google)
// Persists to localStorage

import { browser } from '$app/environment';

const STORAGE_KEY = 'weather-sense:iconSet';

export type IconSetType = 'airy' | 'google';

// Default to 'google'
let iconSet = $state<IconSetType>('google');

// Load from localStorage on module init (browser only)
if (browser) {
	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved === 'airy' || saved === 'google') {
		iconSet = saved;
	}
}

export function getIconSet(): IconSetType {
	return iconSet;
}

export function setIconSet(value: IconSetType) {
	iconSet = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEY, value);
	}
}

export function toggleIconSet() {
	setIconSet(iconSet === 'airy' ? 'google' : 'airy');
}

// Export reactive getter for use in components
export const iconSetStore = {
	get value() {
		return iconSet;
	},
	set value(v: IconSetType) {
		setIconSet(v);
	},
	toggle: toggleIconSet,
};
