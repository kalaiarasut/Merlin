/**
 * Ownership Schema - Multi-Institute Governance
 * 
 * Reusable schema block for data ownership that should be embedded
 * in all data models (Species, FisheriesData, etc.)
 */

import { Schema, Types } from 'mongoose';

export type VisibilityType = 'private' | 'institute' | 'public';
export type LicenseType = 'CC-BY' | 'CC-BY-NC' | 'Government-Open' | 'Restricted';
export type OwnershipStatus = 'active' | 'deprecated';

export interface IOwnership {
    instituteId: Types.ObjectId;
    projectId?: Types.ObjectId;
    uploadedBy: Types.ObjectId;
    embargoEndDate?: Date;
    storedVisibility: VisibilityType;
    license: LicenseType;
    version: number;
    supersedes?: Types.ObjectId;
    status: OwnershipStatus;
}

export const OwnershipSchema = {
    instituteId: {
        type: Schema.Types.ObjectId,
        ref: 'Institute',
        index: true
    },
    projectId: {
        type: Schema.Types.ObjectId,
        ref: 'Project',
        index: true
    },
    uploadedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    embargoEndDate: {
        type: Date,
        index: true
    },
    storedVisibility: {
        type: String,
        enum: ['private', 'institute', 'public'],
        default: 'private',
        index: true
    },
    license: {
        type: String,
        enum: ['CC-BY', 'CC-BY-NC', 'Government-Open', 'Restricted'],
        default: 'Government-Open'
    },
    version: {
        type: Number,
        default: 1
    },
    supersedes: {
        type: Schema.Types.ObjectId
    },
    status: {
        type: String,
        enum: ['active', 'deprecated'],
        default: 'active',
        index: true
    }
};

/**
 * Compute effective visibility based on embargo date
 * ALWAYS use this instead of directly checking storedVisibility
 */
export const getEffectiveVisibility = (ownership: IOwnership): VisibilityType => {
    if (!ownership) return 'private';

    // During embargo, visibility is always private
    if (ownership.embargoEndDate && new Date() < ownership.embargoEndDate) {
        return 'private';
    }

    return ownership.storedVisibility || 'private';
};

/**
 * Check if embargo is currently active
 */
export const isEmbargoActive = (ownership: IOwnership): boolean => {
    if (!ownership?.embargoEndDate) return false;
    return new Date() < ownership.embargoEndDate;
};
