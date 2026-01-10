/**
 * NOAA ERDDAP Service
 * 
 * Fetches real-time and historical oceanographic data from NOAA's ERDDAP servers.
 * 
 * Data Sources:
 * - JPL MUR SST: High-resolution Sea Surface Temperature (0.01° resolution)
 * - AVHRR SST: Long-term SST observations
 * 
 * Indian Ocean Bounds: 
 * - Latitude: -40°S to 30°N
 * - Longitude: 20°E to 120°E
 */

import axios, { AxiosInstance } from 'axios';
import logger from './logger';

// Cache for ERDDAP data (1 hour TTL)
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// ERDDAP Server endpoints
const ERDDAP_SERVERS = {
  // CoastWatch West Coast Node - JPL MUR SST (Multi-scale Ultra-high Resolution)
  MUR_SST: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.json',
  // NCEI ERDDAP - Blended SST (good for Indian Ocean)
  BLENDED_SST: 'https://www.ncei.noaa.gov/erddap/griddap/noaacwBLENDEDsstDNDaily.json',
  // PO.DAAC ERDDAP for salinity
  AQUARIUS_SALINITY: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdQAstress1day.json',
};

// Indian Ocean bounding box
const INDIAN_OCEAN_BOUNDS = {
  latMin: -15,
  latMax: 25,
  lonMin: 50,
  lonMax: 100,
};

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
  dataType: 'observed';
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

