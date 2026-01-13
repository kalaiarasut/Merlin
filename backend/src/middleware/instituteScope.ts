/**
 * Institute Scope Middleware - Multi-Institute Governance
 * 
 * CRITICAL: This middleware MUST be applied to all data queries.
 * It automatically filters data based on user's institute access.
 * 
 * NEVER rely on frontend or route-level checks alone.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Types } from 'mongoose';

export interface InstituteScopedRequest extends AuthRequest {
    instituteFilter: Record<string, any>;
    canAccessAllInstitutes: boolean;
}

/**
 * Injects institute-scoped query filter into request.
 * 
 * Usage in routes:
 * ```typescript
 * const results = await Model.find({
 *   ...req.instituteFilter,  // ← MANDATORY
 *   ...otherConditions
 * });
 * ```
 */
export const instituteScope = async (
    req: InstituteScopedRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        // System admins see everything
        if (req.user?.role === 'admin') {
            req.instituteFilter = {};
            req.canAccessAllInstitutes = true;
            return next();
        }

        const userId = req.user?.id;
        const userInstituteId = req.user?.instituteId;
        const sharedInstituteIds = req.user?.sharedInstituteIds || [];

        // Build access filter
        const accessibleInstituteIds = [
            userInstituteId,
            ...sharedInstituteIds
        ].filter(Boolean);

        // Current UTC time for embargo checks
        const now = new Date();

        req.instituteFilter = {
            $or: [
                // Own institute data
                { 'ownership.instituteId': userInstituteId },

                // Shared institute data (MOU collaborations)
                {
                    'ownership.instituteId': { $in: sharedInstituteIds },
                    'ownership.status': 'active'
                },

                // Public data (only if embargo has ended)
                {
                    'ownership.storedVisibility': 'public',
                    'ownership.status': 'active',
                    $or: [
                        { 'ownership.embargoEndDate': { $exists: false } },
                        { 'ownership.embargoEndDate': null },
                        { 'ownership.embargoEndDate': { $lte: now } }
                    ]
                },

                // Institute-visible data from accessible institutes
                {
                    'ownership.storedVisibility': 'institute',
                    'ownership.instituteId': { $in: accessibleInstituteIds },
                    'ownership.status': 'active'
                }
            ]
        };

        req.canAccessAllInstitutes = false;
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Strict institute scope - only own institute data
 * Use for sensitive operations
 */
export const strictInstituteScope = async (
    req: InstituteScopedRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        if (req.user?.role === 'admin') {
            req.instituteFilter = {};
            req.canAccessAllInstitutes = true;
            return next();
        }

        const userInstituteId = req.user?.instituteId;

        req.instituteFilter = {
            'ownership.instituteId': userInstituteId,
            'ownership.status': 'active'
        };

        req.canAccessAllInstitutes = false;
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Require specific institute admin access
 */
export const requireInstituteAdmin = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const { role, instituteId } = req.user || {};

        if (role === 'admin') {
            return next();
        }

        if (role !== 'institute-admin') {
            return res.status(403).json({
                error: 'Institute admin access required'
            });
        }

        // Institute admins can only manage their own institute
        const targetInstituteId = req.params.instituteId || req.body.instituteId;
        if (targetInstituteId && instituteId?.toString() !== targetInstituteId) {
            return res.status(403).json({
                error: 'Cannot manage other institutes'
            });
        }

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Require system admin access
 */
export const requireSystemAdmin = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({
            error: 'Admin access required'
        });
    }
    next();
};
