/**
 * Fisheries Analytics API Routes
 * 
 * REST API endpoints for fisheries stock assessment and modeling.
 */

import { Router, Request, Response } from 'express';
import {
    cpueAnalysis,
    lengthFrequency,
    stockAssessment,
    abundanceTrends
} from '../services/fisheries';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/fisheries/cpue
 * Calculate CPUE from catch records
 */
router.post('/cpue', async (req: Request, res: Response) => {
    try {
        const { records, species, period } = req.body;

        if (!records || !Array.isArray(records)) {
            return res.status(400).json({
                success: false,
                error: 'Array of catch records required',
            });
        }

        if (species) {
            // Single species CPUE
            const result = cpueAnalysis.calculateCPUE(records, species);
            const series = cpueAnalysis.calculateCPUETimeSeries(records, species, period || 'monthly');

            res.json({
                success: true,
                cpue: result,
                timeSeries: series,
            });
        } else {
            // Summary for all species
            const summary = cpueAnalysis.getCPUESummary(records);

            res.json({
                success: true,
                summary,
            });
        }

    } catch (error: any) {
        logger.error('CPUE calculation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'CPUE calculation failed',
        });
    }
});

/**
 * POST /api/fisheries/length-analysis
 * Analyze length-frequency distribution
 */
router.post('/length-analysis', async (req: Request, res: Response) => {
    try {
        const { records, species, binSize = 5 } = req.body;

        if (!records || !Array.isArray(records)) {
            return res.status(400).json({
                success: false,
                error: 'Array of length records required',
            });
        }

        if (!species) {
            return res.status(400).json({
                success: false,
                error: 'Species name required',
            });
        }

        const distribution = lengthFrequency.calculateLengthDistribution(records, species, binSize);
        const cohorts = lengthFrequency.identifyCohorts(records, species);
        const growth = lengthFrequency.estimateGrowthParameters(records);
        const lengthWeight = lengthFrequency.calculateLengthWeight(records, species);

        res.json({
            success: true,
            distribution,
            cohorts,
            growthParameters: growth,
            lengthWeight,
        });

    } catch (error: any) {
        logger.error('Length analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Length analysis failed',
        });
    }
});

/**
 * POST /api/fisheries/stock-assessment
 * Comprehensive stock assessment
 */
router.post('/stock-assessment', async (req: Request, res: Response) => {
    try {
        const { catchRecords, lengthRecords, species, options = {} } = req.body;

        if (!species) {
            return res.status(400).json({
                success: false,
                error: 'Species name required',
            });
        }

        const mortality = stockAssessment.estimateMortality(
            lengthRecords || [],
            species,
            options
        );

        const status = stockAssessment.assessStockStatus(
            catchRecords || [],
            lengthRecords || [],
            species
        );

        const recruitment = stockAssessment.analyzeRecruitment(
            catchRecords || [],
            lengthRecords || [],
            species
        );

        res.json({
            success: true,
            species,
            mortality,
            stockStatus: status,
            recruitment,
        });

    } catch (error: any) {
        logger.error('Stock assessment error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Stock assessment failed',
        });
    }
});

/**
 * POST /api/fisheries/trends
 * Analyze abundance trends
 */
router.post('/trends', async (req: Request, res: Response) => {
    try {
        const { records, species } = req.body;

        if (!records || !Array.isArray(records)) {
            return res.status(400).json({
                success: false,
                error: 'Array of catch records required',
            });
        }

        if (!species) {
            return res.status(400).json({
                success: false,
                error: 'Species name required',
            });
        }

        const trend = abundanceTrends.analyzeTrend(records, species);
        const spatial = abundanceTrends.analyzeSpatialDistribution(records, species);

        res.json({
            success: true,
            trend,
            spatialDistribution: spatial,
        });

    } catch (error: any) {
        logger.error('Trend analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Trend analysis failed',
        });
    }
});

/**
 * POST /api/fisheries/forecast
 * Generate abundance forecast
 */
router.post('/forecast', async (req: Request, res: Response) => {
    try {
        const { records, species, horizonMonths = 12, method = 'linear' } = req.body;

        if (!records || !Array.isArray(records)) {
            return res.status(400).json({
                success: false,
                error: 'Array of catch records required',
            });
        }

        if (!species) {
            return res.status(400).json({
                success: false,
                error: 'Species name required',
            });
        }

        const forecast = abundanceTrends.forecastAbundance(records, species, horizonMonths, method);

        res.json({
            success: true,
            forecast,
        });

    } catch (error: any) {
        logger.error('Forecast error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Forecasting failed',
        });
    }
});

/**
 * POST /api/fisheries/multi-species
 * Multi-species stock summary
 */
router.post('/multi-species', async (req: Request, res: Response) => {
    try {
        const { catchRecords, lengthRecords } = req.body;

        if (!catchRecords || !Array.isArray(catchRecords)) {
            return res.status(400).json({
                success: false,
                error: 'Array of catch records required',
            });
        }

        const summary = stockAssessment.getMultiSpeciesStockSummary(
            catchRecords,
            lengthRecords || []
        );

        res.json({
            success: true,
            species: summary,
            totalSpecies: summary.length,
        });

    } catch (error: any) {
        logger.error('Multi-species assessment error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Multi-species assessment failed',
        });
    }
});

/**
 * GET /api/fisheries/info
 * Get fisheries analytics information
 */
