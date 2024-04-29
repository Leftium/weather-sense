import type { TileLayer } from 'leaflet';

export type RadarLayer = {
	index: number;
	time: number;
	loaded: boolean;
	tileLayer: TileLayer;
};
