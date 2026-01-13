/**
 * Institute API Routes - Multi-Institute Governance
 * 
 * CRUD operations for institutes.
 * System admins can create/suspend institutes.
 * Institute admins can update their own institute settings.
 */

import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireSystemAdmin, requireInstituteAdmin, InstituteScopedRequest } from '../middleware/instituteScope';
import { Institute } from '../models/Institute';
import { User } from '../models/User';
import { createAuditLogger } from '../services/audit/govAuditService';

const router = express.Router();

/**
 * GET /api/institutes
 * List all institutes (filtered by access)
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        let query: any = { status: 'active' };

        // Admins see all institutes
        const isAdmin = req.user?.role === 'admin';

        if (!isAdmin) {
            // Non-admins only see their own institute and shared ones
            const accessibleIds = [
                req.user?.instituteId,
                ...(req.user?.sharedInstituteIds || [])
            ].filter(Boolean);

            query._id = { $in: accessibleIds };
        }

        const institutes = await Institute.find(query)
            .select('-adminUsers')
            .lean();

        res.json({ institutes });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/institutes/:id
 * Get institute details
 */
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        const institute = await Institute.findById(req.params.id)
            .populate('adminUsers', 'name email role')
            .lean();

        if (!institute) {
            return res.status(404).json({ error: 'Institute not found' });
        }

        // Check access
        if (req.user?.role !== 'admin') {
            const hasAccess =
                req.user?.instituteId?.toString() === institute._id.toString() ||
                req.user?.sharedInstituteIds?.some((id: any) => id.toString() === institute._id.toString());

            if (!hasAccess) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        res.json(institute);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/institutes
 * Create new institute (system admin only)
 */
router.post('/', authenticate, requireSystemAdmin, async (req: AuthRequest, res: Response, next) => {
    try {
        const { code, name, type, parentMinistry, location, settings } = req.body;

        // Check for duplicate code
        const existing = await Institute.findOne({ code: code.toUpperCase() });
        if (existing) {
            return res.status(409).json({ error: 'Institute code already exists' });
        }

        const institute = await Institute.create({
            code: code.toUpperCase(),
            name,
            type,
            parentMinistry,
            location,
            settings: settings || {},
            status: 'active',
            adminUsers: []
        });

        // Audit log
        const audit = createAuditLogger(req);
        await audit({
            action: 'institute_create',
            entityType: 'institute',
            entityId: institute._id,
            entityName: institute.name,
            after: { code: institute.code, name: institute.name }
        });

        res.status(201).json(institute);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/institutes/:id
 * Update institute (system admin or institute admin)
 */
router.put('/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        const institute = await Institute.findById(req.params.id);
        if (!institute) {
            return res.status(404).json({ error: 'Institute not found' });
        }

        // Permission check
        const isSystemAdmin = req.user?.role === 'admin';
        const isInstituteAdmin = req.user?.role === 'institute-admin' &&
            req.user?.instituteId?.toString() === institute._id.toString();

        if (!isSystemAdmin && !isInstituteAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const before = institute.toObject();

        // Update allowed fields
        const { name, type, parentMinistry, location, settings } = req.body;
        if (name) institute.name = name;
        if (type && isSystemAdmin) institute.type = type; // Only system admin can change type
        if (parentMinistry) institute.parentMinistry = parentMinistry;
        if (location) institute.location = { ...institute.location, ...location };
        if (settings) institute.settings = { ...institute.settings, ...settings };

        await institute.save();

        // Audit log
        const audit = createAuditLogger(req);
        await audit({
            action: 'institute_update',
            entityType: 'institute',
            entityId: institute._id,
            entityName: institute.name,
            before,
            after: institute.toObject()
        });

        res.json(institute);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/institutes/:id/status
 * Suspend/activate institute (system admin only)
 */
router.put('/:id/status', authenticate, requireSystemAdmin, async (req: AuthRequest, res: Response, next) => {
    try {
        const { status, reason } = req.body;

        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const institute = await Institute.findById(req.params.id);
        if (!institute) {
            return res.status(404).json({ error: 'Institute not found' });
        }

        const before = { status: institute.status };
        institute.status = status;
        await institute.save();

        // Audit log (high severity)
        const audit = createAuditLogger(req);
        await audit({
            action: status === 'suspended' ? 'institute_suspend' : 'institute_activate',
            entityType: 'institute',
            entityId: institute._id,
            entityName: institute.name,
            before,
            after: { status },
            reason
        });

        res.json({ message: `Institute ${status}`, institute });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/institutes/:id/members
 * List institute members
 */
router.get('/:id/members', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        const instituteId = req.params.id;

        // Check access - admins can access all
        const isAdmin = req.user?.role === 'admin';
        if (!isAdmin) {
            if (req.user?.instituteId?.toString() !== instituteId) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const members = await User.find({ instituteId })
            .select('name email role status lastActive')
            .lean();

        res.json({ members, total: members.length });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/institutes/:id/members
 * Add user to institute (institute admin only)
 */
router.post('/:id/members', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        const instituteId = req.params.id;
        const { userId } = req.body;

        // Permission check
        const isSystemAdmin = req.user?.role === 'admin';
        const isInstituteAdmin = req.user?.role === 'institute-admin' &&
            req.user?.instituteId?.toString() === instituteId;

        if (!isSystemAdmin && !isInstituteAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.instituteId?.toString() === instituteId) {
            return res.status(409).json({ error: 'User already in institute' });
        }

        const before = { instituteId: user.instituteId };
        user.instituteId = instituteId as any;
        await user.save();

        // Audit log
        const audit = createAuditLogger(req);
        await audit({
            action: 'member_add',
            entityType: 'user',
            entityId: user._id,
            entityName: user.name,
            before,
            after: { instituteId }
        });

        res.json({ message: 'User added to institute', user: { id: user._id, name: user.name } });
    } catch (error) {
        next(error);
    }
});

export default router;
