/**
 * GriddedHeatmapLayer Component
 * 
 * Renders ERDDAP satellite data as a proper interpolated grid using canvas.
 * Unlike point-based heatmaps, this creates a grid of colored cells that
 * represent the actual data resolution from satellite observations.
 */

import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export interface GridPoint {
    latitude: number;
    longitude: number;
    value: number;
}

interface GriddedHeatmapLayerProps {
    data: GridPoint[];
    parameter: 'temperature' | 'salinity' | 'chlorophyll';
    opacity?: number;
    visible?: boolean;
    minValue?: number;
    maxValue?: number;
    zoomLevel?: number;  // Current map zoom level for resolution control
}

// Soft/Hard parameter ranges for stable color scaling
// - softMin/softMax: Used for color scale normalization
// - hardMin/hardMax: Values outside are clamped
const PARAMETER_RANGES: Record<string, { softMin: number; softMax: number; hardMin: number; hardMax: number; useLogScale?: boolean }> = {
    temperature: { softMin: 20, softMax: 32, hardMin: -2, hardMax: 40 },
    salinity: { softMin: 32, softMax: 38, hardMin: 0, hardMax: 42 },
    // Chlorophyll uses log10 scale: log10(0.01) = -2, log10(10) = 1
    chlorophyll: { softMin: -2, softMax: 1, hardMin: -3, hardMax: 2, useLogScale: true },
};

// Color scales for different parameters
const colorScales: Record<string, { stops: [number, string][] }> = {
    temperature: {
        stops: [
            [0, '#313695'],    // Deep blue (cold)
            [0.15, '#4575b4'],
            [0.3, '#74add1'],
            [0.4, '#abd9e9'],
            [0.5, '#ffffbf'],  // Yellow (neutral)
            [0.6, '#fee090'],
            [0.7, '#fdae61'],
            [0.85, '#f46d43'],
            [1, '#a50026'],    // Deep red (hot)
        ],
    },
    salinity: {
        stops: [
            [0, '#f7fbff'],
            [0.25, '#c6dbef'],
            [0.5, '#6baed6'],
            [0.75, '#2171b5'],
            [1, '#084594'],
        ],
    },
    chlorophyll: {
        stops: [
            [0, '#ffffd9'],
            [0.25, '#c7e9b4'],
            [0.5, '#41b6c4'],
            [0.75, '#225ea8'],
            [1, '#081d58'],
        ],
    },
};

/**
 * Interpolate color from a color scale
 * Supports log transform for chlorophyll
 */
function getColorForValue(
    value: number,
    min: number,
    max: number,
    parameter: string,
    useLogScale: boolean = false
): string {
    // Apply log transform if needed (for chlorophyll)
    const transformedValue = useLogScale ? Math.log10(Math.max(value, 0.001)) : value;
    const transformedMin = useLogScale ? Math.log10(Math.max(min, 0.001)) : min;
    const transformedMax = useLogScale ? Math.log10(Math.max(max, 0.001)) : max;

    const normalized = Math.max(0, Math.min(1, (transformedValue - transformedMin) / (transformedMax - transformedMin || 1)));
    const scale = colorScales[parameter] || colorScales.temperature;
    const stops = scale.stops;

    // Find the two stops to interpolate between
    let lower = stops[0];
    let upper = stops[stops.length - 1];

    for (let i = 0; i < stops.length - 1; i++) {
        if (normalized >= stops[i][0] && normalized <= stops[i + 1][0]) {
            lower = stops[i];
            upper = stops[i + 1];
            break;
        }
    }

    // Interpolate between the two colors
    const range = upper[0] - lower[0] || 1;
    const t = (normalized - lower[0]) / range;

    return interpolateColor(lower[1], upper[1], t);
}

/**
 * Interpolate between two hex colors
 */
