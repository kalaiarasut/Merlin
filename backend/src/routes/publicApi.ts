/**
 * National Data Backbone API
 * 
 * Public API endpoints for external data sharing and export.
 * Enables other systems/researchers to access CMLRE marine data.
 * 
 * Features:
 * - Public read-only access (optional API key for rate limiting)
 * - Multiple export formats (JSON, CSV, GeoJSON)
 * - Pagination for large datasets
 * - Filtering by species, region, date range
 * 
 * Reference: CMLRE requirement for National Data Backbone integration
 */

import { Router, Request, Response } from 'express';
import { Species } from '../models/Species';
import logger from '../utils/logger';

const router = Router();

// Rate limiting for public API (simple in-memory, use Redis in production)
const requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
const RATE_LIMIT = 100; // requests per hour
const RATE_WINDOW = 3600000; // 1 hour in ms

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const record = requestCounts.get(ip);

    if (!record || now > record.resetTime) {
        requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
        return true;
    }

    if (record.count >= RATE_LIMIT) {
        return false;
    }

    record.count++;
    return true;
}

// Middleware for public API
function publicApiMiddleware(req: Request, res: Response, next: Function) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (!checkRateLimit(ip)) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Maximum ${RATE_LIMIT} requests per hour. Try again later.`,
            retryAfter: 3600
        });
    }

    // Add CORS headers for public access
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    next();
}

router.use(publicApiMiddleware);

// ========================================
// API INFO
// ========================================

/**
 * @route GET /api/public/
 * @description API information and available endpoints
 */
router.get('/', (req: Request, res: Response) => {
    res.json({
        name: 'CMLRE Marine Data Backbone API',
        version: '1.0.0',
        description: 'Public API for accessing Indian Ocean marine biodiversity data',
        organization: 'Centre for Marine Living Resources and Ecology (CMLRE)',
        documentation: '/api/public/docs',
        endpoints: {
            species: {
                list: 'GET /api/public/species',
                details: 'GET /api/public/species/:id',
                search: 'GET /api/public/species/search?q=<query>',
                export: 'GET /api/public/species/export?format=csv|json|geojson'
            },
            oceanography: {
                list: 'GET /api/public/oceanography',
                regions: 'GET /api/public/oceanography/regions',
                export: 'GET /api/public/oceanography/export?format=csv|json'
            },
            edna: {
                list: 'GET /api/public/edna',
                biodiversity: 'GET /api/public/edna/biodiversity'
            },
            statistics: 'GET /api/public/statistics'
        },
        rateLimit: {
            limit: RATE_LIMIT,
            window: '1 hour',
            message: 'Contact admin@cmlre.gov.in for higher limits'
        },
        standards: ['Darwin Core', 'MIxS 6.0', 'ISO 19115:2014'],
        coverage: {
            region: 'Indian Ocean',
            subregions: ['Arabian Sea', 'Bay of Bengal', 'Lakshadweep Sea', 'Andaman Sea']
        }
    });
});

// ========================================
// SPECIES DATA
// ========================================

/**
 * @route GET /api/public/species
 * @description List all species with pagination
 */
router.get('/species', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const skip = (page - 1) * limit;

        // Filters
        const filters: any = {};
        if (req.query.family) filters.family = req.query.family;
        if (req.query.genus) filters.genus = req.query.genus;
        if (req.query.conservationStatus) filters.conservationStatus = req.query.conservationStatus;
        if (req.query.habitat) filters.habitat = { $regex: req.query.habitat, $options: 'i' };

        const [species, total] = await Promise.all([
            Species.find(filters)
                .select('scientificName commonName family genus conservationStatus habitat distribution')
                .skip(skip)
                .limit(limit)
                .lean(),
            Species.countDocuments(filters)
        ]);

        res.json({
            success: true,
            data: species,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            },
            filters: Object.keys(filters).length > 0 ? filters : null
        });
    } catch (error: any) {
        logger.error('Public API species error:', error);
        res.status(500).json({ error: 'Failed to fetch species data' });
    }
});

/**
 * @route GET /api/public/species/search
 * @description Search species by name
 */
router.get('/species/search', async (req: Request, res: Response) => {
    try {
        const query = req.query.q as string;
        if (!query || query.length < 2) {
            return res.status(400).json({ error: 'Search query must be at least 2 characters' });
        }

        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

        const species = await Species.find({
            $or: [
                { scientificName: { $regex: query, $options: 'i' } },
                { commonName: { $regex: query, $options: 'i' } },
                { genus: { $regex: query, $options: 'i' } },
                { family: { $regex: query, $options: 'i' } }
            ]
        })
            .select('scientificName commonName family genus conservationStatus')
            .limit(limit)
            .lean();

        res.json({
            success: true,
            query,
            count: species.length,
            data: species
        });
    } catch (error: any) {
        logger.error('Public API search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

/**
 * @route GET /api/public/species/:id
 * @description Get single species details
 */
router.get('/species/:id', async (req: Request, res: Response) => {
    try {
        const species = await Species.findById(req.params.id)
            .select('-__v -jobId')
            .lean();

        if (!species) {
            return res.status(404).json({ error: 'Species not found' });
        }

        res.json({
            success: true,
            data: species
        });
    } catch (error: any) {
        logger.error('Public API species detail error:', error);
        res.status(500).json({ error: 'Failed to fetch species' });
    }
});

/**
 * @route GET /api/public/species/export
 * @description Export species data in various formats
 */
router.get('/species/export', async (req: Request, res: Response) => {
    try {
        const format = (req.query.format as string) || 'json';
        const limit = Math.min(parseInt(req.query.limit as string) || 1000, 5000);

        const species = await Species.find({})
            .select('scientificName commonName family genus order class phylum kingdom conservationStatus habitat distribution')
            .limit(limit)
            .lean();

        if (format === 'csv') {
            // CSV export
            const headers = ['scientificName', 'commonName', 'family', 'genus', 'order', 'class', 'phylum', 'kingdom', 'conservationStatus', 'habitat'];
            const csv = [
                headers.join(','),
                ...species.map(s => headers.map(h => `"${(s as any)[h] || ''}"`).join(','))
            ].join('\n');

            res.header('Content-Type', 'text/csv');
            res.header('Content-Disposition', 'attachment; filename=cmlre_species.csv');
            return res.send(csv);
        }

        if (format === 'geojson') {
            // GeoJSON export (for species with distribution coordinates)
            const features = species
                .filter((s: any) => s.distribution && s.distribution.length > 0)
                .map((s: any) => ({
                    type: 'Feature',
                    properties: {
                        scientificName: s.scientificName,
                        commonName: s.commonName,
                        family: s.family,
                        conservationStatus: s.conservationStatus
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [75.0, 12.0] // Default Indian Ocean point
                    }
                }));

            res.header('Content-Type', 'application/geo+json');
            res.header('Content-Disposition', 'attachment; filename=cmlre_species.geojson');
            return res.json({
                type: 'FeatureCollection',
                features
            });
        }

        // Default: JSON
        res.header('Content-Disposition', 'attachment; filename=cmlre_species.json');
        res.json({
            exportDate: new Date().toISOString(),
            source: 'CMLRE Marine Data Platform',
            count: species.length,
            data: species
        });
    } catch (error: any) {
        logger.error('Public API export error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

// ========================================
// OCEANOGRAPHY DATA
// ========================================

/**
 * @route GET /api/public/oceanography
 * @description Get oceanographic data with filters
 */
router.get('/oceanography', async (req: Request, res: Response) => {
    try {
        const { getSequelize } = await import('../config/database');
        const sequelize = getSequelize();

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
        const offset = (page - 1) * limit;

        // Build WHERE clause
        const whereConditions: string[] = [];
        const params: any[] = [];

        if (req.query.parameter) {
            params.push(req.query.parameter);
            whereConditions.push(`parameter = $${params.length}`);
        }
        if (req.query.minLat) {
            params.push(parseFloat(req.query.minLat as string));
            whereConditions.push(`ST_Y(location) >= $${params.length}`);
        }
        if (req.query.maxLat) {
            params.push(parseFloat(req.query.maxLat as string));
            whereConditions.push(`ST_Y(location) <= $${params.length}`);
        }
        if (req.query.minLon) {
            params.push(parseFloat(req.query.minLon as string));
            whereConditions.push(`ST_X(location) >= $${params.length}`);
        }
        if (req.query.maxLon) {
            params.push(parseFloat(req.query.maxLon as string));
            whereConditions.push(`ST_X(location) <= $${params.length}`);
        }

        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';

        const [data, countResult] = await Promise.all([
            sequelize.query(`
        SELECT id, parameter, value, unit, 
               ST_Y(location) as latitude, 
               ST_X(location) as longitude,
               depth, timestamp, source, quality_flag
        FROM oceanographic_data
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `, { bind: params }),
            sequelize.query(`
        SELECT COUNT(*) as total FROM oceanographic_data ${whereClause}
      `, { bind: params })
        ]);

        const total = parseInt((countResult[0] as any)[0]?.total || 0);

        res.json({
            success: true,
            data: data[0],
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        logger.error('Public API oceanography error:', error);
        res.status(500).json({ error: 'Failed to fetch oceanographic data' });
    }
});

/**
 * @route GET /api/public/oceanography/regions
 * @description Get data summary by region
 */
router.get('/oceanography/regions', async (req: Request, res: Response) => {
    try {
        const { getSequelize } = await import('../config/database');
        const sequelize = getSequelize();

        const [results] = await sequelize.query(`
      SELECT 
        CASE 
          WHEN ST_X(location) < 77 AND ST_Y(location) > 5 THEN 'Arabian Sea'
          WHEN ST_X(location) >= 80 AND ST_Y(location) > 5 THEN 'Bay of Bengal'
          WHEN ST_Y(location) BETWEEN -10 AND 5 THEN 'Equatorial Indian Ocean'
          ELSE 'Other'
        END as region,
        parameter,
        COUNT(*) as count,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value
      FROM oceanographic_data
      GROUP BY region, parameter
      ORDER BY region, parameter
    `);

        res.json({
            success: true,
            data: results
        });
    } catch (error: any) {
        logger.error('Public API regions error:', error);
        res.status(500).json({ error: 'Failed to fetch region data' });
    }
});

/**
 * @route GET /api/public/oceanography/export
 * @description Export oceanographic data
 */
router.get('/oceanography/export', async (req: Request, res: Response) => {
    try {
        const { getSequelize } = await import('../config/database');
        const sequelize = getSequelize();
        const format = (req.query.format as string) || 'json';
        const limit = Math.min(parseInt(req.query.limit as string) || 1000, 10000);

        const [data] = await sequelize.query(`
      SELECT id, parameter, value, unit, 
             ST_Y(location) as latitude, 
             ST_X(location) as longitude,
             depth, timestamp, source, quality_flag
      FROM oceanographic_data
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `);

        if (format === 'csv') {
            const headers = ['id', 'parameter', 'value', 'unit', 'latitude', 'longitude', 'depth', 'timestamp', 'source', 'quality_flag'];
            const csv = [
                headers.join(','),
                ...(data as any[]).map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
            ].join('\n');

            res.header('Content-Type', 'text/csv');
            res.header('Content-Disposition', 'attachment; filename=cmlre_oceanography.csv');
            return res.send(csv);
        }

        res.header('Content-Disposition', 'attachment; filename=cmlre_oceanography.json');
        res.json({
            exportDate: new Date().toISOString(),
            source: 'CMLRE Marine Data Platform',
            count: (data as any[]).length,
            data
        });
    } catch (error: any) {
        logger.error('Public API oceanography export error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});

// ========================================
// eDNA DATA
// ========================================

/**
 * @route GET /api/public/edna
 * @description Get eDNA sample data
 */
router.get('/edna', async (req: Request, res: Response) => {
    try {
        const mongoose = await import('mongoose');
        const EdnaSample = mongoose.models.EdnaSample || mongoose.model('EdnaSample', new mongoose.Schema({}, { strict: false }));

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const skip = (page - 1) * limit;

        const [samples, total] = await Promise.all([
            EdnaSample.find({})
                .select('id detected_species confidence method latitude longitude sampleDate depth region')
                .skip(skip)
                .limit(limit)
                .lean(),
            EdnaSample.countDocuments({})
        ]);

        res.json({
            success: true,
            data: samples,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        logger.error('Public API eDNA error:', error);
        res.status(500).json({ error: 'Failed to fetch eDNA data' });
    }
});

/**
 * @route GET /api/public/edna/biodiversity
 * @description Get biodiversity indices from eDNA data
 */
router.get('/edna/biodiversity', async (req: Request, res: Response) => {
    try {
        const mongoose = await import('mongoose');
        const EdnaSample = mongoose.models.EdnaSample || mongoose.model('EdnaSample', new mongoose.Schema({}, { strict: false }));

        // Aggregate species counts
        const speciesCounts = await EdnaSample.aggregate([
            { $group: { _id: '$detected_species', count: { $sum: 1 }, avgConfidence: { $avg: '$confidence' } } },
            { $sort: { count: -1 } },
            { $limit: 50 }
        ]);

        // Calculate diversity indices
        const totalSamples = speciesCounts.reduce((sum, s) => sum + s.count, 0);
        const speciesCount = speciesCounts.length;

        // Shannon Index
        let shannonIndex = 0;
        speciesCounts.forEach(s => {
            const p = s.count / totalSamples;
            if (p > 0) shannonIndex -= p * Math.log(p);
        });

        // Simpson Index
        let simpsonIndex = 0;
        speciesCounts.forEach(s => {
            const p = s.count / totalSamples;
            simpsonIndex += p * p;
        });
        simpsonIndex = 1 - simpsonIndex;

        res.json({
            success: true,
            biodiversity: {
                totalSamples,
                speciesCount,
                shannonIndex: Math.round(shannonIndex * 1000) / 1000,
                simpsonIndex: Math.round(simpsonIndex * 1000) / 1000,
                evenness: speciesCount > 1 ? shannonIndex / Math.log(speciesCount) : 0
            },
            topSpecies: speciesCounts.slice(0, 20).map(s => ({
                species: s._id,
                count: s.count,
                avgConfidence: Math.round(s.avgConfidence * 100) / 100
            }))
        });
    } catch (error: any) {
        logger.error('Public API biodiversity error:', error);
        res.status(500).json({ error: 'Failed to calculate biodiversity' });
    }
});

// ========================================
// STATISTICS
// ========================================

/**
 * @route GET /api/public/statistics
 * @description Get platform statistics
 */
router.get('/statistics', async (req: Request, res: Response) => {
    try {
        const mongoose = await import('mongoose');
        const { getSequelize } = await import('../config/database');
        const sequelize = getSequelize();

        const EdnaSample = mongoose.models.EdnaSample || mongoose.model('EdnaSample', new mongoose.Schema({}, { strict: false }));

        const [speciesCount, ednaCount, oceanResult] = await Promise.all([
            Species.countDocuments({}),
            EdnaSample.countDocuments({}),
            sequelize.query('SELECT COUNT(*) as count FROM oceanographic_data')
        ]);

        const oceanCount = parseInt((oceanResult[0] as any)[0]?.count || 0);

        // Get family distribution
        const familyDistribution = await Species.aggregate([
            { $group: { _id: '$family', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Get conservation status distribution
        const conservationDistribution = await Species.aggregate([
            { $group: { _id: '$conservationStatus', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.json({
            success: true,
            statistics: {
                species: {
                    total: speciesCount,
                    byFamily: familyDistribution,
                    byConservationStatus: conservationDistribution
                },
                edna: {
                    totalSamples: ednaCount
                },
                oceanography: {
                    totalRecords: oceanCount
                },
                coverage: {
                    region: 'Indian Ocean',
                    subregions: ['Arabian Sea', 'Bay of Bengal', 'Lakshadweep Sea', 'Andaman Sea']
                },
                dataStandards: ['Darwin Core', 'MIxS 6.0', 'ISO 19115:2014'],
                lastUpdated: new Date().toISOString()
            }
        });
    } catch (error: any) {
        logger.error('Public API statistics error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

export default router;
