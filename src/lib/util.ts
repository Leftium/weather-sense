import dateFormat from 'dateformat';

export function tsToTime(ts: number, format = 'h:MMt') {
	const date = new Date(ts * 1000);
	return dateFormat(date, format);
}

export function humanDistance(n: number | undefined) {
	if (!n) {
		return '??m';
	}
	let units = 'm';

	if (n >= 1000) {
		n = n / 1000;
		units = 'km';
	}
	return `${Math.floor(n)}${units}`;
}
