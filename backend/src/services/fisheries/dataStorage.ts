/**
 * Fisheries Data Storage Service
 * MongoDB-backed storage for fisheries catch/effort/length records
 */

import logger from '../../utils/logger';
import {
    CatchRecord as CatchRecordModel,
    LengthRecord as LengthRecordModel,
    FisheriesDataset as DatasetModel,
    ICatchRecord,
    ILengthRecord,
    IFisheriesDataset,
} from '../../models/FisheriesData';

// Types for fisheries data records - compatible with cpueAnalysis and lengthFrequency
export interface CatchRecord {
    id: string;
    date: string;
    species: string;
    catch: number;  // kg
    effort: number; // hours
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
    datasetId: string;
}

export interface LengthRecord {
    id: string;
    date: string;
    species: string;
    length: number;  // cm
    weight?: number; // kg
    sex?: 'M' | 'F' | 'U';
    maturity?: 'immature' | 'maturing' | 'mature' | 'spawning' | 'spent';
    location?: string;
    age?: number;
    uploadedAt: Date;
    datasetId: string;
}

export interface FisheriesDataset {
    id: string;
    name: string;
    uploadedBy: string;
    uploadedAt: Date;
    recordCount: number;
    species: string[];
    dateRange: { start: string; end: string };
    type: 'catch' | 'length' | 'mixed';
}

/**
 * Parse uploaded CSV/JSON data into catch records and save to MongoDB
 */
async function saveCatchRecords(data: any[], datasetId: string, validationStatus?: any): Promise<number> {
    const records: Partial<ICatchRecord>[] = [];

    for (const row of data) {
        const effortUnitRaw = row.effortUnit || row.effort_unit || row.unit || 'hours';
        const effortUnit = ['hours', 'trips', 'net_days', 'hooks', 'tows'].includes(effortUnitRaw)
            ? effortUnitRaw
            : 'hours';

        records.push({
            datasetId,
            date: row.date || row.Date || row.DATE || new Date().toISOString().split('T')[0],
            species: row.species || row.Species || row.SPECIES || row.scientific_name || 'Unknown',
            catch: parseFloat(row.catch || row.Catch || row.CATCH || row.weight || row.Weight || 0),
            effort: parseFloat(row.effort || row.Effort || row.EFFORT || row.hours || row.Hours || 1),
            effortUnit,
            location: {
                lat: parseFloat(row.lat || row.latitude || row.Latitude) || undefined,
                lon: parseFloat(row.lon || row.longitude || row.Longitude) || undefined,
                name: row.location_name || row.location || undefined,
                area: row.area || row.Area || row.region || undefined,
                depth: parseFloat(row.depth || row.Depth || row.DEPTH || row.avgDepth) || undefined,
            },
            gearType: row.gearType || row.gear_type || row.gear || row.Gear || undefined,
            gear: row.gear || row.Gear || undefined,
            vesselId: row.vesselId || row.vessel_id || undefined,
            vessel: row.vessel || row.Vessel || undefined,
            uploadedAt: new Date(),
            validationStatus,
        });
    }

    if (records.length > 0) {
        await CatchRecordModel.insertMany(records, { ordered: false });
        logger.info(`Saved ${records.length} catch records to MongoDB for dataset ${datasetId}`);
    }
    return records.length;
}

/**
 * Parse uploaded CSV/JSON data into length records and save to MongoDB
 */
async function saveLengthRecords(data: any[], datasetId: string, validationStatus?: any): Promise<number> {
    const records: Partial<ILengthRecord>[] = [];
    const validMaturity = ['immature', 'maturing', 'mature', 'spawning', 'spent'];

    for (const row of data) {
        const maturityRaw = row.maturity || row.Maturity;
        const maturity = maturityRaw && validMaturity.includes(maturityRaw.toLowerCase())
            ? maturityRaw.toLowerCase()
            : undefined;

        records.push({
            datasetId,
            date: row.date || row.Date || new Date().toISOString().split('T')[0],
            species: row.species || row.Species || 'Unknown',
            length: parseFloat(row.length || row.Length || row.TL || row.total_length || 0),
            weight: parseFloat(row.weight || row.Weight) || undefined,
            sex: row.sex || row.Sex || undefined,
            maturity,
            location: row.location || row.Location || undefined,
            age: parseFloat(row.age || row.Age) || undefined,
            uploadedAt: new Date(),
            validationStatus,
        });
    }

    if (records.length > 0) {
        await LengthRecordModel.insertMany(records, { ordered: false });
        logger.info(`Saved ${records.length} length records to MongoDB for dataset ${datasetId}`);
    }
    return records.length;
}

/**
 * Create a new fisheries dataset (saves to MongoDB)
 */
