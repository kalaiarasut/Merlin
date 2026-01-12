import mongoose, { Schema, Document } from 'mongoose';

export interface IDatasetCounter extends Document {
    datasetId: string;
    latestVersion: number;
}

const DatasetCounterSchema = new Schema<IDatasetCounter>(
    {
        datasetId: { type: String, required: true, unique: true },
        latestVersion: { type: Number, default: 0 }
    },
    { versionKey: false }
);

export const DatasetCounter = mongoose.model<IDatasetCounter>('DatasetCounter', DatasetCounterSchema);
