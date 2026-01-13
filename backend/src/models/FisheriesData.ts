/**
 * Fisheries Data MongoDB Models
 * 
 * Persistent storage for fisheries catch and length records,
 * replacing the in-memory dataStorage service.
 */

import mongoose, { Schema, Document } from 'mongoose';
import { IValidationStatus, ValidationStatusSchema } from './ValidationStatus';

// ============================================
// CATCH RECORD MODEL
// ============================================
export interface ICatchRecord extends Document {
    datasetId: string;
    date: string;
    species: string;
    catch: number;  // kg
    effort: number; // hours/tows
    effortUnit: 'hours' | 'trips' | 'net_days' | 'hooks' | 'tows';
    location?: {
        lat?: number;
        lon?: number;
        name?: string;
        area?: string;
        depth?: number;  // Average depth in meters
    };
    gearType?: string;
    gear?: string;
    vesselId?: string;
    vessel?: string;
    uploadedAt: Date;
    validationStatus?: IValidationStatus;
}

const CatchRecordSchema = new Schema<ICatchRecord>({
    datasetId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    species: { type: String, required: true, index: true },
    catch: { type: Number, required: true },
    effort: { type: Number, required: true },
    effortUnit: {
        type: String,
        enum: ['hours', 'trips', 'net_days', 'hooks', 'tows'],
        default: 'hours'
    },
    location: {
        lat: Number,
        lon: Number,
        name: String,
        area: String,
        depth: Number,  // Average depth in meters
    },
    gearType: String,
    gear: String,
    vesselId: String,
    vessel: String,
    uploadedAt: { type: Date, default: Date.now },
    validationStatus: ValidationStatusSchema,
}, { timestamps: true });

CatchRecordSchema.index({ species: 1, date: 1 });
CatchRecordSchema.index({ datasetId: 1, species: 1 });
CatchRecordSchema.index({ 'validationStatus.status': 1 });

export const CatchRecord = mongoose.model<ICatchRecord>('CatchRecord', CatchRecordSchema);

// ============================================
// LENGTH RECORD MODEL
// ============================================
export interface ILengthRecord extends Document {
    datasetId: string;
    date: string;
    species: string;
    length: number;  // cm
    weight?: number; // kg
    sex?: 'M' | 'F' | 'U';
    maturity?: 'immature' | 'maturing' | 'mature' | 'spawning' | 'spent';
    location?: string;
    age?: number;
    uploadedAt: Date;
    validationStatus?: IValidationStatus;
}

const LengthRecordSchema = new Schema<ILengthRecord>({
    datasetId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    species: { type: String, required: true, index: true },
    length: { type: Number, required: true },
    weight: Number,
    sex: { type: String, enum: ['M', 'F', 'U'] },
    maturity: {
        type: String,
        enum: ['immature', 'maturing', 'mature', 'spawning', 'spent']
    },
    location: String,
    age: Number,
    uploadedAt: { type: Date, default: Date.now },
    validationStatus: ValidationStatusSchema,
}, { timestamps: true });

LengthRecordSchema.index({ species: 1, date: 1 });
LengthRecordSchema.index({ datasetId: 1, species: 1 });

export const LengthRecord = mongoose.model<ILengthRecord>('LengthRecord', LengthRecordSchema);

// ============================================
// FISHERIES DATASET MODEL
// ============================================
export interface IFisheriesDataset extends Document {
    name: string;
    type: 'catch' | 'length' | 'mixed';
    uploadedBy: string;
    uploadedAt: Date;
    recordCount: number;
    species: string[];
    dateRange: {
        start: string;
        end: string;
    };
    validationStatus?: IValidationStatus;
}

const FisheriesDatasetSchema = new Schema<IFisheriesDataset>({
    name: { type: String, required: true },
    type: {
        type: String,
        enum: ['catch', 'length', 'mixed'],
        required: true
    },
    uploadedBy: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    recordCount: { type: Number, default: 0 },
    species: [String],
    dateRange: {
        start: String,
        end: String,
    },
    validationStatus: ValidationStatusSchema,
}, { timestamps: true });

FisheriesDatasetSchema.index({ uploadedBy: 1 });
FisheriesDatasetSchema.index({ species: 1 });

export const FisheriesDataset = mongoose.model<IFisheriesDataset>('FisheriesDataset', FisheriesDatasetSchema);
