/**
 * Advanced Data Export Service
 * 
 * Supports multiple export formats:
 * - CSV (standard)
 * - JSON (structured)
 * - NetCDF (oceanographic standard)
 * - Shapefile (GIS)
 * - GeoJSON (web GIS)
 * - Excel (xlsx)
 */

import { Router, Request, Response } from 'express';
import archiver from 'archiver';
import { Parser } from 'json2csv';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import mongoose from 'mongoose';
import logger from '../utils/logger';

const router = Router();

interface ExportOptions {
  format: 'csv' | 'json' | 'netcdf' | 'shapefile' | 'geojson' | 'xlsx';
  dataTypes: string[];  // species, oceanography, edna, otoliths
  filters?: Record<string, any>;
  dateRange?: { start: string; end: string };
  bbox?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  limit?: number;
}

/**
 * @swagger
 * /api/export/bulk:
 *   post:
 *     summary: Bulk export data in various formats
 *     tags: [Export]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [csv, json, netcdf, shapefile, geojson, xlsx]
 *               dataTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *               filters:
 *                 type: object
 *               dateRange:
 *                 type: object
 *               bbox:
 *                 type: object
 */
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const options: ExportOptions = req.body;
    const { format, dataTypes, filters, dateRange, bbox, limit } = options;

    // Validate format
    const validFormats = ['csv', 'json', 'netcdf', 'shapefile', 'geojson', 'xlsx'];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: `Invalid format. Supported: ${validFormats.join(', ')}` });
    }

    // Collect data from each requested type
    const exportData: Record<string, any[]> = {};

    for (const dataType of dataTypes) {
      const data = await fetchData(dataType, { filters, dateRange, bbox, limit });
      exportData[dataType] = data;
    }

    // Generate export based on format
    switch (format) {
      case 'csv':
        await exportAsCSV(res, exportData);
        break;
      case 'json':
        await exportAsJSON(res, exportData);
        break;
      case 'geojson':
        await exportAsGeoJSON(res, exportData);
        break;
      case 'xlsx':
        await exportAsExcel(res, exportData);
        break;
      case 'shapefile':
        await exportAsShapefile(res, exportData);
        break;
      case 'netcdf':
        await exportAsNetCDF(res, exportData);
        break;
      default:
        res.status(400).json({ error: 'Unsupported format' });
    }
  } catch (error) {
    logger.error('Export error:', error);
    res.status(500).json({ error: 'Export failed', details: (error as Error).message });
  }
});

/**
 * Fetch data from database
 */
async function fetchData(
  dataType: string,
  options: { filters?: Record<string, any>; dateRange?: any; bbox?: any; limit?: number }
): Promise<any[]> {
  const { filters, dateRange, bbox, limit = 10000 } = options;

  switch (dataType) {
    case 'species': {
      const Species = mongoose.model('Species');
      let query: any = {};
      
      if (filters?.conservationStatus) {
        query.conservationStatus = filters.conservationStatus;
      }
      if (bbox) {
        query['distribution.coordinates'] = {
          $geoWithin: {
            $box: [[bbox.minLon, bbox.minLat], [bbox.maxLon, bbox.maxLat]]
          }
        };
      }
      
      return Species.find(query).limit(limit).lean();
    }

    case 'oceanography': {
      // Fetch from PostgreSQL
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 
          `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`
      });

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      if (dateRange?.start) {
        params.push(dateRange.start);
        whereClause += ` AND timestamp >= $${params.length}`;
      }
      if (dateRange?.end) {
        params.push(dateRange.end);
        whereClause += ` AND timestamp <= $${params.length}`;
      }
      if (bbox) {
        whereClause += ` AND latitude BETWEEN ${bbox.minLat} AND ${bbox.maxLat}`;
        whereClause += ` AND longitude BETWEEN ${bbox.minLon} AND ${bbox.maxLon}`;
      }

      const result = await pool.query(
        `SELECT * FROM oceanographic_data ${whereClause} LIMIT ${limit}`,
        params
      );
      await pool.end();
      return result.rows;
    }

    case 'edna': {
      const EDNASample = mongoose.model('EDNASample');
      let query: any = {};
      
      if (dateRange?.start || dateRange?.end) {
        query.collectionDate = {};
        if (dateRange.start) query.collectionDate.$gte = new Date(dateRange.start);
        if (dateRange.end) query.collectionDate.$lte = new Date(dateRange.end);
      }
      
      return EDNASample.find(query).limit(limit).lean();
    }

    case 'otoliths': {
      const Otolith = mongoose.model('Otolith');
      return Otolith.find({}).limit(limit).lean();
    }

    default:
      return [];
  }
}

/**
 * Export as CSV (ZIP if multiple types)
 */
