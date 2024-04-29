import type { TileLayer } from 'leaflet';

export type Coordinates = {
	latitude: number;
	longitude: number;
	accuracy: number;
};

export type RadarFrame = {
	time: number;
	path: string;
};

export type Radar = {
	generated: number;
	host: string;
	frames: RadarFrame[];
};

export type RadarLayer = {
	index: number;
	time: number;
	loaded: boolean;
	tileLayer: TileLayer;
};