class ERDDAPService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 30000, // 30 second timeout
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Generate cache key for a request
   */
  private getCacheKey(parameter: string, bounds: any, date?: string): string {
    return `${parameter}_${bounds.latMin}_${bounds.latMax}_${bounds.lonMin}_${bounds.lonMax}_${date || 'latest'}`;
  }

  /**
   * Check if cache entry is valid
   */
  private getCachedData(key: string): any | null {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      logger.debug(`ERDDAP cache hit: ${key}`);
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
    logger.debug(`ERDDAP cache set: ${key}`);
  }

  /**
   * Fetch Sea Surface Temperature from NOAA ERDDAP
   * 
   * Uses JPL MUR SST dataset - high resolution global SST
   */
  async fetchSST(options: {
    bounds?: typeof INDIAN_OCEAN_BOUNDS;
    date?: string; // ISO date string, defaults to latest
    stride?: number; // Sampling stride (1 = all points, 10 = every 10th point)
  } = {}): Promise<ERDDAPResponse> {
    const bounds = options.bounds || INDIAN_OCEAN_BOUNDS;
    const stride = options.stride || 5; // Default: every 5th point for performance
    const date = options.date || 'last';

    const cacheKey = this.getCacheKey('sst', bounds, date);
    const cachedData = this.getCachedData(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    try {
      // Build ERDDAP query URL
      // Format: dataset.json?variable[(time)][(lat_start):stride:(lat_end)][(lon_start):stride:(lon_end)]
      const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.json?analysed_sst[(${date})][(${bounds.latMin}):${stride}:(${bounds.latMax})][(${bounds.lonMin}):${stride}:(${bounds.lonMax})]`;

      logger.info(`Fetching ERDDAP SST data: ${url.substring(0, 100)}...`);

      const response = await this.axiosInstance.get(url);
      const result = this.parseERDDAPResponse(response.data, 'temperature', '°C', 'jplMURSST41');

      this.setCachedData(cacheKey, result);
      return result;

    } catch (error: any) {
      logger.error('ERDDAP SST fetch error:', error.message);

      // Return fallback with empty data
      return {
        success: false,
        source: 'NOAA_ERDDAP',
        parameter: 'temperature',
        unit: '°C',
        dataType: 'observed',
        timestamp: new Date().toISOString(),
        bounds,
        data: [],
        metadata: {
          datasetId: 'jplMURSST41',
          attribution: 'NOAA/NESDIS/STAR, NASA JPL',
          lastUpdated: 'unavailable',
          resolution: '0.01°',
        },
      };
    }
  }

  /**
   * Fetch Chlorophyll-a concentration
   * 
   * Uses VIIRS (Visible Infrared Imaging Radiometer Suite) dataset
   * This is the currently active chlorophyll sensor
   */
  async fetchChlorophyll(options: {
    bounds?: typeof INDIAN_OCEAN_BOUNDS;
    date?: string;
    stride?: number;
  } = {}): Promise<ERDDAPResponse> {
    const bounds = options.bounds || INDIAN_OCEAN_BOUNDS;
    const stride = options.stride || 5;
    const date = options.date || 'last';

    const cacheKey = this.getCacheKey('chlorophyll', bounds, date);
    const cachedData = this.getCachedData(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    try {
      // VIIRS Chlorophyll dataset (S-NPP VIIRS, Science Quality, Global 4km, Monthly)
      // Dataset has 4 dimensions: time, altitude, latitude, longitude
      // Must include [(0)] for altitude (sea surface = 0m)
      const url = `https://coastwatch.noaa.gov/erddap/griddap/noaacwNPPVIIRSSQchlaMonthly.json?chlor_a[(${date})][(0)][(${bounds.latMax}):${stride}:(${bounds.latMin})][(${bounds.lonMin}):${stride}:(${bounds.lonMax})]`;

      logger.info(`Fetching ERDDAP Chlorophyll data (VIIRS Monthly)...`);
      logger.info(`ERDDAP URL: ${url.substring(0, 120)}...`); // Debug: show URL

      const response = await this.axiosInstance.get(url);
      const result = this.parseERDDAPResponse(response.data, 'chlorophyll', 'mg/m³', 'noaacwNPPVIIRSSQchlaMonthly');

      this.setCachedData(cacheKey, result);
      return result;

    } catch (error: any) {
      logger.error('ERDDAP Chlorophyll fetch error:', error.message);

      return {
        success: false,
        source: 'NOAA_ERDDAP',
        parameter: 'chlorophyll',
        unit: 'mg/m³',
        dataType: 'observed',
        timestamp: new Date().toISOString(),
        bounds,
        data: [],
        metadata: {
          datasetId: 'noaacwNPPVIIRSSQchlaMonthly',
          attribution: 'NOAA CoastWatch VIIRS',
          lastUpdated: 'unavailable',
          resolution: '4km',
        },
      };
    }
  }

  /**
   * Fetch Sea Surface Salinity
   * 
   * Uses SMAP (Soil Moisture Active Passive) dataset
   * Aquarius mission ended in 2015, SMAP is the current active satellite
   * SMAP provides 0.25° resolution salinity data from 2015-present
   */
  async fetchSalinity(options: {
    bounds?: typeof INDIAN_OCEAN_BOUNDS;
    date?: string;
    stride?: number;
  } = {}): Promise<ERDDAPResponse> {
    const bounds = options.bounds || INDIAN_OCEAN_BOUNDS;
    const stride = options.stride || 2; // SMAP is lower resolution, use smaller stride
    const date = options.date || 'last';

    const cacheKey = this.getCacheKey('salinity', bounds, date);
    const cachedData = this.getCachedData(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    try {
      // SMAP Sea Surface Salinity - NOAA CoastWatch Daily dataset
      // Active satellite with current data (2015-present), 0.25° resolution
      // Dataset: noaacwSMAPsssDaily - hosted on coastwatch.noaa.gov (NOT pfeg)
      // Dataset has 4 dimensions: time, altitude, latitude, longitude
      // Must include [(0)] for altitude (sea surface = 0m)
      const url = `https://coastwatch.noaa.gov/erddap/griddap/noaacwSMAPsssDaily.json?sss[(${date})][(0)][(${bounds.latMin}):${stride}:(${bounds.latMax})][(${bounds.lonMin}):${stride}:(${bounds.lonMax})]`;

      logger.info(`Fetching ERDDAP Salinity data (SMAP Daily)...`);
      logger.debug(`ERDDAP Salinity URL: ${url}`);

      const response = await this.axiosInstance.get(url);
      const result = this.parseERDDAPResponse(response.data, 'salinity', 'PSU', 'noaacwSMAPsssDaily');

      this.setCachedData(cacheKey, result);
      return result;

    } catch (error: any) {
      logger.error('ERDDAP Salinity fetch error:', error.message);
      if (error.response?.data) {
        logger.error('ERDDAP Error details:', JSON.stringify(error.response.data).substring(0, 500));
      }

      return {
        success: false,
        source: 'NOAA_ERDDAP',
        parameter: 'salinity',
        unit: 'PSU',
        dataType: 'observed',
        timestamp: new Date().toISOString(),
        bounds,
        data: [],
        metadata: {
          datasetId: 'noaacwSMAPsssDaily',
          attribution: 'NOAA CoastWatch SMAP',
          lastUpdated: 'unavailable',
          resolution: '0.25°',
        },
      };
    }
  }

  /**
   * Parse ERDDAP JSON response into normalized format
   */
  private parseERDDAPResponse(
    rawData: any,
    parameter: string,
    unit: string,
    datasetId: string
  ): ERDDAPResponse {
    const data: ERDDAPDataPoint[] = [];

    try {
      const table = rawData.table;
      const columnNames = table.columnNames;
      const rows = table.rows;

      // Find column indices
      const timeIdx = columnNames.indexOf('time');
      const latIdx = columnNames.indexOf('latitude');
      const lonIdx = columnNames.indexOf('longitude');
      // Find value column - exclude time, lat, lon, and altitude (4D datasets)
      const excludedCols = ['time', 'latitude', 'longitude', 'altitude'];
      const valueIdx = columnNames.findIndex((name: string) =>
        !excludedCols.includes(name)
      );

      let lastTime = '';

      for (const row of rows) {
        const value = row[valueIdx];

        // Skip NaN/null values
        if (value === null || value === undefined || Number.isNaN(value)) {
          continue;
        }

        // Convert Kelvin to Celsius if needed (SST datasets often in Kelvin)
        let normalizedValue = value;
        if (parameter === 'temperature' && value > 200) {
          normalizedValue = value - 273.15; // Kelvin to Celsius
        }

        if (row[timeIdx]) {
          lastTime = row[timeIdx];
        }

        data.push({
          latitude: row[latIdx],
          longitude: row[lonIdx],
          value: Number(normalizedValue.toFixed(2)),
          time: lastTime,
          parameter,
          unit,
          source: 'NOAA_ERDDAP',
          dataType: 'observed',
          quality: 'good',
        });
      }

      logger.info(`Parsed ${data.length} ERDDAP data points for ${parameter}`);

      return {
        success: true,
        source: 'NOAA_ERDDAP',
        parameter,
        unit,
        dataType: 'observed',
        timestamp: new Date().toISOString(),
        bounds: INDIAN_OCEAN_BOUNDS,
        data,
        metadata: {
          datasetId,
          attribution: 'NOAA CoastWatch, NASA JPL',
          lastUpdated: lastTime || new Date().toISOString(),
          resolution: datasetId.includes('MUR') ? '0.01°' : '4km',
        },
      };

    } catch (error: any) {
      logger.error('Error parsing ERDDAP response:', error.message);
      return {
        success: false,
        source: 'NOAA_ERDDAP',
        parameter,
        unit,
        dataType: 'observed',
        timestamp: new Date().toISOString(),
        bounds: INDIAN_OCEAN_BOUNDS,
        data: [],
        metadata: {
          datasetId,
          attribution: 'NOAA CoastWatch',
          lastUpdated: 'unavailable',
          resolution: 'unknown',
        },
      };
    }
  }

  /**
   * Clear the cache (for manual refresh)
   */
  clearCache(): void {
    cache.clear();
    logger.info('ERDDAP cache cleared');
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

  /**
   * Get available data sources info
   */
  getDataSources(): Array<{
    id: string;
    name: string;
    parameter: string;
    type: 'observed' | 'modeled';
    resolution: string;
    updateFrequency: string;
    attribution: string;
  }> {
    return [
      {
        id: 'jplMURSST41',
        name: 'JPL MUR SST',
        parameter: 'temperature',
        type: 'observed',
        resolution: '0.01° (~1km)',
        updateFrequency: 'Daily',
        attribution: 'NASA JPL, NOAA/NESDIS',
      },
      {
        id: 'noaacwNPPVIIRSSQchlaMonthly',
        name: 'VIIRS Chlorophyll-a (Monthly)',
        parameter: 'chlorophyll',
        type: 'observed',
        resolution: '4km',
        updateFrequency: 'Monthly',
        attribution: 'NOAA NESDIS VIIRS',
      },
      {
        id: 'noaacwSMAPsssDaily',
        name: 'SMAP Sea Surface Salinity',
        parameter: 'salinity',
        type: 'observed',
        resolution: '0.25°',
        updateFrequency: 'Daily',
        attribution: 'NOAA CoastWatch SMAP',
      },
    ];
  }
}

// Export singleton instance
export const erddapService = new ERDDAPService();
export default erddapService;
