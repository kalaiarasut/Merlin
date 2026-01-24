import axios, { AxiosInstance, AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = API_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 600000, // 10 minute timeout for LLM + FishBase responses
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth-storage');
        if (token) {
          const parsed = JSON.parse(token);
          if (parsed.state?.token) {
            config.headers.Authorization = `Bearer ${parsed.state.token}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('auth-storage');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, params?: any): Promise<T> {
    const response = await this.client.get<T>(url, { params });
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.put<T>(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete<T>(url);
    return response.data;
  }

  async upload<T>(url: string, formData: FormData, onProgress?: (progress: number) => void): Promise<T> {
    const response = await this.client.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
    return response.data;
  }
}

export const apiClient = new ApiClient();
export const aiServicesClient = new ApiClient('http://localhost:8000');

// Auth service
export const authService = {
  login: (email: string, password: string) =>
    apiClient.post<{ user: any; token: string }>('/auth/login', { email, password }),

  register: (data: any) =>
    apiClient.post('/auth/register', data),

  logout: () =>
    apiClient.post('/auth/logout', {}),

  getCurrentUser: () =>
    apiClient.get<any>('/auth/me'),
};

// User Management service (Admin)
export const userService = {
  getAll: (params?: { page?: number; limit?: number; search?: string; role?: string; status?: string }) =>
    apiClient.get<{ users: any[]; pagination: any }>('/auth/users', params),

  getById: (id: string) =>
    apiClient.get<any>(`/auth/users/${id}`),

  update: (id: string, data: { name?: string; email?: string; role?: string; status?: string; organization?: string }) =>
    apiClient.put<any>(`/auth/users/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<any>(`/auth/users/${id}`),

  resetPassword: (id: string, newPassword: string) =>
    apiClient.post<any>(`/auth/users/${id}/reset-password`, { newPassword }),

  getStats: () =>
    apiClient.get<any>('/auth/stats'),

  create: (data: { name: string; email: string; password: string; role: string; organization: string }) =>
    apiClient.post('/auth/register', data),
};

// Species service
export const speciesService = {
  getAll: (params?: any) =>
    apiClient.get<{ data: any[]; pagination: any }>('/species', params),

  getById: (id: string) =>
    apiClient.get<any>(`/species/${id}`),

  search: (query: string) =>
    apiClient.get<any[]>('/species/search', { q: query }),

  create: (data: any) =>
    apiClient.post('/species', data),

  update: (id: string, data: any) =>
    apiClient.put(`/species/${id}`, data),

  delete: (id: string) =>
    apiClient.delete(`/species/${id}`),
};

// Oceanography service
export const oceanographyService = {
  getData: (params?: any) =>
    apiClient.get<{ data: any[]; pagination: any }>('/oceanography', params),

  getParameters: () =>
    apiClient.get<any[]>('/oceanography/parameters'),

  getTimeRange: () =>
    apiClient.get<{ start_date: string; end_date: string; total_records: number }>('/oceanography/time-range'),

  getStats: (params?: any) =>
    apiClient.get<any[]>('/oceanography/stats', params),

  getHeatmap: (params?: any) =>
    apiClient.get<any[]>('/oceanography/heatmap', params),

  getSources: () =>
    apiClient.get<any[]>('/oceanography/sources'),
};

// Otolith service
export const otolithService = {
  getAll: (params?: any) =>
    apiClient.get<{ data: any[]; pagination: any }>('/otoliths', params),

  getById: (id: string) =>
    apiClient.get<any>(`/otoliths/${id}`),

  analyze: (file: File, metadata?: any) => {
    const formData = new FormData();
    formData.append('image', file);
    if (metadata) {
      Object.keys(metadata).forEach(key => formData.append(key, metadata[key]));
    }
    return apiClient.upload<any>('/otoliths/analyze', formData);
  },

  findSimilar: (id: string) =>
    apiClient.get<any[]>(`/otoliths/${id}/similar`),

  getStats: () =>
    apiClient.get<any>('/otoliths/stats/summary'),

  create: (data: any) =>
    apiClient.post('/otoliths', data),

  bulkImport: (records: any[]) =>
    apiClient.post('/otoliths/bulk', { records }),
};

// eDNA service
export const ednaService = {
  getAll: (params?: any) =>
    apiClient.get<{ data: any[]; pagination: any }>('/edna', params),

  getById: (id: string) =>
    apiClient.get<any>(`/edna/${id}`),

  getStats: () =>
    apiClient.get<any>('/edna/stats/summary'),

  getDetectionsBySpecies: () =>
    apiClient.get<any[]>('/edna/detections/by-species'),

  getMethods: () =>
    apiClient.get<string[]>('/edna/meta/methods'),

  getRegions: () =>
    apiClient.get<string[]>('/edna/meta/regions'),

  create: (data: any) =>
    apiClient.post('/edna', data),

  bulkImport: (samples: any[]) =>
    apiClient.post('/edna/bulk', { samples }),

  // ======================================
  // NEW: eDNA Pipeline API Functions
  // ======================================

  // Pipeline Info
  getPipelineInfo: () =>
    apiClient.get<any>('/ai/edna/pipeline/info'),

  // DADA2-Style Denoising
  denoise: (params: {
    samples: Record<string, Array<{ sequence: string; quality?: string }>>;
    min_abundance?: number;
    min_quality?: number;
    min_length?: number;
    max_length?: number;
    singleton_removal?: boolean;
  }) =>
    apiClient.post<any>('/ai/edna/denoise', params),

  getDenoiseInfo: () =>
    apiClient.get<any>('/ai/edna/denoise/info'),

  // Chimera Detection
  detectChimeras: (params: {
    sequences: Array<{ id: string; sequence: string; abundance: number }>;
    marker_type?: string;
    use_reference?: boolean;
    reference_sequences?: Array<{ id: string; sequence: string }>;
  }) =>
    apiClient.post<any>('/ai/edna/chimera/detect', params),

  getChimeraThresholds: () =>
    apiClient.get<any>('/ai/edna/chimera/thresholds'),

  // Taxonomy LCA
  assignTaxonomyLCA: (params: {
    asv_hits: Record<string, Array<{
      accession: string;
      taxid: number;
      species: string;
      pident: number;
      length: number;
      bitscore: number;
      qcovs: number;
      taxonomy: Record<string, string>;
    }>>;
    silva_taxonomies?: Record<string, Record<string, string>>;
  }) =>
    apiClient.post<any>('/ai/edna/taxonomy/lca', params),

  // BIOM Export
  exportBiom: (params: {
    observations: Array<{ id: string; sample_abundances: Record<string, number> }>;
    samples: Array<{ sample_id: string;[key: string]: any }>;
    taxonomy?: Record<string, Record<string, string>>;
    bootstrap_scores?: Record<string, number[]>;
    analysis_mode?: 'ASV' | 'OTU';
    otu_identity_threshold?: number;
  }) =>
    apiClient.post<any>('/ai/edna/export/biom', params),

  // Report Generation
  generateReport: (params: {
    analysis_results: Record<string, any>;
    sample_metadata: Array<Record<string, any>>;
    parameters: Record<string, any>;
    figures?: Array<Record<string, any>>;
    negative_controls?: Record<string, any>;
  }) =>
    apiClient.post<any>('/ai/edna/report/generate', params),

  getAvailableCitations: () =>
    apiClient.get<any>('/ai/edna/report/citations'),

  // SILVA Classification
  classifySilva: (params: {
    sequences: Array<{ id: string; sequence: string }>;
    marker_type?: string;
    bootstrap?: boolean;
  }) =>
    apiClient.post<any>('/ai/edna/silva/classify', params),

  getSilvaInfo: () =>
    apiClient.get<any>('/ai/edna/silva/info'),

  // BLAST
  runBlast: (params: {
    sequences: Array<{ id: string; sequence: string }>;
    database?: string;
    use_cache?: boolean;
  }) =>
    apiClient.post<any>('/ai/edna/blast', params),

  // Job Queue
  getJobStatus: (jobId: string) =>
    apiClient.get<any>(`/ai/edna/jobs/${jobId}`),

  getJobQueueInfo: () =>
    apiClient.get<any>('/ai/edna/jobs/queue/info'),
};

// Ingestion service
export const ingestionService = {
  upload: (file: File, dataType: string, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dataType', dataType);
    return apiClient.upload<any>('/ingest', formData, onProgress);
  },

  analyze: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload<{
      filename: string;
      fileSize: number;
      recordCount: number;
      detectedType: string;
      confidence: number;
      indicators: string[];
      sampleFields: string[];
      sampleData: any[];
    }>('/ingest/analyze', formData);
  },

  getJobs: () =>
    apiClient.get<any[]>('/ingest/jobs'),

  getJobStatus: (jobId: string) =>
    apiClient.get<any>(`/ingest/jobs/${jobId}`),

  deleteJob: (jobId: string) =>
    apiClient.delete<{ message: string; jobId: string; dataType: string; recordsDeleted: number }>(`/ingest/jobs/${jobId}`),

  bulkDeleteJobs: async (jobIds: string[]) => {
    const results = await Promise.allSettled(
      jobIds.map(jobId => apiClient.delete<{ message: string; jobId: string; dataType: string; recordsDeleted: number }>(`/ingest/jobs/${jobId}`))
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    return { succeeded, failed, total: jobIds.length };
  },

  // Metadata extraction
  extractMetadata: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload<{
      success: boolean;
      filename: string;
      extracted_metadata: any;
      auto_tags: string[];
      data_classification: string;
      confidence: number;
    }>('/ingest/extract-metadata', formData);
  },

  extractMetadataText: (content: string, contentType?: string) =>
    apiClient.post<{
      success: boolean;
      extracted_metadata: any;
      auto_tags: string[];
      data_classification: string;
      confidence: number;
    }>('/ingest/extract-metadata-text', { content, content_type: contentType || 'text' }),
};

// Analytics service
export const analyticsService = {
  correlate: (params: any) =>
    apiClient.post<any>('/analytics/correlate', params),

  getStats: () =>
    apiClient.get<any>('/analytics/stats'),

  getTrends: (period?: string) =>
    apiClient.get<any>('/analytics/trends', { period }),

  getDistribution: () =>
    apiClient.get<any[]>('/analytics/distribution'),

  getSpeciesByPhylum: () =>
    apiClient.get<any[]>('/analytics/species-by-phylum'),

  getGrowth: (months?: number) =>
    apiClient.get<any[]>('/analytics/growth', { months }),

  export: (format: string, domain: string, filters?: any) =>
    apiClient.post<any>('/analytics/export', { format, domain, filters }),

  // Environmental Niche Modeling
  nicheModel: (params: {
    occurrence_data: any[];
    environmental_variables?: string[];
    model_type?: string;
    prediction_resolution?: number;
    study_area?: string;  // 'arabian_sea' | 'bay_of_bengal' | 'indian_ocean'
    n_background?: number;  // Default: 10000
  }) => apiClient.post<any>('/analytics/niche-model', params),

  predictSuitability: (params: {
    locations: Array<{ lat: number; lon: number }>;
    species: string;
    env_conditions?: Record<string, number>;
  }) => apiClient.post<any>('/analytics/predict-suitability', params),

  // Report Generation
  generateReport: (params: {
    title: string;
    report_type: string;
    format: string;
    sections?: any[];
    data?: any;
    abstract?: string;
    keywords?: string[];
    use_llm?: boolean;
  }) => apiClient.post<any>('/analytics/generate-report', params),

  quickReport: (params: {
    analysis_type: string;
    data: any;
    format?: string;
    use_llm?: boolean;
  }) => apiClient.post<any>('/analytics/quick-report', params),
};

// Correlation service - Cross-domain analysis
export const correlationService = {
  // Correlate species with environmental data
  speciesEnvironment: (params?: {
    species?: string;
    parameter?: string;
    minDepth?: number;
    maxDepth?: number;
    startDate?: string;
    endDate?: string;
  }) => apiClient.get<{
    species: { count: number; families: string[]; conservationStatuses: Record<string, number> };
    environment: { parameters: any[]; summary: any };
    insights: string[];
  }>('/correlation/species-environment', params),

  // Get biodiversity hotspots
  biodiversityHotspots: (gridSize?: number) =>
    apiClient.get<{
      gridSize: number;
      hotspots: Array<{ region: string; speciesCount: number; diversityIndex: number; species: string[] }>;
      environmentalGrids: number;
      speciesRegions: number;
    }>('/correlation/biodiversity-hotspots', { gridSize }),

  // Get environmental profile for a species
  environmentalProfile: (speciesName: string) =>
    apiClient.get<{
      species: any;
      environmentalPreferences: any;
      distribution: string[];
      aiMetadata: any;
    }>(`/correlation/environmental-profile/${encodeURIComponent(speciesName)}`),

  // Get overall data summary
  summary: () =>
    apiClient.get<{
      species: { total: number; families: number; genera: number; aiEnhanced: number };
      oceanography: any;
      edna: { totalSamples: number; uniqueSpecies: number };
      lastUpdated: string;
    }>('/correlation/summary'),
};

// AI service
export const aiService = {
  chat: (message: string, context?: any, requestId?: string, provider?: 'groq' | 'ollama' | 'ollama_agent' | 'auto') =>
    apiClient.post<{ response: string }>('/ai/chat', { message, context, requestId, provider }),

  // Streaming chat - yields tokens as they're generated
  // Calls Python directly to avoid Express auth issues with streaming
  chatStream: async function* (message: string, context?: any, requestId?: string, provider?: 'groq' | 'ollama' | 'ollama_agent' | 'auto') {
    const response = await fetch('http://localhost:8000/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message, context, request_id: requestId, provider })
    });

    if (!response.ok) {
      throw new Error('Streaming failed');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              yield { type: 'token', content: data.token };
            }
            if (data.done) {
              yield { type: 'done', content: data.full_response };
            }
            if (data.error) {
              yield { type: 'error', content: data.error };
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  },

  classifyFish: async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await apiClient.upload<any>('/ai/classify-fish', formData);

    // Get FishBase data if available
    const fb = response.fishbase || {};

    // Build description: Only use comprehensive bio from scraper
    // Other data (Danger, Diet, Depth, etc.) is displayed in the UI grid separately
    let description = '';

    // Add the comprehensive description if available (from scraper)
    if (fb.description) {
      description = fb.description;
    }

    // Map backend response to frontend interface
    return {
      species: response.common_name || response.species || 'Unknown',
      scientificName: response.scientific_name || response.species || 'Unknown',
      confidence: response.overall_confidence || response.species_confidence || 0,
      family: response.family || 'Unknown',
      commonNames: response.common_name ? [response.common_name] : [],
      conservationStatus: fb.vulnerability ? `Vulnerability: ${fb.vulnerability}` : undefined,
      habitat: response.habitat || fb.habitat_details?.description || undefined,
      description: description.trim() || undefined,
      alternatives: response.top_predictions?.slice(1)?.map((p: any) => ({
        species: p.species,
        scientificName: p.species,
        confidence: p.confidence
      })) || [],
      // Additional FishBase data
      fishbase: fb
    };
  },

  extractMetadata: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload<any>('/ai/extract-metadata', formData);
  },

  // Research paper search
  paperSearch: async (query: string, limit: number = 20) => {
    return aiServicesClient.post<{
      success: boolean;
      total: number;
      papers: any[];
      query: string;
    }>('/research/papers', { query, limit });
  },

  // Export citations in various formats
  exportCitations: async (papers: any[], format: 'bibtex' | 'ris' | 'apa' | 'mla') => {
    return aiServicesClient.post<{
      success: boolean;
      format: string;
      text: string;
      count: number;
    }>('/research/export', { papers, format });
  },

  // Get similar papers for a given paper
  getSimilarPapers: async (paperId: string, limit: number = 10) => {
    return aiServicesClient.get<{
      success: boolean;
      count: number;
      papers: any[];
      source_paper_id: string;
    }>(`/research/similar?paper_id=${encodeURIComponent(paperId)}&limit=${limit}`);
  },
};

