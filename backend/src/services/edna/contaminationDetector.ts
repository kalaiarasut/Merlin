/**
 * Contamination Detection Service
 * 
 * Detects potential contamination in eDNA samples based on
 * unexpected taxa, cross-sample patterns, and negative controls.
 */

import logger from '../../utils/logger';
import { ASV } from './asvClustering';
import { TaxonomicAssignment } from './taxonomicAssignment';

export interface ContaminationFlag {
    asvId: string;
    type: 'unexpected_taxa' | 'cross_contamination' | 'negative_control' | 'lab_contaminant' | 'index_bleed';
    severity: 'low' | 'medium' | 'high';
    confidence: number;
    reason: string;
    recommendation: string;
}

export interface ContaminationReport {
    sampleId: string;
    totalASVs: number;
    flaggedASVs: number;
    flags: ContaminationFlag[];
    contaminationScore: number; // 0-100, 0 = clean
    summary: {
        unexpectedTaxa: number;
        crossContamination: number;
        labContaminants: number;
        indexBleed: number;
    };
    isClean: boolean;
}

// Known lab contaminant sequences (simplified)
const LAB_CONTAMINANTS: string[] = [
    'HUMAN',
    'Homo sapiens',
    'Escherichia coli',
    'Staphylococcus',
    'Bacillus',
    'Pseudomonas',
];

// Unexpected taxa for marine samples
const NON_MARINE_TAXA: string[] = [
    'Mammalia',
    'Aves',
    'Insecta',
    'Arachnida',
    'Reptilia',
];

// Common primer/adapter sequences to detect
const ADAPTER_SEQUENCES: string[] = [
    'AGATCGGAAGAGC', // Illumina adapter
    'CTGTCTCTTATA',  // Nextera
    'TCGTCGGCAGCGT', // Illumina forward
];

/**
 * Check if ASV is a potential lab contaminant
 */
function checkLabContaminant(
    asv: ASV,
    taxonomy?: TaxonomicAssignment
): ContaminationFlag | null {
    if (!taxonomy) return null;

    const species = taxonomy.species || '';
    const genus = taxonomy.genus || '';

    for (const contaminant of LAB_CONTAMINANTS) {
        if (species.includes(contaminant) || genus.includes(contaminant)) {
            return {
                asvId: asv.id,
                type: 'lab_contaminant',
                severity: 'high',
                confidence: 95,
                reason: `Detected common lab contaminant: ${contaminant}`,
                recommendation: 'Exclude from analysis or verify with negative controls',
            };
        }
    }

    return null;
}

/**
 * Check for unexpected taxa in marine samples
 */
function checkUnexpectedTaxa(
    asv: ASV,
    taxonomy?: TaxonomicAssignment,
    expectedEnvironment: 'marine' | 'freshwater' | 'terrestrial' = 'marine'
): ContaminationFlag | null {
    if (!taxonomy) return null;

    if (expectedEnvironment === 'marine') {
        // Check if non-marine class detected
        const taxonClass = taxonomy.class || '';
        for (const nonMarine of NON_MARINE_TAXA) {
            if (taxonClass.includes(nonMarine)) {
                return {
                    asvId: asv.id,
                    type: 'unexpected_taxa',
                    severity: 'medium',
                    confidence: 80,
                    reason: `Non-marine taxa detected in marine sample: ${taxonClass}`,
                    recommendation: 'Verify sample handling or exclude if unexpected',
                };
            }
        }

        // Check isMarine flag from taxonomy
        if (taxonomy.isMarine === false) {
            return {
                asvId: asv.id,
                type: 'unexpected_taxa',
                severity: 'medium',
                confidence: 75,
                reason: `Non-marine species detected: ${taxonomy.species || taxonomy.genus}`,
                recommendation: 'Review sample composition or exclude non-target species',
            };
        }
    }

    return null;
}

/**
 * Check for adapter/primer sequences in ASV
 */
function checkAdapterContamination(asv: ASV): ContaminationFlag | null {
    for (const adapter of ADAPTER_SEQUENCES) {
        if (asv.representativeSequence.includes(adapter)) {
            return {
                asvId: asv.id,
                type: 'lab_contaminant',
                severity: 'high',
                confidence: 99,
                reason: 'Adapter sequence detected in ASV',
                recommendation: 'Re-run quality filtering with adapter trimming',
            };
        }
    }

    return null;
}

/**
 * Detect cross-contamination using negative controls
 */
