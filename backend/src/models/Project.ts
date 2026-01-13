/**
 * Project Model - Multi-Institute Governance
 * 
 * Represents research projects within institutes.
 * Projects have members, visibility settings, and embargo periods.
 * Projects are NEVER deleted - only archived for audit trail compliance.
 */

import mongoose, { Schema, Document, Types } from 'mongoose';

export type LicenseType = 'CC-BY' | 'CC-BY-NC' | 'Government-Open' | 'Restricted';
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'archived';
export type VisibilityType = 'private' | 'institute' | 'public';
export type ProjectRole = 'lead' | 'contributor' | 'viewer';

export interface IProjectMember {
    userId: Types.ObjectId;
    role: ProjectRole;
    joinedAt: Date;
}

export interface IDataPolicy {
    embargoEndDate?: Date;
    storedVisibility: VisibilityType;
    license: LicenseType;
}

export interface IProject extends Document {
    code: string;                    // Unique project code: "FORCIS-2024"
    name: string;
    instituteId: Types.ObjectId;
    description?: string;
    startDate: Date;
    endDate?: Date;
    status: ProjectStatus;
    members: IProjectMember[];
    dataPolicy: IDataPolicy;
    createdAt: Date;
    updatedAt: Date;
}

const ProjectMemberSchema = new Schema<IProjectMember>({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    role: {
        type: String,
        enum: ['lead', 'contributor', 'viewer'],
        default: 'contributor'
    },
    joinedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const DataPolicySchema = new Schema<IDataPolicy>({
    embargoEndDate: {
        type: Date
    },
    storedVisibility: {
        type: String,
        enum: ['private', 'institute', 'public'],
        default: 'private'
    },
    license: {
        type: String,
        enum: ['CC-BY', 'CC-BY-NC', 'Government-Open', 'Restricted'],
        default: 'Government-Open'
    }
}, { _id: false });

const ProjectSchema = new Schema<IProject>({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    instituteId: {
        type: Schema.Types.ObjectId,
        ref: 'Institute',
        required: true,
        index: true
    },
    description: {
        type: String,
        trim: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['planning', 'active', 'completed', 'archived'],
        default: 'planning',
        index: true
    },
    members: [ProjectMemberSchema],
    dataPolicy: {
        type: DataPolicySchema,
        default: () => ({})
    }
}, { timestamps: true });

// Indexes for performance
ProjectSchema.index({ instituteId: 1, status: 1 });
ProjectSchema.index({ 'members.userId': 1 });
ProjectSchema.index({ 'dataPolicy.embargoEndDate': 1 });
ProjectSchema.index({ code: 1 }, { unique: true });

// Helper method to check if user is a member with minimum role
ProjectSchema.methods.hasAccess = function (userId: Types.ObjectId, minRole: ProjectRole): boolean {
    const roleHierarchy: Record<ProjectRole, number> = {
        'viewer': 1,
        'contributor': 2,
        'lead': 3
    };

    const member = this.members.find((m: IProjectMember) =>
        m.userId.toString() === userId.toString()
    );

    if (!member) return false;
    return roleHierarchy[member.role as ProjectRole] >= roleHierarchy[minRole];
};

// Helper to check effective visibility (embargo-aware)
ProjectSchema.methods.getEffectiveVisibility = function (): VisibilityType {
    if (this.dataPolicy.embargoEndDate && new Date() < this.dataPolicy.embargoEndDate) {
        return 'private';
    }
    return this.dataPolicy.storedVisibility;
};

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
