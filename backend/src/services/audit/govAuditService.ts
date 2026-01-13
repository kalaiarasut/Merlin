/**
 * Government Audit Service - Multi-Institute Governance
 * 
 * Centralized audit logging for all high-severity actions.
 * This service MUST be used for compliance with government requirements.
 */

import { GovAuditLog, HIGH_SEVERITY_ACTIONS, AuditEntityType, AuditSeverity } from '../../models/GovAuditLog';
import { Types } from 'mongoose';

export interface AuditLogParams {
    actorId: Types.ObjectId | string;
    actorName: string;
    actorRole: string;
    actorInstituteId?: Types.ObjectId | string;

    action: string;
    entityType: AuditEntityType;
    entityId: Types.ObjectId | string;
    entityName?: string;

    before?: Record<string, any>;
    after?: Record<string, any>;

    reason?: string;

    ipAddress: string;
    userAgent?: string;
    requestId?: string;
}

/**
 * Determine severity based on action type
 */
const getSeverity = (action: string): AuditSeverity => {
    if (['user_delete', 'institute_suspend'].includes(action)) {
        return 'critical';
    }
    if (HIGH_SEVERITY_ACTIONS.includes(action)) {
        return 'high';
    }
    if (['member_add', 'member_remove', 'project_create'].includes(action)) {
        return 'medium';
    }
    return 'low';
};

/**
 * Log an audit event
 * Non-blocking - errors are caught and logged, not thrown
 */
export const logAuditEvent = async (params: AuditLogParams): Promise<void> => {
    try {
        const severity = getSeverity(params.action);

        // Validate: high-severity actions require reason
        if (severity === 'high' || severity === 'critical') {
            if (!params.reason) {
                console.warn(`[AUDIT WARNING] High-severity action '${params.action}' logged without reason`);
            }
        }

        await GovAuditLog.create({
            actorId: params.actorId,
            actorName: params.actorName,
            actorRole: params.actorRole,
            actorInstituteId: params.actorInstituteId,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
            entityName: params.entityName,
            before: params.before,
            after: params.after,
            reason: params.reason,
            severity,
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
            requestId: params.requestId,
            timestamp: new Date()
        });
    } catch (error) {
        // Non-blocking - log error but don't fail the operation
        console.error('[AUDIT ERROR] Failed to log audit event:', error);
    }
};

/**
 * Helper to create audit logger from request context
 */
export const createAuditLogger = (req: any) => {
    return (params: Omit<AuditLogParams, 'actorId' | 'actorName' | 'actorRole' | 'actorInstituteId' | 'ipAddress' | 'userAgent' | 'requestId'>) => {
        return logAuditEvent({
            ...params,
            actorId: req.user?.id,
            actorName: req.user?.name || req.user?.email || 'Unknown',
            actorRole: req.user?.role || 'unknown',
            actorInstituteId: req.user?.instituteId,
            ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
            userAgent: req.get('user-agent'),
            requestId: req.get('x-request-id')
        });
    };
};

/**
 * Query audit logs with filters
 */
export const queryAuditLogs = async (filters: {
    actorId?: Types.ObjectId | string;
    entityType?: AuditEntityType;
    entityId?: Types.ObjectId | string;
    action?: string;
    severity?: AuditSeverity;
    instituteId?: Types.ObjectId | string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
}) => {
    const query: any = {};

    if (filters.actorId) query.actorId = filters.actorId;
    if (filters.entityType) query.entityType = filters.entityType;
    if (filters.entityId) query.entityId = filters.entityId;
    if (filters.action) query.action = filters.action;
    if (filters.severity) query.severity = filters.severity;
    if (filters.instituteId) query.actorInstituteId = filters.instituteId;

    if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) query.timestamp.$gte = filters.startDate;
        if (filters.endDate) query.timestamp.$lte = filters.endDate;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
        GovAuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        GovAuditLog.countDocuments(query)
    ]);

    return {
        logs,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

/**
 * Get audit statistics for dashboard
 */
export const getAuditStats = async (instituteId?: Types.ObjectId | string) => {
    const match: any = {};
    if (instituteId) {
        match.actorInstituteId = new Types.ObjectId(instituteId as string);
    }

    const [bySeverity, byAction, recentCritical] = await Promise.all([
        GovAuditLog.aggregate([
            { $match: match },
            { $group: { _id: '$severity', count: { $sum: 1 } } }
        ]),
        GovAuditLog.aggregate([
            { $match: match },
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]),
        GovAuditLog.find({
            ...match,
            severity: { $in: ['high', 'critical'] }
        })
            .sort({ timestamp: -1 })
            .limit(10)
            .lean()
    ]);

    return {
        bySeverity: Object.fromEntries(bySeverity.map((s: any) => [s._id, s.count])),
        topActions: byAction,
        recentCritical
    };
};