async function exportAsCSV(res: Response, data: Record<string, any[]>): Promise<void> {
  const dataTypes = Object.keys(data);

  if (dataTypes.length === 1) {
    // Single CSV file
    const type = dataTypes[0];
    const records = data[type];
    
    if (records.length === 0) {
      res.status(404).json({ error: 'No data to export' });
      return;
    }

    const fields = Object.keys(records[0]);
    const parser = new Parser({ fields });
    const csv = parser.parse(records);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_export.csv"`);
    res.send(csv);
  } else {
    // Multiple CSV files in ZIP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="bulk_export.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const [type, records] of Object.entries(data)) {
      if (records.length > 0) {
        const fields = Object.keys(records[0]);
        const parser = new Parser({ fields });
        const csv = parser.parse(records);
        archive.append(csv, { name: `${type}.csv` });
      }
    }

    await archive.finalize();
  }
}

/**
 * Export as JSON
 */
async function exportAsJSON(res: Response, data: Record<string, any[]>): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="bulk_export.json"');
  
  res.json({
    exportDate: new Date().toISOString(),
    platform: 'CMLRE Marine Data Platform',
    data
  });
}

/**
 * Export as GeoJSON
 */
async function exportAsGeoJSON(res: Response, data: Record<string, any[]>): Promise<void> {
  const features: any[] = [];

  for (const [type, records] of Object.entries(data)) {
    for (const record of records) {
      // Find coordinates
      let coordinates: [number, number] | null = null;
      
      if (record.longitude !== undefined && record.latitude !== undefined) {
        coordinates = [record.longitude, record.latitude];
      } else if (record.location?.coordinates) {
        coordinates = record.location.coordinates;
      } else if (record.decimalLongitude !== undefined && record.decimalLatitude !== undefined) {
        coordinates = [record.decimalLongitude, record.decimalLatitude];
      }

      if (coordinates) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates
          },
          properties: {
            dataType: type,
            ...record,
            // Remove nested location to avoid duplication
            location: undefined
          }
        });
      }
    }
  }

  const geojson = {
    type: 'FeatureCollection',
    features,
    properties: {
      exportDate: new Date().toISOString(),
      platform: 'CMLRE Marine Data Platform',
      featureCount: features.length
    }
  };

  res.setHeader('Content-Type', 'application/geo+json');
  res.setHeader('Content-Disposition', 'attachment; filename="export.geojson"');
  res.json(geojson);
}

/**
 * Export as Excel (XLSX)
 */
async function exportAsExcel(res: Response, data: Record<string, any[]>): Promise<void> {
  const workbook = xlsx.utils.book_new();

  for (const [sheetName, records] of Object.entries(data)) {
    if (records.length > 0) {
      // Flatten nested objects for Excel
      const flatRecords = records.map(r => flattenObject(r));
      const worksheet = xlsx.utils.json_to_sheet(flatRecords);
      xlsx.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31)); // Excel sheet name limit
    }
  }

  // Add metadata sheet
  const metaSheet = xlsx.utils.json_to_sheet([{
    exportDate: new Date().toISOString(),
    platform: 'CMLRE Marine Data Platform',
    totalRecords: Object.values(data).reduce((sum, arr) => sum + arr.length, 0)
  }]);
  xlsx.utils.book_append_sheet(workbook, metaSheet, 'Metadata');

  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="bulk_export.xlsx"');
  res.send(buffer);
}

/**
 * Export as Shapefile (ZIP containing .shp, .shx, .dbf, .prj)
 */
async function exportAsShapefile(res: Response, data: Record<string, any[]>): Promise<void> {
  // Note: Full shapefile generation requires a library like 'shpjs' or 'shapefile'
  // This is a simplified implementation that exports to GeoJSON with shapefile metadata
  
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="shapefile_export.zip"');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  // Create GeoJSON for each data type
  for (const [type, records] of Object.entries(data)) {
    const features: any[] = [];
    
    for (const record of records) {
      let coordinates: [number, number] | null = null;
      
      if (record.longitude !== undefined && record.latitude !== undefined) {
        coordinates = [record.longitude, record.latitude];
      } else if (record.location?.coordinates) {
        coordinates = record.location.coordinates;
      }

      if (coordinates) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates },
          properties: flattenObject(record)
        });
      }
    }

    if (features.length > 0) {
      const geojson = JSON.stringify({
        type: 'FeatureCollection',
        features
      }, null, 2);
      
      archive.append(geojson, { name: `${type}.geojson` });
    }
  }

  // Add projection file (WGS84)
  const prjContent = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]';
  archive.append(prjContent, { name: 'projection.prj' });

  // Add readme
  const readme = `CMLRE Marine Data Platform - Shapefile Export
Export Date: ${new Date().toISOString()}

This export contains GeoJSON files that can be converted to Shapefiles using QGIS or ogr2ogr:
  ogr2ogr -f "ESRI Shapefile" output.shp input.geojson

Projection: WGS84 (EPSG:4326)
`;
  archive.append(readme, { name: 'README.txt' });

  await archive.finalize();
}

