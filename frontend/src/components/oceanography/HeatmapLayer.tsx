/**
 * HeatmapLayer Component
 * 
 * Renders a heatmap visualization of oceanographic data on Leaflet map.
 * Uses canvas-based rendering for performance with large datasets.
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

// Extend Leaflet types for heat plugin
declare module 'leaflet' {
    function heatLayer(
        latlngs: Array<[number, number, number?]>,
        options?: HeatLayerOptions
    ): HeatLayer;

    interface HeatLayerOptions {
        radius?: number;
        blur?: number;
        maxZoom?: number;
        max?: number;
        minOpacity?: number;
        gradient?: Record<number, string>;
    }

    interface HeatLayer extends L.Layer {
        setLatLngs(latlngs: Array<[number, number, number?]>): this;
        addLatLng(latlng: [number, number, number?]): this;
        setOptions(options: HeatLayerOptions): this;
        redraw(): this;
    }
}

export interface HeatmapPoint {
    latitude: number;
    longitude: number;
    value: number;
}

interface HeatmapLayerProps {
    data: HeatmapPoint[];
    parameter: 'temperature' | 'salinity' | 'chlorophyll' | 'default';
    minValue?: number;
    maxValue?: number;
    radius?: number;
    blur?: number;
    opacity?: number;
    visible?: boolean;
}

// Color gradients for different parameters
const gradients: Record<string, Record<number, string>> = {
    temperature: {
        0.0: '#3b82f6',  // Blue (cold)
        0.25: '#22c55e', // Green
        0.5: '#eab308',  // Yellow
        0.75: '#f97316', // Orange
        1.0: '#ef4444',  // Red (hot)
    },
    salinity: {
        0.0: '#dbeafe',  // Light blue
        0.5: '#3b82f6',  // Blue
        1.0: '#1e3a8a',  // Dark blue
    },
    chlorophyll: {
        0.0: '#fef3c7',  // Light yellow
        0.25: '#84cc16', // Lime
        0.5: '#22c55e',  // Green
        0.75: '#059669', // Emerald
        1.0: '#064e3b',  // Dark green
    },
    default: {
        0.0: '#dbeafe',
        0.5: '#3b82f6',
        1.0: '#1e3a8a',
    },
};

export function HeatmapLayer({
    data,
    parameter,
    minValue,
    maxValue,
    radius = 25,
    blur = 15,
    opacity = 0.6,
    visible = true,
}: HeatmapLayerProps) {
    const map = useMap();
    const heatLayerRef = useRef<L.HeatLayer | null>(null);

    useEffect(() => {
        if (!visible) {
            // Remove layer if not visible
            if (heatLayerRef.current) {
                map.removeLayer(heatLayerRef.current);
                heatLayerRef.current = null;
            }
            return;
        }

        if (data.length === 0) return;

        // Calculate min/max if not provided (using reduce to avoid stack overflow on large arrays)
        const min = minValue ?? data.reduce((m, d) => d.value < m ? d.value : m, data[0]?.value ?? 0);
        const max = maxValue ?? data.reduce((m, d) => d.value > m ? d.value : m, data[0]?.value ?? 0);
        const range = max - min || 1;

        // Normalize data points to [0, 1] intensity
        const heatPoints: Array<[number, number, number]> = data.map(point => [
            point.latitude,
            point.longitude,
            Math.max(0.1, (point.value - min) / range), // Intensity
        ]);

        // Get gradient for parameter
        const gradient = gradients[parameter] || gradients.default;

        // Create or update heat layer
        if (heatLayerRef.current) {
            heatLayerRef.current.setLatLngs(heatPoints);
            heatLayerRef.current.setOptions({
                radius,
                blur,
                minOpacity: opacity,
                gradient,
            });
            heatLayerRef.current.redraw();
        } else {
            heatLayerRef.current = L.heatLayer(heatPoints, {
                radius,
                blur,
                maxZoom: 10,
                max: 1.0,
                minOpacity: opacity,
                gradient,
            });
            heatLayerRef.current.addTo(map);
        }

        // Cleanup on unmount
        return () => {
            if (heatLayerRef.current) {
                map.removeLayer(heatLayerRef.current);
                heatLayerRef.current = null;
            }
        };
    }, [map, data, parameter, minValue, maxValue, radius, blur, opacity, visible]);

    return null; // This component doesn't render anything directly
}

export default HeatmapLayer;
