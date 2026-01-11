// Shared store for WMO code gradient preference (solid vs gradient backgrounds)
// Persists to localStorage

import { browser } from '$app/environment';

const STORAGE_KEY = 'weather-sense:wmoGradient';

// Default to false (solid colors)
let wmoGradient = $state<boolean>(false);

// Load from localStorage on module init (browser only)
if (browser) {
	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved === 'true' || saved === 'false') {
		wmoGradient = saved === 'true';
	}
}

export function getWmoGradient(): boolean {
	return wmoGradient;
}

export function setWmoGradient(value: boolean) {
	wmoGradient = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEY, String(value));
	}
}

export function toggleWmoGradient() {
	setWmoGradient(!wmoGradient);
}

// Export reactive getter for use in components
export const wmoGradientStore = {
	get value() {
		return wmoGradient;
	},
	set value(v: boolean) {
		setWmoGradient(v);
	},
	toggle: toggleWmoGradient,
};