/**
 * Export as NetCDF (CF-compliant)
 * Note: Full NetCDF requires the 'netcdf4' library via Python interop or 'netcdfjs'
 */
async function exportAsNetCDF(res: Response, data: Record<string, any[]>): Promise<void> {
  // Simplified: Export as CDL (NetCDF text representation) which can be converted
  // Full implementation would use a NetCDF library
  
  const oceanData = data.oceanography || [];
  
  if (oceanData.length === 0) {
    res.status(404).json({ 
      error: 'No oceanographic data for NetCDF export',
      suggestion: 'NetCDF format is primarily for oceanographic data'
    });
    return;
  }

  // Generate CDL (Common Data Language) format
  const lats = [...new Set(oceanData.map(r => r.latitude))].sort((a, b) => a - b);
  const lons = [...new Set(oceanData.map(r => r.longitude))].sort((a, b) => a - b);
  const times = [...new Set(oceanData.map(r => r.timestamp))].sort();

  let cdl = `netcdf cmlre_export {
dimensions:
    time = ${times.length};
    lat = ${lats.length};
    lon = ${lons.length};

variables:
    double time(time);
        time:units = "seconds since 1970-01-01 00:00:00";
        time:calendar = "standard";
        time:long_name = "time";
    
    float lat(lat);
        lat:units = "degrees_north";
        lat:long_name = "latitude";
    
    float lon(lon);
        lon:units = "degrees_east";
        lon:long_name = "longitude";
    
    float temperature(time, lat, lon);
        temperature:units = "degC";
        temperature:long_name = "sea water temperature";
        temperature:standard_name = "sea_water_temperature";
        temperature:_FillValue = -999.0f;
    
    float salinity(time, lat, lon);
        salinity:units = "PSU";
        salinity:long_name = "sea water salinity";
        salinity:standard_name = "sea_water_salinity";
        salinity:_FillValue = -999.0f;

// global attributes:
    :title = "CMLRE Marine Data Export";
    :institution = "Centre for Marine Living Resources & Ecology";
    :source = "CMLRE Marine Data Platform";
    :history = "Exported on ${new Date().toISOString()}";
    :Conventions = "CF-1.8";

data:
    time = ${times.map(t => new Date(t).getTime() / 1000).join(', ')};
    lat = ${lats.join(', ')};
    lon = ${lons.join(', ')};
}`;

  // Also include a JSON version with the actual data
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="netcdf_export.zip"');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  archive.append(cdl, { name: 'oceanography.cdl' });
  archive.append(JSON.stringify(oceanData, null, 2), { name: 'oceanography_data.json' });
  
  const readme = `CMLRE NetCDF Export
==================

This export contains:
1. oceanography.cdl - NetCDF CDL (Common Data Language) template
2. oceanography_data.json - Raw data in JSON format

To create a proper NetCDF file:
1. Install NCO tools: apt-get install nco
2. Convert CDL to NetCDF: ncgen -o output.nc oceanography.cdl
3. Or use Python with xarray/netCDF4 to read the JSON and write NetCDF

The CDL file follows CF-1.8 conventions for oceanographic data.
`;
  archive.append(readme, { name: 'README.txt' });

  await archive.finalize();
}

/**
 * Flatten nested objects for tabular export
 */
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(result, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      result[newKey] = JSON.stringify(value);
    } else if (value instanceof Date) {
      result[newKey] = value.toISOString();
    } else {
      result[newKey] = value;
    }
  }
  
  return result;
}

/**
 * Get available export formats
 */
router.get('/formats', (req: Request, res: Response) => {
  res.json({
    formats: [
      { id: 'csv', name: 'CSV', description: 'Comma-separated values', mimeType: 'text/csv' },
      { id: 'json', name: 'JSON', description: 'JavaScript Object Notation', mimeType: 'application/json' },
      { id: 'geojson', name: 'GeoJSON', description: 'Geographic JSON for mapping', mimeType: 'application/geo+json' },
      { id: 'xlsx', name: 'Excel', description: 'Microsoft Excel spreadsheet', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { id: 'shapefile', name: 'Shapefile', description: 'ESRI Shapefile for GIS', mimeType: 'application/zip' },
      { id: 'netcdf', name: 'NetCDF', description: 'Network Common Data Form (oceanographic)', mimeType: 'application/zip' },
    ],
    dataTypes: ['species', 'oceanography', 'edna', 'otoliths']
  });
});

export default router;
