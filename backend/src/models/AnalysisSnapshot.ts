import mongoose, { Schema, Document } from 'mongoose';

export interface IAnalysisSnapshot extends Document {
    name: string;
    description: string;
    createdAt: Date;
    createdBy: string;
    createdByName: string;
    analysisType: 'biodiversity' | 'fisheries' | 'causal' | 'edna' | 'niche' | 'custom';

    // Input data references
    inputDatasets: Array<{
        datasetId: string;
        version: number;
        checksum: string;
    }>;

    // Parameters used
    parameters: Record<string, any>;

    // Environment info
    environment: {
        platformVersion: string;
        nodeVersion: string;
        timestamp: string;
        timezone: string;
    };

    // Results
    resultsSummary: Record<string, any>;
    resultsChecksum: string;

    // Status
    status: 'active' | 'archived' | 'invalidated';
    tags: string[];
}

const AnalysisSnapshotSchema = new Schema<IAnalysisSnapshot>(
    {
        name: { type: String, required: true, index: true }, // Searchable by name
        description: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now, index: true },
        createdBy: { type: String, required: true, index: true },
        createdByName: { type: String, required: true },
        analysisType: {
            type: String,
            required: true,
            enum: ['biodiversity', 'fisheries', 'causal', 'edna', 'niche', 'custom'],
            index: true
        },
        inputDatasets: [{
            datasetId: String,
            version: Number,
            checksum: String
        }],
        parameters: { type: Schema.Types.Mixed, default: {} },
        environment: {
            platformVersion: String,
            nodeVersion: String,
            timestamp: String,
            timezone: String
        },
        resultsSummary: { type: Schema.Types.Mixed, default: {} },
        resultsChecksum: { type: String, required: true },
        status: {
            type: String,
            enum: ['active', 'archived', 'invalidated'],
            default: 'active',
            index: true
        },
        tags: { type: [String], index: true }
    },
    { timestamps: true }
);

export const AnalysisSnapshot = mongoose.model<IAnalysisSnapshot>('AnalysisSnapshot', AnalysisSnapshotSchema);
