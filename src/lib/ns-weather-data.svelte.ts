// Defines nation-state for weather data.

import _ from 'lodash-es';

import { getEmitter } from '$lib/emitter';
import { gg } from '$lib/gg';
import type { Coordinates, Radar } from '$lib/types';
import { celcius } from './util';
import { browser, dev } from '$app/environment';

export type WeatherDataEvents = {
	weatherdata_requestedSetLocation: {
		source: string;
		coords?: Coordinates;
		name?: string;
	};

	weatherdata_requestedSetTime: {
		time: number;
	};

	weatherdata_requestedToggleUnits: {
		temperature: boolean | string;
	};

	weatherdata_requestedTogglePlay: undefined;

	weatherdata_requestedFetchRainviewerData: undefined;

	weatherdata_updatedRadar: {
		nsWeatherData: NsWeatherData;
	};

	weatherdata_updatedData: undefined;

	weatherdata_requestedTrackingStart: undefined;

	weatherdata_requestedTrackingEnd: undefined;
};

const DATEFORMAT_MASK = 'MM-DD hh:mma z';
const PAST_DAYS = dev ? 2 : 2; // 0 to 92
const FORECAST_DAYS = dev ? 4 : 8; // 0 to 16

const { on, emit } = getEmitter<WeatherDataEvents>(import.meta);

type CurrentWeather = {
	time: number;
	timeFormatted: string;
	isDay: boolean;
	weatherCode: number;
	temperature: number;

	precipitation: number;
	rain: number;
	humidity: number;
	showers: number;
	snowfall: number;
};

export type MinutelyWeather = {
	time: number;
	timeFormatted: string;
	minute: number;

	temperature: number;
	temperatureNormalized: number;
	precipitation: number;
	precipitationNormalized: number;

	hourly?: HourlyWeather;
	daily?: DailyWeather;
};

export type HourlyWeather = {
	time: number;
	timeFormatted: string;
	fromNow: number;

	weatherCode: number;
	temperature: number;

	relativeHumidity: number;
	dewPoint: number;

	precipitationProbability: number;
	precipitation: number;
};

type DailyWeather = {
	time: number;
	timeFormatted: string;
	timeCompact: string;
	fromToday: number;

	isDay: boolean;
	weatherCode: number;
	temperature: number;

	precipitation: number;
	rain: number;
	humidity: number;
	showers: number;
	snowfall: number;
};

export type NsWeatherData = ReturnType<typeof makeNsWeatherData>;

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezonePlugin from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

