/**
 * eDNA Analysis API Routes
 * 
 * REST API endpoints for eDNA analysis pipeline.
 */

import { Router, Request, Response } from 'express';
import {
    qualityFilter,
    diversityCalculator,
    asvClustering,
    taxonomicAssignment,
    contaminationDetector
} from '../services/edna';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/edna/quality-check
 * Analyze sequence quality and filter reads
 */
router.post('/quality-check', async (req: Request, res: Response) => {
    try {
        const { sequences, options = {} } = req.body;

        if (!sequences || !Array.isArray(sequences)) {
            return res.status(400).json({
                success: false,
                error: 'Array of sequences required',
            });
        }

        const reads = sequences.map((seq: any, i: number) => ({
            id: seq.id || `read_${i + 1}`,
            sequence: seq.sequence,
            quality: seq.quality,
        }));

        const result = qualityFilter.filterReads(reads, options);

        res.json({
            success: true,
            metrics: result.metrics,
            passedCount: result.passed.length,
            failedCount: result.failed.length,
        });

    } catch (error: any) {
        logger.error('Quality check error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Quality check failed',
        });
    }
});

/**
 * POST /api/edna/cluster
 * Cluster sequences into ASVs
 */
router.post('/cluster', async (req: Request, res: Response) => {
    try {
        const { sequences, options = {} } = req.body;

        if (!sequences || !Array.isArray(sequences)) {
            return res.status(400).json({
                success: false,
                error: 'Array of sequences required',
            });
        }

        const reads = sequences.map((seq: any, i: number) => ({
            id: seq.id || `read_${i + 1}`,
            sequence: seq.sequence,
        }));

        const result = asvClustering.clusterSequences(reads, options);

        res.json({
            success: true,
            totalASVs: result.totalASVs,
            totalSequences: result.totalSequences,
            singletons: result.singletons,
            stats: result.stats,
            asvs: result.asvs.slice(0, 100), // Limit response size
        });

    } catch (error: any) {
        logger.error('Clustering error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Clustering failed',
        });
    }
});

/**
 * POST /api/edna/diversity
 * Calculate diversity indices
 */
router.post('/diversity', async (req: Request, res: Response) => {
    try {
        const { samples } = req.body;

        if (!samples || typeof samples !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Samples object required (sampleId -> {species: count})',
            });
        }

        // Calculate alpha diversity for each sample
        const alphaDiversity = Object.entries(samples).map(([sampleId, abundances]) =>
            diversityCalculator.calculateAlphaDiversity(sampleId, abundances as any)
        );

        // Calculate beta diversity matrix
        const betaDiversity = diversityCalculator.calculateBetaDiversityMatrix(samples);

        res.json({
            success: true,
            alpha: alphaDiversity,
            beta: betaDiversity,
        });

    } catch (error: any) {
        logger.error('Diversity calculation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Diversity calculation failed',
        });
    }
});

/**
 * POST /api/edna/rarefaction
 * Generate rarefaction curves
 */
router.post('/rarefaction', async (req: Request, res: Response) => {
    try {
        const { samples, steps = 20, iterations = 10 } = req.body;

        if (!samples || typeof samples !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Samples object required',
            });
        }

        const curves = Object.entries(samples).map(([sampleId, abundances]) =>
            diversityCalculator.generateRarefactionCurve(sampleId, abundances as any, steps, iterations)
        );

        res.json({
            success: true,
            curves,
        });

    } catch (error: any) {
        logger.error('Rarefaction error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Rarefaction failed',
        });
    }
});

/**
 * POST /api/edna/assign-taxonomy
 * Assign taxonomy to ASVs
 */
router.post('/assign-taxonomy', async (req: Request, res: Response) => {
    try {
        const { asvs, options = {} } = req.body;

        if (!asvs || !Array.isArray(asvs)) {
            return res.status(400).json({
                success: false,
                error: 'Array of ASVs required',
            });
        }

        const result = await taxonomicAssignment.assignTaxonomyBatch(asvs, options);

        res.json({
            success: true,
            ...result,
        });

    } catch (error: any) {
        logger.error('Taxonomy assignment error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Taxonomy assignment failed',
        });
    }
});