// Audit & Provenance Service
export const auditService = {
  // Activity Logs
  getLogs: (params?: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    userId?: string;
    entityType?: string;
    action?: string;
    severity?: string;
  }) => apiClient.get<{
    logs: any[];
    pagination: { total: number; page: number; limit: number; pages: number; }
  }>('/audit/activity', params),

  getStats: (params?: { startDate?: string; endDate?: string }) =>
    apiClient.get<any>('/audit/stats', params),

  // Dataset Versioning
  getDatasetVersions: (datasetId: string) =>
    apiClient.get<any>(`/audit/versioning/${datasetId}/history`),

  getVersion: (datasetId: string, version: number) =>
    apiClient.get<any>(`/audit/versioning/${datasetId}/version/${version}`),

  restoreVersion: (datasetId: string, version: number) =>
    apiClient.post<any>(`/audit/versioning/${datasetId}/restore`, { version }),

  compareVersions: (datasetId: string, v1: number, v2: number) =>
    apiClient.get<any>(`/audit/versioning/${datasetId}/compare`, { v1, v2 }),

  // Analysis Snapshots
  getSnapshots: (params?: { analysisType?: string; status?: string; limit?: number }) =>
    apiClient.get<{ snapshots: any[] }>('/audit/snapshot', params),

  getSnapshotById: (id: string) =>
    apiClient.get<any>(`/audit/snapshot/${id}`),

  verifySnapshot: (id: string) =>
    apiClient.post<{
      verified: boolean;
      matches: boolean;
      details: string;
      checksum_generated: string;
      checksum_recorded: string;
    }>(`/audit/snapshot/${id}/verify`, {}),

  exportSnapshot: (id: string) =>
    apiClient.get<any>(`/audit/snapshot/${id}/export`),
};

