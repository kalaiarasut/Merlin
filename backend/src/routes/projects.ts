/**
 * Project API Routes - Multi-Institute Governance
 * 
 * CRUD operations for projects within institutes.
 * Projects are NEVER deleted - only archived.
 */

import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { instituteScope, InstituteScopedRequest } from '../middleware/instituteScope';
import { loadProject, requireProjectRole, requireActiveProject, ProjectScopedRequest } from '../middleware/projectAccess';
import { Project, LicenseType, VisibilityType } from '../models/Project';
import { User } from '../models/User';
import { createAuditLogger } from '../services/audit/govAuditService';

const router = express.Router();

/**
 * GET /api/projects
 * List user's projects
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        let query: any = { status: { $ne: 'archived' } };

        // System admins see all
        if (req.user?.role === 'admin') {
            // No additional filter
        }
        // Institute admins see their institute's projects
        else if (req.user?.role === 'institute-admin') {
            query.instituteId = req.user?.instituteId;
        }
        // Others see only projects they're members of
        else {
            // Only filter by userId if it's a valid ObjectId format
            const userId = req.user?.id;
            if (userId && /^[0-9a-fA-F]{24}$/.test(userId)) {
                query['members.userId'] = userId;
            } else {
                // No valid userId - return empty for now
                return res.json({ projects: [] });
            }
        }

        // Optional filters
        if (req.query.status) {
            query.status = req.query.status;
        }
        if (req.query.instituteId && req.user?.role === 'admin') {
            query.instituteId = req.query.instituteId;
        }

        const projects = await Project.find(query)
            .populate('instituteId', 'code name')
            .sort({ updatedAt: -1 })
            .lean();

        res.json({ projects });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/projects/:projectId
 * Get project details
 */