/**
 * POST /api/edna/check-contamination
 * Check for contamination in samples
 */
router.post('/check-contamination', async (req: Request, res: Response) => {
    try {
        const { sampleId, asvs, options = {} } = req.body;

        if (!sampleId || !asvs || !Array.isArray(asvs)) {
            return res.status(400).json({
                success: false,
                error: 'Sample ID and ASVs array required',
            });
        }

        const report = contaminationDetector.analyzeContamination(sampleId, asvs, undefined, options);

        res.json({
            success: true,
            report,
        });

    } catch (error: any) {
        logger.error('Contamination check error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Contamination check failed',
        });
    }
});

/**
 * POST /api/edna/analyze
 * Run full eDNA analysis pipeline
 */
router.post('/analyze', async (req: Request, res: Response) => {
    try {
        const { sequences, sampleId = 'sample_1', options = {} } = req.body;

        if (!sequences || !Array.isArray(sequences)) {
            return res.status(400).json({
                success: false,
                error: 'Array of sequences required',
            });
        }

        // 1. Quality filtering
        const reads = sequences.map((seq: any, i: number) => ({
            id: seq.id || `read_${i + 1}`,
            sequence: seq.sequence,
            quality: seq.quality,
        }));

        const filtered = qualityFilter.filterReads(reads, options.quality || {});

        // 2. ASV clustering
        const clustered = asvClustering.clusterSequences(filtered.passed, options.clustering || {});

        // 3. Taxonomy assignment
        const taxonomy = await taxonomicAssignment.assignTaxonomyBatch(clustered.asvs, options.taxonomy || {});

        // 4. Build abundance data for diversity
        const abundances: Record<string, number> = {};
        for (const asv of clustered.asvs) {
            const assignment = taxonomy.assignments.find(a => a.asvId === asv.id);
            const name = assignment?.species || assignment?.genus || asv.id;
            abundances[name] = (abundances[name] || 0) + asv.totalReads;
        }

        // 5. Calculate diversity
        const diversity = diversityCalculator.calculateAlphaDiversity(sampleId, abundances);

        // 6. Check contamination
        const contamination = contaminationDetector.analyzeContamination(
            sampleId,
            clustered.asvs,
            new Map(taxonomy.assignments.map(a => [a.asvId, a])),
            options.contamination || {}
        );

        res.json({
            success: true,
            sampleId,
            pipeline: {
                qualityFiltering: {
                    inputReads: reads.length,
                    passedReads: filtered.passed.length,
                    metrics: filtered.metrics,
                },
                clustering: {
                    totalASVs: clustered.totalASVs,
                    stats: clustered.stats,
                },
                taxonomy: {
                    assignedCount: taxonomy.assignedCount,
                    unassignedCount: taxonomy.unassignedCount,
                    averageConfidence: taxonomy.averageConfidence,
                    summary: taxonomy.taxonomicSummary,
                },
                diversity,
                contamination: {
                    score: contamination.contaminationScore,
                    isClean: contamination.isClean,
                    flaggedASVs: contamination.flaggedASVs,
                },
            },
            topSpecies: Object.entries(abundances)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, count]) => ({ name, count })),
        });

    } catch (error: any) {
        logger.error('Full analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Analysis failed',
        });
    }
});

/**
 * GET /api/edna/info
 * Get eDNA pipeline information
 */
router.get('/info', (req: Request, res: Response) => {
    res.json({
        success: true,
        pipeline: {
            name: 'CMLRE eDNA Analysis Pipeline',
            version: '1.0.0',
            stages: [
                { name: 'Quality Filtering', description: 'Phred score filtering, read trimming' },
                { name: 'ASV Clustering', description: 'Amplicon Sequence Variant identification' },
                { name: 'Taxonomy Assignment', description: 'Species identification with confidence' },
                { name: 'Diversity Analysis', description: 'Alpha/Beta diversity indices' },
                { name: 'Contamination Check', description: 'Detect potential contaminants' },
            ],
            diversityIndices: ['Shannon', 'Simpson', 'Chao1', 'Bray-Curtis', 'Jaccard'],
        },
    });
});

export default router;
