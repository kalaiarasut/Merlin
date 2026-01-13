/**
 * Institute Model - Multi-Institute Governance
 * 
 * Represents research institutions that use the Marlin platform.
 * Each institute has isolated data access and can collaborate via MOUs.
 */

import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInstituteSettings {
    defaultEmbargoMonths: number;
    allowPublicDatasets: boolean;
    requireApprovalForSharing: boolean;
}

export interface IInstitute extends Document {
    code: string;                    // Unique identifier: "CMLRE", "CMFRI", "NIOT"
    name: string;                    // Full name
    type: 'government' | 'academic' | 'private' | 'ngo';
    parentMinistry?: string;
    location: {
        city: string;
        state: string;
        country: string;
    };
    adminUsers: Types.ObjectId[];
    settings: IInstituteSettings;
    status: 'active' | 'suspended';
    createdAt: Date;
    updatedAt: Date;
}

const InstituteSchema = new Schema<IInstitute>({
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
    type: {
        type: String,
        enum: ['government', 'academic', 'private', 'ngo'],
        default: 'government'
    },
    parentMinistry: {
        type: String,
        trim: true
    },
    location: {
        city: { type: String, required: true },
        state: { type: String, required: true },
        country: { type: String, default: 'India' }
    },
    adminUsers: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    settings: {
        defaultEmbargoMonths: { type: Number, default: 6 },
        allowPublicDatasets: { type: Boolean, default: true },
        requireApprovalForSharing: { type: Boolean, default: true }
    },
    status: {
        type: String,
        enum: ['active', 'suspended'],
        default: 'active',
        index: true
    }
}, { timestamps: true });

// Indexes
InstituteSchema.index({ code: 1 }, { unique: true });
InstituteSchema.index({ status: 1 });
InstituteSchema.index({ 'location.state': 1 });

export const Institute = mongoose.model<IInstitute>('Institute', InstituteSchema);
