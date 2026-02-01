// Calm mode state - hides numbers and units for a more peaceful display
// Entered via ?calm URL parameter, exited on any click/touch

import { browser } from '$app/environment';

let calmMode = $state(false);

export function getCalmMode(): boolean {
	return calmMode;
}

export function setCalmMode(value: boolean) {
	calmMode = value;
}

export function exitCalmMode() {
	calmMode = false;
}

// Export reactive getter for use in components
export const calmModeStore = {
	get value() {
		return calmMode;
	},
	set value(v: boolean) {
		setCalmMode(v);
	},
	exit: exitCalmMode,
};

// Number to word mappings for calm mode
const numberWords: Record<number, string> = {
	1: 'One',
	2: 'Two',
	3: 'Three',
	4: 'Four',
	5: 'Five',
	6: 'Six',
	7: 'Seven',
	8: 'Eight',
	9: 'Nine',
	10: 'Ten',
	11: 'Eleven',
	12: 'Twelve',
	13: 'Thirteen',
	14: 'Fourteen',
	15: 'Fifteen',
	16: 'Sixteen',
};

// Ordinal words for dates (1st through 31st)
const ordinalWords: Record<number, string> = {
	1: 'First',
	2: 'Second',
	3: 'Third',
	4: 'Fourth',
	5: 'Fifth',
	6: 'Sixth',
	7: 'Seventh',
	8: 'Eighth',
	9: 'Ninth',
	10: 'Tenth',
	11: 'Eleventh',
	12: 'Twelfth',
	13: 'Thirteenth',
	14: 'Fourteenth',
	15: 'Fifteenth',
	16: 'Sixteenth',
	17: 'Seventeenth',
	18: 'Eighteenth',
	19: 'Nineteenth',
	20: 'Twentieth',
	21: 'Twenty-first',
	22: 'Twenty-second',
	23: 'Twenty-third',
	24: 'Twenty-fourth',
	25: 'Twenty-fifth',
	26: 'Twenty-sixth',
	27: 'Twenty-seventh',
	28: 'Twenty-eighth',
	29: 'Twenty-ninth',
	30: 'Thirtieth',
	31: 'Thirty-first',
};

export function numberToWord(n: number): string {
	return numberWords[n] ?? String(n);
}

export function dayOfMonthToOrdinal(day: number): string {
	return ordinalWords[day] ?? `${day}th`;
}

// =============================================================================
// CALM MODE VALUE DESCRIPTIONS
// =============================================================================

/**
 * Get calm mode description for temperature (in Fahrenheit).
 * Converts to a human-friendly word.
 */
export function describeTemp(fahrenheit: number | null | undefined): string {
	if (fahrenheit == null) return '--';
	if (fahrenheit < 32) return 'Freezing';
	if (fahrenheit < 50) return 'Cold';
	if (fahrenheit < 60) return 'Cool';
	if (fahrenheit < 70) return 'Mild';
	if (fahrenheit < 80) return 'Warm';
	if (fahrenheit < 90) return 'Hot';
	return 'Burning';
}

/**
 * Get calm mode description for precipitation amount (in mm).
 */
export function describePrecipAmount(mm: number | null | undefined): string {
	if (mm == null) return '--';
	if (mm === 0) return 'None';
	if (mm < 2) return 'Light';
	if (mm < 7) return 'Medium';
	if (mm < 15) return 'Heavy';
	return 'Extreme';
}

/**
 * Get calm mode description for precipitation chance (percentage 0-100).
 */
export function describePrecipChance(percent: number | null | undefined): string {
	if (percent == null) return '--';
	if (percent <= 10) return 'None';
	if (percent <= 30) return 'Low';
	if (percent <= 50) return 'Maybe';
	if (percent <= 70) return 'Likely';
	if (percent <= 90) return 'High';
	return 'Certain';
}

/**
 * Get calm mode description for humidity (percentage 0-100).
 * Uses neutral terms that work in any season.
 */
export function describeHumidity(percent: number | null | undefined): string {
	if (percent == null) return '--';
	if (percent < 25) return 'Arid';
	if (percent < 40) return 'Dry';
	if (percent < 60) return 'Normal';
	if (percent < 75) return 'Moist';
	return 'Damp';
}

/**
 * Get calm mode description for EU AQI.
 * Uses same labels as hourly plots (AQI_INDEX_EUROPE).
 */
export function describeAqi(aqi: number | null | undefined): string {
	if (aqi == null) return '--';
	if (aqi <= 20) return 'Good';
	if (aqi <= 40) return 'Fair';
	if (aqi <= 60) return 'Moderate';
	if (aqi <= 80) return 'Poor';
	if (aqi <= 100) return 'Very Poor';
	return 'Ext. Poor';
}

// =============================================================================
// CALM MODE DATE FORMATTING
// =============================================================================

// Two-letter to three-letter day abbreviation mapping
const dayAbbreviations: Record<string, string> = {
	Su: 'Sun',
	Mo: 'Mon',
	Tu: 'Tue',
	We: 'Wed',
	Th: 'Thu',
	Fr: 'Fri',
	Sa: 'Sat',
};

/**
 * Transform compactDate for calm mode display.
 * "Today" stays as "Today"
 * "Su-01" becomes "Sun"
 * "Jan-15" becomes "Jan" (month only, no date number)
 */
export function calmCompactDate(compactDate: string): string {
	if (compactDate === 'Today') return 'Today';

	// Check if it's a day abbreviation format (dd-DD like "Su-01")
	const dayMatch = compactDate.match(/^([A-Za-z]{2})-\d+$/);
	if (dayMatch) {
		const twoLetter = dayMatch[1];
		// Capitalize first letter for lookup
		const normalized = twoLetter.charAt(0).toUpperCase() + twoLetter.charAt(1).toLowerCase();
		return dayAbbreviations[normalized] ?? compactDate;
	}

	// Check if it's a month format (MMM-DD like "Jan-15")
	const monthMatch = compactDate.match(/^([A-Za-z]{3})-\d+$/);
	if (monthMatch) {
		return monthMatch[1]; // Just return the month
	}

	return compactDate;
}