// Curation Service (Scientific Review)
export const curationService = {
  getQueue: () =>
    apiClient.get<any[]>('/curation/queue'),

  getDetail: (entityType: string, id: string) =>
    apiClient.get<any>(`/curation/detail/${entityType}/${id}`),

  submitAction: (entityType: string, id: string, action: 'approve' | 'reject' | 'flag', data: {
    comment?: string;
    scope?: string;
    snapshot?: {
      fieldsValidated: string[];
      previousValues?: Record<string, any>;
    };
  }) =>
    apiClient.post<any>(`/curation/${entityType}/${id}/${action}`, data),
};

// Notification service
export const notificationService = {
  getAll: (params?: { page?: number; limit?: number; unreadOnly?: boolean }) =>
    apiClient.get<{
      notifications: any[];
      unreadCount: number;
      pagination: any
    }>('/notifications', params),

  getUnreadCount: () =>
    apiClient.get<{ count: number }>('/notifications/unread-count'),

  markAsRead: (id: string) =>
    apiClient.put<any>(`/notifications/${id}/read`, {}),

  markAllAsRead: () =>
    apiClient.put<any>('/notifications/mark-all-read', {}),

  delete: (id: string) =>
    apiClient.delete<any>(`/notifications/${id}`),

  clearAll: () =>
    apiClient.delete<any>('/notifications'),

  create: (data: { title: string; description: string; type?: string; category?: string }) =>
    apiClient.post<any>('/notifications', data),
};

