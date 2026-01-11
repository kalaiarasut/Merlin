/**
 * Governance API Routes
 * Institutes, projects, access control, and data sharing
 */

import { Router, Request, Response } from 'express';
import * as governance from '../services/governance';

const router = Router();

// ==================== INFO ====================

router.get('/info', (_req: Request, res: Response) => {
    res.json({
        success: true,
        module: {
            name: 'Multi-Institute Governance',
            version: '1.0.0',
            features: ['institutes', 'projects', 'access-control', 'embargoes', 'sharing-agreements'],
            roles: governance.getRolePermissions(),
        },
    });
});

// ==================== INSTITUTES ====================

router.get('/institutes', (req: Request, res: Response) => {
    try {
        const filters = {
            status: req.query.status as string | undefined,
            type: req.query.type as string | undefined,
        };
        const institutes = governance.listInstitutes(filters);
        res.json({ success: true, institutes });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/institutes/:id', (req: Request, res: Response) => {
    try {
        const institute = governance.getInstitute(req.params.id);
        if (!institute) {
            return res.status(404).json({ success: false, error: 'Institute not found' });
        }
        res.json({ success: true, institute });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/institutes', (req: Request, res: Response) => {
    try {
        const institute = governance.createInstitute({
            name: req.body.name,
            code: req.body.code,
            type: req.body.type,
            country: req.body.country,
            region: req.body.region,
            adminUserId: req.body.adminUserId || 'system',
        });
        res.json({ success: true, institute });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/institutes/:id/settings', (req: Request, res: Response) => {
    try {
        const institute = governance.updateInstituteSettings(req.params.id, req.body);
        if (!institute) {
            return res.status(404).json({ success: false, error: 'Institute not found' });
        }
        res.json({ success: true, institute });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/institutes/:id/members', (req: Request, res: Response) => {
    try {
        const success = governance.addMemberToInstitute(
            req.params.id,
            req.body.userId,
            req.body.isAdmin
        );
        if (!success) {
            return res.status(404).json({ success: false, error: 'Institute not found' });
        }
        res.json({ success: true, message: 'Member added' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== PROJECTS ====================

router.get('/projects', (req: Request, res: Response) => {
    try {
        const filters = {
            instituteId: req.query.instituteId as string | undefined,
            status: req.query.status as string | undefined,
            userId: req.query.userId as string | undefined,
        };
        const projects = governance.listProjects(filters);
        res.json({ success: true, projects });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/projects/:id', (req: Request, res: Response) => {
    try {
        const project = governance.getProject(req.params.id);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        res.json({ success: true, project });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/projects', (req: Request, res: Response) => {
    try {
        const project = governance.createProject({
            name: req.body.name,
            description: req.body.description,
            instituteId: req.body.instituteId,
            leadUserId: req.body.leadUserId || 'system',
            leadUserName: req.body.leadUserName || 'System',
            startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
            visibility: req.body.visibility,
        });
        res.json({ success: true, project });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/projects/:id/members', (req: Request, res: Response) => {
    try {
        const success = governance.addProjectMember(req.params.id, {
            userId: req.body.userId,
            userName: req.body.userName,
            role: req.body.role,
        });
        if (!success) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        res.json({ success: true, message: 'Member added/updated' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/projects/:id/embargo', (req: Request, res: Response) => {
    try {
        const project = governance.setProjectEmbargo(req.params.id, {
            enabled: req.body.enabled,
            endDate: new Date(req.body.endDate),
            reason: req.body.reason,
        });
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        res.json({ success: true, project });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/projects/:id/datasets', (req: Request, res: Response) => {
    try {
        const success = governance.addDatasetToProject(req.params.id, req.body.datasetId);
        if (!success) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        res.json({ success: true, message: 'Dataset added' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ACCESS CONTROL ====================

router.get('/roles', (_req: Request, res: Response) => {
    res.json({ success: true, roles: governance.getRolePermissions() });
});

router.post('/check-permission', (req: Request, res: Response) => {
    try {
        const hasPermission = governance.checkPermission(
            req.body.role,
            req.body.permission
        );
        res.json({ success: true, hasPermission });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/check-project-access', (req: Request, res: Response) => {
    try {
        const result = governance.canAccessProject(
            req.body.userId,
            req.body.projectId
        );
        res.json({ success: true, ...result });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== SHARING AGREEMENTS ====================

router.get('/agreements', (req: Request, res: Response) => {
    try {
        const filters = {
            instituteId: req.query.instituteId as string | undefined,
            status: req.query.status as string | undefined,
        };
        const agreements = governance.listSharingAgreements(filters);
        res.json({ success: true, agreements });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/agreements', (req: Request, res: Response) => {
    try {
        const agreement = governance.createSharingAgreement({
            fromInstituteId: req.body.fromInstituteId,
            toInstituteId: req.body.toInstituteId,
            validityMonths: req.body.validityMonths,
            scope: req.body.scope,
            datasetIds: req.body.datasetIds,
            projectIds: req.body.projectIds,
            conditions: req.body.conditions,
        });
        res.json({ success: true, agreement });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/agreements/:id/approve', (req: Request, res: Response) => {
    try {
        const agreement = governance.approveSharingAgreement(
            req.params.id,
            req.body.approvedBy || 'system'
        );
        if (!agreement) {
            return res.status(404).json({ success: false, error: 'Agreement not found' });
        }
        res.json({ success: true, agreement });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/agreements/:id/revoke', (req: Request, res: Response) => {
    try {
        const success = governance.revokeSharingAgreement(req.params.id);
        if (!success) {
            return res.status(404).json({ success: false, error: 'Agreement not found' });
        }
        res.json({ success: true, message: 'Agreement revoked' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== STATISTICS ====================

router.get('/stats', (_req: Request, res: Response) => {
    try {
        const stats = governance.getGovernanceStats();
        res.json({ success: true, stats });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
