/**
 * eDNA Diversity Calculator
 * 
 * Calculates alpha and beta diversity indices for eDNA data.
 * Implements Shannon, Simpson, Bray-Curtis, and rarefaction analysis.
 */

import logger from '../../utils/logger';

// Sample abundance data: species name -> read count
export type AbundanceData = Record<string, number>;

// Multiple samples for beta diversity
export type SampleSet = Record<string, AbundanceData>;

export interface AlphaDiversityResult {
    sampleId: string;
    richness: number;          // Number of species
    shannon: number;           // Shannon index (H')
    simpson: number;           // Simpson index (D)
    inverseSimpson: number;    // Inverse Simpson (1/D)
    evenness: number;          // Pielou's evenness
    dominance: number;         // Berger-Parker dominance
    chao1: number;             // Chao1 estimator
    totalReads: number;
}

export interface BetaDiversityResult {
    sample1: string;
    sample2: string;
    brayCurtis: number;        // Bray-Curtis dissimilarity (0-1)
    jaccard: number;           // Jaccard distance (0-1)
    sorensen: number;          // Sørensen index
    sharedSpecies: number;
    uniqueToSample1: number;
    uniqueToSample2: number;
}

export interface RarefactionPoint {
    depth: number;
    richness: number;
    standardError: number;
}

export interface RarefactionCurve {
    sampleId: string;
    points: RarefactionPoint[];
    estimatedRichness: number;
    saturationReached: boolean;
}

/**
 * Calculate Shannon diversity index (H')
 * H' = -Σ(pi * ln(pi))
 */
export function calculateShannon(abundances: AbundanceData): number {
    const total = Object.values(abundances).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    let shannon = 0;
    for (const count of Object.values(abundances)) {
        if (count > 0) {
            const p = count / total;
            shannon -= p * Math.log(p);
        }
    }

    return shannon;
}

/**
 * Calculate Simpson diversity index (D)
 * D = Σ(pi^2)
 */
export function calculateSimpson(abundances: AbundanceData): number {
    const total = Object.values(abundances).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    let simpson = 0;
    for (const count of Object.values(abundances)) {
        if (count > 0) {
            const p = count / total;
            simpson += p * p;
        }
    }

    return simpson;
}

/**
 * Calculate Pielou's evenness (J')
 * J' = H' / ln(S)
 */
export function calculateEvenness(shannon: number, richness: number): number {
    if (richness <= 1) return 0;
    return shannon / Math.log(richness);
}

/**
 * Calculate Berger-Parker dominance index
 * d = Nmax / N
 */
export function calculateDominance(abundances: AbundanceData): number {
    const total = Object.values(abundances).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    const maxAbundance = Math.max(...Object.values(abundances));
    return maxAbundance / total;
}

/**
 * Calculate Chao1 estimator for species richness
 * Chao1 = S + (f1^2 / 2*f2)
 * where f1 = singletons, f2 = doubletons
 */
export function calculateChao1(abundances: AbundanceData): number {
    const richness = Object.keys(abundances).length;
    const counts = Object.values(abundances);

    const singletons = counts.filter(c => c === 1).length;
    const doubletons = counts.filter(c => c === 2).length;

    if (doubletons === 0) {
        // If no doubletons, use modified estimator
        return richness + (singletons * (singletons - 1)) / 2;
    }

    return richness + (singletons * singletons) / (2 * doubletons);
}

/**
 * Calculate all alpha diversity indices for a sample
 */
export function calculateAlphaDiversity(
    sampleId: string,
    abundances: AbundanceData
): AlphaDiversityResult {
    const richness = Object.keys(abundances).filter(k => abundances[k] > 0).length;
    const totalReads = Object.values(abundances).reduce((a, b) => a + b, 0);
    const shannon = calculateShannon(abundances);
    const simpson = calculateSimpson(abundances);

    return {
        sampleId,
        richness,
        shannon,
        simpson,
        inverseSimpson: simpson > 0 ? 1 / simpson : 0,
        evenness: calculateEvenness(shannon, richness),
        dominance: calculateDominance(abundances),
        chao1: calculateChao1(abundances),
        totalReads,
    };
}

/**
 * Calculate Bray-Curtis dissimilarity between two samples
 * BC = 1 - (2 * Cij / (Si + Sj))
 * where Cij = sum of minimum abundances
 */
export function calculateBrayCurtis(
    sample1: AbundanceData,
    sample2: AbundanceData
): number {
    const allSpecies = new Set([...Object.keys(sample1), ...Object.keys(sample2)]);

    let sumMin = 0;
    let sum1 = 0;
    let sum2 = 0;

    for (const species of allSpecies) {
        const count1 = sample1[species] || 0;
        const count2 = sample2[species] || 0;

        sumMin += Math.min(count1, count2);
        sum1 += count1;
        sum2 += count2;
    }

    if (sum1 + sum2 === 0) return 0;

    return 1 - (2 * sumMin) / (sum1 + sum2);
}

/**
 * Calculate Jaccard similarity/distance
 * J = |A ∩ B| / |A ∪ B|
 */
