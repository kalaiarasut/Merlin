/**
 * Activity Logger Service
 * Tracks who-did-what-when for complete audit trails
 * Persistence: MongoDB (ActivityLog model)
 */

import { Request } from 'express';
import { ActivityLog, IActivityLog, ActivityAction, EntityType } from '../../models/ActivityLog';

// Re-export types for consumers
export type { ActivityAction, EntityType };

/**
 * Log an activity event
 */
export async function logActivity(params: {
    userId: string;
    userName: string;
    userRole: string;
    action: ActivityAction;
    actionType?: 'INGEST' | 'ANALYZE' | 'EXPORT' | 'DELETE' | 'VIEW' | 'OTHER'; // Optional to allow backward compatibility or default per action
    entityType: EntityType;
    entityId: string;
    entityName?: string;
    details?: Record<string, any>;
    req?: Request;
    success?: boolean;
    severity?: 'INFO' | 'WARNING' | 'ERROR';
    errorMessage?: string;
    requestId?: string;
    duration?: number;
}): Promise<void> { // Changed return type to void as we don't want to await the result in the caller blocking flow
    try {
        const severity = params.severity || (params.success === false ? 'ERROR' : 'INFO');
        const actionType = params.actionType || mapActionToType(params.action);

        const log = new ActivityLog({
            userId: params.userId,
            userName: params.userName,
            userRole: params.userRole,
            action: params.action,
            actionType: actionType,
            entityType: params.entityType,
            entityId: params.entityId,
            entityName: params.entityName,
            details: params.details || {},
            ipAddress: params.req?.ip || params.req?.socket?.remoteAddress,
            userAgent: params.req?.get('User-Agent'),
            duration: params.duration,
            success: params.success ?? true,
            severity: severity,
            errorMessage: params.errorMessage,
            requestId: params.requestId || params.req?.headers['x-request-id'] as string,
            timestamp: new Date()
        });

        // Fire and forget (but we await here inside the async function, caller shouldn't await strictly if they want true non-blocking)
        // Actually, best practice for "don't crash user action" is to swallow error here.
        await log.save();
    } catch (error) {
        // Silently fail or log to console so as not to disrupt the main application flow
        console.error('FAILED TO WRITE AUDIT LOG:', error);
    }
}

// Helper to deduce actionType from action if not provided
function mapActionToType(action: ActivityAction): string {
    if (['upload', 'import', 'create'].includes(action)) return 'INGEST';
    if (['validate', 'approve', 'reject'].includes(action)) return 'ANALYZE'; // Or REVIEW
    if (['download', 'export'].includes(action)) return 'EXPORT';
    if (['delete'].includes(action)) return 'DELETE';
    if (['read', 'login', 'logout'].includes(action)) return 'VIEW';
    return 'OTHER';
}

/**
 * Query activity logs with filters
 */
export async function queryActivities(filters: {
    userId?: string;
    action?: ActivityAction;
    entityType?: EntityType;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
    success?: boolean;
    limit?: number;
    offset?: number;
}): Promise<{ activities: IActivityLog[]; total: number }> {
    const query: any = {};

    if (filters.userId) query.userId = filters.userId;
    if (filters.action) query.action = filters.action;
    if (filters.entityType) query.entityType = filters.entityType;
    if (filters.entityId) query.entityId = filters.entityId;
    if (filters.success !== undefined) query.success = filters.success;

    // Date range query
    if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) query.timestamp.$gte = filters.startDate;
        if (filters.endDate) query.timestamp.$lte = filters.endDate;
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const [activities, total] = await Promise.all([
        ActivityLog.find(query)
            .sort({ timestamp: -1 })
            .skip(offset)
            .limit(limit),
        ActivityLog.countDocuments(query)
    ]);

    return { activities, total };
}

/**
 * Get activity history for a specific entity
 */
export async function getEntityHistory(entityType: EntityType, entityId: string): Promise<IActivityLog[]> {
    return await ActivityLog.find({ entityType, entityId }).sort({ timestamp: -1 });
}

/**
 * Get user activity summary
 */
export async function getUserActivitySummary(userId: string): Promise<{
    totalActions: number;
    byAction: Record<string, number>;
    byEntityType: Record<string, number>;
    recentActivity: IActivityLog[];
    lastActive: Date | null;
}> {
    const userLogs = await ActivityLog.find({ userId }).sort({ timestamp: -1 });

    const byAction: Record<string, number> = {};
    const byEntityType: Record<string, number> = {};

    userLogs.forEach(log => {
        byAction[log.action] = (byAction[log.action] || 0) + 1;
        byEntityType[log.entityType] = (byEntityType[log.entityType] || 0) + 1;
    });

    return {
        totalActions: userLogs.length,
        byAction,
        byEntityType,
        recentActivity: userLogs.slice(0, 10),
        lastActive: userLogs.length > 0 ? userLogs[0].timestamp : null,
    };
}

/**
 * Get system-wide activity statistics
 * Optimized with aggregation pipeline for performance
 */
export async function getActivityStats(): Promise<{
    totalLogs: number;
    todayCount: number;
    byAction: Record<string, number>;
    byEntityType: Record<string, number>;
    topUsers: Array<{ userId: string; userName: string; count: number }>;
    errorRate: number;
}> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalLogs, todayCount, stats, topUsersRaw, errorCount] = await Promise.all([
        ActivityLog.countDocuments(),
        ActivityLog.countDocuments({ timestamp: { $gte: today } }),
        ActivityLog.aggregate([
            {
                $facet: {
                    byAction: [
                        { $group: { _id: '$action', count: { $sum: 1 } } }
                    ],
                    byEntityType: [
                        { $group: { _id: '$entityType', count: { $sum: 1 } } }
                    ]
                }
            }
        ]),
        ActivityLog.aggregate([
            { $group: { _id: { userId: '$userId', userName: '$userName' }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]),
        ActivityLog.countDocuments({ success: false })
    ]);

    const byAction: Record<string, number> = {};
    const byEntityType: Record<string, number> = {};

    stats[0].byAction.forEach((item: any) => { byAction[item._id] = item.count; });
    stats[0].byEntityType.forEach((item: any) => { byEntityType[item._id] = item.count; });

    const topUsers = topUsersRaw.map((u: any) => ({
        userId: u._id.userId,
        userName: u._id.userName,
        count: u.count
    }));

    return {
        totalLogs,
        todayCount,
        byAction,
        byEntityType,
        topUsers,
        errorRate: totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0
    };
}

/**
 * Export activities to JSON
 */
export async function exportActivities(filters?: {
    startDate?: Date;
    endDate?: Date;
}): Promise<string> {
    const query: any = {};
    if (filters?.startDate) {
        query.timestamp = { $gte: filters.startDate };
    }
    if (filters?.endDate) {
        query.timestamp = { ...query.timestamp, $lte: filters.endDate };
    }

    const logs = await ActivityLog.find(query).sort({ timestamp: -1 });
    return JSON.stringify(logs, null, 2);
}

/**
 * Clear old logs (for maintenance)
 */
export async function clearOldLogs(olderThan: Date): Promise<number> {
    const result = await ActivityLog.deleteMany({ timestamp: { $lt: olderThan } });
    return result.deletedCount || 0;
}
