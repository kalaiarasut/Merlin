import mongoose, { Schema, Document } from 'mongoose';

// Activity types
export type ActivityAction =
    | 'create' | 'read' | 'update' | 'delete'
    | 'upload' | 'download' | 'export' | 'import'
    | 'validate' | 'approve' | 'reject'
    | 'login' | 'logout' | 'api_call';

export type EntityType =
    | 'dataset' | 'species' | 'sample' | 'report'
    | 'user' | 'project' | 'institute' | 'analysis';

export interface IActivityLog extends Document {
    userId: string;
    userName: string;
    userRole: string;
    action: ActivityAction;
    actionType: 'INGEST' | 'ANALYZE' | 'EXPORT' | 'DELETE' | 'VIEW' | 'OTHER';
    severity: 'INFO' | 'WARNING' | 'ERROR';
    entityType: EntityType;
    entityId: string;
    entityName?: string;
    details: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    duration?: number;
    success: boolean;
    errorMessage?: string;
    requestId?: string;
    timestamp: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
    {
        userId: { type: String, required: true, index: true },
        userName: { type: String, required: true },
        userRole: { type: String, required: true },
        action: {
            type: String,
            required: true,
            enum: [
                'create', 'read', 'update', 'delete',
                'upload', 'download', 'export', 'import',
                'validate', 'approve', 'reject',
                'login', 'logout', 'api_call'
            ]
        },
        entityType: {
            type: String,
            required: true,
            enum: [
                'dataset', 'species', 'sample', 'report',
                'user', 'project', 'institute', 'analysis'
            ]
        },
        entityId: { type: String, required: true, index: true },
        entityName: { type: String },
        details: { type: Schema.Types.Mixed, default: {} },
        ipAddress: { type: String },
        userAgent: { type: String },
        duration: { type: Number },
        success: { type: Boolean, default: true, index: true },
        severity: {
            type: String,
            required: true,
            enum: ['INFO', 'WARNING', 'ERROR'],
            default: 'INFO'
        },
        errorMessage: { type: String },
        requestId: { type: String, index: true }, // For correlation across services
        timestamp: { type: Date, default: Date.now, index: true } // Key index for time-series queries
    },
    {
        timestamps: true, // Only creates createdAt/updatedAt, we use manual timestamp for the log event time
        versionKey: false
    }
);

// TTL Index: Logs older than 1 year can be automatically pruned (optional, configure as needed)
// ActivityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

// Compound indexes for common query patterns
ActivityLogSchema.index({ entityType: 1, entityId: 1 });
ActivityLogSchema.index({ action: 1, timestamp: -1 });

export const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);
