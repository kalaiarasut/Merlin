/**
 * Length-Frequency Analysis Service
 * 
 * Analyzes fish length distributions to understand population structure,
 * growth patterns, and recruitment pulses.
 */

import logger from '../../utils/logger';

export interface LengthRecord {
    id?: string;
    date: string;
    species: string;
    length: number;      // cm (total length)
    weight?: number;     // kg
    sex?: 'M' | 'F' | 'U';
    maturity?: 'immature' | 'maturing' | 'mature' | 'spawning' | 'spent';
    location?: string;
    age?: number;        // years (from otolith if available)
}

export interface LengthDistribution {
    species: string;
    sampleSize: number;
    minLength: number;
    maxLength: number;
    meanLength: number;
    medianLength: number;
    mode: number;
    standardDeviation: number;
    bins: Array<{
        lengthClass: number;  // midpoint of bin
        count: number;
        frequency: number;    // proportion
    }>;
    lengthAtFirstMaturity?: number;
    percentMature?: number;
}

export interface CohortAnalysis {
    species: string;
    cohorts: Array<{
        id: number;
        meanLength: number;
        estimatedAge: number;
        sampleSize: number;
        proportion: number;
    }>;
    recruitmentIndex: number;
    spawningStockIndex: number;
}

export interface GrowthParameters {
    species: string;
    Linf: number;          // Asymptotic length
    K: number;             // Growth coefficient
    t0: number;            // Age at length zero
    phi: number;           // Growth performance index
    r2: number;            // Fit quality
}

export interface LengthWeightRelation {
    species: string;
    a: number;             // Coefficient
    b: number;             // Exponent
    r2: number;            // R-squared
    conditionFactor: number;
    sampleSize: number;
}

/**
 * Calculate length distribution with bins
 */
export function calculateLengthDistribution(
    records: LengthRecord[],
    species: string,
    binSize: number = 5
): LengthDistribution {
    const filtered = records.filter(r =>
        r.species.toLowerCase() === species.toLowerCase()
    );

    if (filtered.length === 0) {
        return {
            species,
            sampleSize: 0,
            minLength: 0,
            maxLength: 0,
            meanLength: 0,
            medianLength: 0,
            mode: 0,
            standardDeviation: 0,
            bins: [],
        };
    }

    const lengths = filtered.map(r => r.length).sort((a, b) => a - b);
    const n = lengths.length;

    // Basic statistics
    const minLength = lengths[0];
    const maxLength = lengths[n - 1];
    const sum = lengths.reduce((a, b) => a + b, 0);
    const meanLength = sum / n;
    const medianLength = n % 2 === 0
        ? (lengths[n / 2 - 1] + lengths[n / 2]) / 2
        : lengths[Math.floor(n / 2)];

    // Standard deviation
    const variance = lengths.reduce((sum, val) => sum + Math.pow(val - meanLength, 2), 0) / n;
    const standardDeviation = Math.sqrt(variance);

    // Create bins
    const binStart = Math.floor(minLength / binSize) * binSize;
    const binEnd = Math.ceil(maxLength / binSize) * binSize;
    const bins: Array<{ lengthClass: number; count: number; frequency: number }> = [];

    for (let i = binStart; i < binEnd; i += binSize) {
        const count = lengths.filter(l => l >= i && l < i + binSize).length;
        bins.push({
            lengthClass: i + binSize / 2,
            count,
            frequency: count / n,
        });
    }

    // Find mode (most frequent bin)
    const maxBin = bins.reduce((max, bin) => bin.count > max.count ? bin : max, bins[0]);
    const mode = maxBin?.lengthClass || 0;

    // Calculate percent mature
    const matureCount = filtered.filter(r =>
        r.maturity === 'mature' || r.maturity === 'spawning' || r.maturity === 'spent'
    ).length;
    const percentMature = (matureCount / n) * 100;

    // Estimate length at first maturity (L50)
    const lengthAtFirstMaturity = estimateLm50(filtered);

    return {
        species,
        sampleSize: n,
        minLength: Math.round(minLength * 10) / 10,
        maxLength: Math.round(maxLength * 10) / 10,
        meanLength: Math.round(meanLength * 10) / 10,
        medianLength: Math.round(medianLength * 10) / 10,
        mode: Math.round(mode * 10) / 10,
        standardDeviation: Math.round(standardDeviation * 100) / 100,
        bins,
        lengthAtFirstMaturity,
        percentMature: Math.round(percentMature * 10) / 10,
    };
}

