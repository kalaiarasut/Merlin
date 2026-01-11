/**
 * Audit API Routes
 * Activity logs, versioning, and snapshots
 */

import { Router, Request, Response } from 'express';
import * as audit from '../services/audit';

const router = Router();

// ==================== ACTIVITY LOGS ====================

/**
 * GET /api/audit/info
 * Get audit module information
 */
router.get('/info', (_req: Request, res: Response) => {
    res.json({
        success: true,
        module: {
            name: 'Audit & Provenance',
            version: '1.0.0',
            features: ['activity-logging', 'data-versioning', 'snapshots', 'lineage'],
            endpoints: {
                activities: ['/activities', '/activities/:entityId', '/log', '/stats'],
                versions: ['/versions', '/versions/:datasetId', '/versions/compare'],
                snapshots: ['/snapshots', '/snapshots/:id', '/snapshots/:id/verify'],
            },
        },
    });
});

/**
 * GET /api/audit/activities
 * Query activity logs
 */
router.get('/activities', (req: Request, res: Response) => {
    try {
        const filters = {
            userId: req.query.userId as string | undefined,
            action: req.query.action as any,
            entityType: req.query.entityType as any,
            entityId: req.query.entityId as string | undefined,
            startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
            endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
            success: req.query.success ? req.query.success === 'true' : undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
            offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        };

        const result = audit.queryActivities(filters);
        res.json({ success: true, ...result });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/audit/activities/:entityId
 * Get entity activity history
 */
router.get('/activities/:entityType/:entityId', (req: Request, res: Response) => {
    try {
        const history = audit.getEntityHistory(
            req.params.entityType as any,
            req.params.entityId
        );
        res.json({ success: true, history });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/audit/log
 * Log a new activity
 */
router.post('/log', (req: Request, res: Response) => {
    try {
        const log = audit.logActivity({
            userId: req.body.userId || 'system',
            userName: req.body.userName || 'System',
            userRole: req.body.userRole || 'system',
            action: req.body.action,
            entityType: req.body.entityType,
            entityId: req.body.entityId,
            entityName: req.body.entityName,
            details: req.body.details,
            req,
            success: req.body.success ?? true,
            errorMessage: req.body.errorMessage,
        });
        res.json({ success: true, log });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/audit/stats
 * Get activity statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
    try {
        const activityStats = audit.getActivityStats();
        const versioningStats = audit.getVersioningStats();
        const snapshotStats = audit.getSnapshotStats();

        res.json({
            success: true,
            stats: {
                activities: activityStats,
                versioning: versioningStats,
                snapshots: snapshotStats,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/audit/user/:userId
 * Get user activity summary
 */
router.get('/user/:userId', (req: Request, res: Response) => {
    try {
        const summary = audit.getUserActivitySummary(req.params.userId);
        res.json({ success: true, summary });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== DATA VERSIONING ====================

/**
 * GET /api/audit/versions
 * List all versioned datasets
 */
router.get('/versions', (_req: Request, res: Response) => {
    try {
        const datasets = audit.listVersionedDatasets();
        res.json({ success: true, datasets });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/audit/versions/:datasetId
 * Get version history for a dataset
 */
router.get('/versions/:datasetId', (req: Request, res: Response) => {
    try {
        const history = audit.getVersionHistory(req.params.datasetId);
        if (!history) {
            return res.status(404).json({ success: false, error: 'Dataset not found' });
        }
        res.json({ success: true, history });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/audit/versions
 * Create initial version for a new dataset
 */
router.post('/versions', (req: Request, res: Response) => {
    try {
        const version = audit.createInitialVersion({
            datasetId: req.body.datasetId,
            createdBy: req.body.createdBy || 'system',
            createdByName: req.body.createdByName || 'System',
            description: req.body.description || 'Initial version',
            recordCount: req.body.recordCount || 0,
            sizeBytes: req.body.sizeBytes || 0,
            data: req.body.data || {},
            metadata: req.body.metadata,
        });
        res.json({ success: true, version });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/audit/versions/:datasetId
 * Create new version for existing dataset
 */
router.post('/versions/:datasetId', (req: Request, res: Response) => {
    try {
        const version = audit.createVersion({
            datasetId: req.params.datasetId,
            createdBy: req.body.createdBy || 'system',
            createdByName: req.body.createdByName || 'System',
            changeType: req.body.changeType || 'update',
            description: req.body.description || 'Updated',
            recordCount: req.body.recordCount || 0,
            sizeBytes: req.body.sizeBytes || 0,
            data: req.body.data || {},
            changes: req.body.changes || { added: 0, modified: 0, deleted: 0 },
            metadata: req.body.metadata,
        });

        if (!version) {
            return res.status(404).json({ success: false, error: 'Dataset not found' });
        }
        res.json({ success: true, version });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/audit/versions/:datasetId/restore
 * Restore a previous version
 */
router.post('/versions/:datasetId/restore', (req: Request, res: Response) => {
    try {
        const version = audit.restoreVersion({
            datasetId: req.params.datasetId,
            targetVersion: req.body.targetVersion,
            restoredBy: req.body.restoredBy || 'system',
            restoredByName: req.body.restoredByName || 'System',
        });

        if (!version) {
            return res.status(404).json({ success: false, error: 'Version not found' });
        }
        res.json({ success: true, version });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/audit/versions/:datasetId/compare
 * Compare two versions
 */
router.get('/versions/:datasetId/compare', (req: Request, res: Response) => {
    try {
        const v1 = parseInt(req.query.v1 as string);
        const v2 = parseInt(req.query.v2 as string);

        const comparison = audit.compareVersions(req.params.datasetId, v1, v2);
        res.json({ success: true, comparison });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== SNAPSHOTS ====================

/**
 * GET /api/audit/snapshots
 * List analysis snapshots
 */
router.get('/snapshots', (req: Request, res: Response) => {
    try {
        const filters = {
            createdBy: req.query.createdBy as string | undefined,
            analysisType: req.query.analysisType as string | undefined,
            status: req.query.status as string | undefined,
            tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        };

        const snapshots = audit.listSnapshots(filters);
        res.json({ success: true, snapshots });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/audit/snapshots/:id
 * Get a specific snapshot
 */
router.get('/snapshots/:id', (req: Request, res: Response) => {
    try {
        const snapshot = audit.getSnapshot(req.params.id);
        if (!snapshot) {
            return res.status(404).json({ success: false, error: 'Snapshot not found' });
        }
        res.json({ success: true, snapshot });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/audit/snapshots
 * Create a new snapshot
 */
router.post('/snapshots', (req: Request, res: Response) => {
    try {
        const snapshot = audit.createSnapshot({
            name: req.body.name,
            description: req.body.description || '',
            createdBy: req.body.createdBy || 'system',
            createdByName: req.body.createdByName || 'System',
            analysisType: req.body.analysisType || 'custom',
            inputDatasets: req.body.inputDatasets || [],
            parameters: req.body.parameters || {},
            resultsSummary: req.body.resultsSummary || {},
            tags: req.body.tags,
        });
        res.json({ success: true, snapshot });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/audit/snapshots/:id/archive
 * Archive a snapshot
 */
router.post('/snapshots/:id/archive', (req: Request, res: Response) => {
    try {
        const success = audit.archiveSnapshot(req.params.id);
        if (!success) {
            return res.status(404).json({ success: false, error: 'Snapshot not found' });
        }
        res.json({ success: true, message: 'Snapshot archived' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/audit/snapshots/:id/clone
 * Clone a snapshot
 */
router.post('/snapshots/:id/clone', (req: Request, res: Response) => {
    try {
        const cloned = audit.cloneSnapshot(req.params.id, {
            name: req.body.name,
            createdBy: req.body.createdBy || 'system',
            createdByName: req.body.createdByName || 'System',
            parameterOverrides: req.body.parameterOverrides,
        });

        if (!cloned) {
            return res.status(404).json({ success: false, error: 'Snapshot not found' });
        }
        res.json({ success: true, snapshot: cloned });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/audit/snapshots/:id/export
 * Export snapshot as JSON
 */
router.get('/snapshots/:id/export', (req: Request, res: Response) => {
    try {
        const exported = audit.exportSnapshot(req.params.id);
        if (!exported) {
            return res.status(404).json({ success: false, error: 'Snapshot not found' });
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=snapshot-${req.params.id}.json`);
        res.send(exported);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