router.get('/info', (req: Request, res: Response) => {
    res.json({
        success: true,
        module: {
            name: 'CMLRE Fisheries Stock & Abundance Modeling',
            version: '1.0.0',
            capabilities: [
                { name: 'CPUE Analysis', description: 'Catch per unit effort calculations with trend detection' },
                { name: 'Length-Frequency', description: 'Length distribution, cohort identification, growth parameters' },
                { name: 'Stock Assessment', description: 'Mortality estimation, stock status, sustainability scoring' },
                { name: 'Abundance Trends', description: 'Time-series analysis, forecasting, spatial mapping' },
            ],
            methods: {
                mortality: ['Pauly', 'Hoenig', 'Then'],
                growth: ['von Bertalanffy'],
                forecasting: ['Linear', 'Exponential'],
            },
        },
    });
});

// ==================== DATA STORAGE ENDPOINTS ====================

/**
 * POST /api/fisheries/datasets
 * Upload a new fisheries dataset (catch/length records)
 */
router.post('/datasets', async (req: Request, res: Response) => {
    try {
        const { name, type, records, uploadedBy } = req.body;

        if (!name || !records || !Array.isArray(records)) {
            return res.status(400).json({
                success: false,
                error: 'Dataset name and records array required',
            });
        }

        if (!['catch', 'length', 'mixed'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Type must be catch, length, or mixed',
            });
        }

        const { dataStorage } = await import('../services/fisheries');
        const dataset = dataStorage.createDataset({
            name,
            type,
            records,
            uploadedBy: uploadedBy || 'anonymous',
        });

        res.json({
            success: true,
            dataset,
        });

    } catch (error: any) {
        logger.error('Dataset upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to upload dataset',
        });
    }
});

/**
 * GET /api/fisheries/datasets
 * Get all uploaded fisheries datasets
 */
router.get('/datasets', async (req: Request, res: Response) => {
    try {
        const { dataStorage } = await import('../services/fisheries');
        const datasets = dataStorage.getAllDatasets();
        const stats = dataStorage.getStorageStats();

        res.json({
            success: true,
            datasets,
            stats,
        });

    } catch (error: any) {
        logger.error('Get datasets error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get datasets',
        });
    }
});

/**
 * DELETE /api/fisheries/datasets/:id
 * Delete a fisheries dataset
 */
router.delete('/datasets/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { dataStorage } = await import('../services/fisheries');
        const deleted = dataStorage.deleteDataset(id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Dataset not found',
            });
        }

        res.json({
            success: true,
            message: 'Dataset deleted',
        });

    } catch (error: any) {
        logger.error('Delete dataset error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete dataset',
        });
    }
});

/**
 * GET /api/fisheries/data/catch
 * Get stored catch records for analysis
 */
router.get('/data/catch', async (req: Request, res: Response) => {
    try {
        const { species, datasetId, startDate, endDate } = req.query;
        const { dataStorage } = await import('../services/fisheries');

        const records = dataStorage.getCatchRecords({
            species: species as string,
            datasetId: datasetId as string,
            startDate: startDate as string,
            endDate: endDate as string,
        });

        res.json({
            success: true,
            count: records.length,
            records,
        });

    } catch (error: any) {
        logger.error('Get catch data error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get catch data',
        });
    }
});

/**
 * GET /api/fisheries/data/length
 * Get stored length records for analysis
 */
router.get('/data/length', async (req: Request, res: Response) => {
    try {
        const { species, datasetId } = req.query;
        const { dataStorage } = await import('../services/fisheries');

        const records = dataStorage.getLengthRecords({
            species: species as string,
            datasetId: datasetId as string,
        });

        res.json({
            success: true,
            count: records.length,
            records,
        });

    } catch (error: any) {
        logger.error('Get length data error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get length data',
        });
    }
});

/**
 * POST /api/fisheries/analyze-with-data
 * Run CPUE analysis using stored data (from uploaded datasets)
 */
router.post('/analyze-with-data', async (req: Request, res: Response) => {
    try {
        const { species, datasetId } = req.body;

        if (!species) {
            return res.status(400).json({
                success: false,
                error: 'Species name required',
            });
        }

        const { dataStorage } = await import('../services/fisheries');
        const catchRecords = dataStorage.getCatchRecords({ species, datasetId });
        const lengthRecords = dataStorage.getLengthRecords({ species, datasetId });

        if (catchRecords.length === 0) {
            return res.status(404).json({
                success: false,
                error: `No catch data found for species "${species}". Please upload fisheries data first.`,
            });
        }

        // Run analysis with real data - cast to any for type compatibility
        const cpueResult = cpueAnalysis.calculateCPUE(catchRecords as any, species);
        const timeSeries = cpueAnalysis.calculateCPUETimeSeries(catchRecords as any, species, 'monthly');

        // Length frequency analysis
        let lengthResult = null;
        if (lengthRecords.length > 0) {
            const distribution = lengthFrequency.calculateLengthDistribution(lengthRecords as any, species);
            const cohorts = lengthFrequency.identifyCohorts(lengthRecords as any, species);
            const growthParams = lengthFrequency.estimateGrowthParameters(lengthRecords as any);
            const lengthWeight = lengthFrequency.calculateLengthWeight(lengthRecords as any, species);
            lengthResult = { distribution, cohorts, growthParams, lengthWeight };
        }

        // Stock assessment
        let stockResult = null;
        if (lengthRecords.length > 0) {
            const mortality = stockAssessment.estimateMortality(lengthRecords as any, species, {});
            const status = stockAssessment.assessStockStatus(catchRecords as any, lengthRecords as any, species);
            const recruitment = stockAssessment.analyzeRecruitment(catchRecords as any, lengthRecords as any, species);
            stockResult = { mortality, stockStatus: status, recruitment };
        }

        res.json({
            success: true,
            dataSource: 'uploaded',
            recordsUsed: {
                catch: catchRecords.length,
                length: lengthRecords.length,
            },
            cpue: cpueResult,
            timeSeries,
            length: lengthResult,
            stock: stockResult,
        });

    } catch (error: any) {
        logger.error('Analyze with data error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Analysis failed',
        });
    }
});

export default router;
