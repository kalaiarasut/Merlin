/**
 * Validation API Routes
 * Scientific validation workflows and certificates
 */

import { Router, Request, Response } from 'express';
import * as validation from '../services/validation';

const router = Router();

// ==================== INFO ====================

/**
 * GET /api/validation/info
 * Get validation module info
 */
router.get('/info', (_req: Request, res: Response) => {
    res.json({
        success: true,
        module: {
            name: 'Scientific Validation Framework',
            version: '1.0.0',
            features: ['workflow', 'auto-thresholds', 'certificates', 'human-in-loop'],
            endpoints: {
                workflow: ['/pending', '/submit', '/review', '/assign'],
                thresholds: ['/thresholds'],
                certificates: ['/certificates', '/certificates/:id', '/verify'],
            },
        },
        thresholds: validation.getThresholds(),
    });
});

// ==================== VALIDATION WORKFLOW ====================

/**
 * GET /api/validation/pending
 * Get items pending validation
 */
router.get('/pending', (req: Request, res: Response) => {
    try {
        const filters = {
            type: req.query.type as any,
            priority: req.query.priority as string | undefined,
            assignedTo: req.query.assignedTo as string | undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        };

        const items = validation.getPendingItems(filters);
        res.json({ success: true, items, count: items.length });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/validation/submit
 * Submit an item for validation
 */
router.post('/submit', (req: Request, res: Response) => {
    try {
        const item = validation.submitForValidation({
            type: req.body.type,
            entityId: req.body.entityId,
            entityName: req.body.entityName,
            createdBy: req.body.createdBy || 'system',
            createdByName: req.body.createdByName || 'System',
            isAIGenerated: req.body.isAIGenerated ?? false,
            aiConfidence: req.body.aiConfidence,
            aiModel: req.body.aiModel,
            priority: req.body.priority,
            data: req.body.data,
            tags: req.body.tags,
        });

        res.json({
            success: true,
            item,
            message: item.status === 'pending'
                ? 'Submitted for review'
                : item.status === 'approved'
                    ? 'Auto-approved based on confidence threshold'
                    : 'Auto-rejected based on confidence threshold',
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/validation/item/:id
 * Get validation item by ID
 */
router.get('/item/:id', (req: Request, res: Response) => {
    try {
        const item = validation.getValidationItem(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }
        res.json({ success: true, item });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/validation/assign
 * Assign item to a reviewer
 */
router.post('/assign', (req: Request, res: Response) => {
    try {
        const success = validation.assignToReviewer(
            req.body.itemId,
            req.body.reviewerId,
            req.body.reviewerName
        );

        if (!success) {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }
        res.json({ success: true, message: 'Item assigned for review' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/validation/review
 * Submit a review decision
 */
router.post('/review', (req: Request, res: Response) => {
    try {
        const item = validation.submitReview({
            itemId: req.body.itemId,
            reviewerId: req.body.reviewerId,
            reviewerName: req.body.reviewerName,
            reviewerRole: req.body.reviewerRole || 'reviewer',
            decision: req.body.decision,
            comments: req.body.comments,
            suggestedChanges: req.body.suggestedChanges,
            confidence: req.body.confidence ?? 1.0,
        });

        if (!item) {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }

        // If approved, generate certificate
        let certificate = null;
        if (req.body.decision === 'approve' && req.body.generateCertificate) {
            certificate = validation.generateCertificate({
                itemId: item.id,
                itemType: item.type,
                entityId: item.entityId,
                entityName: item.entityName,
                aiConfidence: item.aiConfidence,
                humanReviewers: item.reviews.map(r => ({
                    name: r.reviewerName,
                    role: r.reviewerRole,
                    decision: r.decision,
                    date: r.reviewedAt,
                })),
            });
        }

        res.json({ success: true, item, certificate });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/validation/entity/:entityId
 * Get validation history for an entity
 */
router.get('/entity/:entityId', (req: Request, res: Response) => {
    try {
        const history = validation.getEntityValidationHistory(req.params.entityId);
        res.json({ success: true, history });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/validation/stats
 * Get validation statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
    try {
        const workflowStats = validation.getValidationStats();
        const certificateStats = validation.getCertificateStats();

        res.json({
            success: true,
            stats: {
                workflow: workflowStats,
                certificates: certificateStats,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== THRESHOLDS ====================

/**
 * GET /api/validation/thresholds
 * Get current thresholds
 */
router.get('/thresholds', (_req: Request, res: Response) => {
    res.json({ success: true, thresholds: validation.getThresholds() });
});

/**
 * PUT /api/validation/thresholds
 * Update thresholds
 */
router.put('/thresholds', (req: Request, res: Response) => {
    try {
        const updated = validation.setThresholds(req.body);
        res.json({ success: true, thresholds: updated });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CERTIFICATES ====================

/**
 * GET /api/validation/certificates
 * List certificates
 */
router.get('/certificates', (req: Request, res: Response) => {
    try {
        const filters = {
            institution: req.query.institution as string | undefined,
            validationType: req.query.validationType as string | undefined,
            onlyValid: req.query.onlyValid === 'true',
            limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        };

        const certificates = validation.listCertificates(filters);
        res.json({ success: true, certificates, count: certificates.length });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/validation/certificates/:id
 * Get certificate by ID
 */
router.get('/certificates/:id', (req: Request, res: Response) => {
    try {
        const certificate = validation.getCertificate(req.params.id);
        if (!certificate) {
            return res.status(404).json({ success: false, error: 'Certificate not found' });
        }
        res.json({ success: true, certificate });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/validation/certificates/:id/html
 * Get printable certificate HTML
 */
router.get('/certificates/:id/html', (req: Request, res: Response) => {
    try {
        const html = validation.generateCertificateHTML(req.params.id);
        if (!html) {
            return res.status(404).json({ success: false, error: 'Certificate not found' });
        }
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/validation/verify
 * Verify a certificate
 */
router.post('/verify', (req: Request, res: Response) => {
    try {
        let result;

        if (req.body.verificationCode) {
            const cert = validation.getCertificateByCode(req.body.verificationCode);
            if (cert) {
                result = validation.verifyCertificate(cert.id);
            } else {
                result = { valid: false, certificate: null, issues: ['Certificate not found'] };
            }
        } else if (req.body.certificateId) {
            result = validation.verifyCertificate(req.body.certificateId);
        } else {
            return res.status(400).json({ success: false, error: 'Provide certificateId or verificationCode' });
        }

        res.json({ success: true, ...result });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/validation/certificates
 * Generate a certificate manually
 */
router.post('/certificates', (req: Request, res: Response) => {
    try {
        const certificate = validation.generateCertificate({
            itemId: req.body.itemId,
            itemType: req.body.itemType,
            entityId: req.body.entityId,
            entityName: req.body.entityName,
            aiConfidence: req.body.aiConfidence,
            humanReviewers: req.body.humanReviewers || [],
            institution: req.body.institution,
            methodology: req.body.methodology,
            validityDays: req.body.validityDays,
        });

        res.json({ success: true, certificate });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
