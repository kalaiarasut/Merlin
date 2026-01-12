export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'expert' | 'researcher' | 'viewer';
  organization: string;
  avatar?: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export interface Species {
  id: string;
  scientificName: string;
  commonName: string;
  taxonomicRank: string;
  kingdom: string;
  phylum: string;
  class: string;
  order: string;
  family: string;
  genus: string;
  taxonId?: string;
  aphiaId?: string;
  description?: string;
  habitat?: string;
  distribution?: string[];
  images?: string[];
  conservationStatus?: string;
  lifeHistory?: LifeHistoryTrait[];
  morphology?: MorphologicalData;
  occurrences?: OccurrenceRecord[];
  ednaDetections?: EdnaDetection[];
  otolithRecords?: OtolithRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface LifeHistoryTrait {
  trait: string;
  value: string | number;
  unit?: string;
  source?: string;
}

export interface MorphologicalData {
  maxLength?: number;
  maxWeight?: number;
  bodyShape?: string;
  coloration?: string;
  measurements?: Record<string, number>;
}

export interface OccurrenceRecord {
  id: string;
  speciesId: string;
  date: string;
  location: {
    latitude: number;
    longitude: number;
    depth?: number;
    locationName?: string;
  };
  abundance?: number;
  basisOfRecord: string;
  catalogNumber?: string;
  recordedBy?: string;
  identifiedBy?: string;
  surveyId?: string;
  oceanParameters?: OceanParameters;
}

export interface OceanParameters {
  temperature?: number;
  salinity?: number;
  chlorophyll?: number;
  dissolvedOxygen?: number;
  pH?: number;
  turbidity?: number;
  nutrients?: Record<string, number>;
}

export interface OtolithRecord {
  id: string;
  speciesId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  measurements: OtolithMeasurements;
  shapeDescriptors?: ShapeDescriptors;
  metadata: {
    collectionDate?: string;
    location?: string;
    fishLength?: number;
    fishWeight?: number;
    age?: number;
    sex?: string;
  };
  predictionConfidence?: number;
  createdAt: string;
}

export interface OtolithMeasurements {
  length: number;
  width: number;
  perimeter: number;
  area: number;
  aspectRatio: number;
  circularity: number;
  rectangularity: number;
}

export interface ShapeDescriptors {
  fourier?: number[];
  wavelet?: number[];
  ellipticFourier?: number[];
}

export interface EdnaDetection {
  id: string;
  sequenceId: string;
  speciesId?: string;
  detectedSpecies: string;
  confidence: number;
  method: 'BLAST' | 'Kraken2' | 'Custom';
  location: {
    latitude: number;
    longitude: number;
    depth?: number;
  };
  sampleDate: string;
  oceanParameters?: OceanParameters;
  sequenceData?: {
    reads: number;
    length: number;
    quality: number;
  };
  createdAt: string;
}

export interface OceanographicData {
  id: string;
  parameter: string;
  value: number;
  unit: string;
  location: {
    latitude: number;
    longitude: number;
    depth?: number;
  };
  timestamp: string;
  source: string;
  quality?: string;
}

export interface Survey {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  vessel?: string;
  chief_scientist?: string;
  objectives?: string[];
  stations: Station[];
  status: 'planned' | 'ongoing' | 'completed';
  metadata?: Record<string, any>;
}

export interface Station {
  id: string;
  surveyId: string;
  stationNumber: string;
  location: {
    latitude: number;
    longitude: number;
  };
  samplingDate: string;
  depth?: number;
  samples: Sample[];
}

export interface Sample {
  id: string;
  stationId: string;
  type: 'water' | 'sediment' | 'biological' | 'edna';
  collectionMethod?: string;
  depth?: number;
  volume?: number;
  metadata?: Record<string, any>;
}

export interface IngestionJob {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  dataType?: string;
  recordsProcessed?: number;
  recordsTotal?: number;
  errors?: string[];
  warnings?: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  completedAt?: string;
}

export interface AnalyticsQuery {
  id: string;
  name: string;
  description?: string;
  query: {
    xAxis: string;
    yAxis: string;
    filters?: Record<string, any>;
    aggregation?: 'mean' | 'sum' | 'count' | 'min' | 'max';
    groupBy?: string[];
  };
  results?: any[];
  createdAt: string;
}

export interface MapLayer {
  id: string;
  name: string;
  type: 'heatmap' | 'scatter' | 'geojson' | 'raster';
  visible: boolean;
  opacity: number;
  data: any;
  style?: any;
}

export interface DashboardStats {
  totalSpecies: number;
  totalOccurrences: number;
  totalOtoliths: number;
  totalEdnaDetections: number;
  totalSurveys: number;
  totalStations: number;
  dataQualityScore: number;
  recentActivity: ActivityLog[];
}

export interface ActivityLog {
  id: string;
  type: 'ingestion' | 'analysis' | 'export' | 'user_action';
  action: string;
  description: string;
  userId?: string;
  userName?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface TaxonomyNode {
  id: string;
  name: string;
  rank: string;
  parentId?: string;
  children?: TaxonomyNode[];
  speciesCount: number;
}