router.get('/:projectId', authenticate, loadProject, requireProjectRole('viewer'), async (req: ProjectScopedRequest, res: Response, next) => {
    try {
        const project = await Project.findById(req.params.projectId)
            .populate('instituteId', 'code name')
            .populate('members.userId', 'name email role')
            .lean();

        res.json(project);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/projects
 * Create new project (institute admin or system admin)
 */
router.post('/', authenticate, async (req: AuthRequest, res: Response, next) => {
    try {
        const { code, name, description, startDate, endDate, dataPolicy, instituteId } = req.body;

        // Determine target institute
        let targetInstituteId = instituteId;
        if (req.user?.role === 'admin') {
            if (!instituteId) {
                return res.status(400).json({ error: 'instituteId required for system admin' });
            }
        } else if (req.user?.role === 'institute-admin') {
            targetInstituteId = req.user?.instituteId;
        } else {
            return res.status(403).json({ error: 'Admin access required to create projects' });
        }

        // Check duplicate code
        const existing = await Project.findOne({ code: code.toUpperCase() });
        if (existing) {
            return res.status(409).json({ error: 'Project code already exists' });
        }

        const project = await Project.create({
            code: code.toUpperCase(),
            name,
            instituteId: targetInstituteId,
            description,
            startDate: startDate || new Date(),
            endDate,
            status: 'planning',
            members: [{
                userId: req.user?.id,
                role: 'lead',
                joinedAt: new Date()
            }],
            dataPolicy: {
                storedVisibility: dataPolicy?.storedVisibility || 'private',
                license: dataPolicy?.license || 'Government-Open',
                embargoEndDate: dataPolicy?.embargoEndDate
            }
        });

        // Audit log
        const audit = createAuditLogger(req);
        await audit({
            action: 'project_create',
            entityType: 'project',
            entityId: project._id,
            entityName: project.name,
            after: { code: project.code, name: project.name, instituteId: targetInstituteId }
        });

        res.status(201).json(project);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/projects/:projectId
 * Update project (project lead or admin)
 */
router.put('/:projectId', authenticate, loadProject, requireProjectRole('lead'), async (req: ProjectScopedRequest, res: Response, next) => {
    try {
        const project = req.project;
        const before = project.toObject();

        const { name, description, startDate, endDate, status } = req.body;

        if (name) project.name = name;
        if (description !== undefined) project.description = description;
        if (startDate) project.startDate = startDate;
        if (endDate) project.endDate = endDate;

        // Status transitions
        if (status) {
            const validTransitions: Record<string, string[]> = {
                'planning': ['active'],
                'active': ['completed'],
                'completed': ['archived'],
                'archived': [] // Cannot transition out of archived
            };

            if (!validTransitions[project.status]?.includes(status)) {
                return res.status(400).json({
                    error: `Cannot transition from ${project.status} to ${status}`
                });
            }
            project.status = status;
        }

        await project.save();

        // Audit log
        const audit = createAuditLogger(req);
        await audit({
            action: 'project_update',
            entityType: 'project',
            entityId: project._id,
            entityName: project.name,
            before,
            after: project.toObject()
        });

        res.json(project);
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/projects/:projectId/visibility
 * Change project visibility (high-severity, requires reason)
 */
router.put('/:projectId/visibility', authenticate, loadProject, requireProjectRole('lead'), async (req: ProjectScopedRequest, res: Response, next) => {
    try {
        const { visibility, reason }: { visibility: VisibilityType; reason: string } = req.body;

        if (!reason) {
            return res.status(400).json({ error: 'Reason required for visibility change' });
        }

        if (!['private', 'institute', 'public'].includes(visibility)) {
            return res.status(400).json({ error: 'Invalid visibility value' });
        }

        const project = req.project;
        const before = { storedVisibility: project.dataPolicy.storedVisibility };

        project.dataPolicy.storedVisibility = visibility;
        await project.save();

        // Audit log (high severity)
        const audit = createAuditLogger(req);
        await audit({
            action: 'visibility_change',
            entityType: 'project',
            entityId: project._id,
            entityName: project.name,
            before,
            after: { storedVisibility: visibility },
            reason
        });

        res.json({ message: 'Visibility updated', visibility });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/projects/:projectId/embargo
 * Set/update embargo date (high-severity, requires reason)
 */
router.put('/:projectId/embargo', authenticate, loadProject, requireProjectRole('lead'), async (req: ProjectScopedRequest, res: Response, next) => {
    try {
        const { embargoEndDate, reason }: { embargoEndDate: string | null; reason: string } = req.body;

        if (!reason) {
            return res.status(400).json({ error: 'Reason required for embargo change' });
        }

        const project = req.project;
        const before = { embargoEndDate: project.dataPolicy.embargoEndDate };

        project.dataPolicy.embargoEndDate = embargoEndDate ? new Date(embargoEndDate) : undefined;
        await project.save();

        // Audit log (high severity)
        const audit = createAuditLogger(req);
        await audit({
            action: 'embargo_change',
            entityType: 'project',
            entityId: project._id,
            entityName: project.name,
            before,
            after: { embargoEndDate: project.dataPolicy.embargoEndDate },
            reason
        });

        res.json({ message: 'Embargo updated', embargoEndDate: project.dataPolicy.embargoEndDate });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/projects/:projectId/members
 * Add member to project
 */
router.post('/:projectId/members', authenticate, loadProject, requireProjectRole('lead'), async (req: ProjectScopedRequest, res: Response, next) => {
    try {
        const { userId, role } = req.body;

        if (!['lead', 'contributor', 'viewer'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const project = req.project;

        // Check if already a member
        const existingMember = project.members.find(
            (m: any) => m.userId.toString() === userId
        );
        if (existingMember) {
            return res.status(409).json({ error: 'User is already a member' });
        }

        project.members.push({
            userId,
            role,
            joinedAt: new Date()
        });
        await project.save();

        // Also add project to user's projectIds
        if (!user.projectIds) user.projectIds = [];
        user.projectIds.push(project._id);
        await user.save();

        // Audit log
        const audit = createAuditLogger(req);
        await audit({
            action: 'member_add',
            entityType: 'project',
            entityId: project._id,
            entityName: project.name,
            after: { userId, role, userName: user.name }
        });

        res.json({ message: 'Member added', member: { userId, role, name: user.name } });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/projects/:projectId/members/:userId
 * Remove member from project
 */
router.delete('/:projectId/members/:userId', authenticate, loadProject, requireProjectRole('lead'), async (req: ProjectScopedRequest, res: Response, next) => {
    try {
        const { userId } = req.params;
        const project = req.project;

        const memberIndex = project.members.findIndex(
            (m: any) => m.userId.toString() === userId
        );

        if (memberIndex === -1) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const removedMember = project.members[memberIndex];
        project.members.splice(memberIndex, 1);
        await project.save();

        // Also remove from user's projectIds
        await User.updateOne(
            { _id: userId },
            { $pull: { projectIds: project._id } }
        );

        // Audit log
        const audit = createAuditLogger(req);
        await audit({
            action: 'member_remove',
            entityType: 'project',
            entityId: project._id,
            entityName: project.name,
            before: { userId, role: removedMember.role }
        });

        res.json({ message: 'Member removed' });
    } catch (error) {
        next(error);
    }
});

export default router;
