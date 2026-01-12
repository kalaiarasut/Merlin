/**
 * Causal Analysis API Routes
 * 
 * REST API endpoints for cross-domain causal analysis.
 */

import { Router, Request, Response } from 'express';
import {
    correlationAnalysis,
    lagAnalysis,
    causalInference,
    TimeSeries
} from '../services/causal';
import { dataStorage } from '../services/fisheries';
import logger from '../utils/logger';

const router = Router();

// ============================================================
// TIME SERIES DATA ENDPOINTS (for Causal Analysis Integration)
// ============================================================

/**
 * GET /api/causal/available-series
 * List available time series for causal analysis
 * Returns oceanographic (SST, salinity, chlorophyll) and fisheries (CPUE) series
 */
router.get('/available-series', async (req: Request, res: Response) => {
    try {
        // Get available fisheries data (species list)
        const catchRecords = await dataStorage.getCatchRecords({});
        const speciesSet = new Set<string>();
        for (const rec of catchRecords) {
            if (rec.species) speciesSet.add(rec.species);
        }
        const species = Array.from(speciesSet);

        // Build available series list
        const oceanographicSeries = [
            { id: 'sst', name: 'Sea Surface Temperature', unit: '°C', source: 'erddap', available: true },
            { id: 'salinity', name: 'Sea Surface Salinity', unit: 'PSU', source: 'erddap', available: true },
            { id: 'chlorophyll', name: 'Chlorophyll-a', unit: 'mg/m³', source: 'erddap', available: true },
        ];

        const fisheriesSeries = species.map(sp => ({
            id: `cpue_${sp.toLowerCase().replace(/\s+/g, '_')}`,
            name: `CPUE - ${sp}`,
            species: sp,
            unit: 'kg/hour',
            source: 'uploaded',
            available: true,
        }));

        // Check if we have enough data points for analysis
        const totalRecords = catchRecords.length;
        const hasUploadedData = totalRecords > 10;

        res.json({
            success: true,
            oceanographic: oceanographicSeries,
            fisheries: fisheriesSeries,
            aggregationOptions: ['monthly', 'weekly'],
            defaultAggregation: 'monthly',
            dataStatus: {
                hasUploadedData,
                totalCatchRecords: totalRecords,
                speciesCount: species.length,
            },
        });

    } catch (error: any) {
        logger.error('Available series error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get available series',
        });
    }
});

/**
 * GET /api/causal/time-series/:seriesId
 * Extract time series data for a specific parameter
 * Query params: aggregation=monthly|weekly, species=<name>
 */
router.get('/time-series/:seriesId', async (req: Request, res: Response) => {
    try {
        const { seriesId } = req.params;
        const { aggregation = 'monthly', species } = req.query;

        let timeSeries: { date: string; value: number }[] = [];
        let metadata: any = {};

        // Handle fisheries CPUE series
        if (seriesId.startsWith('cpue_')) {
            const targetSpecies = species as string || seriesId.replace('cpue_', '').replace(/_/g, ' ');

            const catchRecords = await dataStorage.getCatchRecords({ species: targetSpecies });

            // Aggregate by time period
            const periodMap = new Map<string, { totalCatch: number; totalEffort: number; count: number }>();

            for (const rec of catchRecords) {
                if (!rec.date) continue;

                // Get period key based on aggregation
                let periodKey: string;
                const date = new Date(rec.date);
                if (aggregation === 'weekly') {
                    // ISO week
                    const week = Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7);
                    periodKey = `${date.getFullYear()}-W${week.toString().padStart(2, '0')}`;
                } else {
                    // Monthly (default)
                    periodKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                }

                if (!periodMap.has(periodKey)) {
                    periodMap.set(periodKey, { totalCatch: 0, totalEffort: 0, count: 0 });
                }
                const p = periodMap.get(periodKey)!;
                p.totalCatch += rec.catch || 0;
                p.totalEffort += rec.effort || 1;
                p.count++;
            }

            // Convert to time series
            timeSeries = Array.from(periodMap.entries())
                .map(([date, data]) => ({
                    date,
                    value: Math.round((data.totalCatch / data.totalEffort) * 100) / 100, // CPUE
                }))
                .sort((a, b) => a.date.localeCompare(b.date));

            metadata = {
                seriesId,
                name: `CPUE - ${targetSpecies}`,
                unit: 'kg/hour',
                aggregation,
                dataPoints: timeSeries.length,
                species: targetSpecies,
            };
        }
        // Oceanographic series would be fetched from ERDDAP here
        // For now, return a placeholder
        else if (['sst', 'salinity', 'chlorophyll'].includes(seriesId)) {
            metadata = {
                seriesId,
                name: seriesId === 'sst' ? 'Sea Surface Temperature' :
                    seriesId === 'salinity' ? 'Sea Surface Salinity' : 'Chlorophyll-a',
                unit: seriesId === 'sst' ? '°C' : seriesId === 'salinity' ? 'PSU' : 'mg/m³',
                aggregation,
                dataPoints: 0,
                note: 'Oceanographic data integration pending - use ERDDAP source directly',
            };
        }

        res.json({
            success: true,
            timeSeries,
            metadata,
        });

    } catch (error: any) {
        logger.error('Time series extraction error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to extract time series',
        });
    }
});

/**
 * POST /api/causal/correlate
 * Calculate correlation between two variables
 */