export async function createDataset(params: {
    name: string;
    uploadedBy: string;
    type: 'catch' | 'length' | 'mixed';
    records: any[];
    validationStatus?: any;
}): Promise<FisheriesDataset> {
    // Extract species and date range from records
    const speciesSet = new Set<string>();
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';

    for (const r of params.records) {
        const species = r.species || r.Species || 'Unknown';
        speciesSet.add(species);

        const date = r.date || r.Date || '';
        if (date < minDate) minDate = date;
        if (date > maxDate) maxDate = date;
    }

    // Create dataset document
    const datasetDoc = new DatasetModel({
        name: params.name,
        type: params.type,
        uploadedBy: params.uploadedBy,
        recordCount: params.records.length,
        species: Array.from(speciesSet),
        dateRange: { start: minDate, end: maxDate },
        validationStatus: params.validationStatus,
    });

    await datasetDoc.save();
    const datasetId = datasetDoc._id.toString();

    // Save records based on type
    if (params.type === 'catch' || params.type === 'mixed') {
        await saveCatchRecords(params.records, datasetId, params.validationStatus);
    }
    if (params.type === 'length' || params.type === 'mixed') {
        await saveLengthRecords(params.records, datasetId, params.validationStatus);
    }

    logger.info(`Created fisheries dataset ${datasetId}: ${params.records.length} records in MongoDB`);

    return {
        id: datasetId,
        name: params.name,
        uploadedBy: params.uploadedBy,
        uploadedAt: datasetDoc.uploadedAt,
        recordCount: params.records.length,
        species: Array.from(speciesSet),
        dateRange: { start: minDate, end: maxDate },
        type: params.type,
    };
}

/**
 * Get all datasets from MongoDB
 */
export async function getAllDatasets(validatedOnly?: boolean): Promise<FisheriesDataset[]> {
    const query: any = {};
    if (validatedOnly) {
        query['validationStatus.status'] = { $in: ['auto-validated', 'expert-validated'] };
    }
    const docs = await DatasetModel.find(query).sort({ uploadedAt: -1 }).lean();
    return docs.map(d => ({
        id: d._id.toString(),
        name: d.name,
        uploadedBy: d.uploadedBy,
        uploadedAt: d.uploadedAt,
        recordCount: d.recordCount,
        species: d.species,
        dateRange: d.dateRange,
        type: d.type,
    }));
}

/**
 * Get catch records from MongoDB for analysis
 */
export async function getCatchRecords(filters?: {
    species?: string;
    datasetId?: string;
    startDate?: string;
    endDate?: string;
    validatedOnly?: boolean;
}): Promise<CatchRecord[]> {
    const query: any = {};

    if (filters?.validatedOnly) {
        query['validationStatus.status'] = { $in: ['auto-validated', 'expert-validated'] };
    }

    if (filters?.species) {
        query.species = { $regex: filters.species, $options: 'i' };
    }
    if (filters?.datasetId) {
        query.datasetId = filters.datasetId;
    }
    if (filters?.startDate) {
        query.date = { ...query.date, $gte: filters.startDate };
    }
    if (filters?.endDate) {
        query.date = { ...query.date, $lte: filters.endDate };
    }

    const docs = await CatchRecordModel.find(query).sort({ date: 1 }).lean();

    return docs.map(d => ({
        id: d._id.toString(),
        date: d.date,
        species: d.species,
        catch: d.catch,
        effort: d.effort,
        effortUnit: d.effortUnit as CatchRecord['effortUnit'],
        location: d.location,
        gearType: d.gearType,
        gear: d.gear,
        vesselId: d.vesselId,
        vessel: d.vessel,
        uploadedAt: d.uploadedAt,
        datasetId: d.datasetId,
    }));
}

/**
 * Get length records from MongoDB for analysis
 */
export async function getLengthRecords(filters?: {
    species?: string;
    datasetId?: string;
    validatedOnly?: boolean;
}): Promise<LengthRecord[]> {
    const query: any = {};

    if (filters?.validatedOnly) {
        query['validationStatus.status'] = { $in: ['auto-validated', 'expert-validated'] };
    }

    if (filters?.species) {
        query.species = { $regex: filters.species, $options: 'i' };
    }
    if (filters?.datasetId) {
        query.datasetId = filters.datasetId;
    }

    const docs = await LengthRecordModel.find(query).lean();

    return docs.map(d => ({
        id: d._id.toString(),
        date: d.date,
        species: d.species,
        length: d.length,
        weight: d.weight,
        sex: d.sex as LengthRecord['sex'],
        maturity: d.maturity as LengthRecord['maturity'],
        location: d.location,
        age: d.age,
        uploadedAt: d.uploadedAt,
        datasetId: d.datasetId,
    }));
}

/**
 * Get storage statistics from MongoDB
 */
export async function getStorageStats(): Promise<{
    totalDatasets: number;
    totalCatchRecords: number;
    totalLengthRecords: number;
    speciesCovered: number;
}> {
    const [datasetCount, catchCount, lengthCount, catchSpecies, lengthSpecies] = await Promise.all([
        DatasetModel.countDocuments(),
        CatchRecordModel.countDocuments(),
        LengthRecordModel.countDocuments(),
        CatchRecordModel.distinct('species'),
        LengthRecordModel.distinct('species'),
    ]);

    const allSpecies = new Set([...catchSpecies, ...lengthSpecies]);

    return {
        totalDatasets: datasetCount,
        totalCatchRecords: catchCount,
        totalLengthRecords: lengthCount,
        speciesCovered: allSpecies.size,
    };
}

/**
 * Delete a dataset and its records from MongoDB
 */
export async function deleteDataset(datasetId: string): Promise<boolean> {
    const result = await DatasetModel.findByIdAndDelete(datasetId);
    if (!result) return false;

    await Promise.all([
        CatchRecordModel.deleteMany({ datasetId }),
        LengthRecordModel.deleteMany({ datasetId }),
    ]);

    logger.info(`Deleted fisheries dataset ${datasetId} and associated records from MongoDB`);
    return true;
}

export default {
    createDataset,
    getAllDatasets,
    getCatchRecords,
    getLengthRecords,
    getStorageStats,
    deleteDataset,
};
