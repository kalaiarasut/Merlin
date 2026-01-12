import mongoose, { Schema, Document } from 'mongoose';

export interface IDataVersion extends Document {
    datasetId: string;
    version: number;
    createdAt: Date;
    createdBy: string;
    createdByName: string;
    changeType: 'create' | 'update' | 'append' | 'delete' | 'restore';
    description: string;
    recordCount: number;
    sizeBytes: number;
    parentVersion?: number;
    checksum: string;
    changes: {
        added: number;
        modified: number;
        deleted: number;
    };
    metadata: Record<string, any>;
    isActive: boolean;
}

export interface DatasetVersionHistory {
    datasetId: string;
    datasetName: string;
    currentVersion: number;
    versions: IDataVersion[];
    totalVersions: number;
}

const DataVersionSchema = new Schema<IDataVersion>(
    {
        datasetId: { type: String, required: true, index: true },
        version: { type: Number, required: true },
        createdAt: { type: Date, default: Date.now, index: true },
        createdBy: { type: String, required: true },
        createdByName: { type: String, required: true },
        changeType: {
            type: String,
            required: true,
            enum: ['create', 'update', 'append', 'delete', 'restore']
        },
        description: { type: String, default: '' },
        recordCount: { type: Number, default: 0 },
        sizeBytes: { type: Number, default: 0 },
        parentVersion: { type: Number },
        checksum: { type: String, required: true },
        changes: {
            added: { type: Number, default: 0 },
            modified: { type: Number, default: 0 },
            deleted: { type: Number, default: 0 }
        },
        metadata: { type: Schema.Types.Mixed, default: {} },
        isActive: { type: Boolean, default: true, index: true }
    },
    { timestamps: true }
);

// Compound index to ensure unique versions for a dataset
DataVersionSchema.index({ datasetId: 1, version: 1 }, { unique: true });

export const DataVersion = mongoose.model<IDataVersion>('DataVersion', DataVersionSchema);
