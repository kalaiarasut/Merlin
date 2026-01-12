import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Species } from '../models/Species';
import { CatchRecord, LengthRecord } from '../models/FisheriesData';
import path from 'path';
import fs from 'fs';

const router = express.Router();

/**
 * @swagger
 * /api/curation/queue:
 *   get:
 *     summary: Get the list of items needing scientific validation
 *     tags: [Curation]
 */
router.get('/queue', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        // Fetch pending from multiple sources
        const speciesPending = await Species.find({
            'validationStatus.status': { $in: ['pending', 'under-review'] }
        }).limit(50);

        const catchesPending = await CatchRecord.find({
            'validationStatus.status': { $in: ['pending', 'under-review'] }
        }).limit(50);

        // Combine queues
        const queue: any[] = [
            ...speciesPending.map(s => ({
                id: s._id,
                entityType: 'species',
                title: s.scientificName,
                subtitle: s.commonName || s.taxonomicRank,
                confidence: s.aiMetadata?.confidence,
                status: s.validationStatus?.status || 'pending',
                createdAt: (s as any).createdAt,
                jobId: s.jobId
            })),
            ...catchesPending.map(c => ({
                id: c._id,
                entityType: 'fisheries-catch',
                title: c.species,
                subtitle: `Catch: ${c.catch}kg on ${c.date}`,
                confidence: 1.0, // Manual/Historical usually 100% until reviewed
                status: c.validationStatus?.status || 'pending',
                createdAt: (c as any).createdAt,
                datasetId: c.datasetId
            }))
        ];

        // Scientific Priority Sort: 
        // 1. 'under-review' (disputed) first
        // 2. Lowest confidence first
        // 3. Oldest pending first
        // 4. createdAt ASC tie-breaker
        queue.sort((a, b) => {
            // Under-review priority
            if (a.status === 'under-review' && b.status !== 'under-review') return -1;
            if (a.status !== 'under-review' && b.status === 'under-review') return 1;

            // Confidence priority
            if ((a.confidence ?? 1) !== (b.confidence ?? 1)) {
                return (a.confidence ?? 1) - (b.confidence ?? 1);
            }

            // Age priority
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateA - dateB;
        });

        res.json(queue);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/curation/detail/{entityType}/{id}:
 *   get:
 *     summary: Get full details for review
 */
router.get('/detail/:entityType/:id', authenticate, async (req, res, next) => {
    const { entityType, id } = req.params;
    try {
        let Model: any;
        if (entityType === 'species') Model = Species;
        else if (entityType === 'fisheries-catch') Model = CatchRecord;
        else if (entityType === 'fisheries-length') Model = LengthRecord;
        else return res.status(400).json({ error: 'Invalid entity type' });

        const record = await Model.findById(id);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        res.json(record);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/curation/{entityType}/{id}/{action}:
 *   post:
 *     summary: Apply validation action (approve, reject, flag)
 */
router.post('/:entityType/:id/:action', authenticate, async (req: AuthRequest, res: Response, next) => {
    const { entityType, id, action } = req.params;
    const { comment, scope, snapshot } = req.body;
    const userId = req.user.id;
    const userName = req.user.name || req.user.email || 'Expert Curator';

    try {
        let Model: any;
        if (entityType === 'species') Model = Species;
        else if (entityType === 'fisheries-catch') Model = CatchRecord;
        else if (entityType === 'fisheries-length') Model = LengthRecord;
        else return res.status(400).json({ error: 'Invalid entity type' });

        const record = await Model.findById(id);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        // Idempotency: 409 Conflict if already expert-validated
        if (action === 'approve' && record.validationStatus?.status === 'expert-validated') {
            return res.status(409).json({ error: 'Record is already expert-validated' });
        }

        const newStatus = action === 'approve' ? 'expert-validated' :
            action === 'reject' ? 'rejected' :
                action === 'flag' ? 'under-review' : 'pending';

        // Prepare History Entry (Immutable Append)
        const historyEntry = {
            action: action === 'flag' ? 'flag' : action as any,
            userId,
            userName,
            timestamp: new Date(),
            comment,
            snapshot: {
                fieldsValidated: snapshot?.fieldsValidated || [scope || 'full-record'],
                previousValues: snapshot?.previousValues || {}
            }
        };

        const update: any = {
            $set: {
                'validationStatus.status': newStatus,
                'validationStatus.scope': scope || record.validationStatus?.scope || 'full-record',
                'validationStatus.validatedBy': userId,
                'validationStatus.validatedByName': userName,
                'validationStatus.validatedAt': new Date(),
            },
            $push: {
                'validationStatus.history': historyEntry
            }
        };

        // Add to comments array if provided
        if (comment) {
            update.$push['validationStatus.comments'] = comment;
        }

        const updatedRecord = await Model.findByIdAndUpdate(id, update, { new: true });

        res.json({
            message: `Scientific action '${action}' recorded successfully.`,
            status: updatedRecord?.validationStatus
        });
    } catch (error) {
        next(error);
    }
});

export default router;
