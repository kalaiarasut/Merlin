/**
 * Project Access Middleware - Multi-Institute Governance
 * 
 * Controls access to project-level resources based on membership and role.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Project, ProjectRole } from '../models/Project';
import { Types } from 'mongoose';

export interface ProjectScopedRequest extends AuthRequest {
    project?: any;
    projectRole?: ProjectRole;
}

/**
 * Load project and verify user membership
 */
export const loadProject = async (
    req: ProjectScopedRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const projectId = req.params.projectId || req.body.projectId;

        if (!projectId) {
            return res.status(400).json({ error: 'Project ID required' });
        }

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        req.project = project;

        // Find user's role in project
        const member = project.members.find(
            (m) => m.userId.toString() === req.user?.id?.toString()
        );
        req.projectRole = member?.role;

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Require minimum project role
 */
export const requireProjectRole = (minRole: ProjectRole) => {
    const roleHierarchy: Record<ProjectRole, number> = {
        'viewer': 1,
        'contributor': 2,
        'lead': 3
    };

    return async (
        req: ProjectScopedRequest,
        res: Response,
        next: NextFunction
    ) => {
        try {
            // System admins bypass
            if (req.user?.role === 'admin') {
                return next();
            }

            // Institute admins can access their institute's projects
            if (req.user?.role === 'institute-admin') {
                if (req.project?.instituteId?.toString() === req.user?.instituteId?.toString()) {
                    return next();
                }
            }

            // Check project membership and role
            if (!req.projectRole) {
                return res.status(403).json({
                    error: 'Not a member of this project'
                });
            }

            if (roleHierarchy[req.projectRole] < roleHierarchy[minRole]) {
                return res.status(403).json({
                    error: `Requires ${minRole} role or higher`
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Check if project allows uploads (based on status)
 */
export const requireActiveProject = async (
    req: ProjectScopedRequest,
    res: Response,
    next: NextFunction
) => {
    if (!req.project) {
        return res.status(400).json({ error: 'Project not loaded' });
    }

    if (req.project.status === 'planning') {
        return res.status(403).json({
            error: 'Project is in planning phase - no uploads allowed'
        });
    }

    if (req.project.status === 'completed' || req.project.status === 'archived') {
        return res.status(403).json({
            error: 'Project is completed/archived - read-only access'
        });
    }

    next();
};
