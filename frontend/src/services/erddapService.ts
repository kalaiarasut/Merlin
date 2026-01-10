/**
 * ERDDAP Service (Frontend)
 * 
 * Client-side service to fetch real oceanographic data from backend ERDDAP endpoints.
 */

import { apiClient } from './api';

export interface ERDDAPDataPoint {
    latitude: number;
    longitude: number;
    value: number;
    time: string;
    parameter: string;
    unit: string;
    source: 'NOAA_ERDDAP';
    dataType: 'observed';
    quality: 'good' | 'questionable' | 'missing';
}

export interface ERDDAPResponse {
    success: boolean;
    source: string;
    parameter: string;
    unit: string;
    dataType: 'observed' | 'modeled' | 'simulated';
    timestamp: string;
    bounds: {
        latMin: number;
        latMax: number;
        lonMin: number;
        lonMax: number;
    };
    data: ERDDAPDataPoint[];
    metadata: {
        datasetId: string;
        attribution: string;
        lastUpdated: string;
        resolution: string;
    };
}

export interface DataSource {
    id: string;
    name: string;
    parameter: string;
    type: 'observed' | 'modeled' | 'simulated';
    resolution: string;
    updateFrequency: string;
    attribution: string;
}

export interface BoundsQuery {
    latMin?: number;
    latMax?: number;
    lonMin?: number;
    lonMax?: number;
    date?: string;
    stride?: number;
}

class ERDDAPService {
    private baseUrl = '/oceanography/erddap';

    /**
     * Fetch real SST data from NOAA ERDDAP
     */
    async fetchSST(options: BoundsQuery = {}): Promise<ERDDAPResponse> {
        try {
            const params = new URLSearchParams();
            if (options.latMin !== undefined) params.append('latMin', options.latMin.toString());
            if (options.latMax !== undefined) params.append('latMax', options.latMax.toString());
            if (options.lonMin !== undefined) params.append('lonMin', options.lonMin.toString());
            if (options.lonMax !== undefined) params.append('lonMax', options.lonMax.toString());
            if (options.date) params.append('date', options.date);
            if (options.stride) params.append('stride', options.stride.toString());

            const response = await apiClient.get<ERDDAPResponse>(`${this.baseUrl}/sst?${params.toString()}`);
            return response;
        } catch (error) {
            console.error('Failed to fetch SST data:', error);
            return this.getEmptyResponse('temperature', '°C');
        }
    }

    /**
     * Fetch real Chlorophyll data from NOAA ERDDAP
     */
    async fetchChlorophyll(options: BoundsQuery = {}): Promise<ERDDAPResponse> {
        try {
            const params = new URLSearchParams();
            if (options.latMin !== undefined) params.append('latMin', options.latMin.toString());
            if (options.latMax !== undefined) params.append('latMax', options.latMax.toString());
            if (options.lonMin !== undefined) params.append('lonMin', options.lonMin.toString());
            if (options.lonMax !== undefined) params.append('lonMax', options.lonMax.toString());
            if (options.date) params.append('date', options.date);
            if (options.stride) params.append('stride', (options.stride || 10).toString());

            const response = await apiClient.get<ERDDAPResponse>(`${this.baseUrl}/chlorophyll?${params.toString()}`);
            return response;
        } catch (error) {
            console.error('Failed to fetch Chlorophyll data:', error);
            return this.getEmptyResponse('chlorophyll', 'mg/m³');
        }
    }

    /**
     * Fetch real Salinity data from NOAA ERDDAP
     */
    async fetchSalinity(options: BoundsQuery = {}): Promise<ERDDAPResponse> {
        try {
            const params = new URLSearchParams();
            if (options.latMin !== undefined) params.append('latMin', options.latMin.toString());
            if (options.latMax !== undefined) params.append('latMax', options.latMax.toString());
            if (options.lonMin !== undefined) params.append('lonMin', options.lonMin.toString());
            if (options.lonMax !== undefined) params.append('lonMax', options.lonMax.toString());
            if (options.date) params.append('date', options.date);
            if (options.stride) params.append('stride', options.stride.toString());

            const response = await apiClient.get<ERDDAPResponse>(`${this.baseUrl}/salinity?${params.toString()}`);
            return response;
        } catch (error) {
            console.error('Failed to fetch Salinity data:', error);
            return this.getEmptyResponse('salinity', 'PSU');
        }
    }

    /**
     * Fetch data by parameter name
     */
    async fetchByParameter(parameter: string, options: BoundsQuery = {}): Promise<ERDDAPResponse> {
        switch (parameter.toLowerCase()) {
            case 'temperature':
            case 'sst':
                return this.fetchSST(options);
            case 'chlorophyll':
            case 'chlorophyll-a':
                return this.fetchChlorophyll(options);
            case 'salinity':
                return this.fetchSalinity(options);
            default:
                return this.getEmptyResponse(parameter, '');
        }
    }

    /**
     * Get available data sources
     */
    async getDataSources(): Promise<{ sources: DataSource[]; cache: any; status: string }> {
        try {
            const response = await apiClient.get<{ sources: DataSource[]; cache: any; status: string }>(`${this.baseUrl}/sources`);
            return response;
        } catch (error) {
            console.error('Failed to fetch data sources:', error);
            return { sources: [], cache: { entries: 0, keys: [] }, status: 'offline' };
        }
    }

    /**
     * Refresh cache (force fresh data on next request)
     */
    async refreshCache(): Promise<{ success: boolean; message: string }> {
        try {
            const response = await apiClient.post<{ success: boolean; message: string }>(`${this.baseUrl}/refresh`);
            return response;
        } catch (error) {
            console.error('Failed to refresh cache:', error);
            return { success: false, message: 'Failed to refresh cache' };
        }
    }

    /**
     * Generate empty response for error cases
     */
    private getEmptyResponse(parameter: string, unit: string): ERDDAPResponse {
        return {
            success: false,
            source: 'NOAA_ERDDAP',
            parameter,
            unit,
            dataType: 'observed',
            timestamp: new Date().toISOString(),
            bounds: { latMin: -15, latMax: 25, lonMin: 50, lonMax: 100 },
            data: [],
            metadata: {
                datasetId: 'unavailable',
                attribution: 'NOAA CoastWatch',
                lastUpdated: 'unavailable',
                resolution: 'unknown',
            },
        };
    }
}

export const erddapService = new ERDDAPService();
export default erddapService;
