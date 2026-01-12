import { Schema } from 'mongoose';

export interface IValidationHistory {
    action: 'approve' | 'reject' | 'flag' | 'auto-validate';
    userId: string;
    userName: string;
    timestamp: Date;
    comment?: string;
    snapshot?: {
        fieldsValidated: string[];
        previousValues?: Record<string, any>;
        thresholdUsed?: number;
        confidence?: number;
    };
}

export interface IValidationStatus {
    status: 'pending' | 'under-review' | 'auto-validated' | 'expert-validated' | 'rejected';
    scope: 'metadata-only' | 'taxonomy' | 'measurement' | 'full-record';
    validatedBy?: string;
    validatedByName?: string;
    validatedAt?: Date;
    comments?: string[];
    history: IValidationHistory[];
}

export const ValidationStatusSchema = {
    status: {
        type: String,
        enum: ['pending', 'under-review', 'auto-validated', 'expert-validated', 'rejected'],
        default: 'pending',
        index: true
    },
    scope: {
        type: String,
        enum: ['metadata-only', 'taxonomy', 'measurement', 'full-record'],
        default: 'full-record'
    },
    validatedBy: String,
    validatedByName: String,
    validatedAt: Date,
    comments: [String],
    history: [{
        action: { type: String, enum: ['approve', 'reject', 'flag', 'auto-validate'] },
        userId: String,
        userName: String,
        timestamp: { type: Date, default: Date.now },
        comment: String,
        snapshot: {
            fieldsValidated: [String],
            previousValues: Schema.Types.Mixed,
            thresholdUsed: Number,
            confidence: Number
        }
    }]
};
