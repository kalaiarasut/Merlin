import axios, { AxiosInstance, AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 60000,
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
  }) => apiClient.post<any>('/analytics/generate-report', params),
  
  quickReport: (params: {
    analysis_type: string;
    data: any;
    format?: string;
  }) => apiClient.post<any>('/analytics/quick-report', params),
};

// AI service
export const aiService = {
  chat: (message: string, context?: any) =>
    apiClient.post<{ response: string }>('/ai/chat', { message, context }),
  
  classifyFish: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return apiClient.upload<any>('/ai/classify-fish', formData);
  },
  
  extractMetadata: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload<any>('/ai/extract-metadata', formData);
  },
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

export default apiClient;