/**
 * Estimate length at 50% maturity (Lm50)
 */
function estimateLm50(records: LengthRecord[]): number | undefined {
    const withMaturity = records.filter(r => r.maturity);
    if (withMaturity.length < 10) return undefined;

    // Group by length classes
    const byLength: Record<number, { mature: number; total: number }> = {};

    for (const record of withMaturity) {
        const lengthClass = Math.floor(record.length / 5) * 5;
        if (!byLength[lengthClass]) {
            byLength[lengthClass] = { mature: 0, total: 0 };
        }
        byLength[lengthClass].total++;
        if (record.maturity === 'mature' || record.maturity === 'spawning' || record.maturity === 'spent') {
            byLength[lengthClass].mature++;
        }
    }

    // Find length where ~50% mature
    const sorted = Object.entries(byLength)
        .map(([length, data]) => ({
            length: parseFloat(length),
            propMature: data.mature / data.total,
        }))
        .sort((a, b) => a.length - b.length);

    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].propMature <= 0.5 && sorted[i + 1].propMature >= 0.5) {
            // Linear interpolation
            const x1 = sorted[i].length, y1 = sorted[i].propMature;
            const x2 = sorted[i + 1].length, y2 = sorted[i + 1].propMature;
            return Math.round((x1 + (0.5 - y1) * (x2 - x1) / (y2 - y1)) * 10) / 10;
        }
    }

    return undefined;
}

/**
 * Identify cohorts using modal progression analysis
 */
export function identifyCohorts(
    records: LengthRecord[],
    species: string,
    numCohorts: number = 3
): CohortAnalysis {
    const distribution = calculateLengthDistribution(records, species, 2);

    if (distribution.sampleSize === 0) {
        return {
            species,
            cohorts: [],
            recruitmentIndex: 0,
            spawningStockIndex: 0,
        };
    }

    // Simple peak detection for cohort identification
    const bins = distribution.bins;
    const peaks: Array<{ lengthClass: number; count: number }> = [];

    for (let i = 1; i < bins.length - 1; i++) {
        if (bins[i].count > bins[i - 1].count && bins[i].count > bins[i + 1].count) {
            peaks.push({
                lengthClass: bins[i].lengthClass,
                count: bins[i].count,
            });
        }
    }

    // Sort peaks by count and take top N
    peaks.sort((a, b) => b.count - a.count);
    const topPeaks = peaks.slice(0, numCohorts).sort((a, b) => a.lengthClass - b.lengthClass);

    // Assign approximate ages based on length
    const cohorts = topPeaks.map((peak, index) => ({
        id: index + 1,
        meanLength: peak.lengthClass,
        estimatedAge: index + 1, // Simplified age estimation
        sampleSize: peak.count,
        proportion: peak.count / distribution.sampleSize,
    }));

    // Calculate recruitment index (proportion of small fish)
    const smallFishThreshold = distribution.meanLength * 0.6;
    const smallFish = bins.filter(b => b.lengthClass < smallFishThreshold)
        .reduce((sum, b) => sum + b.count, 0);
    const recruitmentIndex = smallFish / distribution.sampleSize;

    // Calculate spawning stock index (proportion of mature fish)
    const spawningStockIndex = (distribution.percentMature || 0) / 100;

    return {
        species,
        cohorts,
        recruitmentIndex: Math.round(recruitmentIndex * 100) / 100,
        spawningStockIndex: Math.round(spawningStockIndex * 100) / 100,
    };
}

