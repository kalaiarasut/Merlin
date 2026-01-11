/**
 * Performance API Routes
 * Job queue, cache, and system metrics
 */

import { Router, Request, Response } from 'express';
import * as perf from '../services/performance';

const router = Router();

// ==================== INFO ====================

router.get('/info', (_req: Request, res: Response) => {
    res.json({
        success: true,
        module: {
            name: 'Performance & Scalability',
            version: '1.0.0',
            features: ['job-queue', 'caching', 'metrics', 'monitoring'],
            jobTypes: ['analysis', 'export', 'import', 'validation', 'report', 'sync'],
        },
    });
});

// ==================== JOBS ====================

router.get('/jobs', (req: Request, res: Response) => {
    try {
        const filters = {
            status: req.query.status as any,
            type: req.query.type as any,
            createdBy: req.query.createdBy as string | undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        };
        const jobs = perf.listJobs(filters);
        res.json({ success: true, jobs, count: jobs.length });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/jobs/:id', (req: Request, res: Response) => {
    try {
        const job = perf.getJob(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }
        res.json({ success: true, job });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/jobs', (req: Request, res: Response) => {
    try {
        const job = perf.submitJob({
            type: req.body.type,
            name: req.body.name,
            description: req.body.description,
            priority: req.body.priority,
            createdBy: req.body.createdBy || 'system',
            metadata: req.body.metadata,
        });
        res.json({ success: true, job });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/jobs/:id/cancel', (req: Request, res: Response) => {
    try {
        const success = perf.cancelJob(req.params.id);
        if (!success) {
            return res.status(400).json({ success: false, error: 'Cannot cancel job' });
        }
        res.json({ success: true, message: 'Job cancelled' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/jobs/:id/retry', (req: Request, res: Response) => {
    try {
        const job = perf.retryJob(req.params.id);
        if (!job) {
            return res.status(400).json({ success: false, error: 'Cannot retry job' });
        }
        res.json({ success: true, job });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/jobs-stats', (_req: Request, res: Response) => {
    try {
        const stats = perf.getJobStats();
        res.json({ success: true, stats });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== CACHE ====================

router.get('/cache/stats', (_req: Request, res: Response) => {
    try {
        const stats = perf.getCacheStats();
        res.json({ success: true, stats });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/cache/:key', (req: Request, res: Response) => {
    try {
        const value = perf.cacheGet(req.params.key);
        if (value === null) {
            return res.status(404).json({ success: false, error: 'Cache miss' });
        }
        res.json({ success: true, value });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/cache', (req: Request, res: Response) => {
    try {
        perf.cacheSet(req.body.key, req.body.value, req.body.ttlSeconds);
        res.json({ success: true, message: 'Cached' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/cache/:key', (req: Request, res: Response) => {
    try {
        const deleted = perf.cacheDelete(req.params.key);
        res.json({ success: true, deleted });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/cache/clear', (_req: Request, res: Response) => {
    try {
        const cleared = perf.cacheClear();
        res.json({ success: true, clearedEntries: cleared });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== METRICS ====================

router.get('/metrics', (_req: Request, res: Response) => {
    try {
        const metrics = perf.getSystemMetrics();
        res.json({
            success: true,
            metrics: {
                ...metrics,
                memory: {
                    heapUsed: perf.formatBytes(metrics.memory.heapUsed),
                    heapTotal: perf.formatBytes(metrics.memory.heapTotal),
                    rss: perf.formatBytes(metrics.memory.rss),
                    external: perf.formatBytes(metrics.memory.external),
                },
                uptime: `${Math.floor(metrics.uptime / 60)} minutes`,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/health', (_req: Request, res: Response) => {
    try {
        const metrics = perf.getSystemMetrics();
        const jobStats = perf.getJobStats();

        const healthy =
            metrics.memory.heapUsed < metrics.memory.heapTotal * 0.9 &&
            metrics.activeJobs < 100 &&
            jobStats.successRate > 80;

        res.status(healthy ? 200 : 503).json({
            success: true,
            healthy,
            checks: {
                memory: metrics.memory.heapUsed < metrics.memory.heapTotal * 0.9 ? 'ok' : 'warning',
                jobQueue: metrics.activeJobs < 100 ? 'ok' : 'warning',
                successRate: jobStats.successRate > 80 ? 'ok' : 'warning',
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
