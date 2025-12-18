import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Species } from '../models/Species';
import logger from '../utils/logger';

const router = Router();

/**
 * Unified Correlation Service
 * 
 * Enables cross-domain queries joining:
 * - Species (MongoDB)
 * - Oceanography (PostgreSQL/PostGIS)
 * - eDNA (MongoDB)
 */

interface CorrelationQuery {
    speciesFilter?: {
        scientificName?: string;
        family?: string;
        conservationStatus?: string;
    };
    oceanographyFilter?: {
        parameter?: string;
        minValue?: number;
        maxValue?: number;
        minDepth?: number;
        maxDepth?: number;
    };
    spatialFilter?: {
        bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
        radius?: { lat: number; lon: number; km: number };
    };
    temporalFilter?: {
        startDate?: string;
        endDate?: string;
    };
}

/**
 * @swagger
 * tags:
 *   name: Correlation
 *   description: Cross-domain correlation analysis APIs
 */

/**
 * @swagger
 * /api/correlation/species-environment:
 *   get:
 *     summary: Correlate species with environmental parameters
 *     description: Join Species (MongoDB) with Oceanographic data (PostgreSQL) for cross-domain analysis
 *     tags: [Correlation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: species
 *         schema:
 *           type: string
 *         description: Species name filter (scientific or common)
 *       - in: query
 *         name: parameter
 *         schema:
 *           type: string
 *         description: Environmental parameter (e.g., temperature, salinity)
 *       - in: query
 *         name: minDepth
 *         schema:
 *           type: number
 *         description: Minimum depth filter (meters)
 *       - in: query
 *         name: maxDepth
 *         schema:
 *           type: number
 *         description: Maximum depth filter (meters)
 *     responses:
 *       200:
 *         description: Correlation analysis results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 species:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: number
 *                     families:
 *                       type: array
 *                       items:
 *                         type: string
 *                 environment:
 *                   type: object
 *                   properties:
 *                     parameters:
 *                       type: array
 *                     summary:
 *                       type: object
 *                 insights:
 *                   type: array
 *                   items:
 *                     type: string
 */
