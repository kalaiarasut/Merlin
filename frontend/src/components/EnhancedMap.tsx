/**
 * Enhanced Map Component with advanced features
 * 
 * Features:
 * - Point clustering for large datasets
 * - Heatmap visualization
 * - Drawing tools for spatial queries
 * - Layer controls
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.heat';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet.markercluster';
import 'leaflet-draw';
import { Layers, Map as MapIcon, Thermometer, Pencil, Trash2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export interface MapPoint {
  lat: number;
  lng: number;
  value?: number;
  label?: string;
  data?: Record<string, any>;
}

export interface DrawnShape {
  type: 'polygon' | 'rectangle' | 'circle';
  coordinates: number[][] | { center: [number, number]; radius: number };
  layer: L.Layer;
}

interface EnhancedMapProps {
  points: MapPoint[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  showClustering?: boolean;
  showHeatmap?: boolean;
  showDrawingTools?: boolean;
  heatmapOptions?: {
    radius?: number;
    blur?: number;
    maxZoom?: number;
    gradient?: Record<number, string>;
  };
  clusterOptions?: {
    maxClusterRadius?: number;
    spiderfyOnMaxZoom?: boolean;
    showCoverageOnHover?: boolean;
    disableClusteringAtZoom?: number;
  };
  onPointClick?: (point: MapPoint) => void;
  onShapeDrawn?: (shape: DrawnShape) => void;
  onShapeDeleted?: (shape: DrawnShape) => void;
  className?: string;
}

type ViewMode = 'markers' | 'clusters' | 'heatmap';

export default function EnhancedMap({
  points,
  center = [10.0, 76.0], // Default to Indian Ocean
  zoom = 6,
  height = '500px',
  showClustering = true,
  showHeatmap = true,
  showDrawingTools = true,
  heatmapOptions = {},
  clusterOptions = {},
  onPointClick,
  onShapeDrawn,
  onShapeDeleted,
  className,
}: EnhancedMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const heatmapRef = useRef<any>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('clusters');
  const [drawnShapes, setDrawnShapes] = useState<DrawnShape[]>([]);

  // Default heatmap gradient
  const defaultGradient = {
    0.0: '#3b82f6',
    0.25: '#22c55e',
    0.5: '#eab308',
    0.75: '#f97316',
    1.0: '#ef4444',
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Create map
    const map = L.map(mapContainer.current, {
      center,
      zoom,
      zoomControl: true,
    });

    // Add base layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    });

    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '© Esri' }
    );

    const oceanLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
      { attribution: '© Esri' }
    );

    osmLayer.addTo(map);

    // Layer control
    L.control.layers(
      {
        'OpenStreetMap': osmLayer,
        'Satellite': satelliteLayer,
        'Ocean': oceanLayer,
      },
      {},
      { position: 'topright' }
    ).addTo(map);

    // Initialize layers
    markersRef.current = L.layerGroup().addTo(map);
    clusterRef.current = (L as any).markerClusterGroup({
      maxClusterRadius: clusterOptions.maxClusterRadius || 50,
      spiderfyOnMaxZoom: clusterOptions.spiderfyOnMaxZoom ?? true,
      showCoverageOnHover: clusterOptions.showCoverageOnHover ?? false,
      disableClusteringAtZoom: clusterOptions.disableClusteringAtZoom || 18,
      chunkedLoading: true,
    });
    drawnItemsRef.current = new L.FeatureGroup().addTo(map);

    // Initialize drawing tools
    if (showDrawingTools) {
      drawControlRef.current = new (L.Control as any).Draw({
        position: 'topleft',
        draw: {
          polyline: false,
          polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: {
              color: '#0891b2',
              fillColor: '#0891b2',
              fillOpacity: 0.2,
            },
          },
          rectangle: {
            shapeOptions: {
              color: '#0891b2',
              fillColor: '#0891b2',
              fillOpacity: 0.2,
            },
          },
          circle: {
            shapeOptions: {
              color: '#0891b2',
              fillColor: '#0891b2',
              fillOpacity: 0.2,
            },
          },
          marker: false,
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItemsRef.current,
          remove: true,
        },
      });
      map.addControl(drawControlRef.current);

      // Handle draw events
      map.on(L.Draw.Event.CREATED, (e: any) => {
        const layer = e.layer;
        drawnItemsRef.current?.addLayer(layer);

        let shape: DrawnShape;
        if (e.layerType === 'polygon' || e.layerType === 'rectangle') {
          const coords = layer.getLatLngs()[0].map((ll: L.LatLng) => [ll.lat, ll.lng]);
          shape = { type: e.layerType, coordinates: coords, layer };
        } else if (e.layerType === 'circle') {
          const center = layer.getLatLng();
          shape = {
            type: 'circle',
            coordinates: { center: [center.lat, center.lng], radius: layer.getRadius() },
            layer,
          };
        } else {
          return;
        }

        setDrawnShapes(prev => [...prev, shape]);
        onShapeDrawn?.(shape);
      });

      map.on(L.Draw.Event.DELETED, (e: any) => {
        e.layers.eachLayer((layer: L.Layer) => {
          const shape = drawnShapes.find(s => s.layer === layer);
          if (shape) {
            setDrawnShapes(prev => prev.filter(s => s.layer !== layer));
            onShapeDeleted?.(shape);
          }
        });
      });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update points based on view mode
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    // Clear all point layers
    markersRef.current?.clearLayers();
    clusterRef.current?.clearLayers();
    if (heatmapRef.current) {
      map.removeLayer(heatmapRef.current);
      heatmapRef.current = null;
    }

    if (points.length === 0) return;

    switch (viewMode) {
      case 'markers':
        // Simple markers
        points.forEach(point => {
          const marker = L.marker([point.lat, point.lng])
            .bindPopup(createPopupContent(point))
            .on('click', () => onPointClick?.(point));
          markersRef.current?.addLayer(marker);
        });
        markersRef.current?.addTo(map);
        break;

      case 'clusters':
        // Clustered markers
        points.forEach(point => {
          const marker = L.marker([point.lat, point.lng])
            .bindPopup(createPopupContent(point))
            .on('click', () => onPointClick?.(point));
          clusterRef.current?.addLayer(marker);
        });
        clusterRef.current?.addTo(map);
        break;

      case 'heatmap':
        // Heatmap layer
        const heatData = points.map(p => [
          p.lat,
          p.lng,
          p.value ?? 1,
        ]);

        heatmapRef.current = (L as any).heatLayer(heatData, {
          radius: heatmapOptions.radius || 25,
          blur: heatmapOptions.blur || 15,
          maxZoom: heatmapOptions.maxZoom || 17,
          gradient: heatmapOptions.gradient || defaultGradient,
          minOpacity: 0.3,
        }).addTo(map);
        break;
    }
  }, [points, viewMode, onPointClick, heatmapOptions]);

  // Create popup content
  const createPopupContent = useCallback((point: MapPoint): string => {
    let content = `<div class="p-2">`;
    if (point.label) {
      content += `<strong>${point.label}</strong><br>`;
    }
    content += `<span class="text-sm">Lat: ${point.lat.toFixed(4)}, Lng: ${point.lng.toFixed(4)}</span>`;
    if (point.value !== undefined) {
      content += `<br><span class="text-sm">Value: ${point.value}</span>`;
    }
    if (point.data) {
      Object.entries(point.data).slice(0, 5).forEach(([key, value]) => {
        content += `<br><span class="text-xs text-gray-600">${key}: ${value}</span>`;
      });
    }
    content += `</div>`;
    return content;
  }, []);

  // Clear all drawn shapes
  const clearDrawnShapes = useCallback(() => {
    drawnItemsRef.current?.clearLayers();
    setDrawnShapes([]);
  }, []);

  // Get points within drawn shapes
  const getPointsInShapes = useCallback((): MapPoint[] => {
    if (drawnShapes.length === 0) return points;

    return points.filter(point => {
      return drawnShapes.some(shape => {
        if (shape.type === 'circle') {
          const coords = shape.coordinates as { center: [number, number]; radius: number };
          const distance = mapRef.current?.distance(
            L.latLng(point.lat, point.lng),
            L.latLng(coords.center[0], coords.center[1])
          );
          return distance !== undefined && distance <= coords.radius;
        } else {
          const coords = shape.coordinates as [number, number][];
          const polygon = L.polygon(coords);
          return polygon.getBounds().contains(L.latLng(point.lat, point.lng));
        }
      });
    });
  }, [points, drawnShapes]);

  return (
    <div className={cn('relative rounded-lg overflow-hidden border', className)}>
      {/* Controls */}
      <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-1 flex flex-col gap-1">
          <button
            onClick={() => setViewMode('markers')}
            className={cn(
              'p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
              viewMode === 'markers' && 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300'
            )}
            title="Simple Markers"
          >
            <MapIcon className="w-4 h-4" />
          </button>

          {showClustering && (
            <button
              onClick={() => setViewMode('clusters')}
              className={cn(
                'p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                viewMode === 'clusters' && 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300'
              )}
              title="Clustered Markers"
            >
              <Layers className="w-4 h-4" />
            </button>
          )}

          {showHeatmap && (
            <button
              onClick={() => setViewMode('heatmap')}
              className={cn(
                'p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                viewMode === 'heatmap' && 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300'
              )}
              title="Heatmap"
            >
              <Thermometer className="w-4 h-4" />
            </button>
          )}
        </div>

        {showDrawingTools && drawnShapes.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-1">
            <button
              onClick={clearDrawnShapes}
              className="p-2 rounded hover:bg-red-100 dark:hover:bg-red-900 text-red-600 transition-colors"
              title="Clear All Shapes"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-white/90 dark:bg-gray-800/90 rounded-lg shadow-md px-3 py-1.5 text-xs">
        <span className="text-gray-600 dark:text-gray-400">
          {points.length.toLocaleString()} points
          {drawnShapes.length > 0 && ` • ${getPointsInShapes().length} selected`}
        </span>
      </div>

      {/* Heatmap Legend */}
      {viewMode === 'heatmap' && (
        <div className="absolute bottom-2 right-2 z-[1000] bg-white/90 dark:bg-gray-800/90 rounded-lg shadow-md p-2">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Intensity</div>
          <div
            className="h-2 w-24 rounded"
            style={{
              background: `linear-gradient(to right, ${Object.values(heatmapOptions.gradient || defaultGradient).join(', ')})`
            }}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-0.5">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>
      )}

      {/* Map container */}
      <div ref={mapContainer} style={{ height, width: '100%' }} />
    </div>
  );
}

