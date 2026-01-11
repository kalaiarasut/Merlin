/**
 * Fisheries Data Storage Service
 * Stores uploaded fisheries catch/effort/length records for analysis
 */

import logger from '../../utils/logger';

// Types for fisheries data records - compatible with cpueAnalysis and lengthFrequency
export interface CatchRecord {
    id: string;
    date: string;
    species: string;
    catch: number;  // kg
    effort: number; // hours
    effortUnit: 'hours' | 'trips' | 'net_days' | 'hooks';  // Required by cpueAnalysis
    location?: {
        lat?: number;
        lon?: number;
        name?: string;
        area?: string;
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
    maturity?: 'immature' | 'maturing' | 'mature' | 'spawning' | 'spent';  // Fixed union type
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

// In-memory storage (would be MongoDB in production)
const catchRecords: Map<string, CatchRecord> = new Map();
const lengthRecords: Map<string, LengthRecord> = new Map();
const datasets: Map<string, FisheriesDataset> = new Map();

/**
 * Parse uploaded CSV/JSON data into catch records
 */
export function parseCatchData(data: any[], datasetId: string): CatchRecord[] {
    const records: CatchRecord[] = [];

    for (const row of data) {
        // Determine effort unit from data or default to hours
        const effortUnitRaw = row.effortUnit || row.effort_unit || row.unit || 'hours';
        const effortUnit: CatchRecord['effortUnit'] =
            ['hours', 'trips', 'net_days', 'hooks'].includes(effortUnitRaw)
                ? effortUnitRaw
                : 'hours';

        // Handle various column naming conventions
        const record: CatchRecord = {
            id: `CR-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
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
            },
            gearType: row.gearType || row.gear_type || row.gear || row.Gear || undefined,
            gear: row.gear || row.Gear || undefined,
            vesselId: row.vesselId || row.vessel_id || undefined,
            vessel: row.vessel || row.Vessel || undefined,
            uploadedAt: new Date(),
            datasetId,
        };
        records.push(record);
        catchRecords.set(record.id, record);
    }

    logger.info(`Parsed ${records.length} catch records for dataset ${datasetId}`);
    return records;
}

/**
 * Parse uploaded CSV/JSON data into length records
 */
export function parseLengthData(data: any[], datasetId: string): LengthRecord[] {
    const records: LengthRecord[] = [];
    const validMaturity = ['immature', 'maturing', 'mature', 'spawning', 'spent'];

    for (const row of data) {
        // Validate maturity value
        const maturityRaw = row.maturity || row.Maturity;
        const maturity: LengthRecord['maturity'] =
            maturityRaw && validMaturity.includes(maturityRaw.toLowerCase())
                ? maturityRaw.toLowerCase() as LengthRecord['maturity']
                : undefined;

        const record: LengthRecord = {
            id: `LR-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
            date: row.date || row.Date || new Date().toISOString().split('T')[0],
            species: row.species || row.Species || 'Unknown',
            length: parseFloat(row.length || row.Length || row.TL || row.total_length || 0),
            weight: parseFloat(row.weight || row.Weight) || undefined,
            sex: row.sex || row.Sex || undefined,
            maturity,
            location: row.location || row.Location || undefined,
            age: parseFloat(row.age || row.Age) || undefined,
            uploadedAt: new Date(),
            datasetId,
        };
        records.push(record);
        lengthRecords.set(record.id, record);
    }

    logger.info(`Parsed ${records.length} length records for dataset ${datasetId}`);
    return records;
}

/**
 * Create a new fisheries dataset
 */
export function createDataset(params: {
    name: string;
    uploadedBy: string;
    type: 'catch' | 'length' | 'mixed';
    records: any[];
}): FisheriesDataset {
    const datasetId = `FDS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

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

    const dataset: FisheriesDataset = {
        id: datasetId,
        name: params.name,
        uploadedBy: params.uploadedBy,
        uploadedAt: new Date(),
        recordCount: params.records.length,
        species: Array.from(speciesSet),
        dateRange: { start: minDate, end: maxDate },
        type: params.type,
    };

    datasets.set(datasetId, dataset);

    // Parse and store records based on type
    if (params.type === 'catch' || params.type === 'mixed') {
        parseCatchData(params.records, datasetId);
    }
    if (params.type === 'length' || params.type === 'mixed') {
        parseLengthData(params.records, datasetId);
    }

    logger.info(`Created fisheries dataset ${datasetId}: ${params.records.length} records`);
    return dataset;
}

/**
 * Get all datasets
 */
export function getAllDatasets(): FisheriesDataset[] {
    return Array.from(datasets.values()).sort((a, b) =>
        b.uploadedAt.getTime() - a.uploadedAt.getTime()
    );
}

/**
 * Get catch records for analysis
 */
export function getCatchRecords(filters?: {
    species?: string;
    datasetId?: string;
    startDate?: string;
    endDate?: string;
}): CatchRecord[] {
    let records = Array.from(catchRecords.values());

    if (filters?.species) {
        records = records.filter(r => r.species.toLowerCase().includes(filters.species!.toLowerCase()));
    }
    if (filters?.datasetId) {
        records = records.filter(r => r.datasetId === filters.datasetId);
    }
    if (filters?.startDate) {
        records = records.filter(r => r.date >= filters.startDate!);
    }
    if (filters?.endDate) {
        records = records.filter(r => r.date <= filters.endDate!);
    }

    return records.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get length records for analysis
 */
export function getLengthRecords(filters?: {
    species?: string;
    datasetId?: string;
}): LengthRecord[] {
    let records = Array.from(lengthRecords.values());

    if (filters?.species) {
        records = records.filter(r => r.species.toLowerCase().includes(filters.species!.toLowerCase()));
    }
    if (filters?.datasetId) {
        records = records.filter(r => r.datasetId === filters.datasetId);
    }

    return records;
}

/**
 * Get storage statistics
 */
export function getStorageStats(): {
    totalDatasets: number;
    totalCatchRecords: number;
    totalLengthRecords: number;
    speciesCovered: number;
} {
    const allSpecies = new Set<string>();
    catchRecords.forEach(r => allSpecies.add(r.species));
    lengthRecords.forEach(r => allSpecies.add(r.species));

    return {
        totalDatasets: datasets.size,
        totalCatchRecords: catchRecords.size,
        totalLengthRecords: lengthRecords.size,
        speciesCovered: allSpecies.size,
    };
}

/**
 * Delete a dataset and its records
 */
export function deleteDataset(datasetId: string): boolean {
    if (!datasets.has(datasetId)) return false;

    // Delete associated records
    for (const [id, record] of catchRecords) {
        if (record.datasetId === datasetId) catchRecords.delete(id);
    }
    for (const [id, record] of lengthRecords) {
        if (record.datasetId === datasetId) lengthRecords.delete(id);
    }

    datasets.delete(datasetId);
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