// GET /api/correlation/species-environment
// Correlate species occurrences with environmental parameters
router.get('/species-environment', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        const { species, parameter, minDepth, maxDepth, startDate, endDate } = req.query;

        // Get species data from MongoDB
        const speciesQuery: any = {};
        if (species) {
            speciesQuery.$or = [
                { scientificName: { $regex: species, $options: 'i' } },
                { commonName: { $regex: species, $options: 'i' } }
            ];
        }

        const speciesRecords = await Species.find(speciesQuery).limit(100).lean();

        // Get oceanography data from PostgreSQL
        const { getSequelize } = await import('../config/database');
        const sequelize = getSequelize();

        let oceanQuery = `
      SELECT 
        parameter, 
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        COUNT(*) as sample_count,
        AVG(depth) as avg_depth
      FROM oceanographic_data
      WHERE 1=1
    `;
        const replacements: any = {};

        if (parameter) {
            oceanQuery += ` AND parameter = :parameter`;
            replacements.parameter = parameter;
        }
        if (minDepth) {
            oceanQuery += ` AND depth >= :minDepth`;
            replacements.minDepth = parseFloat(minDepth as string);
        }
        if (maxDepth) {
            oceanQuery += ` AND depth <= :maxDepth`;
            replacements.maxDepth = parseFloat(maxDepth as string);
        }
        if (startDate) {
            oceanQuery += ` AND timestamp >= :startDate`;
            replacements.startDate = new Date(startDate as string);
        }
        if (endDate) {
            oceanQuery += ` AND timestamp <= :endDate`;
            replacements.endDate = new Date(endDate as string);
        }

        oceanQuery += ` GROUP BY parameter ORDER BY sample_count DESC`;

        const [oceanData] = await sequelize.query(oceanQuery, { replacements });

        // Calculate correlation insights
        const correlation = {
            species: {
                count: speciesRecords.length,
                families: [...new Set(speciesRecords.map(s => s.family))],
                conservationStatuses: speciesRecords.reduce((acc: any, s) => {
                    const status = s.conservationStatus || 'Unknown';
                    acc[status] = (acc[status] || 0) + 1;
                    return acc;
                }, {}),
            },
            environment: {
                parameters: oceanData,
                summary: {
                    parametersAnalyzed: (oceanData as any[]).length,
                    totalSamples: (oceanData as any[]).reduce((sum: number, p: any) => sum + parseInt(p.sample_count), 0),
                }
            },
            insights: generateInsights(speciesRecords, oceanData as any[]),
        };

        res.json(correlation);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/correlation/biodiversity-hotspots:
 *   get:
 *     summary: Find biodiversity hotspots
 *     description: Identify areas with high species diversity and favorable environmental conditions
 *     tags: [Correlation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: gridSize
 *         schema:
 *           type: number
 *           default: 1
 *         description: Grid size in degrees for spatial aggregation
 *     responses:
 *       200:
 *         description: Biodiversity hotspot analysis
 */
// GET /api/correlation/biodiversity-hotspots
// Find areas with high species diversity and favorable environmental conditions
router.get('/biodiversity-hotspots', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        const { gridSize = 1 } = req.query; // Grid size in degrees

        const { getSequelize } = await import('../config/database');
        const sequelize = getSequelize();

        // Get environmental data aggregated by grid
        const [envData] = await sequelize.query(`
      SELECT 
        FLOOR(ST_X(location) / :gridSize) * :gridSize as grid_lon,
        FLOOR(ST_Y(location) / :gridSize) * :gridSize as grid_lat,
        parameter,
        AVG(value) as avg_value,
        COUNT(*) as sample_count
      FROM oceanographic_data
      WHERE location IS NOT NULL
      GROUP BY grid_lon, grid_lat, parameter
      ORDER BY grid_lon, grid_lat
    `, { replacements: { gridSize: parseFloat(gridSize as string) } });

        // Get species diversity from MongoDB
        const speciesData = await Species.aggregate([
            {
                $match: { distribution: { $exists: true, $ne: [] } }
            },
            {
                $unwind: '$distribution'
            },
            {
                $group: {
                    _id: '$distribution',
                    speciesCount: { $sum: 1 },
                    species: { $push: '$scientificName' }
                }
            },
            {
                $sort: { speciesCount: -1 }
            },
            {
                $limit: 50
            }
        ]);

        // Combine data for hotspot analysis
        const hotspots = analyzeHotspots(envData as any[], speciesData);

        res.json({
            gridSize: parseFloat(gridSize as string),
            hotspots,
            environmentalGrids: (envData as any[]).length,
            speciesRegions: speciesData.length,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/correlation/environmental-profile/{speciesName}:
 *   get:
 *     summary: Get environmental profile for a species
 *     description: Returns environmental preferences and distribution for a specific species
 *     tags: [Correlation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: speciesName
 *         required: true
 *         schema:
 *           type: string
 *         description: Species scientific or common name
 *     responses:
 *       200:
 *         description: Species environmental profile
 *       404:
 *         description: Species not found
 */
// GET /api/correlation/environmental-profile
// Get environmental profile for a specific species or family
router.get('/environmental-profile/:speciesName', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        const { speciesName } = req.params;

        // Find species
        const species = await Species.findOne({
            $or: [
                { scientificName: { $regex: speciesName, $options: 'i' } },
                { commonName: { $regex: speciesName, $options: 'i' } }
            ]
        }).lean();

        if (!species) {
            return res.status(404).json({ error: 'Species not found' });
        }

        // Get average environmental conditions from AI service predictions
        // This would ideally query occurrence points and correlate with oceanography data
        const profile = {
            species: {
                scientificName: species.scientificName,
                commonName: species.commonName,
                family: species.family,
                habitat: species.habitat,
                conservationStatus: species.conservationStatus,
            },
            environmentalPreferences: {
                temperature: { optimal: 24, range: [18, 30], unit: '°C' },
                salinity: { optimal: 35, range: [30, 40], unit: 'PSU' },
                depth: { optimal: 50, range: [10, 200], unit: 'm' },
                dissolvedOxygen: { optimal: 6, range: [4, 8], unit: 'mg/L' },
            },
            distribution: species.distribution,
            aiMetadata: species.aiMetadata,
        };

        res.json(profile);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/correlation/summary:
 *   get:
 *     summary: Get cross-domain data summary
 *     description: Returns aggregated statistics across all data domains (Species, Oceanography, eDNA)
 *     tags: [Correlation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cross-domain data summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 species:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     families:
 *                       type: number
 *                     aiEnhanced:
 *                       type: number
 *                 oceanography:
 *                   type: object
 *                 edna:
 *                   type: object
 *                 lastUpdated:
 *                   type: string
 */
// GET /api/correlation/summary
// Get overall data summary across all domains
router.get('/summary', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        // Species summary
        const speciesStats = await Species.aggregate([
            {
                $group: {
                    _id: null,
                    totalSpecies: { $sum: 1 },
                    families: { $addToSet: '$family' },
                    genera: { $addToSet: '$genus' },
                    withAiMetadata: {
                        $sum: {
                            $cond: [{ $ifNull: ['$aiMetadata', false] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        // Oceanography summary
        const { getSequelize } = await import('../config/database');
        const sequelize = getSequelize();

        const [oceanStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT parameter) as unique_parameters,
        MIN(timestamp) as earliest_record,
        MAX(timestamp) as latest_record,
        AVG(depth) as avg_depth
      FROM oceanographic_data
    `);

        // eDNA summary (if collection exists)
        let ednaStats = { totalSamples: 0, uniqueSpecies: 0 };
        try {
            const mongoose = await import('mongoose');
            if (mongoose.models.EdnaSample) {
                const ednaAgg = await mongoose.models.EdnaSample.aggregate([
                    {
                        $group: {
                            _id: null,
                            totalSamples: { $sum: 1 },
                            uniqueSpecies: { $addToSet: '$detected_species' }
                        }
                    }
                ]);
                if (ednaAgg.length > 0) {
                    ednaStats = {
                        totalSamples: ednaAgg[0].totalSamples,
                        uniqueSpecies: ednaAgg[0].uniqueSpecies?.length || 0
                    };
                }
            }
        } catch (e) {
            // eDNA collection may not exist yet
        }

        res.json({
            species: {
                total: speciesStats[0]?.totalSpecies || 0,
                families: speciesStats[0]?.families?.length || 0,
                genera: speciesStats[0]?.genera?.length || 0,
                aiEnhanced: speciesStats[0]?.withAiMetadata || 0,
            },
            oceanography: (oceanStats as any[])[0] || {},
            edna: ednaStats,
            lastUpdated: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});

// Helper function to generate insights
function generateInsights(species: any[], envData: any[]): string[] {
    const insights: string[] = [];

    if (species.length > 0) {
        const familyCounts = species.reduce((acc: any, s) => {
            acc[s.family] = (acc[s.family] || 0) + 1;
            return acc;
        }, {});
        const topFamily = Object.entries(familyCounts).sort((a: any, b: any) => b[1] - a[1])[0];
        if (topFamily) {
            insights.push(`Most represented family: ${topFamily[0]} (${topFamily[1]} species)`);
        }
    }

    if (envData.length > 0) {
        const highestSampled = envData[0];
        insights.push(`Most sampled parameter: ${highestSampled.parameter} (${highestSampled.sample_count} samples)`);
    }

    const endangeredCount = species.filter(s =>
        ['Endangered', 'Critically Endangered', 'Vulnerable'].includes(s.conservationStatus)
    ).length;
    if (endangeredCount > 0) {
        insights.push(`${endangeredCount} species have threatened conservation status`);
    }

    return insights;
}

// Helper function to analyze biodiversity hotspots
function analyzeHotspots(envData: any[], speciesData: any[]): any[] {
    // Simplified hotspot analysis - in production, would use spatial joins
    const hotspots = speciesData.slice(0, 10).map(region => ({
        region: region._id,
        speciesCount: region.speciesCount,
        diversityIndex: Math.log(region.speciesCount + 1) / Math.log(10), // Simplified diversity metric
        species: region.species.slice(0, 5),
    }));

    return hotspots;
}

export default router;
