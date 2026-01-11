/**
 * CPUE (Catch Per Unit Effort) Analysis Service
 * 
 * Implements CPUE calculations for fisheries stock assessment.
 * CPUE is a key indicator of fish abundance and stock health.
 */

import logger from '../../utils/logger';

export interface CatchRecord {
    id?: string;
    date: string;
    location?: {
        lat: number;
        lon: number;
        name?: string;
    };
    species: string;
    catch: number;         // kg or count
    effort: number;        // hours, trips, or net days
    effortUnit: 'hours' | 'trips' | 'net_days' | 'hooks';
    gearType?: string;
    vesselId?: string;
}

export interface CPUEResult {
    species: string;
    cpue: number;                  // Catch per unit effort
    totalCatch: number;
    totalEffort: number;
    effortUnit: string;
    sampleSize: number;
    standardError: number;
    confidence95: { lower: number; upper: number };
    trend?: 'increasing' | 'stable' | 'decreasing';
}

export interface CPUESeries {
    species: string;
    period: 'monthly' | 'quarterly' | 'yearly';
    dataPoints: Array<{
        date: string;
        cpue: number;
        catch: number;
        effort: number;
        sampleSize: number;
    }>;
    overallCPUE: number;
    trend: {
        direction: 'increasing' | 'stable' | 'decreasing';
        changePercent: number;
        significanceP?: number;
    };
}

export interface CPUEComparison {
    species: string;
    locations: Array<{
        name: string;
        cpue: number;
        sampleSize: number;
    }>;
    highestCPUE: { name: string; cpue: number };
    lowestCPUE: { name: string; cpue: number };
}

/**
 * Calculate CPUE for a single species
 */
export function calculateCPUE(records: CatchRecord[], species?: string): CPUEResult {
    // Filter by species if specified
    const filtered = species
        ? records.filter(r => r.species.toLowerCase() === species.toLowerCase())
        : records;

    if (filtered.length === 0) {
        return {
            species: species || 'all',
            cpue: 0,
            totalCatch: 0,
            totalEffort: 0,
            effortUnit: 'trips',
            sampleSize: 0,
            standardError: 0,
            confidence95: { lower: 0, upper: 0 },
        };
    }

    const totalCatch = filtered.reduce((sum, r) => sum + r.catch, 0);
    const totalEffort = filtered.reduce((sum, r) => sum + r.effort, 0);
    const cpue = totalEffort > 0 ? totalCatch / totalEffort : 0;

    // Calculate individual CPUE values for standard error
    const individualCPUEs = filtered.map(r => r.effort > 0 ? r.catch / r.effort : 0);
    const mean = individualCPUEs.reduce((a, b) => a + b, 0) / individualCPUEs.length;
    const variance = individualCPUEs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / individualCPUEs.length;
    const standardError = Math.sqrt(variance / filtered.length);

    // 95% confidence interval (t-distribution approximation for large n)
    const tValue = 1.96; // Approximate for large n
    const margin = tValue * standardError;

    return {
        species: species || 'all',
        cpue: Math.round(cpue * 1000) / 1000,
        totalCatch,
        totalEffort,
        effortUnit: filtered[0].effortUnit,
        sampleSize: filtered.length,
        standardError: Math.round(standardError * 1000) / 1000,
        confidence95: {
            lower: Math.max(0, Math.round((cpue - margin) * 1000) / 1000),
            upper: Math.round((cpue + margin) * 1000) / 1000,
        },
    };
}

/**
 * Calculate CPUE time series
 */
export function calculateCPUETimeSeries(
    records: CatchRecord[],
    species: string,
    period: 'monthly' | 'quarterly' | 'yearly' = 'monthly'
): CPUESeries {
    const filtered = records.filter(r =>
        r.species.toLowerCase() === species.toLowerCase()
    );

    // Group by period
    const groups: Record<string, CatchRecord[]> = {};

    for (const record of filtered) {
        const date = new Date(record.date);
        let key: string;

        switch (period) {
            case 'monthly':
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                break;
            case 'quarterly':
                const quarter = Math.floor(date.getMonth() / 3) + 1;
                key = `${date.getFullYear()}-Q${quarter}`;
                break;
            case 'yearly':
                key = `${date.getFullYear()}`;
                break;
        }

        if (!groups[key]) groups[key] = [];
        groups[key].push(record);
    }

    // Calculate CPUE for each period
    const dataPoints = Object.entries(groups)
        .map(([date, recs]) => {
            const totalCatch = recs.reduce((sum, r) => sum + r.catch, 0);
            const totalEffort = recs.reduce((sum, r) => sum + r.effort, 0);
            return {
                date,
                cpue: totalEffort > 0 ? Math.round((totalCatch / totalEffort) * 1000) / 1000 : 0,
                catch: totalCatch,
                effort: totalEffort,
                sampleSize: recs.length,
            };
        })
        .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate trend
    const trend = calculateTrend(dataPoints.map(d => d.cpue));
    const overallCPUE = calculateCPUE(filtered, species).cpue;

    return {
        species,
        period,
        dataPoints,
        overallCPUE,
        trend,
    };
}

