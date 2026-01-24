/**
 * Copernicus Marine Service
 * 
 * Fetches modeled Dissolved Oxygen and pH data from Copernicus Marine Service.
 * 
 * Data Source:
 * - Product: GLOBAL_ANALYSISFORECAST_BGC_001_028
 * - Variables: o2 (dissolved oxygen), ph
 * - Resolution: 0.25° / 50 depths
 * - Update: Monthly
 * 
 * IMPORTANT:
 * - Default depth: Surface (0-5m) only
 * - DO is converted from mmol/m³ to mg/L (×0.032)
 * - pH and DO vary massively with depth - do not expose all depths by default
 */

import axios, { AxiosInstance } from 'axios';
import logger from './logger';

// Cache for Copernicus data (24 hour TTL - monthly data)
interface CacheEntry {
    data: any;
    timestamp: number;
    ttl: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Indian Ocean bounding box
const INDIAN_OCEAN_BOUNDS = {
    latMin: -15,
    latMax: 25,
    lonMin: 50,
    lonMax: 100,
};

// Copernicus conversion factors
const MMOL_TO_MG_L = 0.032; // mmol/m³ → mg/L for O2

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
    temporalResolution: 'monthly' | 'daily';
    measurementType: ['modeled'];
    validationSource: 'Argo in-situ';
    verticalReference: string;
    unit: string;
    data: CopernicusDataPoint[];
    error?: string; // Optional error message
    metadata: {
        productId: string;
        attribution: string;
        lastUpdated: string;
        depthLevel: number;
        dataCount?: number;
    };
}

class CopernicusService {
    private axiosInstance: AxiosInstance;

    constructor() {
        this.axiosInstance = axios.create({
            timeout: 60000, // 60 second timeout (Copernicus can be slow)
            headers: {
                'Accept': 'application/json',
            },
        });
    }

    /**
     * Generate cache key for a request
     */
    private getCacheKey(parameter: string, bounds: any, depth: number): string {
        return `copernicus_${parameter}_${bounds.latMin}_${bounds.latMax}_${bounds.lonMin}_${bounds.lonMax}_${depth}`;
    }

    /**
     * Check if cache entry is valid
     */
    private getCachedData(key: string): any | null {
        const entry = cache.get(key);
        if (entry && Date.now() - entry.timestamp < entry.ttl) {
            logger.debug(`Copernicus cache hit: ${key}`);
            return entry.data;
        }
        return null;
    }

    /**
     * Store data in cache
     */
    private setCachedData(key: string, data: any, ttl: number = CACHE_TTL): void {
        cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl,
        });
        logger.debug(`Copernicus cache set: ${key}`);
    }

    /**
     * Fetch Dissolved Oxygen from Copernicus Marine Service
     * 
     * NOTE: Copernicus provides DO in mmol/m³
     * We convert to mg/L for user-friendliness: mg/L = mmol/m³ × 0.032
     * 
     * @param options.bounds - Geographic bounds
     * @param options.depth - Depth level (0 = surface, default)
     * @param options.stride - Sampling stride (default 5)
     */
    async fetchDissolvedOxygen(options: {
        bounds?: typeof INDIAN_OCEAN_BOUNDS;
        depth?: number;
        stride?: number;
    } = {}): Promise<CopernicusResponse> {
        const bounds = options.bounds || INDIAN_OCEAN_BOUNDS;
        const depth = options.depth ?? 0; // Default: surface (0-5m)
        const stride = options.stride || 5;

        const cacheKey = this.getCacheKey('dissolved_oxygen', bounds, depth);
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            return cachedData;
        }

        try {
            // REAL DATA: Call AI service which uses copernicusmarine package
            const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

            const response = await this.axiosInstance.get(`${AI_SERVICE_URL}/copernicus/do`, {
                params: {
                    lat_min: bounds.latMin,
                    lat_max: bounds.latMax,
                    lon_min: bounds.lonMin,
                    lon_max: bounds.lonMax,
                    depth,
                    stride,
                },
                timeout: 120000, // 2 min timeout for Copernicus API
            });

            const result = response.data as CopernicusResponse;

            if (result.success && result.data.length > 0) {
                this.setCachedData(cacheKey, result);
                logger.info(`Fetched REAL Copernicus DO data: ${result.data.length} points at depth ${depth}m`);
                return result;
            } else {
                logger.warn(`Copernicus DO returned no data: ${result.error || 'unknown'}`);
                return this.getEmptyResponse('dissolved_oxygen', 'mg/L', depth);
            }

        } catch (error: any) {
            logger.error('Copernicus DO fetch error:', error.message);
            return this.getEmptyResponse('dissolved_oxygen', 'mg/L', depth);
        }
    }

    /**
     * Fetch pH from Copernicus Marine Service
     * 
     * @param options.bounds - Geographic bounds
     * @param options.depth - Depth level (0 = surface, default)
     * @param options.stride - Sampling stride (default 5)
     */
    async fetchPH(options: {
        bounds?: typeof INDIAN_OCEAN_BOUNDS;
        depth?: number;
        stride?: number;
    } = {}): Promise<CopernicusResponse> {
        const bounds = options.bounds || INDIAN_OCEAN_BOUNDS;
        const depth = options.depth ?? 0; // Default: surface (0-5m)
        const stride = options.stride || 5;

        const cacheKey = this.getCacheKey('ph', bounds, depth);
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            return cachedData;
        }

        try {
            // REAL DATA: Call AI service which uses copernicusmarine package
            const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

            const response = await this.axiosInstance.get(`${AI_SERVICE_URL}/copernicus/ph`, {
                params: {
                    lat_min: bounds.latMin,
                    lat_max: bounds.latMax,
                    lon_min: bounds.lonMin,
                    lon_max: bounds.lonMax,
                    depth,
                    stride,
                },
                timeout: 120000, // 2 min timeout for Copernicus API
            });

            const result = response.data as CopernicusResponse;

            if (result.success && result.data.length > 0) {
                this.setCachedData(cacheKey, result);
                logger.info(`Fetched REAL Copernicus pH data: ${result.data.length} points at depth ${depth}m`);
                return result;
            } else {
                logger.warn(`Copernicus pH returned no data: ${result.error || 'unknown'}`);
                return this.getEmptyResponse('ph', 'pH units', depth);
            }

        } catch (error: any) {
            logger.error('Copernicus pH fetch error:', error.message);
            return this.getEmptyResponse('ph', 'pH units', depth);
        }
    }

    /**
     * Generate empty response for error cases
     */
    private getEmptyResponse(parameter: string, unit: string, depth: number): CopernicusResponse {
        return {
            success: false,
            parameter,
            primarySource: 'Copernicus model',
            secondarySource: 'Argo in-situ',
            spatialCoverage: 'global',
            temporalResolution: 'monthly',
            measurementType: ['modeled'],
            validationSource: 'Argo in-situ',
            verticalReference: depth === 0 ? 'surface (0–5 m)' : `${depth}m depth`,
            unit,
            data: [],
            metadata: {
                productId: 'GLOBAL_ANALYSISFORECAST_BGC_001_028',
                attribution: 'E.U. Copernicus Marine Service Information',
                lastUpdated: 'unavailable',
                depthLevel: depth,
            },
        };
    }

    /**
     * Clear the cache (for manual refresh)
     */
    clearCache(): void {
        cache.clear();
        logger.info('Copernicus cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { entries: number; keys: string[] } {
        return {
            entries: cache.size,
            keys: Array.from(cache.keys()),
        };
    }
}

// Export singleton instance
export const copernicusService = new CopernicusService();
export default copernicusService;