function interpolateColor(color1: string, color2: string, t: number): string {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Estimate grid cell size from data points
 */
function estimateGridCellSize(data: GridPoint[]): { latStep: number; lonStep: number } {
    if (data.length < 2) return { latStep: 0.25, lonStep: 0.25 };

    // Sort by latitude and longitude to find smallest steps
    const lats = [...new Set(data.map(p => p.latitude))].sort((a, b) => a - b);
    const lons = [...new Set(data.map(p => p.longitude))].sort((a, b) => a - b);

    let latStep = 0.25;
    let lonStep = 0.25;

    if (lats.length >= 2) {
        const diffs = [];
        for (let i = 1; i < Math.min(lats.length, 10); i++) {
            diffs.push(Math.abs(lats[i] - lats[i - 1]));
        }
        latStep = diffs.reduce((a, b) => a + b, 0) / diffs.length || 0.25;
    }

    if (lons.length >= 2) {
        const diffs = [];
        for (let i = 1; i < Math.min(lons.length, 10); i++) {
            diffs.push(Math.abs(lons[i] - lons[i - 1]));
        }
        lonStep = diffs.reduce((a, b) => a + b, 0) / diffs.length || 0.25;
    }

    return { latStep, lonStep };
}

export function GriddedHeatmapLayer({
    data,
    parameter,
    opacity = 0.7,
    visible = true,
    minValue,
    maxValue,
    zoomLevel = 5,
}: GriddedHeatmapLayerProps) {
    const map = useMap();
    const overlayRef = useRef<L.ImageOverlay | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [, setUpdateTrigger] = useState(0);

    // Check if zoom level allows gridded heatmap
    const isZoomSufficient = zoomLevel >= 4;

    useEffect(() => {
        // Disable at low zoom levels
        if (!visible || data.length === 0 || !isZoomSufficient) {
            if (overlayRef.current) {
                map.removeLayer(overlayRef.current);
                overlayRef.current = null;
            }
            return;
        }

        // Get parameter range settings
        const paramRange = PARAMETER_RANGES[parameter] || PARAMETER_RANGES.temperature;
        const useLogScale = paramRange.useLogScale || false;

        // Calculate bounds from data
        const lats = data.map(p => p.latitude);
        const lons = data.map(p => p.longitude);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);

        // Use FIXED soft ranges for stable color scaling (no zoom flicker)
        // Values outside soft range are clamped to hard range
        const values = data.map(p => p.value).filter(v => v !== null && !isNaN(v));
        const min = minValue ?? paramRange.softMin;
        const max = maxValue ?? paramRange.softMax;

        // Estimate grid cell size
        const { latStep, lonStep } = estimateGridCellSize(data);

        // Create canvas for rendering
        if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
        }
        const canvas = canvasRef.current;

        // Calculate grid dimensions
        const gridWidth = Math.ceil((maxLon - minLon) / lonStep) + 1;
        const gridHeight = Math.ceil((maxLat - minLat) / latStep) + 1;

        // Set canvas size (limit for performance)
        const maxCanvasSize = 1024;
        const scale = Math.min(1, maxCanvasSize / Math.max(gridWidth, gridHeight));
        canvas.width = Math.max(1, Math.round(gridWidth * scale));
        canvas.height = Math.max(1, Math.round(gridHeight * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // ============================================================
        // GRID-INDEX BASED ASSIGNMENT (scientifically correct approach)
        // Each data point belongs to exactly one grid cell.
        // No distance-based spreading or interpolation.
        // ============================================================

        // Step 1: Create sparse grid - snap each data point to its grid cell
        // Key: "i,j" (grid indices), Value: observation value
        const gridData = new Map<string, number>();

        data.forEach(point => {
            // Snap to grid indices (which cell does this observation belong to?)
            const i = Math.round((point.longitude - minLon) / lonStep);
            const j = Math.round((maxLat - point.latitude) / latStep); // Flip Y axis

            // Validate indices are within bounds
            if (i >= 0 && i < gridWidth && j >= 0 && j < gridHeight) {
                const key = `${i},${j}`;
                // If multiple points map to same cell, keep the first (or could average)
                if (!gridData.has(key)) {
                    gridData.set(key, point.value);
                }
            }
        });

        // Cell size in pixels
        const cellWidth = canvas.width / gridWidth;
        const cellHeight = canvas.height / gridHeight;

        // Step 2: Render ALL grid cells, but color only those with values
        for (let i = 0; i < gridWidth; i++) {
            for (let j = 0; j < gridHeight; j++) {
                const key = `${i},${j}`;
                const cellValue = gridData.get(key);

                // Only render cells with actual observations
                // Empty cells remain transparent (no interpolation)
                if (cellValue !== undefined && cellValue !== null && !isNaN(cellValue)) {
                    // Clamp to hard range to prevent outlier distortion
                    const clampedValue = Math.max(
                        paramRange.hardMin,
                        Math.min(paramRange.hardMax, cellValue)
                    );
                    const color = getColorForValue(clampedValue, min, max, parameter, useLogScale);
                    ctx.fillStyle = color;
                    ctx.fillRect(
                        Math.floor(i * cellWidth),
                        Math.floor(j * cellHeight),
                        Math.ceil(cellWidth) + 1,
                        Math.ceil(cellHeight) + 1
                    );
                }
                // Cells without observations remain transparent
            }
        }

        // Create image overlay
        const bounds = L.latLngBounds(
            [minLat - latStep / 2, minLon - lonStep / 2],
            [maxLat + latStep / 2, maxLon + lonStep / 2]
        );

        const imageUrl = canvas.toDataURL('image/png');

        if (overlayRef.current) {
            overlayRef.current.setUrl(imageUrl);
            overlayRef.current.setBounds(bounds);
            overlayRef.current.setOpacity(opacity);
        } else {
            overlayRef.current = L.imageOverlay(imageUrl, bounds, {
                opacity,
                interactive: false,
            });
            overlayRef.current.addTo(map);
        }

        // Force component update
        setUpdateTrigger(prev => prev + 1);

        return () => {
            if (overlayRef.current) {
                map.removeLayer(overlayRef.current);
                overlayRef.current = null;
            }
        };
    }, [map, data, parameter, opacity, visible, minValue, maxValue, isZoomSufficient]);

    // Update on map move/zoom
    useEffect(() => {
        const handleMoveEnd = () => {
            setUpdateTrigger(prev => prev + 1);
        };

        map.on('moveend', handleMoveEnd);
        map.on('zoomend', handleMoveEnd);

        return () => {
            map.off('moveend', handleMoveEnd);
            map.off('zoomend', handleMoveEnd);
        };
    }, [map]);

    return null;
}

export default GriddedHeatmapLayer;
