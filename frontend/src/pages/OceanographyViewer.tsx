import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { oceanographyService } from '@/services/api';
import {
  Map, Layers, Thermometer, Droplets, Wind,
  Download, RefreshCw, MapPin, Eye, EyeOff,
  Waves, Loader
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

export default function OceanographyViewer() {
  const navigate = useNavigate();
  const [layers, setLayers] = useState(MAP_LAYERS);
  const [selectedParameter, setSelectedParameter] = useState('temperature');
  const [selectedPoint, setSelectedPoint] = useState<any>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([10, 76]); // Indian Ocean
  const [region, setRegion] = useState('indian');

  // Filter states
  const [depthRange, setDepthRange] = useState<[number, number]>([0, 500]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [selectedSource, setSelectedSource] = useState('');

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
            <Map className="w-5 h-5 text-ocean-500" />
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

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Avg. Value"
          value={formatNumber(currentStats.avg_value, 2)}
          subtitle={selectedParameter}
          icon={Thermometer}
          iconColor="text-coral-400"
          iconBg="bg-coral-50/60"
        />
        <StatCard
          title="Min / Max"
          value={currentStats.min_value && currentStats.max_value
            ? `${formatNumber(currentStats.min_value, 1)} - ${formatNumber(currentStats.max_value, 1)}`
            : '—'}
          subtitle="Range"
          icon={Droplets}
          iconColor="text-ocean-400"
          iconBg="bg-ocean-50/60"
        />
        <StatCard
          title="Data Points"
          value={currentStats.count?.toLocaleString() || timeRange?.total_records?.toLocaleString() || '0'}
          subtitle="measurements"
          icon={MapPin}
          iconColor="text-marine-400"
          iconBg="bg-marine-50/60"
        />
        <StatCard
          title="Avg. Depth"
          value={currentStats.avg_depth ? `${formatNumber(currentStats.avg_depth, 0)}m` : '—'}
          subtitle="sampling depth"
          icon={Layers}
          iconColor="text-deep-400"
          iconBg="bg-deep-100/50"
        />
      </div>

      {/* Horizontal Filters Bar */}
      <Card variant="glass" className="p-4">
        <div className="flex flex-wrap items-end gap-6">
          {/* Depth Range - Left with better styling */}
          <div className="flex-1 min-w-[280px] max-w-[400px] bg-white/60 rounded-xl p-3 border border-gray-100">
            <label className="text-xs font-semibold text-deep-700 mb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-ocean-500" />
              Depth Range: <span className="text-ocean-600">{depthRange[0]}m</span> - <span className="text-ocean-600">{depthRange[1]}m</span>
            </label>
            <div className="flex gap-3 items-center">
              <span className="text-xs text-deep-400 w-8">0m</span>
              <input type="range" min="0" max="500" value={depthRange[0]}
                onChange={(e) => setDepthRange([parseInt(e.target.value), depthRange[1]])}
                className="flex-1 h-2 bg-gradient-to-r from-blue-200 to-ocean-300 rounded-lg appearance-none cursor-pointer accent-ocean-600" />
              <input type="range" min="0" max="500" value={depthRange[1]}
                onChange={(e) => setDepthRange([depthRange[0], parseInt(e.target.value)])}
                className="flex-1 h-2 bg-gradient-to-r from-ocean-300 to-blue-500 rounded-lg appearance-none cursor-pointer accent-ocean-600" />
              <span className="text-xs text-deep-400 w-12">500m</span>
            </div>
          </div>

          {/* Source Filter */}
          <div>
            <label className="text-xs font-medium text-deep-600 mb-1 block">Source</label>
            <select value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="h-9 px-3 text-sm rounded-lg border border-gray-200 focus:border-ocean-400 focus:outline-none bg-white min-w-[140px] dark:bg-gray-900 dark:border-gray-700 dark:text-white">
              <option value="">All Sources</option>
              {sources?.map((src: any) => (
                <option key={src.source} value={src.source}>{src.source}</option>
              ))}
            </select>
          </div>

          {/* Date Range - Right */}
          <div className="flex gap-2 items-center">
            <div>
              <label className="text-xs font-medium text-deep-600 mb-1 block">From</label>
              <input type="date" value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="h-9 px-3 text-sm rounded-lg border border-gray-200 focus:border-ocean-400 focus:outline-none dark:bg-gray-900 dark:border-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="text-xs font-medium text-deep-600 mb-1 block">To</label>
              <input type="date" value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="h-9 px-3 text-sm rounded-lg border border-gray-200 focus:border-ocean-400 focus:outline-none dark:bg-gray-900 dark:border-gray-700 dark:text-white" />
            </div>
          </div>

          {/* Clear Button */}
          <Button variant="outline" size="sm"
            onClick={() => { setDepthRange([0, 500]); setDateRange({ start: '', end: '' }); setSelectedSource(''); }}>
            Clear
          </Button>
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

                {dataPoints.map((point: any, idx: number) => (
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
                      click: () => setSelectedPoint(point)
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold">{point.parameter}</p>
                        <p className="text-lg font-bold">{formatNumber(point.value, 2)} {point.unit}</p>
                        <p className="text-gray-500">Depth: {point.depth}m</p>
                        <p className="text-gray-500">{new Date(point.timestamp).toLocaleDateString()}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>

              {/* Legend */}
              <div className="absolute top-4 left-4 z-[500]">
                <Card variant="glass" className="bg-white/95 backdrop-blur-sm w-48">
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold text-deep-700 mb-2 capitalize">
                      {selectedParameter.replace('_', ' ')}
                    </p>
                    <div className="h-3 rounded-full bg-gradient-to-r from-blue-500 via-yellow-400 to-red-500" />
                    <div className="flex justify-between text-xs text-deep-500 mt-1">
                      <span>Low</span>
                      <span>Med</span>
                      <span>High</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Data info */}
              {timeRange && (
                <div className="absolute bottom-4 left-4 right-4 z-[500]">
                  <Card variant="glass" className="bg-white/95 backdrop-blur-sm">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-deep-500">
                          {dataPoints.length} points displayed
                        </span>
                        <span className="text-deep-500">
                          {timeRange.start_date && `Data from ${new Date(timeRange.start_date).toLocaleDateString()} to ${new Date(timeRange.end_date).toLocaleDateString()}`}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Layer Controls */}
          <Card variant="default">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-ocean-500" />
                Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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
            </CardContent>
          </Card>


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
      </div>
    </div>
  );
}
