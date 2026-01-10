import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { oceanographyService } from '@/services/api';
import { erddapService, ERDDAPDataPoint } from '@/services/erddapService';

import {
  DataSourceBadge,
  EnhancedLegend,
  HeatmapLayer,
  LayerControl,
  NASAOceanColorLayer,
  DataSourceMode,
  VisibleLayer,
} from '@/components/oceanography';
import {
  Map as MapIcon, Layers, Thermometer, Droplets, Wind,
  Download, RefreshCw, MapPin, Eye, EyeOff,
  Waves, Loader, Satellite, ChevronDown, ChevronUp, Database
} from 'lucide-react';
import { cn } from '@/lib/utils';
import 'leaflet/dist/leaflet.css';

const MAP_LAYERS = [
  { id: 'temperature', name: 'Sea Surface Temperature', icon: Thermometer, color: 'coral', enabled: true },
  { id: 'salinity', name: 'Salinity', icon: Droplets, color: 'ocean', enabled: false },
  { id: 'chlorophyll', name: 'Chlorophyll', icon: Waves, color: 'marine', enabled: false },
  { id: 'dissolved_oxygen', name: 'Dissolved Oxygen', icon: Wind, color: 'deep', enabled: false },
  { id: 'pH', name: 'pH Level', icon: MapPin, color: 'abyss', enabled: false },
];

// Helper function to safely format numbers
const formatNumber = (value: any, decimals: number = 2): string => {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'number' ? value : parseFloat(value);
  return isNaN(num) ? String(value) : num.toFixed(decimals);
};

// Color scale for temperature
const getTemperatureColor = (value: number) => {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  if (num < 18) return '#3b82f6'; // blue
  if (num < 22) return '#22c55e'; // green
  if (num < 26) return '#eab308'; // yellow
  if (num < 30) return '#f97316'; // orange
  return '#ef4444'; // red
};

// Color scale for other parameters
const getParameterColor = (param: string, value: number) => {
  const num = typeof value === 'number' ? value : parseFloat(value as any) || 0;
  if (param === 'temperature') return getTemperatureColor(num);
  if (param === 'salinity') {
    if (num < 33) return '#60a5fa';
    if (num < 35) return '#3b82f6';
    return '#1d4ed8';
  }
  if (param === 'pH') {
    if (num < 7.8) return '#fbbf24';
    if (num < 8.1) return '#22c55e';
    return '#16a34a';
  }
  return '#0ea5e9';
};