router.post('/correlate', async (req: Request, res: Response) => {
    try {
        const { series1, series2 } = req.body;

        if (!series1 || !series2) {
            return res.status(400).json({
                success: false,
                error: 'Two time series required (series1, series2)',
            });
        }

        const result = correlationAnalysis.correlateTimeSeries(series1, series2);

        res.json({
            success: true,
            correlation: result,
        });

    } catch (error: any) {
        logger.error('Correlation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Correlation analysis failed',
        });
    }
});

/**
 * POST /api/causal/correlation-matrix
 * Build correlation matrix for multiple variables
 */
router.post('/correlation-matrix', async (req: Request, res: Response) => {
    try {
        const { series } = req.body;

        if (!series || !Array.isArray(series)) {
            return res.status(400).json({
                success: false,
                error: 'Array of time series required',
            });
        }

        const matrix = correlationAnalysis.buildCorrelationMatrix(series);

        res.json({
            success: true,
            matrix,
        });

    } catch (error: any) {
        logger.error('Correlation matrix error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Correlation matrix failed',
        });
    }
});

/**
 * POST /api/causal/regression
 * Multiple regression analysis
 */
router.post('/regression', async (req: Request, res: Response) => {
    try {
        const { target, predictors } = req.body;

        if (!target || !predictors || !Array.isArray(predictors)) {
            return res.status(400).json({
                success: false,
                error: 'Target and predictors array required',
            });
        }

        const result = correlationAnalysis.multipleRegression(target, predictors);
        const importance = correlationAnalysis.calculateFeatureImportance(result);

        res.json({
            success: true,
            regression: result,
            featureImportance: importance,
        });

    } catch (error: any) {
        logger.error('Regression error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Regression analysis failed',
        });
    }
});

/**
 * POST /api/causal/lag-analysis
 * Analyze lagged relationships
 */
router.post('/lag-analysis', async (req: Request, res: Response) => {
    try {
        const { driver, response, maxLag = 12 } = req.body;

        if (!driver || !response) {
            return res.status(400).json({
                success: false,
                error: 'Driver and response series required',
            });
        }

        const result = lagAnalysis.crossCorrelation(driver, response, maxLag, 'months');

        res.json({
            success: true,
            lagAnalysis: result,
        });

    } catch (error: any) {
        logger.error('Lag analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Lag analysis failed',
        });
    }
});

/**
 * POST /api/causal/granger
 * Granger causality test
 */
router.post('/granger', async (req: Request, res: Response) => {
    try {
        const { cause, effect, maxLag = 4 } = req.body;

        if (!cause || !effect) {
            return res.status(400).json({
                success: false,
                error: 'Cause and effect series required',
            });
        }

        const result = lagAnalysis.grangerCausality(cause, effect, maxLag);

        res.json({
            success: true,
            granger: result,
        });

    } catch (error: any) {
        logger.error('Granger causality error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Granger causality test failed',
        });
    }
});

/**
 * POST /api/causal/test-hypothesis
 * Test a specific causal hypothesis
 */
router.post('/test-hypothesis', async (req: Request, res: Response) => {
    try {
        const { hypothesis, causeSeries, effectSeries } = req.body;

        if (!hypothesis || !causeSeries || !effectSeries) {
            return res.status(400).json({
                success: false,
                error: 'Hypothesis, cause series, and effect series required',
            });
        }

        const result = causalInference.testHypothesis(hypothesis, causeSeries, effectSeries);

        res.json({
            success: true,
            result,
        });

    } catch (error: any) {
        logger.error('Hypothesis test error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Hypothesis test failed',
        });
    }
});

/**
 * POST /api/causal/analyze
 * Comprehensive causal analysis
 */
router.post('/analyze', async (req: Request, res: Response) => {
    try {
        const { target, potentialDrivers } = req.body;

        if (!target || !potentialDrivers || !Array.isArray(potentialDrivers)) {
            return res.status(400).json({
                success: false,
                error: 'Target and potential drivers array required',
            });
        }

        const analysis = causalInference.analyzeCausalDrivers(target, potentialDrivers);
        const report = causalInference.generateCausalReport(analysis);

        res.json({
            success: true,
            analysis,
            report,
        });

    } catch (error: any) {
        logger.error('Causal analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Causal analysis failed',
        });
    }
});

/**
 * GET /api/causal/mechanisms
 * Get known ecological mechanisms
 */
router.get('/mechanisms', (req: Request, res: Response) => {
    res.json({
        success: true,
        mechanisms: causalInference.KNOWN_MECHANISMS,
    });
});

/**
 * GET /api/causal/info
 * Get causal analysis information
 */
router.get('/info', (req: Request, res: Response) => {
    res.json({
        success: true,
        module: {
            name: 'CMLRE Cross-Domain Causal Analysis',
            version: '1.0.0',
            capabilities: [
                { name: 'Correlation Analysis', description: 'Pearson, Spearman, correlation matrices' },
                { name: 'Multiple Regression', description: 'Multivariate regression with feature importance' },
                { name: 'Lag Analysis', description: 'Time-lagged cross-correlation analysis' },
                { name: 'Granger Causality', description: 'Statistical causality testing' },
                { name: 'Hypothesis Testing', description: 'Test specific causal hypotheses' },
                { name: 'Causal Inference', description: 'Identify drivers and causal pathways' },
            ],
            methods: {
                correlation: ['Pearson', 'Spearman'],
                regression: ['OLS Multiple Regression'],
                causality: ['Granger Causality', 'Cross-Correlation'],
            },
        },
    });
});

export default router;