export function calculateJaccard(
    sample1: AbundanceData,
    sample2: AbundanceData
): number {
    const species1 = new Set(Object.keys(sample1).filter(k => sample1[k] > 0));
    const species2 = new Set(Object.keys(sample2).filter(k => sample2[k] > 0));

    const intersection = [...species1].filter(s => species2.has(s)).length;
    const union = new Set([...species1, ...species2]).size;

    if (union === 0) return 0;

    return 1 - (intersection / union); // Return distance, not similarity
}

/**
 * Calculate Sørensen index
 */
export function calculateSorensen(
    sample1: AbundanceData,
    sample2: AbundanceData
): number {
    const species1 = new Set(Object.keys(sample1).filter(k => sample1[k] > 0));
    const species2 = new Set(Object.keys(sample2).filter(k => sample2[k] > 0));

    const intersection = [...species1].filter(s => species2.has(s)).length;

    if (species1.size + species2.size === 0) return 0;

    return (2 * intersection) / (species1.size + species2.size);
}

/**
 * Calculate beta diversity between two samples
 */
export function calculateBetaDiversity(
    sample1Id: string,
    sample1: AbundanceData,
    sample2Id: string,
    sample2: AbundanceData
): BetaDiversityResult {
    const species1 = new Set(Object.keys(sample1).filter(k => sample1[k] > 0));
    const species2 = new Set(Object.keys(sample2).filter(k => sample2[k] > 0));

    const shared = [...species1].filter(s => species2.has(s)).length;

    return {
        sample1: sample1Id,
        sample2: sample2Id,
        brayCurtis: calculateBrayCurtis(sample1, sample2),
        jaccard: calculateJaccard(sample1, sample2),
        sorensen: calculateSorensen(sample1, sample2),
        sharedSpecies: shared,
        uniqueToSample1: species1.size - shared,
        uniqueToSample2: species2.size - shared,
    };
}

/**
 * Calculate pairwise beta diversity matrix
 */
export function calculateBetaDiversityMatrix(
    samples: SampleSet
): BetaDiversityResult[] {
    const results: BetaDiversityResult[] = [];
    const sampleIds = Object.keys(samples);

    for (let i = 0; i < sampleIds.length; i++) {
        for (let j = i + 1; j < sampleIds.length; j++) {
            results.push(calculateBetaDiversity(
                sampleIds[i],
                samples[sampleIds[i]],
                sampleIds[j],
                samples[sampleIds[j]]
            ));
        }
    }

    return results;
}

/**
 * Generate rarefaction curve for a sample
 * Uses random subsampling to estimate richness at different sequencing depths
 */
export function generateRarefactionCurve(
    sampleId: string,
    abundances: AbundanceData,
    steps: number = 20,
    iterations: number = 10
): RarefactionCurve {
    const totalReads = Object.values(abundances).reduce((a, b) => a + b, 0);

    if (totalReads === 0) {
        return {
            sampleId,
            points: [],
            estimatedRichness: 0,
            saturationReached: false,
        };
    }

    // Create pool of reads for subsampling
    const readPool: string[] = [];
    for (const [species, count] of Object.entries(abundances)) {
        for (let i = 0; i < count; i++) {
            readPool.push(species);
        }
    }

    const points: RarefactionPoint[] = [];
    const stepSize = Math.max(1, Math.floor(totalReads / steps));

    for (let depth = stepSize; depth <= totalReads; depth += stepSize) {
        const richnessValues: number[] = [];

        for (let iter = 0; iter < iterations; iter++) {
            // Random subsample
            const subsample = shuffleArray([...readPool]).slice(0, depth);
            const uniqueSpecies = new Set(subsample);
            richnessValues.push(uniqueSpecies.size);
        }

        const mean = richnessValues.reduce((a, b) => a + b, 0) / richnessValues.length;
        const variance = richnessValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / richnessValues.length;

        points.push({
            depth,
            richness: Math.round(mean * 100) / 100,
            standardError: Math.sqrt(variance / iterations),
        });
    }

    // Check if saturation is reached (last few points are similar)
    const lastPoints = points.slice(-3);
    const saturationReached = lastPoints.length >= 3 &&
        lastPoints.every((p, i) => i === 0 || Math.abs(p.richness - lastPoints[i - 1].richness) < 1);

    return {
        sampleId,
        points,
        estimatedRichness: calculateChao1(abundances),
        saturationReached,
    };
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Convert ASV table to abundance data
 */
export function asvTableToAbundance(
    asvTable: Array<{ asvId: string; taxonomy?: string; samples: Record<string, number> }>
): SampleSet {
    const samples: SampleSet = {};

    for (const asv of asvTable) {
        const species = asv.taxonomy || asv.asvId;

        for (const [sampleId, count] of Object.entries(asv.samples)) {
            if (!samples[sampleId]) {
                samples[sampleId] = {};
            }
            samples[sampleId][species] = (samples[sampleId][species] || 0) + count;
        }
    }

    return samples;
}

export default {
    calculateShannon,
    calculateSimpson,
    calculateEvenness,
    calculateDominance,
    calculateChao1,
    calculateAlphaDiversity,
    calculateBrayCurtis,
    calculateJaccard,
    calculateSorensen,
    calculateBetaDiversity,
    calculateBetaDiversityMatrix,
    generateRarefactionCurve,
    asvTableToAbundance,
};