// Map center control component
function MapCenterControl({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

// Collapsible Panel Component
function CollapsiblePanel({
  title,
  icon: Icon,
  children,
  defaultExpanded = true,
  className
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Card variant="default" className={className}>
      <CardHeader
        className="pb-3 cursor-pointer hover:bg-gray-50/50 transition-colors rounded-t-xl"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="w-4 h-4 text-ocean-500" />
            {title}
          </CardTitle>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-2 pt-0">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// Zoom change handler component - tracks zoom level for resolution scaling
function ZoomChangeHandler({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handleZoomEnd = () => {
      onZoomChange(map.getZoom());
    };
    map.on('zoomend', handleZoomEnd);
    // Set initial zoom
    onZoomChange(map.getZoom());
    return () => {
      map.off('zoomend', handleZoomEnd);
    };
  }, [map, onZoomChange]);
  return null;
}

export default function OceanographyViewer() {
  const navigate = useNavigate();
  const [layers, setLayers] = useState(MAP_LAYERS);
  const [selectedParameter, setSelectedParameter] = useState('temperature');
  const [selectedPoint, setSelectedPoint] = useState<any>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([10, 76]); // Indian Ocean
  const [region, setRegion] = useState('indian');

  // NEW: Data source and layer controls
  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>('erddap');
  const [visibleLayers, setVisibleLayers] = useState<VisibleLayer[]>(['markers']);

  // Filter states
  const [depthRange, setDepthRange] = useState<[number, number]>([0, 500]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [selectedSource, setSelectedSource] = useState('');

  // NEW: Zoom level for dynamic resolution scaling
  const [zoomLevel, setZoomLevel] = useState(5);

  // Calculate stride based on zoom level (professional platforms do this)
  // Lower zoom = higher stride (less data), Higher zoom = lower stride (more data)
  const getStrideForZoom = useCallback((zoom: number) => {
    if (zoom >= 8) return 2;   // Full resolution at high zoom
    if (zoom >= 7) return 5;   // High detail
    if (zoom >= 6) return 10;  // Medium detail
    if (zoom >= 5) return 15;  // Standard view
    return 25;                  // Overview - maximum sampling
  }, []);

  // Calculate estimated total grid cells (for Indian Ocean bounds: -15 to 25 lat, 50 to 100 lon)
  const estimateTotalGridCells = useCallback((parameter: string) => {
    // Different datasets have different resolutions
    const resolutions: Record<string, number> = {
      temperature: 0.01,  // MUR SST: 0.01° resolution
      chlorophyll: 0.04,  // VIIRS: 4km ≈ 0.04°
      salinity: 0.25,     // SMAP: 0.25° resolution
    };
    const res = resolutions[parameter] || 0.1;
    const latRange = 40;  // -15 to 25 = 40°
    const lonRange = 50;  // 50 to 100 = 50°
    return Math.floor((latRange / res) * (lonRange / res));
  }, []);

  // NEW: Fetch real data from NOAA ERDDAP with zoom-based resolution
  const { data: erddapData, isLoading: erddapLoading, refetch: refetchErddap } = useQuery({
    queryKey: ['erddap-data', selectedParameter, zoomLevel],
    queryFn: async () => {
      const stride = getStrideForZoom(zoomLevel);
      const result = await erddapService.fetchByParameter(selectedParameter, {
        stride,
      });
      // Limit data points to prevent browser hanging
      const maxPoints = zoomLevel >= 7 ? 1000 : 500;
      const totalFetched = result.data?.length || 0;
      if (result.data && result.data.length > maxPoints) {
        result.data = result.data.slice(0, maxPoints);
      }
      // Add metadata for display
      (result as any).totalFetched = totalFetched;
      (result as any).stride = stride;
      (result as any).estimatedTotalCells = estimateTotalGridCells(selectedParameter);
      return result;
    },
    enabled: dataSourceMode === 'erddap',
    staleTime: 1000 * 60 * 30, // 30 min cache (refresh on zoom change)
    refetchOnWindowFocus: false,
  });

  // Toggle layer visibility
  const handleLayerToggle = useCallback((layer: VisibleLayer) => {
    setVisibleLayers(prev =>
      prev.includes(layer)
        ? prev.filter(l => l !== layer)
        : [...prev, layer]
    );
  }, []);

  // Handle data source change
  const handleDataSourceChange = useCallback((source: DataSourceMode) => {
    setDataSourceMode(source);
  }, []);

  // Refresh data based on current source
  const handleRefresh = useCallback(() => {
    if (dataSourceMode === 'erddap') {
      refetchErddap();
    } else {
      refetch();
    }
  }, [dataSourceMode, refetchErddap]);

  // Fetch sources for filter dropdown
  const { data: sources } = useQuery({
    queryKey: ['oceanography-sources'],
    queryFn: () => oceanographyService.getSources(),
  });

  // Fetch oceanographic data with all filters
  const { data: oceanData, isLoading, refetch } = useQuery({
    queryKey: ['oceanography-data', selectedParameter, depthRange, dateRange, selectedSource],
    queryFn: () => oceanographyService.getData({
      parameter: selectedParameter,
      limit: 500,
      // Only pass depth filters if they're not at default values
      minDepth: depthRange[0] > 0 ? depthRange[0] : undefined,
      maxDepth: depthRange[1] < 500 ? depthRange[1] : undefined,
      startDate: dateRange.start || undefined,
      endDate: dateRange.end || undefined,
      source: selectedSource || undefined,
    }),
  });

  // Fetch parameters list
  const { data: parameters } = useQuery({
    queryKey: ['oceanography-parameters'],
    queryFn: () => oceanographyService.getParameters(),
  });

  // Fetch statistics
  const { data: stats } = useQuery({
    queryKey: ['oceanography-stats', selectedParameter],
    queryFn: () => oceanographyService.getStats({ parameter: selectedParameter }),
  });

  // Fetch time range
  const { data: timeRange } = useQuery({
    queryKey: ['oceanography-timerange'],
    queryFn: () => oceanographyService.getTimeRange(),
  });

  const dataPoints = oceanData?.data || [];

  // Calculate stats from filtered data (updates dynamically with filters)
  const currentStats = {
    count: dataPoints.length,
    avg_value: dataPoints.length > 0
      ? dataPoints.reduce((sum: number, p: any) => sum + (parseFloat(p.value) || 0), 0) / dataPoints.length
      : null,
    min_value: dataPoints.length > 0
      ? Math.min(...dataPoints.map((p: any) => parseFloat(p.value) || 0))
      : null,
    max_value: dataPoints.length > 0
      ? Math.max(...dataPoints.map((p: any) => parseFloat(p.value) || 0))
      : null,
    avg_depth: dataPoints.length > 0
      ? dataPoints.reduce((sum: number, p: any) => sum + (parseFloat(p.depth) || 0), 0) / dataPoints.length
      : null,
  };

  const toggleLayer = (id: string) => {
    setSelectedParameter(id);
    setLayers(prev => prev.map(layer => ({
      ...layer,
      enabled: layer.id === id
    })));
  };

  const handleRegionChange = (newRegion: string) => {
    setRegion(newRegion);
    switch (newRegion) {
      case 'arabian':
        setMapCenter([15, 65]);
        break;
      case 'bay':
        setMapCenter([15, 88]);
        break;
      case 'global':
        setMapCenter([0, 80]);
        break;
      default:
        setMapCenter([10, 76]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapIcon className="w-5 h-5 text-ocean-500" />
            <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">GIS Platform</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-white">Oceanography Viewer</h1>
          <p className="text-deep-500 dark:text-gray-400 mt-1">
            Interactive maps with real-time oceanographic parameters
          </p>
        </div>
        <div className="flex gap-3">
          <Select
            className="w-48"
            value={region}
            onChange={(e) => handleRegionChange(e.target.value)}
          >
            <option value="indian">Indian Ocean</option>
            <option value="arabian">Arabian Sea</option>
            <option value="bay">Bay of Bengal</option>
            <option value="global">Global View</option>
          </Select>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => navigate('/reports')}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Horizontal Filters Bar & Data Source Control */}
      <Card variant="glass" className="p-4">
        <div className="flex flex-wrap items-center gap-6 w-full">
          {/* Conditional Content based on Source - Left Side */}
          {dataSourceMode === 'erddap' ? (
            /* Satellite Info Mode */
            <div className="flex items-center gap-3 animate-in fade-in duration-300 mr-auto">
              <div className="p-2 bg-ocean-50 rounded-full">
                <Satellite className="w-5 h-5 text-ocean-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ocean-700 flex items-center gap-2">
                  NOAA Satellite Data
                  <Badge variant="secondary" className="bg-ocean-100 text-ocean-700 border-ocean-200 text-[10px] h-5">
                    Live
                  </Badge>
                </p>
                <p className="text-xs text-ocean-600">
                  Real-time observations from CoastWatch
                </p>
              </div>
            </div>
          ) : (
            /* Database Filters Mode */
            <div className="flex flex-wrap items-end gap-6 animate-in fade-in duration-300 mr-auto">
              {/* Depth Range */}
              <div className="flex-1 min-w-[280px] max-w-[360px]">
                <label className="text-xs font-medium text-deep-600 mb-1 flex items-center gap-2">
                  <Layers className="w-3 h-3 text-ocean-500" />
                  Depth: <span className="text-ocean-600 font-semibold">{depthRange[0]}m</span> - <span className="text-ocean-600 font-semibold">{depthRange[1]}m</span>
                </label>
                <div className="flex gap-2 items-center h-9 px-3 rounded-lg border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700">
                  <input type="range" min="0" max="500" value={depthRange[0]}
                    onChange={(e) => setDepthRange([parseInt(e.target.value), depthRange[1]])}
                    className="flex-1 h-1.5 bg-gradient-to-r from-blue-200 to-ocean-300 rounded-lg appearance-none cursor-pointer accent-ocean-600" />
                  <input type="range" min="0" max="500" value={depthRange[1]}
                    onChange={(e) => setDepthRange([depthRange[0], parseInt(e.target.value)])}
                    className="flex-1 h-1.5 bg-gradient-to-r from-ocean-300 to-blue-500 rounded-lg appearance-none cursor-pointer accent-ocean-600" />
                </div>
              </div>

              {/* Source Filter */}
              <div>
                <label className="text-xs font-medium text-deep-600 mb-1 block">Source</label>
                <select value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="h-9 px-3 text-sm rounded-lg border border-gray-200 focus:border-ocean-400 focus:outline-none bg-white min-w-[140px]">
                  <option value="">All Sources</option>
                  {sources?.map((src: any) => (
                    <option key={src.source} value={src.source}>{src.source}</option>
                  ))}
                </select>
              </div>

              {/* Date Range */}
              <div className="flex gap-2 items-center">
                <div>
                  <label className="text-xs font-medium text-deep-600 mb-1 block">From</label>
                  <input type="date" value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="h-9 px-2 text-sm rounded-lg border border-gray-200 w-32" />
                </div>
                <div>
                  <label className="text-xs font-medium text-deep-600 mb-1 block">To</label>
                  <input type="date" value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    className="h-9 px-2 text-sm rounded-lg border border-gray-200 w-32" />
                </div>
              </div>
            </div>
          )}

          {/* Controls Group - Pushed to End */}
          <div className="flex items-center gap-4 ml-auto">
            {/* Clear Button */}
            <Button variant="outline" size="sm"
              onClick={() => { setDepthRange([0, 500]); setDateRange({ start: '', end: '' }); setSelectedSource(''); }}>
              Clear Filters
            </Button>

            <div className="h-8 w-px bg-gray-200 hidden sm:block"></div>

            {/* Data Source Toggle */}
            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
              <button
                onClick={() => handleDataSourceChange('erddap')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  dataSourceMode === 'erddap'
                    ? "bg-white text-ocean-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Satellite className="w-4 h-4" />
                Satellite
              </button>
              <button
                onClick={() => handleDataSourceChange('database')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  dataSourceMode === 'database'
                    ? "bg-white text-deep-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Database className="w-4 h-4" />
                Database
              </button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Map Container */}
        <div className="xl:col-span-3">
          <Card variant="default" className="overflow-hidden">
            <div className="relative h-[600px]">
              {isLoading && (
                <div className="absolute inset-0 z-[1000] bg-white/80 flex items-center justify-center">
                  <Loader className="w-8 h-8 animate-spin text-ocean-500" />
                </div>
              )}

              <MapContainer
                center={mapCenter}
                zoom={5}
                style={{ height: '100%', width: '100%' }}
                className="z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapCenterControl center={mapCenter} />
                <ZoomChangeHandler onZoomChange={setZoomLevel} />

                {/* NASA OceanColor WMS Layer */}
                {visibleLayers.includes('nasa_wms') && (
                  <NASAOceanColorLayer
                    layer={selectedParameter === 'chlorophyll' ? 'chlorophyll' : 'sst'}
                    opacity={0.6}
                    visible={true}
                  />
                )}

                {/* Heatmap Layer for ERDDAP Data */}
                {visibleLayers.includes('heatmap') && erddapData?.data && (
                  <HeatmapLayer
                    data={erddapData.data.map(p => ({
                      latitude: p.latitude,
                      longitude: p.longitude,
                      value: p.value,
                    }))}
                    parameter={selectedParameter as 'temperature' | 'salinity' | 'chlorophyll'}
                    radius={30}
                    blur={20}
                    opacity={0.7}
                    visible={true}
                  />
                )}

                {/* ERDDAP Real Data Markers */}
                {dataSourceMode === 'erddap' && visibleLayers.includes('markers') && erddapData?.data?.map((point, idx) => (
                  <CircleMarker
                    key={`erddap-${idx}`}
                    center={[point.latitude, point.longitude]}
                    radius={5}
                    pathOptions={{
                      fillColor: getParameterColor(selectedParameter, point.value),
                      fillOpacity: 0.8,
                      color: '#fff',
                      weight: 1
                    }}
                    eventHandlers={{
                      click: () => setSelectedPoint({
                        ...point,
                        source: 'NOAA_ERDDAP',
                        dataType: 'observed',
                      })
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -5]} opacity={0.95}>
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Satellite className="w-3 h-3 text-blue-500" />
                          <span className="font-semibold text-blue-600">NOAA ERDDAP</span>
                        </div>
                        <p className="text-sm font-bold">{formatNumber(point.value, 2)} {point.unit}</p>
                        <p className="text-gray-500 text-[10px]">Observed Data</p>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                ))}

                {/* Database/Local Data Markers */}
                {dataSourceMode === 'database' && visibleLayers.includes('markers') && dataPoints.map((point: any, idx: number) => (
                  <CircleMarker
                    key={idx}
                    center={[point.latitude, point.longitude]}
                    radius={6}
                    pathOptions={{
                      fillColor: getParameterColor(selectedParameter, point.value),
                      fillOpacity: 0.8,
                      color: '#fff',
                      weight: 1
                    }}
                    eventHandlers={{
                      click: () => setSelectedPoint({
                        ...point,
                        source: 'DATABASE',
                        dataType: 'observed',
                      })
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <div className="flex items-center gap-1.5 mb-1">
                          <MapPin className="w-3 h-3 text-gray-500" />
                          <span className="font-medium text-gray-600">Local Database</span>
                        </div>
                        <p className="font-semibold">{point.parameter}</p>
                        <p className="text-lg font-bold">{formatNumber(point.value, 2)} {point.unit}</p>
                        <p className="text-gray-500">Depth: {point.depth}m</p>
                        <p className="text-gray-500">{new Date(point.timestamp).toLocaleDateString()}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

              </MapContainer>

              {/* Enhanced Legend with Source Attribution - Moved right to avoid zoom controls */}
              <div className="absolute top-2 left-16 z-[500]">
                <EnhancedLegend
                  parameter={selectedParameter}
                  unit={selectedParameter === 'temperature' ? '°C' : selectedParameter === 'salinity' ? 'PSU' : 'mg/m³'}
                  min={(() => {
                    const validData = erddapData?.data?.filter(p => p.value != null && !isNaN(p.value)) || [];
                    if (validData.length > 0) {
                      return validData.reduce((min, p) => p.value < min ? p.value : min, validData[0].value);
                    }
                    return currentStats.min_value || 0;
                  })()}
                  max={(() => {
                    const validData = erddapData?.data?.filter(p => p.value != null && !isNaN(p.value)) || [];
                    if (validData.length > 0) {
                      return validData.reduce((max, p) => p.value > max ? p.value : max, validData[0].value);
                    }
                    return currentStats.max_value || 100;
                  })()}
                  colorScale={selectedParameter as 'temperature' | 'salinity' | 'chlorophyll'}
                  source={dataSourceMode === 'erddap' ? 'NOAA_ERDDAP' : 'DATABASE'}
                  dataType="observed"
                  dataPoints={dataSourceMode === 'erddap' ? erddapData?.data?.length : dataPoints.length}
                />
              </div>

              {/* Data Source Badge */}
              <div className="absolute top-4 right-4 z-[500]">
                <DataSourceBadge
                  source={dataSourceMode === 'erddap' ? 'NOAA_ERDDAP' : 'DATABASE'}
                  dataType="observed"
                  parameter={selectedParameter}
                  lastUpdated={erddapData?.metadata?.lastUpdated}
                  resolution={erddapData?.metadata?.resolution}
                  showDetails={true}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Parameters Panel */}
          <CollapsiblePanel title="Parameters" icon={Layers} defaultExpanded={false}>
            <div className="space-y-2">
              {layers.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => toggleLayer(layer.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-all",
                    layer.enabled
                      ? "border-ocean-200 bg-ocean-50"
                      : "border-gray-100 bg-white hover:bg-gray-50"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-lg transition-colors",
                    layer.enabled ? "bg-ocean-100" : "bg-gray-100"
                  )}>
                    <layer.icon className={cn(
                      "w-4 h-4",
                      layer.enabled ? "text-ocean-600" : "text-gray-400"
                    )} />
                  </div>
                  <span className={cn(
                    "flex-1 text-left text-sm font-medium",
                    layer.enabled ? "text-ocean-700" : "text-deep-600"
                  )}>
                    {layer.name}
                  </span>
                  {layer.enabled ? (
                    <Eye className="w-4 h-4 text-ocean-500" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              ))}
            </div>
          </CollapsiblePanel>

          {/* Layer Controls (Moved from Map) */}
          <div className="z-10 relative">
            <LayerControl
              visibleLayers={visibleLayers}
              onLayerToggle={handleLayerToggle}
              onRefresh={handleRefresh}
              isLoading={isLoading || erddapLoading}
              dataPointCount={dataSourceMode === 'erddap' ? erddapData?.data?.length : dataPoints.length}
              totalGridCells={(erddapData as any)?.estimatedTotalCells}
              zoomLevel={zoomLevel}
              stride={(erddapData as any)?.stride}
              lastUpdated={erddapData?.timestamp || new Date().toISOString()}
              className="relative w-full shadow-sm border border-gray-200"
            />
          </div>


          {/* Selected Point Info */}
          {selectedPoint && (
            <Card variant="premium">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Data Point</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-deep-500">Parameter</span>
                    <span className="font-medium text-deep-900 capitalize">
                      {selectedPoint.parameter?.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-deep-500">Value</span>
                    <span className="font-bold text-lg text-ocean-600">
                      {formatNumber(selectedPoint.value, 2)} {selectedPoint.unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-deep-500">Coordinates</span>
                    <span className="font-mono text-xs text-deep-700">
                      {formatNumber(selectedPoint.latitude, 4)}, {formatNumber(selectedPoint.longitude, 4)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-deep-500">Depth</span>
                    <span className="font-medium text-deep-900">{selectedPoint.depth}m</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-deep-500">Quality</span>
                    <Badge variant={selectedPoint.quality === 'good' ? 'success' : 'warning'} dot>
                      {selectedPoint.quality}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-deep-500">Timestamp</span>
                    <span className="text-sm text-deep-700">
                      {new Date(selectedPoint.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Available Parameters */}
          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-ocean-50/60">
                  <Layers className="w-5 h-5 text-ocean-400" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-deep-900">Available Data</h4>
                  <div className="mt-2 space-y-1">
                    {parameters?.slice(0, 5).map((param: any) => (
                      <div key={param.parameter} className="flex justify-between text-xs">
                        <span className="text-deep-600 capitalize">{param.parameter?.replace('_', ' ')}</span>
                        <span className="text-deep-400">{param.count} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div >
    </div >
  );
}
