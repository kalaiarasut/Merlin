/**
 * Reporting API Routes
 * 
 * REST API endpoints for policy-grade report generation.
 */

import { Router, Request, Response } from 'express';
import {
    reportGenerator,
    reproducibility,
    provenanceTracker
} from '../services/reporting';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/reporting/generate
 * Generate a policy-grade report
 */
router.post('/generate', async (req: Request, res: Response) => {
    try {
        const { data, options = {} } = req.body;

        if (!data || !data.title || !data.type) {
            return res.status(400).json({
                success: false,
                error: 'Report data with title and type required',
            });
        }

        const report = reportGenerator.generateReport(data, options);

        // Track provenance
        provenanceTracker.recordEvent(
            report.id,
            'export',
            'api',
            `Generated ${data.type} report`
        );

        res.json({
            success: true,
            report: {
                id: report.id,
                title: report.title,
                type: report.type,
                generatedAt: report.generatedAt,
                format: report.format,
                executiveSummary: report.executiveSummary,
                sections: report.sections.map(s => ({ id: s.id, title: s.title })),
                dataProvenance: report.dataProvenance,
                citationInfo: report.citationInfo,
            },
            content: report.content,
        });

    } catch (error: any) {
        logger.error('Report generation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Report generation failed',
        });
    }
});

/**
 * GET /api/reporting/templates
 * Get available report templates
 */
router.get('/templates', (req: Request, res: Response) => {
    const templates = reportGenerator.getAvailableTemplates();

    res.json({
        success: true,
        templates,
    });
});

/**
 * POST /api/reporting/verify
 * Verify report reproducibility
 */
router.post('/verify', async (req: Request, res: Response) => {
    try {
        const { data, expectedHash, parameters } = req.body;

        if (!data || !expectedHash) {
            return res.status(400).json({
                success: false,
                error: 'Data and expected hash required',
            });
        }

        const result = reproducibility.verifyReproducibility(data, expectedHash, parameters);

        res.json({
            success: true,
            verification: result,
            message: result.match
                ? 'Hash verified - data is reproducible'
                : 'Hash mismatch - data may have been modified',
        });

    } catch (error: any) {
        logger.error('Verification error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Verification failed',
        });
    }
});

/**
 * POST /api/reporting/hash
 * Calculate reproducibility hash
 */
router.post('/hash', async (req: Request, res: Response) => {
    try {
        const { data } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Data required',
            });
        }

        const hash = reproducibility.calculateReproducibilityHash(data);
        const record = reproducibility.createReproducibilityRecord('temp', data);

        res.json({
            success: true,
            hash,
            record,
        });

    } catch (error: any) {
        logger.error('Hash calculation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Hash calculation failed',
        });
    }
});

/**
 * POST /api/reporting/provenance/init
 * Initialize provenance tracking for a dataset
 */
router.post('/provenance/init', async (req: Request, res: Response) => {
    try {
        const { datasetId, name, sources } = req.body;

        if (!datasetId || !name) {
            return res.status(400).json({
                success: false,
                error: 'Dataset ID and name required',
            });
        }

        const lineage = provenanceTracker.initializeProvenance(datasetId, name, sources || []);

        res.json({
            success: true,
            lineage,
        });

    } catch (error: any) {
        logger.error('Provenance init error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Provenance initialization failed',
        });
    }
});

/**
 * GET /api/reporting/provenance/:datasetId
 * Get provenance for a dataset
 */
router.get('/provenance/:datasetId', (req: Request, res: Response) => {
    const { datasetId } = req.params;

    const lineage = provenanceTracker.getProvenance(datasetId);

    if (!lineage) {
        return res.status(404).json({
            success: false,
            error: 'Dataset not found',
        });
    }

    res.json({
        success: true,
        lineage,
    });
});

/**
 * POST /api/reporting/provenance/event
 * Record a provenance event
 */
router.post('/provenance/event', async (req: Request, res: Response) => {
    try {
        const { datasetId, eventType, actor, action, metadata } = req.body;

        if (!datasetId || !eventType || !action) {
            return res.status(400).json({
                success: false,
                error: 'Dataset ID, event type, and action required',
            });
        }

        const event = provenanceTracker.recordEvent(
            datasetId,
            eventType,
            actor || 'api',
            action,
            metadata
        );

        res.json({
            success: true,
            event,
        });

    } catch (error: any) {
        logger.error('Event recording error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Event recording failed',
        });
    }
});

/**
 * POST /api/reporting/citation
 * Create data citation
 */
router.post('/citation', async (req: Request, res: Response) => {
    try {
        const { datasetId, authors, year } = req.body;

        if (!datasetId || !authors || !year) {
            return res.status(400).json({
                success: false,
                error: 'Dataset ID, authors array, and year required',
            });
        }

        const citation = provenanceTracker.createDataCitation(datasetId, authors, year);

        res.json({
            success: true,
            ...citation,
        });

    } catch (error: any) {
        logger.error('Citation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Citation generation failed',
        });
    }
});

/**
 * GET /api/reporting/version
 * Get version info for reproducibility
 */
router.get('/version', (req: Request, res: Response) => {
    const versionInfo = reproducibility.getVersionInfo();

    res.json({
        success: true,
        version: versionInfo,
    });
});

/**
 * GET /api/reporting/info
 * Get reporting module information
 */
router.get('/info', (req: Request, res: Response) => {
    res.json({
        success: true,
        module: {
            name: 'CMLRE Policy-Grade Reporting Engine',
            version: '1.0.0',
            capabilities: [
                { name: 'Report Generation', description: 'MoES-compliant policy reports with executive summaries' },
                { name: 'Templates', description: 'Multiple formats: Standard, Brief, Scientific, Executive' },
                { name: 'Reproducibility', description: 'SHA-256 hashing ensures same data → same result' },
                { name: 'Provenance', description: 'Full data lineage and audit trail tracking' },
                { name: 'Citations', description: 'Auto-generated data citations with BibTeX support' },
            ],
            formats: ['html', 'pdf', 'docx', 'json'],
            templates: reportGenerator.getAvailableTemplates().map(t => t.id),
        },
    });
});

export default router;
