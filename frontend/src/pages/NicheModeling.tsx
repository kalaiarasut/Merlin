import { useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Globe, Layers, Upload, Play,
  Loader2, CheckCircle, AlertCircle, Info,
  MapPin, Thermometer, Droplets, Wind,
  AlertTriangle, ChevronDown, ChevronUp, Clock, Copy
} from 'lucide-react';
import { analyticsService, speciesService } from '@/services/api';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, BarChart, Bar, Cell
} from 'recharts';
import { cn } from '@/lib/utils';

interface OccurrenceRecord {
  id: string;
  lat: number;
  lon: number;
  species?: string;
  date?: string;
}

interface NicheResult {
  success: boolean;
  species: string;
  model_type: string;
  occurrence_count: number;
  model_metrics: {
    auc?: number;
    tss?: number;
    accuracy?: number;
  };
  variable_importance: Record<string, number>;
  environmental_profile: {
    temperature?: { min: number; max: number; optimal: number };
    depth?: { min: number; max: number; optimal: number };
    salinity?: { min: number; max: number; optimal: number };
  };
  suitable_area: number;
  hotspots: Array<{ lat: number; lon: number; suitability: number }>;
  niche_breadth: Record<string, number>;
  // Scientific-grade data sources
  data_sources?: Record<string, string>;
  variables_used?: string[];
  real_data?: boolean;
  warnings?: string[];
  // Reproducibility & transparency
  model_id?: string;
  config_hash?: string;
  collinearity_warnings?: string[];
  scientific_metadata?: {
    study_area: string;
    n_presence: number;
    n_background: number;
    background_method: string;
    land_mask: string;
  };
}

const MODEL_TYPES = [
  { value: 'maxent', label: 'MaxEnt', description: 'Maximum entropy modeling' },
  { value: 'bioclim', label: 'BIOCLIM', description: 'Climate envelope approach' },
  { value: 'gower', label: 'Gower Distance', description: 'Similarity-based prediction' },
];

// Environmental variables with authoritative data sources
const ENV_VARIABLES = [
  { value: 'temperature', label: 'Sea Surface Temperature', icon: Thermometer, source: 'Copernicus CMEMS', description: 'Highest-quality merged SST, bias-corrected' },
  { value: 'depth', label: 'Depth (Bathymetry)', icon: Layers, source: 'GEBCO/ETOPO', description: 'Global standard, universally accepted' },
  { value: 'salinity', label: 'Salinity', icon: Droplets, source: 'Copernicus CMEMS', description: 'Data-assimilated (Argo + satellites)' },
  { value: 'chlorophyll', label: 'Chlorophyll-a', icon: Layers, source: 'VIIRS (NOAA ERDDAP)', description: 'Gold-standard ocean color sensor' },
  { value: 'current_speed', label: 'Current Speed', icon: Wind, source: 'Copernicus CMEMS', description: 'Global ocean physics model' },
  { value: 'dissolved_oxygen', label: 'Dissolved Oxygen', icon: Droplets, source: 'Copernicus Argo BGC', description: 'Real in-situ measurements' },
];

