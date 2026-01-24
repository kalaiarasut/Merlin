/**
 * Argo Service (Frontend)
 * 
 * Client-side service to fetch in-situ BGC float data from backend Argo endpoints.
 * 
 * NOTE: Argo data is near real-time / delayed-mode QC, NOT truly real-time.
 * Coverage is sparse - only where floats happen to be.
 */

import { apiClient } from './api';

export interface ArgoDepthProfile {
    depth: number[];
    doxy?: number[];      // Dissolved oxygen (µmol/kg)
    ph?: number[];        // pH
    temperature?: number[];
    salinity?: number[];
}

export interface ArgoProfile {
    floatId: string;
    cycleNumber: number;
    latitude: number;
    longitude: number;
    timestamp: string;
    profiles: ArgoDepthProfile;
    measurementType: 'in-situ';
    qcMode: 'near-real-time' | 'delayed-mode';
    hasBGC: boolean;
}

export interface ArgoResponse {
    success: boolean;
    source: 'Argo BGC';
    dataType: 'in-situ';
    qcNote: string;
    floats: ArgoProfile[];
    metadata: {
        totalFloats: number;
        maxFloatsLimit: number;
        bounds: {
            latMin: number;
            latMax: number;
            lonMin: number;
            lonMax: number;
        };
        queryTime: string;
    };
}

export interface ArgoFloatResponse {
    success: boolean;
    source: 'Argo BGC';
    dataType: 'in-situ';
    qcNote: string;
    profile: ArgoProfile;
}

export interface BoundsQuery {
    latMin?: number;
    latMax?: number;
    lonMin?: number;
    lonMax?: number;
    startDate?: string;
    endDate?: string;
    maxFloats?: number;
}

class ArgoService {
    // apiClient already has /api base, so use relative path
    private baseUrl = '/oceanography/argo';

    /**
     * Fetch Argo BGC float profiles in a region
     * 
     * NOTE: Argo data is near real-time / delayed-mode QC.
     * maxFloats limit prevents UI overload (default 200).
     */
    async fetchBGCProfiles(options: BoundsQuery = {}): Promise<ArgoResponse> {
        try {
            const params = new URLSearchParams();
            if (options.latMin !== undefined) params.append('latMin', options.latMin.toString());
            if (options.latMax !== undefined) params.append('latMax', options.latMax.toString());
            if (options.lonMin !== undefined) params.append('lonMin', options.lonMin.toString());
            if (options.lonMax !== undefined) params.append('lonMax', options.lonMax.toString());
            if (options.startDate) params.append('startDate', options.startDate);
            if (options.endDate) params.append('endDate', options.endDate);
            if (options.maxFloats) params.append('maxFloats', options.maxFloats.toString());

            const response = await apiClient.get<ArgoResponse>(`${this.baseUrl}/profiles?${params.toString()}`);
            return response;
        } catch (error) {
            console.error('Failed to fetch Argo profiles:', error);
            return this.getEmptyResponse();
        }
    }

    /**
     * Fetch a single float's complete profile
     */
    async fetchFloatProfile(floatId: string): Promise<ArgoFloatResponse | null> {
        try {
            const response = await apiClient.get<ArgoFloatResponse>(`${this.baseUrl}/profile/${floatId}`);
            return response;
        } catch (error) {
            console.error(`Failed to fetch float ${floatId}:`, error);
            return null;
        }
    }

    /**
     * Generate empty response for error cases
     */
    private getEmptyResponse(): ArgoResponse {
        return {
            success: false,
            source: 'Argo BGC',
            dataType: 'in-situ',
            qcNote: 'Data unavailable',
            floats: [],
            metadata: {
                totalFloats: 0,
                maxFloatsLimit: 200,
                bounds: {
                    latMin: -15,
                    latMax: 25,
                    lonMin: 50,
                    lonMax: 100,
                },
                queryTime: new Date().toISOString(),
            },
        };
    }
}

export const argoService = new ArgoService();
export default argoService;
