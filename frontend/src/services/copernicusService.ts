/**
 * Copernicus Service (Frontend)
 * 
 * Client-side service to fetch modeled DO and pH data from backend Copernicus endpoints.
 */

import { apiClient } from './api';

export interface CopernicusDataPoint {
    latitude: number;
    longitude: number;
    value: number;
    depth: number;
    time: string;
    parameter: string;
    unit: string;
    source: 'Copernicus';
    dataType: 'modeled';
}

export interface CopernicusResponse {
    success: boolean;
    parameter: string;
    primarySource: 'Copernicus model';
    secondarySource: 'Argo in-situ';
    spatialCoverage: 'global';
    temporalResolution: 'monthly';
    measurementType: ['modeled'];
    validationSource: 'Argo in-situ';
    verticalReference: string;
    unit: string;
    data: CopernicusDataPoint[];
    metadata: {
        productId: string;
        attribution: string;
        lastUpdated: string;
        depthLevel: number;
    };
}

export interface BoundsQuery {
    latMin?: number;
    latMax?: number;
    lonMin?: number;
    lonMax?: number;
    depth?: number;
    stride?: number;
}

class CopernicusService {
    // apiClient already has /api base, so use relative path
    private baseUrl = '/oceanography/biogeochem';

    /**
     * Fetch Dissolved Oxygen data from Copernicus
     * 
     * Default depth: surface (0-5m)
     * Unit: mg/L
     */
    async fetchDissolvedOxygen(options: BoundsQuery = {}): Promise<CopernicusResponse> {
        try {
            const params = new URLSearchParams();
            if (options.latMin !== undefined) params.append('latMin', options.latMin.toString());
            if (options.latMax !== undefined) params.append('latMax', options.latMax.toString());
            if (options.lonMin !== undefined) params.append('lonMin', options.lonMin.toString());
            if (options.lonMax !== undefined) params.append('lonMax', options.lonMax.toString());
            if (options.depth !== undefined) params.append('depth', options.depth.toString());
            if (options.stride) params.append('stride', options.stride.toString());

            const response = await apiClient.get<CopernicusResponse>(`${this.baseUrl}/do?${params.toString()}`);
            return response;
        } catch (error) {
            console.error('Failed to fetch DO data:', error);
            return this.getEmptyResponse('dissolved_oxygen', 'mg/L');
        }
    }

    /**
     * Fetch pH data from Copernicus
     * 
     * Default depth: surface (0-5m)
     * Unit: pH units
     */
    async fetchPH(options: BoundsQuery = {}): Promise<CopernicusResponse> {
        try {
            const params = new URLSearchParams();
            if (options.latMin !== undefined) params.append('latMin', options.latMin.toString());
            if (options.latMax !== undefined) params.append('latMax', options.latMax.toString());
            if (options.lonMin !== undefined) params.append('lonMin', options.lonMin.toString());
            if (options.lonMax !== undefined) params.append('lonMax', options.lonMax.toString());
            if (options.depth !== undefined) params.append('depth', options.depth.toString());
            if (options.stride) params.append('stride', options.stride.toString());

            const response = await apiClient.get<CopernicusResponse>(`${this.baseUrl}/ph?${params.toString()}`);
            return response;
        } catch (error) {
            console.error('Failed to fetch pH data:', error);
            return this.getEmptyResponse('ph', 'pH units');
        }
    }

    /**
     * Fetch data by parameter name
     */
    async fetchByParameter(parameter: string, options: BoundsQuery = {}): Promise<CopernicusResponse> {
        switch (parameter.toLowerCase()) {
            case 'dissolved_oxygen':
            case 'do':
                return this.fetchDissolvedOxygen(options);
            case 'ph':
                return this.fetchPH(options);
            default:
                return this.getEmptyResponse(parameter, '');
        }
    }

    /**
     * Generate empty response for error cases
     */
    private getEmptyResponse(parameter: string, unit: string): CopernicusResponse {
        return {
            success: false,
            parameter,
            primarySource: 'Copernicus model',
            secondarySource: 'Argo in-situ',
            spatialCoverage: 'global',
            temporalResolution: 'monthly',
            measurementType: ['modeled'],
            validationSource: 'Argo in-situ',
            verticalReference: 'surface (0–5 m)',
            unit,
            data: [],
            metadata: {
                productId: 'GLOBAL_ANALYSISFORECAST_BGC_001_028',
                attribution: 'E.U. Copernicus Marine Service Information',
                lastUpdated: 'unavailable',
                depthLevel: 0,
            },
        };
    }
}

export const copernicusService = new CopernicusService();
export default copernicusService;