function checkNegativeControlContamination(
    asv: ASV,
    negativeControlASVs: Set<string>
): ContaminationFlag | null {
    if (negativeControlASVs.has(asv.representativeSequence)) {
        return {
            asvId: asv.id,
            type: 'negative_control',
            severity: 'high',
            confidence: 90,
            reason: 'ASV present in negative control sample',
            recommendation: 'Exclude from analysis - likely environmental contamination',
        };
    }

    return null;
}

/**
 * Detect potential index bleed (cross-sample contamination)
 */
function checkIndexBleed(
    asv: ASV,
    allSampleAbundances: Record<string, number>,
    threshold: number = 0.001 // 0.1% of dominant sample
): ContaminationFlag | null {
    const abundances = Object.values(allSampleAbundances);
    if (abundances.length < 2) return null;

    const max = Math.max(...abundances);
    const total = abundances.reduce((a, b) => a + b, 0);

    // Check if this ASV appears as very low abundance in multiple samples
    const lowAbundanceSamples = abundances.filter(a => a > 0 && a < max * threshold).length;

    if (lowAbundanceSamples > 1 && max > 100) {
        return {
            asvId: asv.id,
            type: 'index_bleed',
            severity: 'low',
            confidence: 60,
            reason: `ASV appears at very low abundance in ${lowAbundanceSamples} samples - possible index bleed`,
            recommendation: 'Review sample indices or apply abundance threshold',
        };
    }

    return null;
}

/**
 * Run full contamination analysis on a sample
 */
export function analyzeContamination(
    sampleId: string,
    asvs: ASV[],
    taxonomyAssignments?: Map<string, TaxonomicAssignment>,
    options: {
        negativeControlSequences?: Set<string>;
        expectedEnvironment?: 'marine' | 'freshwater' | 'terrestrial';
        indexBleedThreshold?: number;
    } = {}
): ContaminationReport {
    const {
        negativeControlSequences = new Set(),
        expectedEnvironment = 'marine',
        indexBleedThreshold = 0.001,
    } = options;

    const flags: ContaminationFlag[] = [];
    const summary = {
        unexpectedTaxa: 0,
        crossContamination: 0,
        labContaminants: 0,
        indexBleed: 0,
    };

    for (const asv of asvs) {
        const taxonomy = taxonomyAssignments?.get(asv.id);

        // Check various contamination types
        const labFlag = checkLabContaminant(asv, taxonomy);
        if (labFlag) {
            flags.push(labFlag);
            summary.labContaminants++;
        }

        const unexpectedFlag = checkUnexpectedTaxa(asv, taxonomy, expectedEnvironment);
        if (unexpectedFlag) {
            flags.push(unexpectedFlag);
            summary.unexpectedTaxa++;
        }

        const adapterFlag = checkAdapterContamination(asv);
        if (adapterFlag) {
            flags.push(adapterFlag);
            summary.labContaminants++;
        }

        const ncFlag = checkNegativeControlContamination(asv, negativeControlSequences);
        if (ncFlag) {
            flags.push(ncFlag);
            summary.crossContamination++;
        }

        const indexFlag = checkIndexBleed(asv, asv.abundance, indexBleedThreshold);
        if (indexFlag) {
            flags.push(indexFlag);
            summary.indexBleed++;
        }
    }

    // Calculate contamination score
    const highSeverity = flags.filter(f => f.severity === 'high').length;
    const mediumSeverity = flags.filter(f => f.severity === 'medium').length;
    const lowSeverity = flags.filter(f => f.severity === 'low').length;

    const contaminationScore = Math.min(100,
        (highSeverity * 20) + (mediumSeverity * 5) + (lowSeverity * 1)
    );

    return {
        sampleId,
        totalASVs: asvs.length,
        flaggedASVs: flags.length,
        flags,
        contaminationScore,
        summary,
        isClean: contaminationScore < 10,
    };
}

/**
 * Filter out contaminated ASVs
 */
export function removeContaminants(
    asvs: ASV[],
    report: ContaminationReport,
    minSeverity: 'low' | 'medium' | 'high' = 'high'
): { cleaned: ASV[]; removed: string[] } {
    const severityRank = { low: 1, medium: 2, high: 3 };
    const minRank = severityRank[minSeverity];

    const asvIdsToRemove = new Set(
        report.flags
            .filter(f => severityRank[f.severity] >= minRank)
            .map(f => f.asvId)
    );

    return {
        cleaned: asvs.filter(a => !asvIdsToRemove.has(a.id)),
        removed: [...asvIdsToRemove],
    };
}

export default {
    analyzeContamination,
    removeContaminants,
};