const CHART_COLORS = ['#0891b2', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4'];

// Model assumptions and limitations for scientific rigor
const MODEL_ASSUMPTIONS: Record<string, { name: string; assumptions: string[]; limitations: string[] }> = {
  maxent: {
    name: 'MaxEnt',
    assumptions: [
      'Uses presence-only data (no confirmed absences required)',
      'Assumes sampling is representative of species occurrence',
      'Maximum entropy principle for probability distribution'
    ],
    limitations: [
      'Sensitive to sampling bias in occurrence data',
      'May overfit with small sample sizes',
      'Correlative model - does not imply causation'
    ]
  },
  bioclim: {
    name: 'BIOCLIM',
    assumptions: [
      'Envelope-based approach using environmental ranges',
      'Species can survive within observed environmental limits',
      'Environmental variables are linearly related to suitability'
    ],
    limitations: [
      'Cannot extrapolate beyond observed environmental space',
      'Does not account for species interactions',
      'Sensitive to outliers in occurrence data'
    ]
  },
  gower: {
    name: 'Gower Distance',
    assumptions: [
      'Similarity-based prediction using distance metrics',
      'Similar environments indicate similar suitability',
      'All variables contribute equally unless weighted'
    ],
    limitations: [
      'Performance depends on reference point selection',
      'May not capture non-linear relationships',
      'Sensitive to variable scaling'
    ]
  }
};

export default function NicheModeling() {
  const [modelType, setModelType] = useState('maxent');
  const [selectedVars, setSelectedVars] = useState<string[]>(['temperature', 'depth', 'salinity']);
  const [occurrences, setOccurrences] = useState<OccurrenceRecord[]>([]);
  const [manualCoords, setManualCoords] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [resolution, setResolution] = useState(0.5);
  const [studyArea, setStudyArea] = useState('arabian_sea');
  const [result, setResult] = useState<NicheResult | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [modelRunTimestamp, setModelRunTimestamp] = useState<Date | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Study area options for scientific SDM
  const STUDY_AREAS = [
    { value: 'arabian_sea', label: 'Arabian Sea / Indian EEZ', bounds: '60-80°E, 0-25°N' },
    { value: 'bay_of_bengal', label: 'Bay of Bengal', bounds: '80-100°E, 0-25°N' },
    { value: 'indian_ocean', label: 'North Indian Ocean', bounds: '40-120°E, 10°S-30°N' },
  ];

  // Fetch species list for selection
  const { data: speciesData } = useQuery({
    queryKey: ['species-list-niche'],
    queryFn: () => speciesService.getAll({ limit: 200 }),
  });

  const speciesList = useMemo(() => {
    return (speciesData as any)?.data || [];
  }, [speciesData]);

  // Niche modeling mutation
  const modelMutation = useMutation({
    mutationFn: async () => {
      setValidationErrors([]);
      const errors: string[] = [];

      // Combine manual coords with uploaded occurrences
      let allOccurrences = [...occurrences];

      // Parse manual coordinates
      if (manualCoords.trim()) {
        const lines = manualCoords.split('\n').filter(l => l.trim());
        lines.forEach((line, i) => {
          const parts = line.split(/[,\s]+/).map(p => parseFloat(p.trim()));
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            allOccurrences.push({
              id: `manual_${i}`,
              lat: parts[0],
              lon: parts[1],
              species: selectedSpecies || 'Unknown',
            });
          }
        });
      }

      // Validation: Filter invalid lat/lon
      const originalCount = allOccurrences.length;
      allOccurrences = allOccurrences.filter(occ => {
        const validLat = occ.lat >= -90 && occ.lat <= 90;
        const validLon = occ.lon >= -180 && occ.lon <= 180;
        return validLat && validLon;
      });
      const invalidCount = originalCount - allOccurrences.length;
      if (invalidCount > 0) {
        errors.push(`${invalidCount} records with invalid coordinates removed (lat: -90 to 90, lon: -180 to 180)`);
      }

      // Validation: Remove duplicates
      const seenCoords = new Set<string>();
      const uniqueOccurrences: OccurrenceRecord[] = [];
      allOccurrences.forEach(occ => {
        const key = `${occ.lat.toFixed(6)},${occ.lon.toFixed(6)}`;
        if (!seenCoords.has(key)) {
          seenCoords.add(key);
          uniqueOccurrences.push(occ);
        }
      });
      const duplicateCount = allOccurrences.length - uniqueOccurrences.length;
      if (duplicateCount > 0) {
        errors.push(`${duplicateCount} duplicate coordinates removed`);
      }
      allOccurrences = uniqueOccurrences;

      if (errors.length > 0) {
        setValidationErrors(errors);
      }

      if (allOccurrences.length < 5) {
        throw new Error(`At least 5 valid occurrence records required. Currently: ${allOccurrences.length}`);
      }

      const response = await analyticsService.nicheModel({
        occurrence_data: allOccurrences,
        environmental_variables: selectedVars,
        model_type: modelType,
        prediction_resolution: resolution,
        study_area: studyArea,
        n_background: 10000,
      });
      return response;
    },
    onSuccess: (data) => {
      setResult(data as NicheResult);
      setModelRunTimestamp(new Date());
    },
  });

  // Toggle environment variable selection
  const toggleVariable = (varName: string) => {
    setSelectedVars(prev =>
      prev.includes(varName)
        ? prev.filter(v => v !== varName)
        : [...prev, varName]
    );
  };

  // Parse CSV/text file with occurrences
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());

    // Skip header if present
    const startIdx = lines[0].toLowerCase().includes('lat') ? 1 : 0;

    const parsed: OccurrenceRecord[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(/[,\t]+/);
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);

      if (!isNaN(lat) && !isNaN(lon)) {
        parsed.push({
          id: `file_${i}`,
          lat,
          lon,
          species: parts[2] || selectedSpecies,
          date: parts[3],
        });
      }
    }

    setOccurrences(parsed);
  };

  // Format importance data for chart
  const importanceData = useMemo(() => {
    if (!result?.variable_importance) return [];
    return Object.entries(result.variable_importance)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [result]);

  // Format hotspots for scatter plot
  const hotspotsData = useMemo(() => {
    if (!result?.hotspots) return [];
    return result.hotspots.map((h, i) => ({
      ...h,
      name: `Site ${i + 1}`,
      suitability: Math.round(h.suitability * 100),
    }));
  }, [result]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-5 h-5 text-ocean-500" />
            <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Spatial Analysis</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-gray-100">
            Environmental Niche Modeling
          </h1>
          <p className="text-deep-500 dark:text-gray-400 mt-1">
            Species Distribution Modeling (SDM) for habitat suitability prediction
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="premium"
            onClick={() => modelMutation.mutate()}
            disabled={modelMutation.isPending || (occurrences.length === 0 && !manualCoords.trim())}
          >
            {modelMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Run Model
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="space-y-6">
          {/* Model Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Model Type</CardTitle>
              <CardDescription>Select the SDM algorithm</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {MODEL_TYPES.map((model) => (
                <button
                  key={model.value}
                  onClick={() => setModelType(model.value)}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left transition-all",
                    modelType === model.value
                      ? "border-ocean-500 bg-ocean-50 dark:bg-ocean-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-ocean-300"
                  )}
                >
                  <p className="font-medium text-sm text-deep-900 dark:text-gray-100">
                    {model.label}
                  </p>
                  <p className="text-xs text-deep-500 dark:text-gray-400">
                    {model.description}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Model Assumptions & Limitations Panel */}
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
            <button
              onClick={() => setShowAssumptions(!showAssumptions)}
              className="w-full p-4 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Model Assumptions & Limitations
                </span>
              </div>
              {showAssumptions ? (
                <ChevronUp className="w-4 h-4 text-amber-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-amber-600" />
              )}
            </button>
            {showAssumptions && MODEL_ASSUMPTIONS[modelType] && (
              <CardContent className="pt-0 pb-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Assumptions:</p>
                  <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    {MODEL_ASSUMPTIONS[modelType].assumptions.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-amber-500 mt-0.5">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Limitations:</p>
                  <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    {MODEL_ASSUMPTIONS[modelType].limitations.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-amber-500 mt-0.5">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 italic pt-2 border-t border-amber-200 dark:border-amber-800">
                  Results are correlative and should not be interpreted as causal relationships.
                </p>
              </CardContent>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Environmental Variables</CardTitle>
              <CardDescription>Select predictors for the model</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {ENV_VARIABLES.map((v) => {
                const Icon = v.icon;
                const isSelected = selectedVars.includes(v.value);
                return (
                  <button
                    key={v.value}
                    onClick={() => toggleVariable(v.value)}
                    className={cn(
                      "w-full p-2.5 rounded-lg border text-left transition-all flex items-center gap-3",
                      isSelected
                        ? "border-ocean-500 bg-ocean-50 dark:bg-ocean-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-ocean-300"
                    )}
                  >
                    <Icon className={cn(
                      "w-4 h-4",
                      isSelected ? "text-ocean-500" : "text-gray-400"
                    )} />
                    <span className="text-sm text-deep-900 dark:text-gray-100">
                      {v.label}
                    </span>
                    {isSelected && (
                      <CheckCircle className="w-4 h-4 ml-auto text-ocean-500" />
                    )}
                  </button>
                );
              })}

              {/* Variable Correlation Warning */}
              {selectedVars.length > 3 && (
                <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      <span className="font-medium">Note:</span> Highly correlated variables may introduce multicollinearity and bias model results.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Model Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-deep-700 dark:text-gray-300">
                  Species
                </label>
                <Select
                  value={selectedSpecies}
                  onChange={(e) => setSelectedSpecies(e.target.value)}
                  className="mt-1"
                >
                  <option value="">Select species...</option>
                  {speciesList.map((s: any) => (
                    <option key={s._id} value={s.scientificName}>
                      {s.scientificName}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-deep-700 dark:text-gray-300">
                  Study Area
                </label>
                <Select
                  value={studyArea}
                  onChange={(e) => setStudyArea(e.target.value)}
                  className="mt-1"
                >
                  {STUDY_AREAS.map((area) => (
                    <option key={area.value} value={area.value}>
                      {area.label}
                    </option>
                  ))}
                </Select>
                <p className="text-[10px] text-deep-500 dark:text-gray-400 mt-1">
                  {STUDY_AREAS.find(a => a.value === studyArea)?.bounds}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-deep-700 dark:text-gray-300">
                  Grid Resolution (degrees)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="2"
                  value={resolution}
                  onChange={(e) => setResolution(parseFloat(e.target.value))}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Data Sources Information */}
          <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Environmental Data Sources
              </CardTitle>
              <CardDescription className="text-xs">
                Scientific-grade data from authoritative institutions
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Static Data Sources Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-green-200 dark:border-green-800">
                      <th className="text-left py-1.5 font-semibold text-deep-700 dark:text-gray-200">Variable</th>
                      <th className="text-left py-1.5 font-semibold text-green-700 dark:text-green-300">Primary Source</th>
                      <th className="text-left py-1.5 font-semibold text-deep-500 dark:text-gray-400">Fallback</th>
                    </tr>
                  </thead>
                  <tbody className="text-deep-600 dark:text-gray-300">
                    <tr className="border-b border-green-100 dark:border-green-900/50">
                      <td className="py-1.5">SST</td>
                      <td className="py-1.5 text-green-700 dark:text-green-400">Copernicus CMEMS</td>
                      <td className="py-1.5 text-deep-400">NOAA MODIS ERDDAP</td>
                    </tr>
                    <tr className="border-b border-green-100 dark:border-green-900/50">
                      <td className="py-1.5">Salinity</td>
                      <td className="py-1.5 text-green-700 dark:text-green-400">Copernicus CMEMS</td>
                      <td className="py-1.5 text-deep-400">WOA18 Climatology</td>
                    </tr>
                    <tr className="border-b border-green-100 dark:border-green-900/50">
                      <td className="py-1.5">Depth</td>
                      <td className="py-1.5 text-green-700 dark:text-green-400">GEBCO/ETOPO via NOAA ERDDAP</td>
                      <td className="py-1.5 text-deep-400">—</td>
                    </tr>
                    <tr className="border-b border-green-100 dark:border-green-900/50">
                      <td className="py-1.5">Chlorophyll</td>
                      <td className="py-1.5 text-green-700 dark:text-green-400">VIIRS via NOAA CoastWatch</td>
                      <td className="py-1.5 text-deep-400">MODIS ERDDAP</td>
                    </tr>
                    <tr>
                      <td className="py-1.5">Dissolved Oxygen</td>
                      <td className="py-1.5 text-green-700 dark:text-green-400">WOA18 Climatology (NOAA)</td>
                      <td className="py-1.5 text-deep-400">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Actual Sources Used After Model Run */}
              {result?.data_sources && Object.keys(result.data_sources).length > 0 && (
                <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                  <p className="text-[10px] font-semibold text-green-700 dark:text-green-300 mb-2">
                    Sources Used in Last Model Run:
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(result.data_sources).map(([varName, source]) => (
                      <div key={varName} className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-deep-600 dark:text-gray-300 capitalize font-medium">{varName}:</span>
                        <Badge variant="success" className="text-[9px] px-1.5 py-0">
                          {String(source).replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* CRITICAL: Scientific Assumptions Card (Always Visible) */}
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Scientific Assumptions
              </CardTitle>
              <CardDescription className="text-xs">
                Important limitations of species distribution models
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="text-[10px] text-deep-600 dark:text-gray-300 space-y-1.5">
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span><strong>Correlation ≠ Causation:</strong> Environmental associations do not imply causal relationships</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span><strong>Presence-only bias:</strong> Models infer from where species was observed, not where it is absent</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span><strong>Sampling bias:</strong> Occurrence data may reflect survey effort, not true distribution</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span><strong>Environmental equilibrium:</strong> Assumes species occupy all suitable habitat</span>
                </li>
              </ul>
              <p className="text-[9px] text-amber-700 dark:text-amber-400 mt-2 font-medium">
                Results show <em>relative habitat suitability</em>, not species prediction.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Occurrence Data Input */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Occurrence Data</CardTitle>
                  <CardDescription>
                    Upload occurrence records or enter coordinates manually
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {occurrences.length} records loaded
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* File Upload */}
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-ocean-400 transition-colors">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="occurrence-upload"
                />
                <label htmlFor="occurrence-upload" className="cursor-pointer">
                  <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                  <p className="text-sm font-medium text-deep-900 dark:text-gray-100">
                    Upload CSV/TXT file
                  </p>
                  <p className="text-xs text-deep-500 dark:text-gray-400 mt-1">
                    Format: lat, lon, species (optional), date (optional)
                  </p>
                </label>
              </div>

              {/* Manual Input */}
              <div>
                <label className="text-sm font-medium text-deep-700 dark:text-gray-300">
                  Or enter coordinates manually (one per line)
                </label>
                <Textarea
                  value={manualCoords}
                  onChange={(e) => setManualCoords(e.target.value)}
                  placeholder="12.5, 76.3&#10;11.8, 75.9&#10;13.2, 77.1"
                  className="mt-1 font-mono text-sm"
                  rows={5}
                />
              </div>

              {/* Quick Summary */}
              {occurrences.length > 0 && (
                <div className="p-3 bg-ocean-50 dark:bg-ocean-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-ocean-500" />
                    <span className="font-medium text-ocean-700 dark:text-ocean-300">
                      {occurrences.length} occurrence records loaded
                    </span>
                  </div>
                  <p className="text-xs text-ocean-600 dark:text-ocean-400 mt-1">
                    Lat range: {Math.min(...occurrences.map(o => o.lat)).toFixed(2)} to {Math.max(...occurrences.map(o => o.lat)).toFixed(2)} |
                    Lon range: {Math.min(...occurrences.map(o => o.lon)).toFixed(2)} to {Math.max(...occurrences.map(o => o.lon)).toFixed(2)}
                  </p>
                </div>
              )}

              {/* Validation Errors Display */}
              {validationErrors.length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Data Validation Applied</p>
                      <ul className="text-xs text-blue-700 dark:text-blue-300 mt-1 space-y-0.5">
                        {validationErrors.map((err, i) => (
                          <li key={i}>• {err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {result && (
            <>
              {/* Model Metrics */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        Model Results
                      </CardTitle>
                      <CardDescription>
                        {result.model_type.toUpperCase()} model for {result.species}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="success">
                        {result.occurrence_count} occurrences
                      </Badge>
                      {result.model_id && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-deep-400 dark:text-gray-500">ID:</span>
                          <code className="text-[9px] text-deep-500 dark:text-gray-400 bg-gray-100 dark:bg-deep-800 px-1.5 py-0.5 rounded">
                            {result.model_id}
                          </code>
                          <button
                            onClick={() => navigator.clipboard.writeText(result.model_id || '')}
                            className="text-deep-400 hover:text-deep-600 dark:text-gray-500 dark:hover:text-gray-300"
                            title="Copy model ID"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-3 bg-gray-50 dark:bg-deep-800 rounded-lg text-center relative group">
                      <p className="text-2xl font-bold text-ocean-600">
                        {result.model_metrics.auc?.toFixed(3) || 'N/A'}
                      </p>
                      <p className="text-xs text-deep-500">AUC Score</p>
                      {result.model_metrics.auc && (
                        <p className={cn(
                          "text-[10px] mt-1",
                          result.model_metrics.auc >= 0.7 ? "text-green-600" : "text-amber-600"
                        )}>
                          {result.model_metrics.auc >= 0.9 ? 'Excellent' :
                            result.model_metrics.auc >= 0.8 ? 'Good' :
                              result.model_metrics.auc >= 0.7 ? 'Acceptable' : 'Poor'}
                        </p>
                      )}
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-deep-800 rounded-lg text-center">
                      <p className="text-2xl font-bold text-marine-600">
                        {result.model_metrics.tss?.toFixed(3) || 'N/A'}
                      </p>
                      <p className="text-xs text-deep-500">TSS</p>
                      {result.model_metrics.tss && (
                        <p className={cn(
                          "text-[10px] mt-1",
                          result.model_metrics.tss >= 0.5 ? "text-green-600" : "text-amber-600"
                        )}>
                          {result.model_metrics.tss >= 0.7 ? 'Excellent' :
                            result.model_metrics.tss >= 0.5 ? 'Good' : 'Fair'}
                        </p>
                      )}
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-deep-800 rounded-lg text-center">
                      <p className="text-2xl font-bold text-coral-600">
                        {result.suitable_area?.toLocaleString() || 0}
                      </p>
                      <p className="text-xs text-deep-500">Suitable km²</p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-deep-800 rounded-lg text-center">
                      <p className="text-2xl font-bold text-abyss-600">
                        {result.hotspots?.length || 0}
                      </p>
                      <p className="text-xs text-deep-500">Hotspots</p>
                    </div>
                  </div>

                  {/* Collinearity Warnings (if any) */}
                  {result.collinearity_warnings && result.collinearity_warnings.length > 0 && (
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                            Collinearity Warning
                          </p>
                          <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">
                            Selected variables show high correlation (|r| &gt; 0.7). This may inflate model performance and reduce interpretability.
                          </p>
                          <ul className="text-[10px] text-amber-600 dark:text-amber-500 mt-1 space-y-0.5">
                            {result.collinearity_warnings.map((warn, i) => (
                              <li key={i}>• {warn}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Variable Importance Chart */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-deep-700 dark:text-gray-300 mb-3">
                      Variable Importance
                    </h4>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={importanceData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis type="number" domain={[0, 100]} />
                          <YAxis dataKey="name" type="category" width={120} />
                          <Tooltip
                            formatter={(value: number) => [`${value}%`, 'Importance']}
                          />
                          <Bar dataKey="value" fill="#0891b2" radius={[0, 4, 4, 0]}>
                            {importanceData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Environmental Profile */}
                  {result.environmental_profile && (
                    <div>
                      <h4 className="text-sm font-medium text-deep-700 dark:text-gray-300 mb-3">
                        Environmental Preferences
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {Object.entries(result.environmental_profile).map(([key, profile]) => (
                          <div key={key} className="p-3 border rounded-lg">
                            <p className="text-sm font-medium capitalize mb-2">{key}</p>
                            <div className="space-y-1 text-xs text-deep-500">
                              <p>Min: {profile.min?.toFixed(1)}</p>
                              <p>Optimal: <span className="text-ocean-600 font-medium">{profile.optimal?.toFixed(1)}</span></p>
                              <p>Max: {profile.max?.toFixed(1)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reproducibility Metadata */}
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-deep-400" />
                      <h4 className="text-sm font-medium text-deep-700 dark:text-gray-300">Model Run Metadata</h4>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      <div className="p-2 bg-gray-50 dark:bg-deep-800 rounded">
                        <p className="text-deep-400 mb-0.5">Model</p>
                        <p className="font-medium text-deep-700 dark:text-gray-200">{result.model_type.toUpperCase()}</p>
                      </div>
                      <div className="p-2 bg-gray-50 dark:bg-deep-800 rounded">
                        <p className="text-deep-400 mb-0.5">Species</p>
                        <p className="font-medium text-deep-700 dark:text-gray-200 truncate">{result.species}</p>
                      </div>
                      <div className="p-2 bg-gray-50 dark:bg-deep-800 rounded">
                        <p className="text-deep-400 mb-0.5">Variables</p>
                        <p className="font-medium text-deep-700 dark:text-gray-200">{selectedVars.length} selected</p>
                      </div>
                      <div className="p-2 bg-gray-50 dark:bg-deep-800 rounded">
                        <p className="text-deep-400 mb-0.5">Resolution</p>
                        <p className="font-medium text-deep-700 dark:text-gray-200">{resolution}°</p>
                      </div>
                      <div className="p-2 bg-gray-50 dark:bg-deep-800 rounded">
                        <p className="text-deep-400 mb-0.5">Timestamp</p>
                        <p className="font-medium text-deep-700 dark:text-gray-200">
                          {modelRunTimestamp?.toLocaleString() || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Confidence Disclaimer */}
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-deep-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-deep-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-deep-500 dark:text-gray-400">
                        <span className="font-medium">Important:</span> Predictions represent modeled habitat suitability based on environmental correlates, not confirmed species presence. Results should be validated with field observations.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Hotspots Map Placeholder */}
              {result.hotspots && result.hotspots.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">High Suitability Hotspots</CardTitle>
                    <CardDescription>Locations with highest predicted habitat suitability</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            dataKey="lon"
                            name="Longitude"
                            unit="°"
                            domain={['auto', 'auto']}
                          />
                          <YAxis
                            type="number"
                            dataKey="lat"
                            name="Latitude"
                            unit="°"
                            domain={['auto', 'auto']}
                          />
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            formatter={(value: number, name: string) => [
                              name === 'suitability' ? `${value}%` : value.toFixed(4),
                              name
                            ]}
                          />
                          <Legend />
                          <Scatter
                            name="Hotspots"
                            data={hotspotsData}
                            fill="#0891b2"
                          >
                            {hotspotsData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={`rgba(8, 145, 178, ${entry.suitability / 100})`}
                              />
                            ))}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Hotspot Table */}
                    <div className="mt-4 max-h-[200px] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-deep-800 sticky top-0">
                          <tr>
                            <th className="p-2 text-left">#</th>
                            <th className="p-2 text-left">Latitude</th>
                            <th className="p-2 text-left">Longitude</th>
                            <th className="p-2 text-left">Suitability</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.hotspots.slice(0, 10).map((h, i) => (
                            <tr key={i} className="border-t dark:border-gray-700">
                              <td className="p-2">{i + 1}</td>
                              <td className="p-2">{h.lat.toFixed(4)}</td>
                              <td className="p-2">{h.lon.toFixed(4)}</td>
                              <td className="p-2">
                                <Badge variant={h.suitability > 0.8 ? 'success' : h.suitability > 0.5 ? 'warning' : 'secondary'}>
                                  {(h.suitability * 100).toFixed(1)}%
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Loading State */}
          {modelMutation.isPending && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-ocean-500" />
                  <h3 className="text-lg font-medium text-deep-900 dark:text-gray-100 mb-2">
                    Running Niche Model
                  </h3>
                  <p className="text-deep-500 dark:text-gray-400 mb-4">
                    Analyzing environmental preferences and predicting habitat suitability...
                  </p>
                  <Progress value={60} variant="gradient" className="max-w-xs mx-auto" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {modelMutation.isError && (
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="py-6">
                <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
                  <AlertCircle className="w-6 h-6" />
                  <div>
                    <p className="font-medium">Model failed</p>
                    <p className="text-sm opacity-80">
                      {modelMutation.error?.message || 'Please check your input data and try again'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Help Card */}
          {!result && !modelMutation.isPending && (
            <Card className="bg-ocean-50 dark:bg-ocean-900/20 border-ocean-200 dark:border-ocean-800">
              <CardContent className="py-6">
                <div className="flex items-start gap-4">
                  <Info className="w-6 h-6 text-ocean-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-ocean-900 dark:text-ocean-100 mb-2">
                      About Species Distribution Modeling
                    </h4>
                    <div className="text-sm text-ocean-700 dark:text-ocean-300 space-y-2">
                      <p>
                        Environmental Niche Modeling (ENM) predicts where a species is likely to occur
                        based on environmental conditions at known occurrence locations.
                      </p>
                      <p>
                        <strong>To run a model:</strong>
                      </p>
                      <ol className="list-decimal ml-4 space-y-1">
                        <li>Upload occurrence records (latitude, longitude) or enter them manually</li>
                        <li>Select environmental variables relevant to your species</li>
                        <li>Choose a modeling algorithm (MaxEnt recommended for most cases)</li>
                        <li>Click "Run Model" to generate habitat suitability predictions</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
