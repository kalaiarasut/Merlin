/**
 * EnhancedLegend Component
 * 
 * Improved legend with gradient color scales, min/max values,
 * and data source attribution.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { DataSourceBadge, DataSourceType, DataType } from './DataSourceBadge';

interface LegendProps {
    parameter: string;
    unit: string;
    min: number;
    max: number;
    colorScale?: 'temperature' | 'salinity' | 'chlorophyll' | 'dissolved_oxygen' | 'pH' | 'default';
    source?: DataSourceType;
    dataType?: DataType;
    dataPoints?: number;
    totalGridCells?: number;  // Total grid cells before sampling
    stride?: number;           // Sampling stride used
    zoomLevel?: number;        // Current map zoom level
    className?: string;
}

const colorScales = {
    temperature: [
        { stop: 0, color: '#3b82f6' },    // Blue (cold)
        { stop: 25, color: '#22c55e' },   // Green (normal)
        { stop: 50, color: '#eab308' },   // Yellow (warm)
        { stop: 75, color: '#f97316' },   // Orange (hot)
        { stop: 100, color: '#ef4444' },  // Red (very hot)
    ],
    salinity: [
        { stop: 0, color: '#dbeafe' },    // Light blue (low)
        { stop: 50, color: '#3b82f6' },   // Blue (normal)
        { stop: 100, color: '#1e3a8a' },  // Dark blue (high)
    ],
    chlorophyll: [
        // Ocean color palette for log-distributed chlorophyll
        { stop: 0, color: '#3b82f6' },    // Blue - oligotrophic (<0.1)
        { stop: 15, color: '#06b6d4' },   // Cyan - low
        { stop: 30, color: '#22c55e' },   // Green - moderate
        { stop: 45, color: '#84cc16' },   // Lime - mesotrophic
        { stop: 60, color: '#eab308' },   // Yellow - productive
        { stop: 80, color: '#f97316' },   // Orange - high bloom
        { stop: 100, color: '#ef4444' },  // Red - extreme bloom
    ],
    dissolved_oxygen: [
        { stop: 0, color: '#ef4444' },    // Red (hypoxic - danger)
        { stop: 20, color: '#f97316' },   // Orange (low)
        { stop: 40, color: '#fbbf24' },   // Amber (marginal)
        { stop: 60, color: '#22c55e' },   // Green (good)
        { stop: 80, color: '#06b6d4' },   // Cyan (very good)
        { stop: 100, color: '#3b82f6' },  // Blue (excellent)
    ],
    pH: [
        // Perceptually uniform palette for tight pH range (7.95-8.15)
        { stop: 0, color: '#ef4444' },    // Red (acidifying - warning)
        { stop: 20, color: '#fb923c' },   // Light orange (low end)
        { stop: 40, color: '#fbbf24' },   // Amber (below normal)
        { stop: 60, color: '#14b8a6' },   // Teal (normal ~8.05)
        { stop: 80, color: '#06b6d4' },   // Cyan (slightly alkaline)
        { stop: 100, color: '#3b82f6' },  // Blue (alkaline)
    ],
    default: [
        { stop: 0, color: '#dbeafe' },
        { stop: 50, color: '#3b82f6' },
        { stop: 100, color: '#1e3a8a' },
    ],
};

export function EnhancedLegend({
    parameter,
    unit,
    min,
    max,
    colorScale = 'default',
    source,
    dataType = 'observed',
    dataPoints,
    totalGridCells,
    stride,
    zoomLevel,
    className,
}: LegendProps) {
    // Generate gradient CSS
    const gradientStyle = useMemo(() => {
        const scale = colorScales[colorScale] || colorScales.default;
        const gradientStops = scale
            .map(s => `${s.color} ${s.stop}%`)
            .join(', ');
        return {
            background: `linear-gradient(to right, ${gradientStops})`,
        };
    }, [colorScale]);

    // Format value with appropriate precision
    const formatValue = (value: number) => {
        if (Math.abs(value) < 1) return value.toFixed(2);
        if (Math.abs(value) < 10) return value.toFixed(1);
        return Math.round(value).toString();
    };

    // Get parameter display name
    const getParameterLabel = (param: string) => {
        const labels: Record<string, string> = {
            temperature: 'Sea Surface Temperature',
            salinity: 'Sea Surface Salinity',
            chlorophyll: 'Chlorophyll-a Concentration',
            dissolved_oxygen: 'Dissolved Oxygen',
            ph: 'pH Level',
            sst: 'Sea Surface Temperature',
        };
        return labels[param.toLowerCase()] || param;
    };

    return (
        <div className={cn(
            'bg-white/95 backdrop-blur-sm rounded-lg border border-gray-200 shadow-lg p-3 min-w-[200px]',
            className
        )}>
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-gray-700">
                    {getParameterLabel(parameter)}
                </h4>
                {source && (
                    <DataSourceBadge
                        source={source}
                        dataType={dataType}
                        className="text-[10px] py-0 px-1.5"
                    />
                )}
            </div>

            {/* Color Bar */}
            <div className="relative mb-1">
                <div
                    className="h-3 rounded-sm w-full"
                    style={gradientStyle}
                />
            </div>

            {/* Min/Max Labels */}
            <div className="flex justify-between text-xs text-gray-600 mb-2">
                <span>{formatValue(min)} {unit}</span>
                <span>{formatValue(max)} {unit}</span>
            </div>

            {/* Data Points Count with Sampling Info */}
            {dataPoints !== undefined && (
                <div className="text-xs text-gray-600 border-t pt-1.5 mt-1.5">
                    {totalGridCells ? (
                        <>
                            <span>Showing {dataPoints.toLocaleString()} of ~{totalGridCells.toLocaleString()} grid cells</span>
                            {(zoomLevel !== undefined || stride) && (
                                <span className="block text-[10px] text-gray-500 mt-0.5">
                                    {zoomLevel !== undefined && `Zoom: ${zoomLevel}`}
                                    {zoomLevel !== undefined && stride && stride > 1 && ' • '}
                                    {stride && stride > 1 && `Stride: ${stride}x (sampled)`}
                                </span>
                            )}
                            {/* Data availability warning when coverage < 5% */}
                            {dataPoints < totalGridCells * 0.05 && (
                                <span className="block text-[10px] text-amber-500 mt-1">
                                    ⚠ Limited valid observations for this region
                                </span>
                            )}
                        </>
                    ) : (
                        <span>{dataPoints.toLocaleString()} data points</span>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Compact inline legend for map overlay
 */
export function CompactLegend({
    parameter,
    unit,
    min,
    max,
    colorScale = 'default',
}: Pick<LegendProps, 'parameter' | 'unit' | 'min' | 'max' | 'colorScale'>) {
    const scale = colorScales[colorScale] || colorScales.default;
    const gradientStops = scale.map(s => `${s.color} ${s.stop}%`).join(', ');

    return (
        <div className="flex items-center gap-2 bg-white/90 rounded px-2 py-1 text-xs">
            <span className="text-gray-600 capitalize font-medium">{parameter}</span>
            <div className="flex items-center gap-1">
                <span className="text-gray-500">{min}</span>
                <div
                    className="w-16 h-2 rounded-sm"
                    style={{ background: `linear-gradient(to right, ${gradientStops})` }}
                />
                <span className="text-gray-500">{max}</span>
                <span className="text-gray-400">{unit}</span>
            </div>
        </div>
    );
}

export default EnhancedLegend;
