/**
 * Activity Logger Service
 * Tracks who-did-what-when for complete audit trails
 */

import { Request } from 'express';

// Activity types
export type ActivityAction =
    | 'create' | 'read' | 'update' | 'delete'
    | 'upload' | 'download' | 'export' | 'import'
    | 'validate' | 'approve' | 'reject'
    | 'login' | 'logout' | 'api_call';

export type EntityType =
    | 'dataset' | 'species' | 'sample' | 'report'
    | 'user' | 'project' | 'institute' | 'analysis';

export interface ActivityLog {
    id: string;
    timestamp: Date;
    userId: string;
    userName: string;
    userRole: string;
    action: ActivityAction;
    entityType: EntityType;
    entityId: string;
    entityName?: string;
    details: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    duration?: number;
    success: boolean;
    errorMessage?: string;
}

// In-memory store (in production, use MongoDB)
const activityLogs: ActivityLog[] = [];

/**
 * Log an activity event
 */
export function logActivity(params: {
    userId: string;
    userName: string;
    userRole: string;
    action: ActivityAction;
    entityType: EntityType;
    entityId: string;
    entityName?: string;
    details?: Record<string, any>;
    req?: Request;
    success?: boolean;
    errorMessage?: string;
    duration?: number;
}): ActivityLog {
    const log: ActivityLog = {
        id: `ACT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        timestamp: new Date(),
        userId: params.userId,
        userName: params.userName,
        userRole: params.userRole,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.entityName,
        details: params.details || {},
        ipAddress: params.req?.ip || params.req?.socket?.remoteAddress,
        userAgent: params.req?.get('User-Agent'),
        duration: params.duration,
        success: params.success ?? true,
        errorMessage: params.errorMessage,
    };

    activityLogs.unshift(log); // Add to beginning for recent-first

    // Keep only last 10000 logs in memory
    if (activityLogs.length > 10000) {
        activityLogs.pop();
    }

    return log;
}

/**
 * Query activity logs with filters
 */
export function queryActivities(filters: {
    userId?: string;
    action?: ActivityAction;
    entityType?: EntityType;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
    success?: boolean;
    limit?: number;
    offset?: number;
}): { activities: ActivityLog[]; total: number } {
    let filtered = [...activityLogs];

    if (filters.userId) {
        filtered = filtered.filter(a => a.userId === filters.userId);
    }
    if (filters.action) {
        filtered = filtered.filter(a => a.action === filters.action);
    }
    if (filters.entityType) {
        filtered = filtered.filter(a => a.entityType === filters.entityType);
    }
    if (filters.entityId) {
        filtered = filtered.filter(a => a.entityId === filters.entityId);
    }
    if (filters.startDate) {
        filtered = filtered.filter(a => a.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
        filtered = filtered.filter(a => a.timestamp <= filters.endDate!);
    }
    if (filters.success !== undefined) {
        filtered = filtered.filter(a => a.success === filters.success);
    }

    const total = filtered.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;

    return {
        activities: filtered.slice(offset, offset + limit),
        total,
    };
}

/**
 * Get activity history for a specific entity
 */
export function getEntityHistory(entityType: EntityType, entityId: string): ActivityLog[] {
    return activityLogs.filter(
        a => a.entityType === entityType && a.entityId === entityId
    );
}

/**
 * Get user activity summary
 */
export function getUserActivitySummary(userId: string): {
    totalActions: number;
    byAction: Record<string, number>;
    byEntityType: Record<string, number>;
    recentActivity: ActivityLog[];
    lastActive: Date | null;
} {
    const userLogs = activityLogs.filter(a => a.userId === userId);

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
 */
export function getActivityStats(): {
    totalLogs: number;
    todayCount: number;
    byAction: Record<string, number>;
    byEntityType: Record<string, number>;
    topUsers: Array<{ userId: string; userName: string; count: number }>;
    errorRate: number;
} {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayLogs = activityLogs.filter(a => a.timestamp >= today);
    const errors = activityLogs.filter(a => !a.success);

    const byAction: Record<string, number> = {};
    const byEntityType: Record<string, number> = {};
    const userCounts: Record<string, { userName: string; count: number }> = {};

    activityLogs.forEach(log => {
        byAction[log.action] = (byAction[log.action] || 0) + 1;
        byEntityType[log.entityType] = (byEntityType[log.entityType] || 0) + 1;

        if (!userCounts[log.userId]) {
            userCounts[log.userId] = { userName: log.userName, count: 0 };
        }
        userCounts[log.userId].count++;
    });

    const topUsers = Object.entries(userCounts)
        .map(([userId, data]) => ({ userId, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return {
        totalLogs: activityLogs.length,
        todayCount: todayLogs.length,
        byAction,
        byEntityType,
        topUsers,
        errorRate: activityLogs.length > 0 ? (errors.length / activityLogs.length) * 100 : 0,
    };
}

/**
 * Export activities to JSON
 */
export function exportActivities(filters?: {
    startDate?: Date;
    endDate?: Date;
}): string {
    let toExport = [...activityLogs];

    if (filters?.startDate) {
        toExport = toExport.filter(a => a.timestamp >= filters.startDate!);
    }
    if (filters?.endDate) {
        toExport = toExport.filter(a => a.timestamp <= filters.endDate!);
    }

    return JSON.stringify(toExport, null, 2);
}

/**
 * Clear old logs (for maintenance)
 */
export function clearOldLogs(olderThan: Date): number {
    const before = activityLogs.length;
    const cutoffIndex = activityLogs.findIndex(a => a.timestamp < olderThan);

    if (cutoffIndex > -1) {
        activityLogs.splice(cutoffIndex);
    }

    return before - activityLogs.length;
}