// Institute service (Multi-Institute Governance)
export const instituteService = {
  getAll: () =>
    apiClient.get<{ institutes: any[] }>('/institutes'),

  getById: (id: string) =>
    apiClient.get<any>(`/institutes/${id}`),

  create: (data: { code: string; name: string; type: string; parentMinistry?: string; location: any; settings?: any }) =>
    apiClient.post<any>('/institutes', data),

  update: (id: string, data: any) =>
    apiClient.put<any>(`/institutes/${id}`, data),

  updateStatus: (id: string, status: 'active' | 'suspended', reason: string) =>
    apiClient.put<any>(`/institutes/${id}/status`, { status, reason }),

  getMembers: (id: string) =>
    apiClient.get<{ members: any[]; total: number }>(`/institutes/${id}/members`),

  addMember: (id: string, userId: string) =>
    apiClient.post<any>(`/institutes/${id}/members`, { userId }),
};

// Project service (Multi-Institute Governance)
export const projectService = {
  getAll: (params?: { status?: string; instituteId?: string }) =>
    apiClient.get<{ projects: any[] }>('/projects', params),

  getById: (id: string) =>
    apiClient.get<any>(`/projects/${id}`),

  create: (data: { code: string; name: string; description?: string; startDate: string; dataPolicy?: any; instituteId?: string }) =>
    apiClient.post<any>('/projects', data),

  update: (id: string, data: any) =>
    apiClient.put<any>(`/projects/${id}`, data),

  updateVisibility: (id: string, visibility: 'private' | 'institute' | 'public', reason: string) =>
    apiClient.put<any>(`/projects/${id}/visibility`, { visibility, reason }),

  updateEmbargo: (id: string, embargoEndDate: string | null, reason: string) =>
    apiClient.put<any>(`/projects/${id}/embargo`, { embargoEndDate, reason }),

  addMember: (id: string, userId: string, role: 'lead' | 'contributor' | 'viewer') =>
    apiClient.post<any>(`/projects/${id}/members`, { userId, role }),

  removeMember: (projectId: string, userId: string) =>
    apiClient.delete<any>(`/projects/${projectId}/members/${userId}`),
};

export default apiClient;
