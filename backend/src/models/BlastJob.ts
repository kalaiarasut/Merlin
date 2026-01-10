/**
 * BLAST Job Model
 * 
 * Tracks async BLAST sequence analysis jobs.
 * Jobs are submitted and processed in background, 
 * with status updates via WebSocket.
 */

import mongoose, { Schema, Document } from 'mongoose';

export enum BlastJobStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled'
}

export interface IBlastJob extends Document {
    userId: string;
    status: BlastJobStatus;

    // Input
    sequences: {
        id: string;
        sequence: string;
        length: number;
    }[];
    database: string;
    maxResults: number;

    // Progress
    progress: number;  // 0-100
    currentSequence: number;
    totalSequences: number;
    stage: string;

    // Results
    detections: {
        sequenceId: string;
        species: string;
        confidence: number;
        eValue: number;
        identity: number;
        method: string;
        taxonomy: {
            kingdom?: string;
            phylum?: string;
            class?: string;
            order?: string;
            family?: string;
            genus?: string;
            species?: string;
        };
    }[];

    // Timing
    submittedAt: Date;
    startedAt?: Date;
    completedAt?: Date;

    // Error handling
    error?: string;
    retryCount: number;
    maxRetries: number;

    // Metadata
    createdAt: Date;
    updatedAt: Date;
}

const BlastJobSchema = new Schema<IBlastJob>({
    userId: {
        type: String,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: Object.values(BlastJobStatus),
        default: BlastJobStatus.PENDING,
        index: true
    },

    // Input
    sequences: [{
        id: { type: String, required: true },
        sequence: { type: String, required: true },
        length: { type: Number, required: true }
    }],
    database: {
        type: String,
        default: 'nt',
        enum: ['nt', 'nr', 'refseq_rna', 'refseq_genomic']
    },
    maxResults: {
        type: Number,
        default: 5,
        min: 1,
        max: 50
    },

    // Progress
    progress: { type: Number, default: 0, min: 0, max: 100 },
    currentSequence: { type: Number, default: 0 },
    totalSequences: { type: Number, default: 0 },
    stage: { type: String, default: 'queued' },

    // Results
    detections: [{
        sequenceId: String,
        species: String,
        confidence: Number,
        eValue: Number,
        identity: Number,
        method: { type: String, default: 'BLAST' },
        taxonomy: {
            kingdom: String,
            phylum: String,
            class: String,
            order: String,
            family: String,
            genus: String,
            species: String
        }
    }],

    // Timing
    submittedAt: { type: Date, default: Date.now },
    startedAt: Date,
    completedAt: Date,

    // Error handling
    error: String,
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 }
}, {
    timestamps: true
});

// Indexes for efficient querying
BlastJobSchema.index({ status: 1, submittedAt: 1 });  // For worker polling
BlastJobSchema.index({ userId: 1, createdAt: -1 });  // For user job listing

// TTL index: auto-delete completed jobs after 7 days
BlastJobSchema.index(
    { completedAt: 1 },
    { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { status: 'completed' } }
);

export const BlastJob = mongoose.models.BlastJob || mongoose.model<IBlastJob>('BlastJob', BlastJobSchema);
export default BlastJob;