/**
 * Calculate trend direction and change
 */
function calculateTrend(values: number[]): {
    direction: 'increasing' | 'stable' | 'decreasing';
    changePercent: number;
    significanceP?: number;
} {
    if (values.length < 2) {
        return { direction: 'stable', changePercent: 0 };
    }

    // Simple linear regression
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
        numerator += (i - xMean) * (values[i] - yMean);
        denominator += Math.pow(i - xMean, 2);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Calculate percent change
    const firstValue = values[0] || 1;
    const predictedChange = slope * (n - 1);
    const changePercent = (predictedChange / firstValue) * 100;

    // Determine direction
    let direction: 'increasing' | 'stable' | 'decreasing';
    if (changePercent > 10) {
        direction = 'increasing';
    } else if (changePercent < -10) {
        direction = 'decreasing';
    } else {
        direction = 'stable';
    }

    return {
        direction,
        changePercent: Math.round(changePercent * 10) / 10,
    };
}

/**
 * Compare CPUE across locations
 */
export function compareCPUEByLocation(
    records: CatchRecord[],
    species: string
): CPUEComparison {
    const filtered = records.filter(r =>
        r.species.toLowerCase() === species.toLowerCase() && r.location?.name
    );

    // Group by location
    const byLocation: Record<string, CatchRecord[]> = {};
    for (const record of filtered) {
        const locName = record.location?.name || 'Unknown';
        if (!byLocation[locName]) byLocation[locName] = [];
        byLocation[locName].push(record);
    }

    const locations = Object.entries(byLocation).map(([name, recs]) => {
        const cpueResult = calculateCPUE(recs);
        return {
            name,
            cpue: cpueResult.cpue,
            sampleSize: cpueResult.sampleSize,
        };
    });

    const sorted = [...locations].sort((a, b) => b.cpue - a.cpue);

    return {
        species,
        locations,
        highestCPUE: sorted[0] ? { name: sorted[0].name, cpue: sorted[0].cpue } : { name: 'N/A', cpue: 0 },
        lowestCPUE: sorted[sorted.length - 1] ? { name: sorted[sorted.length - 1].name, cpue: sorted[sorted.length - 1].cpue } : { name: 'N/A', cpue: 0 },
    };
}

/**
 * Standardize CPUE across different gear types
 */
export function standardizeCPUE(
    records: CatchRecord[],
    referenceGear: string
): CatchRecord[] {
    // Calculate gear efficiency factors
    const byGear: Record<string, number[]> = {};

    for (const record of records) {
        const gear = record.gearType || 'unknown';
        if (!byGear[gear]) byGear[gear] = [];
        const cpue = record.effort > 0 ? record.catch / record.effort : 0;
        byGear[gear].push(cpue);
    }

    // Calculate mean CPUE for each gear
    const gearMeans: Record<string, number> = {};
    for (const [gear, cpues] of Object.entries(byGear)) {
        gearMeans[gear] = cpues.reduce((a, b) => a + b, 0) / cpues.length;
    }

    const refMean = gearMeans[referenceGear] || 1;

    // Standardize records
    return records.map(record => {
        const gear = record.gearType || 'unknown';
        const factor = refMean / (gearMeans[gear] || refMean);

        return {
            ...record,
            catch: record.catch * factor, // Adjust catch to reference gear efficiency
        };
    });
}

/**
 * Get CPUE summary for multiple species
 */
export function getCPUESummary(records: CatchRecord[]): {
    species: string;
    cpue: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    sampleSize: number;
}[] {
    const speciesList = [...new Set(records.map(r => r.species))];

    return speciesList.map(species => {
        const result = calculateCPUE(records, species);
        const series = calculateCPUETimeSeries(records, species, 'yearly');

        return {
            species,
            cpue: result.cpue,
            trend: series.trend.direction,
            sampleSize: result.sampleSize,
        };
    });
}

export default {
    calculateCPUE,
    calculateCPUETimeSeries,
    compareCPUEByLocation,
    standardizeCPUE,
    getCPUESummary,
};
