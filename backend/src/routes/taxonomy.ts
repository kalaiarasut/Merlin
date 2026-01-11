/**
 * Taxonomy API Routes
 * 
 * REST API endpoints for taxonomic authority resolution.
 * Provides name resolution, validation, and search functionality
 * using WoRMS and ITIS databases.
 */

import { Router, Request, Response } from 'express';
import { taxonomyResolver } from '../services/taxonomy';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/taxonomy/resolve
 * Resolve a single scientific name to its authoritative taxonomy
 */
router.post('/resolve', async (req: Request, res: Response) => {
    try {
        const { name } = req.body;

        if (!name || typeof name !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Scientific name is required',
            });
        }

        const result = await taxonomyResolver.resolveTaxon(name);

        res.json({
            success: result.success,
            result,
        });

    } catch (error: any) {
        logger.error('Taxonomy resolution error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Resolution failed',
        });
    }
});

/**
 * POST /api/taxonomy/resolve-batch
 * Resolve multiple scientific names
 */
router.post('/resolve-batch', async (req: Request, res: Response) => {
    try {
        const { names } = req.body;

        if (!names || !Array.isArray(names)) {
            return res.status(400).json({
                success: false,
                error: 'Array of names is required',
            });
        }

        if (names.length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 100 names per batch',
            });
        }

        const result = await taxonomyResolver.batchResolveTaxons(names);

        res.json({
            success: true,
            ...result,
        });

    } catch (error: any) {
        logger.error('Batch taxonomy resolution error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Batch resolution failed',
        });
    }
});

/**
 * POST /api/taxonomy/validate
 * Validate a scientific name with detailed feedback
 */
router.post('/validate', async (req: Request, res: Response) => {
    try {
        const { name } = req.body;

        if (!name || typeof name !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Scientific name is required',
            });
        }

        const result = await taxonomyResolver.validateTaxon(name);

        res.json({
            success: true,
            validation: result,
        });

    } catch (error: any) {
        logger.error('Taxonomy validation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Validation failed',
        });
    }
});

/**
 * GET /api/taxonomy/search
 * Search for taxa by name (autocomplete)
 */
router.get('/search', async (req: Request, res: Response) => {
    try {
        const query = req.query.q as string;
        const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

        if (!query || query.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Query must be at least 2 characters',
            });
        }

        const result = await taxonomyResolver.searchTaxa(query, limit);

        res.json({
            success: true,
            ...result,
        });

    } catch (error: any) {
        logger.error('Taxonomy search error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Search failed',
        });
    }
});

/**
 * GET /api/taxonomy/stats
 * Get taxonomy service statistics
 */
router.get('/stats', (req: Request, res: Response) => {
    try {
        const stats = taxonomyResolver.getStats();

        res.json({
            success: true,
            stats,
            sources: {
                primary: {
                    name: 'WoRMS',
                    description: 'World Register of Marine Species',
                    url: 'https://www.marinespecies.org/',
                },
                fallback: {
                    name: 'ITIS',
                    description: 'Integrated Taxonomic Information System',
                    url: 'https://www.itis.gov/',
                },
            },
        });

    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get stats',
        });
    }
});

/**
 * POST /api/taxonomy/clear-cache
 * Clear taxonomy caches (admin only)
 */
router.post('/clear-cache', (req: Request, res: Response) => {
    try {
        taxonomyResolver.clearAllCaches();

        res.json({
            success: true,
            message: 'All taxonomy caches cleared',
        });

    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to clear cache',
        });
    }
});

export default router;
