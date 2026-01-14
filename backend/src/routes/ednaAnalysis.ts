/**
 * eDNA Analysis API Routes
 * 
 * REST API endpoints for eDNA analysis pipeline.
 * Includes publication-ready BLAST integration with scientific safeguards.
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
import axios from 'axios';

const router = Router();

// AI Service URL for BLAST processing
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// BLAST filter thresholds (match Python client)
const BLAST_THRESHOLDS = {
    MIN_PIDENT: 85,
    MIN_QUERY_COVERAGE: 70,
    MIN_ALIGNMENT_LENGTH: 100,
};

/**
 * POST /api/edna/blast
 * Run BLAST species identification with scientific safeguards
 * 
 * Features:
 * - Post-hoc filtering (pident, qcovs, alignment length)
 * - Strand consistency checking
 * - Database versioning
 * - Full hit metadata for provenance
 */
router.post('/blast', async (req: Request, res: Response) => {
    try {
        const {
            sequences,
            database = 'nt',
            use_cache = true,
            options = {}
        } = req.body;

        if (!sequences || !Array.isArray(sequences)) {
            return res.status(400).json({
                success: false,
                error: 'Array of sequences required. Format: [{id: string, sequence: string}]',
            });
        }

        // Validate sequences
        for (const seq of sequences) {
            if (!seq.sequence || typeof seq.sequence !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'Each sequence must have a sequence string',
                });
            }
            if (seq.sequence.length < 50) {
                return res.status(400).json({
                    success: false,
                    error: 'Sequences must be at least 50bp for reliable BLAST',
                });
            }
        }

        // Call AI service for BLAST
        const response = await axios.post(`${AI_SERVICE_URL}/edna/blast`, {
            sequences,
            database,
            use_cache,
            options: {
                min_pident: options.min_pident || BLAST_THRESHOLDS.MIN_PIDENT,
                min_qcovs: options.min_qcovs || BLAST_THRESHOLDS.MIN_QUERY_COVERAGE,
                min_length: options.min_length || BLAST_THRESHOLDS.MIN_ALIGNMENT_LENGTH,
            }
        }, {
            timeout: 300000, // 5 minute timeout for BLAST
        });

        res.json({
            success: true,
            ...response.data,
            thresholds: BLAST_THRESHOLDS,
        });

    } catch (error: any) {
        logger.error('BLAST error:', error);

        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({
                success: false,
                error: 'BLAST service unavailable. Please try again later.',
            });
        }

        res.status(500).json({
            success: false,
            error: error.response?.data?.error || error.message || 'BLAST search failed',
        });
    }
});

/**
 * GET /api/edna/blast/thresholds
 * Get current BLAST filter thresholds
 */
router.get('/blast/thresholds', (req: Request, res: Response) => {
    res.json({
        success: true,
        thresholds: BLAST_THRESHOLDS,
        description: {
            MIN_PIDENT: 'Minimum percent identity (applied post-BLAST)',
            MIN_QUERY_COVERAGE: 'Minimum query coverage percentage',
            MIN_ALIGNMENT_LENGTH: 'Minimum alignment length in bp',
        },
        scientific_note: 'perc_identity is NOT a BLAST search parameter; it is applied post-hoc for scientific reproducibility.',
    });
});

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
