/**
 * LayerControl Component
 * 
 * Unified control panel for map layers:
 * - Data source selection (ERDDAP, Database)
 * - Layer toggles (Heatmap, Markers, Satellite)
 * - Opacity controls
 * 
 * NOTE: No demo/simulation mode. Real data only with fallback to cache.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    Layers,
    Satellite,
    MapPin,
    Waves,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Database,
    Grid
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type DataSourceMode = 'erddap' | 'database';
export type VisibleLayer = 'markers' | 'heatmap' | 'gridded_heatmap' | 'nasa_wms';

interface LayerControlProps {
    // Layers
    visibleLayers: VisibleLayer[];
    onLayerToggle: (layer: VisibleLayer) => void;

    // Actions
    onRefresh: () => void;
    isLoading?: boolean;

    // Stats
    dataPointCount?: number;
    totalGridCells?: number;
    zoomLevel?: number;
    stride?: number;
    lastUpdated?: string;

    // Error state
    hasError?: boolean;
    errorMessage?: string;

    className?: string;
}


export function LayerControl({
    visibleLayers,
    onLayerToggle,
    onRefresh,
    isLoading = false,
    dataPointCount,
    totalGridCells,
    zoomLevel,
    stride,
    lastUpdated,
    className,
}: LayerControlProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    const isLayerVisible = (layer: VisibleLayer) => visibleLayers.includes(layer);

    return (
        <Card className={cn(
            'w-full bg-white shadow-sm border-gray-200',
            className
        )}>
            {/* Header */}
            <CardHeader
                className="pb-3 cursor-pointer hover:bg-gray-50/50 transition-colors rounded-t-xl"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Layers className="w-4 h-4 text-ocean-500" />
                        Layer Controls
                    </CardTitle>
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                    )}
                </div>
            </CardHeader>

            {isExpanded && (
                <CardContent className="p-3 space-y-4">


                    {/* Layer Toggles */}
                    <div className="space-y-2">

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5 text-gray-500" />
                                    <span className="text-sm">Data Markers</span>
                                </div>
                                <Switch
                                    checked={isLayerVisible('markers')}
                                    onCheckedChange={() => onLayerToggle('markers')}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Waves className="w-3.5 h-3.5 text-gray-500" />
                                    <span className="text-sm">Heatmap</span>
                                </div>
                                <Switch
                                    checked={isLayerVisible('heatmap')}
                                    onCheckedChange={() => onLayerToggle('heatmap')}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Grid className="w-3.5 h-3.5 text-ocean-500" />
                                    <span className="text-sm">Gridded Heatmap</span>
                                </div>
                                <Switch
                                    checked={isLayerVisible('gridded_heatmap')}
                                    onCheckedChange={() => onLayerToggle('gridded_heatmap')}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Satellite className="w-3.5 h-3.5 text-gray-500" />
                                    <span className="text-sm">NASA Satellite</span>
                                </div>
                                <Switch
                                    checked={isLayerVisible('nasa_wms')}
                                    onCheckedChange={() => onLayerToggle('nasa_wms')}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Grid Cell Info - Professional platform style */}
                    {dataPointCount !== undefined && (
                        <div className="px-2 py-1.5 bg-gray-50 rounded-md border">
                            <div className="flex items-center justify-between">
                                <div className="text-xs">
                                    <span className="font-medium text-gray-700">
                                        Showing {dataPointCount.toLocaleString()}
                                    </span>
                                    {totalGridCells && (
                                        <span className="text-gray-500">
                                            {' '}of {totalGridCells.toLocaleString()} grid cells
                                        </span>
                                    )}
                                </div>
                            </div>
                            {zoomLevel !== undefined && stride !== undefined && (
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                    Zoom: {zoomLevel} • Stride: {stride}x (sampled)
                                </div>
                            )}
                        </div>
                    )}

                    {/* Stats & Refresh */}
                    <div className="flex items-center justify-between pt-2 border-t">
                        <div className="text-xs text-gray-500">
                            {lastUpdated && (
                                <span className="text-gray-400">
                                    Updated: {new Date(lastUpdated).toLocaleTimeString()}
                                </span>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onRefresh}
                            disabled={isLoading}
                            className="h-7 px-2"
                        >
                            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
                        </Button>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

export default LayerControl;
