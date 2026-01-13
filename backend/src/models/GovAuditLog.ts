/**
 * Audit Log Model - Multi-Institute Governance
 * 
 * NON-NEGOTIABLE for government deployments.
 * Records all high-severity actions for compliance and RTI requests.
 */

import mongoose, { Schema, Document, Types } from 'mongoose';

export type AuditEntityType = 'species' | 'fisheries' | 'project' | 'user' | 'institute' | 'dataset' | 'edna';
export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface IGovAuditLog extends Document {
    actorId: Types.ObjectId;
    actorName: string;
    actorRole: string;
    actorInstituteId?: Types.ObjectId;

    action: string;                    // e.g., "visibility_change", "embargo_update"
    entityType: AuditEntityType;
    entityId: Types.ObjectId;
    entityName?: string;               // Human-readable name for quick reference

    before?: Record<string, any>;      // State before change
    after?: Record<string, any>;       // State after change

    reason?: string;                   // Required for high-severity actions
    severity: AuditSeverity;

    ipAddress: string;
    userAgent?: string;
    requestId?: string;                // Correlation ID

    timestamp: Date;                   // Always UTC
}

const GovAuditLogSchema = new Schema<IGovAuditLog>({
    actorId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    actorName: {
        type: String,
        required: true
    },
    actorRole: {
        type: String,
        required: true
    },
    actorInstituteId: {
        type: Schema.Types.ObjectId,
        ref: 'Institute',
        index: true
    },

    action: {
        type: String,
        required: true,
        index: true
    },
    entityType: {
        type: String,
        enum: ['species', 'fisheries', 'project', 'user', 'institute', 'dataset', 'edna'],
        required: true,
        index: true
    },
    entityId: {
        type: Schema.Types.ObjectId,
        required: true,
        index: true
    },
    entityName: String,

    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,

    reason: String,
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'low',
        index: true
    },

    ipAddress: {
        type: String,
        required: true
    },
    userAgent: String,
    requestId: String,

    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    // No updatedAt - audit logs are immutable
    timestamps: false
});

// Compound indexes for common queries
GovAuditLogSchema.index({ entityType: 1, entityId: 1 });
GovAuditLogSchema.index({ actorId: 1, timestamp: -1 });
GovAuditLogSchema.index({ actorInstituteId: 1, timestamp: -1 });
GovAuditLogSchema.index({ severity: 1, timestamp: -1 });
GovAuditLogSchema.index({ action: 1, timestamp: -1 });

// TTL index - keep audit logs for 7 years (government requirement)
// 7 years = 7 * 365 * 24 * 60 * 60 = 220752000 seconds
// Commented out by default - uncomment if needed
// GovAuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 220752000 });

export const GovAuditLog = mongoose.model<IGovAuditLog>('GovAuditLog', GovAuditLogSchema);

// High-severity actions that require reason field
export const HIGH_SEVERITY_ACTIONS = [
    'visibility_change',
    'embargo_change',
    'role_change',
    'user_delete',
    'dataset_deprecate',
    'project_archive',
    'institute_suspend'
];
