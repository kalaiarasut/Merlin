import { create } from 'zustand';
import { MapLayer } from '../types';

interface MapState {
  layers: MapLayer[];
  selectedLayers: string[];
  baseMap: 'osm' | 'satellite' | 'terrain';
  center: [number, number];
  zoom: number;
  timeRange: [Date | null, Date | null];
  
  addLayer: (layer: MapLayer) => void;
  removeLayer: (layerId: string) => void;
  toggleLayer: (layerId: string) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  setBaseMap: (baseMap: 'osm' | 'satellite' | 'terrain') => void;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setTimeRange: (range: [Date | null, Date | null]) => void;
}

export const useMapStore = create<MapState>((set) => ({
  layers: [],
  selectedLayers: [],
  baseMap: 'osm',
  center: [15, 75], // Center on India
  zoom: 5,
  timeRange: [null, null],

  addLayer: (layer) =>
    set((state) => ({
      layers: [...state.layers, layer],
      selectedLayers: [...state.selectedLayers, layer.id],
    })),

  removeLayer: (layerId) =>
    set((state) => ({
      layers: state.layers.filter((l) => l.id !== layerId),
      selectedLayers: state.selectedLayers.filter((id) => id !== layerId),
    })),

  toggleLayer: (layerId) =>
    set((state) => ({
      selectedLayers: state.selectedLayers.includes(layerId)
        ? state.selectedLayers.filter((id) => id !== layerId)
        : [...state.selectedLayers, layerId],
    })),

  setLayerOpacity: (layerId, opacity) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === layerId ? { ...l, opacity } : l
      ),
    })),

  setBaseMap: (baseMap) => set({ baseMap }),
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setTimeRange: (timeRange) => set({ timeRange }),
}));
