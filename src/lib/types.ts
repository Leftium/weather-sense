import type { TileLayer } from 'leaflet';

export type Coordinates = {
	latitude: number;
	longitude: number;
	accuracy: number;
};

export type RadarFrame = {
	ms: number;
	path: string;
};

export type Radar = {
	generatedPretty?: string;
	generated: number;
	host: string;
	frames: RadarFrame[];

	msStart?: number;
	msEnd?: number;
};

export type RadarLayer =
	| {
			__brand: 'RadarMap';
			index: number;
			ms: number;
			loaded: boolean;
			tileLayer: TileLayer;
	  }
	| {
			__brand: 'RadarMapLibre';
			index: number;
			ms: number;
			loaded: boolean;
			layerId: string;
			sourceId: string;
	  };
