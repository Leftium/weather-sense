import dateFormat from 'dateformat';

export function tsToTime(ts: number, format = 'h:MMt') {
	const date = new Date(ts * 1000);
	return dateFormat(date, format);
}
