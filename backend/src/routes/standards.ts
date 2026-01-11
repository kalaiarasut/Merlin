/**
 * Standards Validation API Routes
 * 
 * REST API endpoints for validating datasets against data standards.
 */

import { Router, Request, Response } from 'express';
import {
    validateAgainstStandard,
    validateAllStandards,
    generateComplianceReport,
    shouldRejectUpload,
    getComplianceGrade,
    StandardType,
} from '../services/standards';

const router = Router();

/**
 * POST /api/standards/validate
 * Validate data against a specific standard
 */
router.post('/validate', async (req: Request, res: Response) => {
    try {
        const { data, standard, options } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Data is required',
            });
        }

        if (!standard) {
            return res.status(400).json({
                success: false,
                error: 'Standard type is required (dwc, obis, mixs, iso19115, cf)',
            });
        }

        const validStandards: StandardType[] = ['dwc', 'obis', 'mixs', 'iso19115', 'cf'];
        if (!validStandards.includes(standard)) {
            return res.status(400).json({
                success: false,
                error: `Invalid standard. Must be one of: ${validStandards.join(', ')}`,
            });
        }

        const result = await validateAgainstStandard(standard, data, options);

        return res.json({
            success: true,
            result,
            grade: getComplianceGrade(result.score),
        });
    } catch (error) {
        console.error('Validation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Validation failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/standards/validate-all
 * Validate data against all applicable standards
 */
router.post('/validate-all', async (req: Request, res: Response) => {
    try {
        const { data, metadata, cfMetadata } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Data is required',
            });
        }

        const results = await validateAllStandards(data, metadata, cfMetadata);

        return res.json({
            success: true,
            results,
            summary: {
                totalStandards: results.length,
                passed: results.filter(r => r.valid).length,
                failed: results.filter(r => !r.valid).length,
            },
        });
    } catch (error) {
        console.error('Validation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Validation failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/standards/report/:datasetId
 * Generate full compliance report for a dataset
 */
router.post('/report/:datasetId', async (req: Request, res: Response) => {
    try {
        const { datasetId } = req.params;
        const { data, metadata, cfMetadata } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Data is required',
            });
        }

        const report = await generateComplianceReport(datasetId, data, metadata, cfMetadata);
        const rejection = shouldRejectUpload(report);

        return res.json({
            success: true,
            report,
            grade: getComplianceGrade(report.overallScore),
            rejection,
        });
    } catch (error) {
        console.error('Report generation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Report generation failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/standards/score/:datasetId
 * Get compliance score for a dataset (cached or pre-computed)
 */
router.get('/score/:datasetId', async (req: Request, res: Response) => {
    try {
        const { datasetId } = req.params;

        // TODO: Retrieve pre-computed score from database
        // For now, return a placeholder response
        return res.json({
            success: true,
            datasetId,
            message: 'Use POST /api/standards/report/:datasetId to generate a new report',
            note: 'Score caching will be implemented with database integration',
        });
    } catch (error) {
        console.error('Score retrieval error:', error);
        return res.status(500).json({
            success: false,
            error: 'Score retrieval failed',
        });
    }
});

/**
 * GET /api/standards/info
 * Get information about supported standards
 */
router.get('/info', async (_req: Request, res: Response) => {
    try {
        const standards = {
            dwc: {
                name: 'Darwin Core',
                version: '1.6',
                description: 'Biodiversity occurrence data standard',
                requiredFor: ['GBIF submission', 'OBIS', 'iDigBio'],
                reference: 'https://dwc.tdwg.org/terms/',
            },
            obis: {
                name: 'OBIS Schema',
                version: '2.0',
                description: 'Ocean Biodiversity Information System schema',
                requiredFor: ['OBIS submission', 'Marine biodiversity portals'],
                reference: 'https://obis.org/manual/',
            },
            mixs: {
                name: 'MIxS',
                version: '6.0',
                description: 'Minimum Information about any (x) Sequence',
                requiredFor: ['eDNA data', 'INSDC submission', 'ENA'],
                reference: 'https://genomicsstandardsconsortium.github.io/mixs/',
            },
            iso19115: {
                name: 'ISO 19115',
                version: '2014',
                description: 'Geographic information metadata standard',
                requiredFor: ['National SDI', 'INSPIRE', 'CSW catalogs'],
                reference: 'https://www.iso.org/standard/53798.html',
            },
            cf: {
                name: 'CF Conventions',
                version: '1.8',
                description: 'Climate and Forecast metadata conventions for NetCDF',
                requiredFor: ['NetCDF files', 'ERDDAP', 'THREDDS'],
                reference: 'http://cfconventions.org/',
            },
        };

        return res.json({
            success: true,
            standards,
            supportedFormats: ['JSON', 'CSV', 'NetCDF'],
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve standards info',
        });
    }
});

/**
 * POST /api/standards/check-upload
 * Pre-upload validation check
 */
router.post('/check-upload', async (req: Request, res: Response) => {
    try {
        const { data, metadata, threshold = 50 } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Data is required for upload check',
            });
        }

        const report = await generateComplianceReport('upload-check', data, metadata);
        const rejection = shouldRejectUpload(report, threshold);

        return res.json({
            success: true,
            canUpload: !rejection.reject,
            score: report.overallScore,
            grade: getComplianceGrade(report.overallScore),
            rejection,
            criticalErrors: report.standardResults.flatMap(r =>
                r.errors.filter(e => e.code.includes('REQUIRED'))
            ).slice(0, 10),
            recommendations: report.recommendations,
        });
    } catch (error) {
        console.error('Upload check error:', error);
        return res.status(500).json({
            success: false,
            error: 'Upload check failed',
        });
    }
});

export default router;