/**
 * Estimate von Bertalanffy growth parameters
 */
export function estimateGrowthParameters(
    records: LengthRecord[]
): GrowthParameters | null {
    // Need age data for proper estimation
    const withAge = records.filter(r => r.age !== undefined && r.age > 0);

    if (withAge.length < 10) {
        // Not enough age data for reliable estimation
        return null;
    }

    const species = withAge[0].species;

    // Ford-Walford plot method for Linf and K estimation
    // Group by age and calculate mean length
    const byAge: Record<number, number[]> = {};
    for (const r of withAge) {
        const age = r.age!;
        if (!byAge[age]) byAge[age] = [];
        byAge[age].push(r.length);
    }

    const ageData = Object.entries(byAge)
        .map(([age, lengths]) => ({
            age: parseInt(age),
            meanLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
        }))
        .sort((a, b) => a.age - b.age);

    if (ageData.length < 3) return null;

    // Estimate Linf from larger fish
    const maxObserved = Math.max(...withAge.map(r => r.length));
    const Linf = maxObserved * 1.05; // Rough estimate

    // Estimate K using linearized von Bertalanffy
    let sumXY = 0, sumX = 0, sumY = 0, sumX2 = 0;
    const n = ageData.length;

    for (const point of ageData) {
        const x = point.age;
        const y = Math.log(1 - point.meanLength / Linf);

        if (isFinite(y)) {
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }
    }

    const K = -((n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX));
    const t0 = (sumY / n) / K - (sumX / n);

    // Growth performance index
    const phi = Math.log10(K) + 2 * Math.log10(Linf);

    return {
        species,
        Linf: Math.round(Linf * 10) / 10,
        K: Math.round(K * 1000) / 1000,
        t0: Math.round(t0 * 100) / 100,
        phi: Math.round(phi * 100) / 100,
        r2: 0.85, // Placeholder - would need proper calculation
    };
}

/**
 * Calculate length-weight relationship
 */
export function calculateLengthWeight(
    records: LengthRecord[],
    species: string
): LengthWeightRelation | null {
    const filtered = records.filter(r =>
        r.species.toLowerCase() === species.toLowerCase() &&
        r.weight !== undefined &&
        r.weight > 0
    );

    if (filtered.length < 10) return null;

    // Log-transform for linear regression: log(W) = log(a) + b*log(L)
    const logData = filtered.map(r => ({
        logL: Math.log(r.length),
        logW: Math.log(r.weight!),
    }));

    const n = logData.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (const point of logData) {
        sumX += point.logL;
        sumY += point.logW;
        sumXY += point.logL * point.logW;
        sumX2 += point.logL * point.logL;
        sumY2 += point.logW * point.logW;
    }

    const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const logA = (sumY - b * sumX) / n;
    const a = Math.exp(logA);

    // Calculate R-squared
    const yMean = sumY / n;
    const ssTotal = sumY2 - n * yMean * yMean;
    const ssRes = sumY2 - logA * sumY - b * sumXY;
    const r2 = 1 - ssRes / ssTotal;

    // Condition factor (Fulton's K)
    const avgWeight = filtered.reduce((sum, r) => sum + r.weight!, 0) / n;
    const avgLength = filtered.reduce((sum, r) => sum + r.length, 0) / n;
    const conditionFactor = (avgWeight * 100) / Math.pow(avgLength, 3);

    return {
        species,
        a: Math.round(a * 10000) / 10000,
        b: Math.round(b * 1000) / 1000,
        r2: Math.round(r2 * 1000) / 1000,
        conditionFactor: Math.round(conditionFactor * 1000) / 1000,
        sampleSize: n,
    };
}

export default {
    calculateLengthDistribution,
    identifyCohorts,
    estimateGrowthParameters,
    calculateLengthWeight,
};
