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
 * Calculate maturity ogive (percentage mature at each length class)
 * Returns S-curve data for maturity by length visualization
 */
function calculateMaturityOgive(lengthRecords: any[]): { lengthClass: number; percentMature: number; totalCount: number }[] {
    const matureStates = ['mature', 'spawning', 'spent', 'maturing'];
    const binSize = 5; // 5cm bins

    // Group by length class
    const lengthGroups = new Map<number, { mature: number; total: number }>();

    for (const rec of lengthRecords) {
        if (!rec.length) continue;

        const lengthClass = Math.floor(rec.length / binSize) * binSize + binSize / 2;

        if (!lengthGroups.has(lengthClass)) {
            lengthGroups.set(lengthClass, { mature: 0, total: 0 });
        }

        const group = lengthGroups.get(lengthClass)!;
        group.total++;

        // Check if mature
        if (rec.maturity && matureStates.includes(rec.maturity.toLowerCase())) {
            group.mature++;
        }
    }

    // Convert to ogive data
    return Array.from(lengthGroups.entries())
        .map(([lengthClass, data]) => ({
            lengthClass,
            percentMature: Math.round((data.mature / data.total) * 100),
            totalCount: data.total,
        }))
        .filter(d => d.totalCount >= 3) // Minimum sample size
        .sort((a, b) => a.lengthClass - b.lengthClass);
}


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
        const datasets = await dataStorage.getAllDatasets();
        const stats = await dataStorage.getStorageStats();

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
        const deleted = await dataStorage.deleteDataset(id);

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

        const records = await dataStorage.getCatchRecords({
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

        const records = await dataStorage.getLengthRecords({
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
        const catchRecords = await dataStorage.getCatchRecords({ species, datasetId });
        const lengthRecords = await dataStorage.getLengthRecords({ species, datasetId });

        if (catchRecords.length === 0) {
            return res.status(404).json({
                success: false,
                error: `No catch data found for species "${species}". Please upload fisheries data first.`,
            });
        }

        // Run analysis with real data - cast to any for type compatibility
        const cpueResult = cpueAnalysis.calculateCPUE(catchRecords as any, species);
        const timeSeries = cpueAnalysis.calculateCPUETimeSeries(catchRecords as any, species, 'monthly');

        // Calculate YEARLY CPUE time series (for bar chart)
        const yearlyMap = new Map<number, { totalCatch: number; totalEffort: number }>();
        for (const rec of catchRecords) {
            const year = parseInt(rec.date.substring(0, 4));
            if (!yearlyMap.has(year)) {
                yearlyMap.set(year, { totalCatch: 0, totalEffort: 0 });
            }
            const y = yearlyMap.get(year)!;
            y.totalCatch += rec.catch || 0;
            y.totalEffort += rec.effort || 1;
        }
        const yearlyTimeSeries = Array.from(yearlyMap.entries())
            .map(([year, data]) => ({
                year,
                catch: Math.round(data.totalCatch * 10) / 10,
                effort: data.totalEffort,
                cpue: Math.round((data.totalCatch / data.totalEffort) * 100) / 100,
            }))
            .sort((a, b) => a.year - b.year);

        // Extract date range for UI label
        const years = yearlyTimeSeries.map(y => y.year);
        const dateRange = {
            startYear: Math.min(...years),
            endYear: Math.max(...years),
        };

        // Length frequency analysis
        let lengthResult = null;
        if (lengthRecords.length > 0) {
            const distribution = lengthFrequency.calculateLengthDistribution(lengthRecords as any, species);
            const cohorts = lengthFrequency.identifyCohorts(lengthRecords as any, species);
            const growthParams = lengthFrequency.estimateGrowthParameters(lengthRecords as any);
            const lengthWeight = lengthFrequency.calculateLengthWeight(lengthRecords as any, species);

            // Calculate maturity ogive (% mature at each length class)
            const maturityOgive = calculateMaturityOgive(lengthRecords);

            lengthResult = { distribution, cohorts, growthParams, lengthWeight, maturityOgive };
        }

        // Stock assessment
        let stockResult = null;
        if (lengthRecords.length > 0) {
            const mortality = stockAssessment.estimateMortality(lengthRecords as any, species, {});
            const status = stockAssessment.assessStockStatus(catchRecords as any, lengthRecords as any, species);
            const recruitment = stockAssessment.analyzeRecruitment(catchRecords as any, lengthRecords as any, species);

            // Calculate F/M ratio for sustainability indicator
            const fmRatio = mortality.F && mortality.M
                ? Math.round((mortality.F / mortality.M) * 100) / 100
                : null;

            // Determine sustainability status
            const sustainabilityScore = status.sustainabilityScore || 50;
            let sustainabilityStatus: 'sustainable' | 'fully_exploited' | 'overfished' = 'fully_exploited';
            if (sustainabilityScore >= 70) sustainabilityStatus = 'sustainable';
            else if (sustainabilityScore < 40) sustainabilityStatus = 'overfished';

            stockResult = {
                mortality,
                stockStatus: status,
                recruitment,
                fmRatio,
                sustainabilityStatus,
            };
        }

        // Transform timeSeries dataPoints for frontend (expects period not date)
        const monthlyTimeSeries = timeSeries.dataPoints.map(d => ({
            period: d.date,
            cpue: d.cpue,
            catch: d.catch,
            effort: d.effort,
            sampleSize: d.sampleSize,
        }));

        res.json({
            success: true,
            dataSource: 'uploaded',
            dateRange,
            recordsUsed: {
                catch: catchRecords.length,
                length: lengthRecords.length,
            },
            cpue: cpueResult,
            timeSeries: monthlyTimeSeries,  // Array with period field
            yearlyTimeSeries,
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

// ============================================================
// SPATIAL & ENVIRONMENTAL ANALYSIS ENDPOINTS
// ============================================================

/**
 * GET /api/fisheries/spatial-cpue
 * Get spatial CPUE data for heatmap visualization
 */
router.get('/spatial-cpue', async (req: Request, res: Response) => {
    try {
        const { species } = req.query;
        const { dataStorage } = await import('../services/fisheries');

        const catchRecords = await dataStorage.getCatchRecords({
            species: species as string,
        });

        // Group by location and calculate CPUE
        const locationMap = new Map<string, { lat: number; lon: number; totalCatch: number; totalEffort: number; count: number; depth?: number }>();

        for (const rec of catchRecords) {
            if (!rec.location?.lat || !rec.location?.lon) continue;

            // Round to 0.1 degree grid for aggregation
            const gridLat = Math.round(rec.location.lat * 10) / 10;
            const gridLon = Math.round(rec.location.lon * 10) / 10;
            const key = `${gridLat},${gridLon}`;

            if (!locationMap.has(key)) {
                locationMap.set(key, {
                    lat: gridLat,
                    lon: gridLon,
                    totalCatch: 0,
                    totalEffort: 0,
                    count: 0,
                    depth: rec.location.depth
                });
            }

            const loc = locationMap.get(key)!;
            loc.totalCatch += rec.catch || 0;
            loc.totalEffort += rec.effort || 1;
            loc.count++;
        }

        const spatialData = Array.from(locationMap.values()).map(loc => ({
            lat: loc.lat,
            lon: loc.lon,
            cpue: loc.totalEffort > 0 ? Math.round((loc.totalCatch / loc.totalEffort) * 100) / 100 : 0,
            totalCatch: Math.round(loc.totalCatch * 10) / 10,
            samples: loc.count,
            avgDepth: loc.depth,
        }));

        // Calculate bounds for map centering
        const lats = spatialData.map(d => d.lat).filter(l => l);
        const lons = spatialData.map(d => d.lon).filter(l => l);

        res.json({
            success: true,
            species: species || 'all',
            pointCount: spatialData.length,
            data: spatialData,
            bounds: lats.length > 0 ? {
                minLat: Math.min(...lats),
                maxLat: Math.max(...lats),
                minLon: Math.min(...lons),
                maxLon: Math.max(...lons),
                centerLat: (Math.min(...lats) + Math.max(...lats)) / 2,
                centerLon: (Math.min(...lons) + Math.max(...lons)) / 2,
            } : null,
        });

    } catch (error: any) {
        logger.error('Spatial CPUE error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/fisheries/depth-distribution
 * Get species catch distribution by depth
 */
router.get('/depth-distribution', async (req: Request, res: Response) => {
    try {
        const { species } = req.query;
        const { dataStorage } = await import('../services/fisheries');

        const catchRecords = await dataStorage.getCatchRecords({
            species: species as string,
        });

        // Group by depth bins (25m intervals)
        const depthBinSize = 25;
        const depthBins = new Map<number, { totalCatch: number; count: number; avgCpue: number }>();

        for (const rec of catchRecords) {
            const depth = rec.location?.depth;
            if (!depth || depth <= 0) continue;

            const depthBin = Math.floor(depth / depthBinSize) * depthBinSize;

            if (!depthBins.has(depthBin)) {
                depthBins.set(depthBin, { totalCatch: 0, count: 0, avgCpue: 0 });
            }

            const bin = depthBins.get(depthBin)!;
            bin.totalCatch += rec.catch || 0;
            bin.count++;
        }

        // Calculate average CPUE per bin
        const depthData = Array.from(depthBins.entries())
            .map(([depthBin, data]) => ({
                depthRange: `${depthBin}-${depthBin + depthBinSize}m`,
                depthMid: depthBin + depthBinSize / 2,
                totalCatch: Math.round(data.totalCatch * 10) / 10,
                sampleCount: data.count,
                avgCatch: Math.round((data.totalCatch / data.count) * 100) / 100,
            }))
            .sort((a, b) => a.depthMid - b.depthMid);

        res.json({
            success: true,
            species: species || 'all',
            binSize: depthBinSize,
            data: depthData,
            summary: {
                totalSamples: depthData.reduce((sum, d) => sum + d.sampleCount, 0),
                depthRange: depthData.length > 0 ? {
                    min: depthData[0].depthMid - depthBinSize / 2,
                    max: depthData[depthData.length - 1].depthMid + depthBinSize / 2,
                } : null,
                peakDepth: depthData.length > 0
                    ? depthData.reduce((max, d) => d.totalCatch > max.totalCatch ? d : max, depthData[0])
                    : null,
            },
        });

    } catch (error: any) {
        logger.error('Depth distribution error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/fisheries/environment-correlate
 * Correlate fisheries data with environmental parameters (SST, Chl-a)
 */
router.post('/environment-correlate', async (req: Request, res: Response) => {
    try {
        const { species, environmentData } = req.body;
        // environmentData format: [{ lat, lon, sst, chla, date }]

        const { dataStorage } = await import('../services/fisheries');

        const catchRecords = await dataStorage.getCatchRecords({
            species: species as string,
        });

        if (!environmentData || environmentData.length === 0) {
            // Return fisheries points that can be matched with environment data
            const points = catchRecords
                .filter(r => r.location?.lat && r.location?.lon)
                .map(r => ({
                    lat: r.location!.lat,
                    lon: r.location!.lon,
                    date: r.date,
                    cpue: r.effort > 0 ? r.catch / r.effort : 0,
                    catch: r.catch,
                    depth: r.location!.depth,
                }));

            return res.json({
                success: true,
                message: 'Fisheries data ready for correlation. Provide environmentData to compute correlations.',
                fisheryPoints: points.slice(0, 100), // Limit for performance
                totalPoints: points.length,
            });
        }

        // Match fisheries data with environment data (nearest neighbor)
        const correlatedData: Array<{
            lat: number;
            lon: number;
            cpue: number;
            sst?: number;
            chla?: number;
        }> = [];

        for (const rec of catchRecords) {
            if (!rec.location?.lat || !rec.location?.lon) continue;

            // Find nearest environment data point
            let nearestEnv = null;
            let minDist = Infinity;

            for (const env of environmentData) {
                const dist = Math.sqrt(
                    Math.pow(rec.location.lat - env.lat, 2) +
                    Math.pow(rec.location.lon - env.lon, 2)
                );
                if (dist < minDist) {
                    minDist = dist;
                    nearestEnv = env;
                }
            }

            if (nearestEnv && minDist < 0.5) { // Within 0.5 degrees
                correlatedData.push({
                    lat: rec.location.lat,
                    lon: rec.location.lon,
                    cpue: rec.effort > 0 ? rec.catch / rec.effort : 0,
                    sst: nearestEnv.sst,
                    chla: nearestEnv.chla,
                });
            }
        }

        // Calculate correlation coefficients
        const cpueValues = correlatedData.map(d => d.cpue);
        const sstValues = correlatedData.map(d => d.sst).filter((v): v is number => v !== undefined);
        const chlaValues = correlatedData.map(d => d.chla).filter((v): v is number => v !== undefined);

        const calculateCorrelation = (x: number[], y: number[]): number => {
            if (x.length !== y.length || x.length < 2) return 0;
            const n = x.length;
            const sumX = x.reduce((a, b) => a + b, 0);
            const sumY = y.reduce((a, b) => a + b, 0);
            const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
            const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
            const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

            const numerator = n * sumXY - sumX * sumY;
            const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
            return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 1000;
        };

        res.json({
            success: true,
            species: species || 'all',
            matchedPoints: correlatedData.length,
            correlations: {
                cpue_sst: sstValues.length > 5 ? calculateCorrelation(cpueValues.slice(0, sstValues.length), sstValues) : null,
                cpue_chla: chlaValues.length > 5 ? calculateCorrelation(cpueValues.slice(0, chlaValues.length), chlaValues) : null,
            },
            data: correlatedData.slice(0, 50), // Sample for visualization
        });

    } catch (error: any) {
        logger.error('Environment correlate error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