export function makeNsWeatherData() {
	//gg('makeNsWeatherData');

	// Inputs:
	let coords: Coordinates | null = $state(null);
	let name: string | null = $state(null);
	let source: string = $state('???');

	// The time for which to render weather data:
	let time = $state(+new Date() / 1000);

	// The timezone for this data.
	let timezone = $state('Greenwich'); // GMT
	let timezoneAbbreviation = $state('GMT'); // GMT
	let utcOffsetSeconds = $state(0);

	let radarPlaying = $state(false);
	let resetRadarOnPlay = $state(true);
	let radar: Radar = $state({ generated: 0, host: '', frames: [] });

	let current: CurrentWeather | null = $state(null);
	let hourly: HourlyWeather[] | null = $state(null);
	let daily: DailyWeather[] | null = $state(null);

	let byMinute: Record<number, MinutelyWeather> = $state({});

	let minutely: MinutelyWeather[] = $derived.by(() => {
		console.time('minutely');
		if (!hourly) {
			return [];
		}

		const minutely: MinutelyWeather[] = [];
		byMinute = {};

		// Normalize temperatures to scale: [0, 1].
		const minTemperature = _.minBy(hourly, 'temperature')?.temperature ?? 0;
		const maxTemperature = _.maxBy(hourly, 'temperature')?.temperature ?? 0;
		const temperatureRange = maxTemperature - minTemperature;

		function makeMinuteData(
			minute: number,
			nextTemperature: number,
			precipitation: number,
			item: HourlyWeather
		) {
			const time = item.time + minute * 60;
			const temperature = (item.temperature * (60 - minute)) / 60 + (nextTemperature * minute) / 60;
			const timeFormatted = nsWeatherData.tzFormat(time, DATEFORMAT_MASK);
			const temperatureNormalized = ((temperature - minTemperature) / temperatureRange) * 0.8 + 0.1;
			const precipitationNormalized = 1 - Math.exp(-precipitation / 2);

			return {
				time,
				timeFormatted,
				temperature,
				temperatureNormalized,
				hourly: item,
				precipitation,
				precipitationNormalized,
				minute
			};
		}

		hourly.forEach((item, index, array) => {
			if (hourly && minutely && byMinute) {
				// Fake precipitation:
				const date = new Date(item.time * 1000);
				const precipitation = false && dev ? date.getHours() / 10 : item.precipitation;

				if (index < array.length - 1) {
					const nextTemperature = array[index + 1].temperature;

					function next(minute: number) {
						const currentTime = item.time + minute * 60;
						let step = 10;

						if (
							radar.timeStart &&
							radar.timeEnd &&
							(currentTime < radar.timeStart || currentTime >= radar.timeEnd)
						) {
							step = 30;
							while (step != 10 && !(minute + step == 30) && !(minute + step == 60)) {
								step -= 10;
							}
						}
						return minute + step;
					}

					for (let minute = 0; minute < 60; minute = next(minute)) {
						const minuteData = makeMinuteData(minute, nextTemperature, precipitation, item);
						minutely.push(minuteData);
						byMinute[minuteData.time] = minuteData;
					}
				}
			}
		});
		console.timeEnd('minutely');
		return minutely;
	});

	let units = $state({
		temperature: 'F'
	});

	let tracking = $state(false);

	const unitsUsed: Record<string, keyof typeof units> = {
		temperature: 'temperature',
		temperatureMax: 'temperature',
		temperatureMin: 'temperature',
		displayTemperature: 'temperature'
	};

	async function fetchOpenMeteo() {
		console.time('fetchOpenMeteo');
		const url =
			`https://api.open-meteo.com/v1/forecast?latitude=${coords?.latitude}&longitude=${coords?.longitude}` +
			`&current=temperature_2m,relative_humidity_2m,is_day,precipitation,rain,showers,snowfall,weather_code` +
			`&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,dew_point_2m` +
			`&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,precipitation_probability_max` +
			`&temperature_unit=fahrenheit&timeformat=unixtime&timezone=auto&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}`;

		const fetched = await fetch(url);

		const json = await fetched.json();

		timezone = json.timezone;
		timezoneAbbreviation = json.timezone_abbreviation;
		utcOffsetSeconds = json.utc_offset_seconds;

		current = {
			timeFormatted: nsWeatherData.tzFormat(json.current.time, DATEFORMAT_MASK),
			time: json.current.time,
			isDay: json.current.is_day === 1,
			weatherCode: json.current.weather_code,
			temperature: json.current.temperature_2m,

			precipitation: json.current.precipitation,
			rain: json.current.rain,
			humidity: json.current.relative_humidity_2m,
			showers: json.current.showers,
			snowfall: json.current.snowfall
		};

		const hourlyKeys = {
			weather_code: 'weatherCode',
			temperature_2m: 'temperature',
			relative_humidity_2m: 'relativeHumidity',
			dew_point_2m: 'dewPoint',
			precipitation_probability: 'precipitationProbability',
			precipitation: 'precipitation'
		};

		const dailyKeys = {
			weather_code: 'weatherCode',
			temperature_2m_max: 'temperatureMax',
			temperature_2m_min: 'temperatureMin',
			sunrise: 'sunrise',
			sunset: 'sunset',
			precipitation_sum: 'precipitation',
			rain_sum: 'rain',
			showers_sum: 'showers',
			snowfall_sum: 'snow',
			precipitation_hours: 'precipitationHours',
			precipitation_probability_max: 'precipitationProbabilityMax'
		};

		const now = +new Date() / 1000;

		hourly = _.map(json.hourly.time, (time, index: number) => {
			const fromNow = Math.floor((time - now) / 60 / 60) + 1; // Hours from now; no longer used...
			const object: Partial<HourlyWeather> = {
				timeFormatted: nsWeatherData.tzFormat(time, DATEFORMAT_MASK),
				time,
				fromNow
			};

			_.forEach(hourlyKeys, (newKey, openMeteoKey) => {
				object[newKey as keyof HourlyWeather] = json.hourly[openMeteoKey][index];
			});

			return object as HourlyWeather;
		});
		daily = _.map(json.daily.time, (time, index: number) => {
			const timeCompact = nsWeatherData.tzFormat(time, 'dd-DD');

			const object: Partial<DailyWeather> = {
				timeFormatted: nsWeatherData.tzFormat(time, DATEFORMAT_MASK),
				timeCompact: index === PAST_DAYS ? 'Today' : timeCompact,
				time,
				fromToday: index - PAST_DAYS
			};

			_.forEach(dailyKeys, (newKey, openMeteoKey) => {
				object[newKey as keyof DailyWeather] = json.daily[openMeteoKey][index];
			});

			return object as DailyWeather;
		});

		console.timeEnd('fetchOpenMeteo');

		emit('weatherdata_updatedData');
		gg('fetchOpenMeteo', { json: $state.snapshot(json), daily: $state.snapshot(daily) });
	}

	if (browser) {
		on('weatherdata_requestedFetchRainviewerData', async function () {
			// Load all the available map frames from RainViewer API.
			const fetched = await fetch('https://api.rainviewer.com/public/weather-maps.json');
			const rainviewerData = await fetched.json();

			const frames = (rainviewerData.radar.past || [])
				.concat(rainviewerData.radar.nowcast || [])
				.map((frame: { time: number }) => ({
					timeFormatted: nsWeatherData.tzFormat(frame.time, DATEFORMAT_MASK),
					...frame
				}));

			const timeStart = frames[0]?.time;
			const timeLast = frames.at(-1)?.time;
			const timeEnd = timeLast ? timeLast + 10 * 60 : undefined;

			radar = {
				generated: rainviewerData.generated,
				host: rainviewerData.host,
				frames,
				timeStart,
				timeEnd
			};
			emit('weatherdata_updatedRadar', { nsWeatherData });
		});

		on('weatherdata_requestedSetLocation', async function (params) {
			gg('weatherdata_requestedSetLocation', params);

			source = params.source;

			if (params.coords) {
				coords = {
					latitude: params.coords.latitude,
					longitude: params.coords.longitude,
					accuracy: params.coords.accuracy
				};
			} else if (params.name) {
				// coords = GEOCODE(params.name)
			}

			if (params.name) {
				name = params.name;
			} else if (params.coords) {
				name = '...';
				// name = REVERSE_GEOCODE(params.coords)
				const resp = await fetch(
					`/api/geo/reverse?lat=${params.coords.latitude}&lon=${params.coords.longitude}`
				);
				const json = await resp.json();
				const result = json[0];

				name = `${result.name}, ${result.country}`;
			}

			//gg({ name, coords, params });

			fetchOpenMeteo();
		});

		on('weatherdata_requestedSetTime', function (params) {
			// gg('weatherdata_requestedSetTime', params);

			time = params.time;
			const maxRadarTime = (radar.frames.at(-1)?.time || 0) + 10 * 60;
			if (time > maxRadarTime) {
				radarPlaying = false;
				if (!tracking) {
					time = +new Date() / 1000;
					resetRadarOnPlay = true;
				}
			}
		});

		on('weatherdata_requestedTrackingStart', function () {
			//gg('weatherdata_requestedTrackingStart', params.value);
			tracking = true;
		});

		on('weatherdata_requestedTrackingEnd', function () {
			//gg('weatherdata_requestedTrackingEnd', params.value);
			tracking = false;
			time = +new Date() / 1000;
		});

		on('weatherdata_requestedTogglePlay', function () {
			radarPlaying = !radarPlaying;

			if (resetRadarOnPlay) {
				time = radar.frames[0].time;
			}
			resetRadarOnPlay = false;
		});

		on('weatherdata_requestedToggleUnits', function (params) {
			if (params.temperature) {
				if (typeof params.temperature === 'string' && ['C', 'F'].includes(params.temperature)) {
					units.temperature = params.temperature;
				} else {
					units.temperature = units.temperature === 'F' ? 'C' : 'F';
				}
			}
		});
	}

	function formatTemperature(n: number, { unit, showUnits }: { unit: string; showUnits: boolean }) {
		if (unit === 'F') {
			let formatted = `${Math.round(n)}°`;
			if (showUnits) {
				formatted = formatted + 'F';
			}
			return formatted;
		}
		if (unit === 'C') {
			let formatted = `${celcius(n)?.toFixed(1)}°`;
			if (showUnits) {
				formatted = formatted + 'C';
			}
			return formatted;
		}
		return null;
	}

	const nsWeatherData = {
		get source() {
			return source;
		},

		get coords() {
			return coords;
		},

		get name() {
			return name;
		},

		get time() {
			return time;
		},

		get radar() {
			return radar;
		},

		get radarPlaying() {
			return radarPlaying;
		},

		get current() {
			return { ...current };
		},

		get minutely() {
			return minutely;
		},

		get hourly() {
			return hourly;
		},

		get daily() {
			return daily?.toSpliced(-1, 1);
		},

		get units() {
			return units;
		},

		get displayTemperature() {
			const nearestMinute = Math.floor(time / 600) * 600;
			return byMinute[nearestMinute]?.temperature ?? current?.temperature;
		},

		get displayWeatherCode() {
			const nearestMinute = Math.floor(time / 600) * 600;
			return byMinute[nearestMinute]?.hourly?.weatherCode ?? current?.weatherCode;
		},

		get displayHumidity() {
			const nearestMinute = Math.floor(time / 600) * 600;
			return byMinute[nearestMinute]?.hourly?.relativeHumidity ?? current?.humidity;
		},

		get displayDewPoint() {
			const nearestMinute = Math.floor(time / 600) * 600;
			const dewPoint = byMinute[nearestMinute]?.hourly?.dewPoint;

			return dewPoint
				? formatTemperature(dewPoint, { unit: units['temperature'], showUnits: false })
				: '...';
		},

		get displayPrecipitation() {
			const nearestMinute = Math.floor(time / 600) * 600;
			return byMinute[nearestMinute]?.precipitation ?? current?.precipitation;
		},

		get timezone() {
			return timezone;
		},

		get timezoneAbbreviation() {
			return timezoneAbbreviation;
		},

		get utcOffsetSeconds() {
			return utcOffsetSeconds;
		},

		// Converts units, rounds to appropriate digits, and adds units label.
		format(dataPath: string, showUnits = true) {
			const key = dataPath.replace(/.*\./, '') as keyof typeof unitsUsed;
			const unit = units[unitsUsed[key]];
			const n = _.get(nsWeatherData, dataPath);

			if (n === undefined) {
				return '...';
			}
			return formatTemperature(n, { unit, showUnits }) || `${n} unknown unit: ${unit}`;
		},

		tzFormat(time: number, format = 'ddd MMM D, h:mma z') {
			let day = dayjs.unix(time);
			if (timezone) {
				day = day;
			}

			return dayjs.unix(time).tz(timezone).format(format).replace('z', timezoneAbbreviation);
		}
	};

	return nsWeatherData;
}
