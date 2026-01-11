/**
 * ASV/OTU Clustering Service
 * 
 * Implements clustering algorithms for eDNA amplicon sequences.
 * Groups similar sequences into Amplicon Sequence Variants (ASVs)
 * or Operational Taxonomic Units (OTUs).
 */

import logger from '../../utils/logger';
import { SequenceRead } from './qualityFilter';

export interface ASV {
    id: string;
    representativeSequence: string;
    memberCount: number;
    totalReads: number;
    members: string[]; // IDs of member sequences
    abundance: Record<string, number>; // sample -> count
}

export interface ClusteringResult {
    asvs: ASV[];
    totalSequences: number;
    totalASVs: number;
    clusteringMethod: 'unoise' | 'swarm' | 'vsearch' | 'simple';
    similarityThreshold: number;
    singletons: number;
    stats: {
        averageClusterSize: number;
        maxClusterSize: number;
        minClusterSize: number;
    };
}

export interface ClusteringOptions {
    method?: 'unoise' | 'swarm' | 'vsearch' | 'simple';
    similarityThreshold?: number; // 0.97 for OTU, 1.0 for exact ASV
    minAbundance?: number; // Minimum reads to form ASV
    removeSingletons?: boolean;
}

/**
 * Calculate sequence identity between two sequences
 * Uses simple alignment-free method for speed
 */
function calculateIdentity(seq1: string, seq2: string): number {
    if (seq1.length === 0 || seq2.length === 0) return 0;

    // Use k-mer based similarity for speed
    const k = 8;
    const kmers1 = new Set<string>();
    const kmers2 = new Set<string>();

    for (let i = 0; i <= seq1.length - k; i++) {
        kmers1.add(seq1.slice(i, i + k));
    }
    for (let i = 0; i <= seq2.length - k; i++) {
        kmers2.add(seq2.slice(i, i + k));
    }

    const intersection = [...kmers1].filter(kmer => kmers2.has(kmer)).length;
    const union = new Set([...kmers1, ...kmers2]).size;

    return union > 0 ? intersection / union : 0;
}

/**
 * Simple greedy clustering algorithm
 * Similar to USEARCH clustering
 */
export function clusterSequences(
    reads: SequenceRead[],
    options: ClusteringOptions = {}
): ClusteringResult {
    const {
        method = 'simple',
        similarityThreshold = 0.97,
        minAbundance = 2,
        removeSingletons = false,
    } = options;

    // Sort by abundance (assuming duplicates are pre-counted)
    const sequenceCounts: Record<string, { sequence: string; count: number; ids: string[] }> = {};

    for (const read of reads) {
        if (sequenceCounts[read.sequence]) {
            sequenceCounts[read.sequence].count++;
            sequenceCounts[read.sequence].ids.push(read.id);
        } else {
            sequenceCounts[read.sequence] = {
                sequence: read.sequence,
                count: 1,
                ids: [read.id],
            };
        }
    }

    // Sort unique sequences by abundance
    const sortedSeqs = Object.values(sequenceCounts)
        .sort((a, b) => b.count - a.count);

    const asvs: ASV[] = [];
    const assigned = new Set<string>();
    let asvCounter = 0;

    for (const seqData of sortedSeqs) {
        if (assigned.has(seqData.sequence)) continue;
        if (seqData.count < minAbundance && minAbundance > 1) continue;

        // This becomes a centroid
        asvCounter++;
        const asv: ASV = {
            id: `ASV_${asvCounter.toString().padStart(4, '0')}`,
            representativeSequence: seqData.sequence,
            memberCount: 1,
            totalReads: seqData.count,
            members: [...seqData.ids],
            abundance: {},
        };

        assigned.add(seqData.sequence);

        // Find similar sequences
        for (const otherSeq of sortedSeqs) {
            if (assigned.has(otherSeq.sequence)) continue;

            const identity = calculateIdentity(seqData.sequence, otherSeq.sequence);

            if (identity >= similarityThreshold) {
                asv.memberCount++;
                asv.totalReads += otherSeq.count;
                asv.members.push(...otherSeq.ids);
                assigned.add(otherSeq.sequence);
            }
        }

        asvs.push(asv);
    }

    // Filter singletons if requested
    let finalAsvs = asvs;
    let singletons = asvs.filter(a => a.totalReads === 1).length;

    if (removeSingletons) {
        finalAsvs = asvs.filter(a => a.totalReads > 1);
    }

    // Calculate stats
    const clusterSizes = finalAsvs.map(a => a.totalReads);

    return {
        asvs: finalAsvs,
        totalSequences: reads.length,
        totalASVs: finalAsvs.length,
        clusteringMethod: method,
        similarityThreshold,
        singletons,
        stats: {
            averageClusterSize: clusterSizes.length > 0
                ? clusterSizes.reduce((a, b) => a + b, 0) / clusterSizes.length
                : 0,
            maxClusterSize: clusterSizes.length > 0 ? Math.max(...clusterSizes) : 0,
            minClusterSize: clusterSizes.length > 0 ? Math.min(...clusterSizes) : 0,
        },
    };
}

/**
 * Dereplicate sequences (exact matching)
 * Groups identical sequences together
 */
export function dereplicateSequences(
    reads: SequenceRead[]
): { unique: Map<string, SequenceRead[]>; stats: { total: number; unique: number; duplicateRate: number } } {
    const unique = new Map<string, SequenceRead[]>();

    for (const read of reads) {
        const existing = unique.get(read.sequence);
        if (existing) {
            existing.push(read);
        } else {
            unique.set(read.sequence, [read]);
        }
    }

    const total = reads.length;
    const uniqueCount = unique.size;

    return {
        unique,
        stats: {
            total,
            unique: uniqueCount,
            duplicateRate: total > 0 ? ((total - uniqueCount) / total) * 100 : 0,
        },
    };
}

/**
 * Convert ASVs to abundance table
 */
export function createAbundanceTable(
    asvs: ASV[],
    sampleMapping?: Map<string, string> // read ID -> sample ID
): { table: Array<{ asvId: string; sequence: string; samples: Record<string, number> }>; sampleIds: string[] } {

    // If no sample mapping, use a default sample
    const defaultSample = 'sample_1';
    const sampleSet = new Set<string>();

    const table = asvs.map(asv => {
        const samples: Record<string, number> = {};

        for (const memberId of asv.members) {
            const sampleId = sampleMapping?.get(memberId) || defaultSample;
            samples[sampleId] = (samples[sampleId] || 0) + 1;
            sampleSet.add(sampleId);
        }

        return {
            asvId: asv.id,
            sequence: asv.representativeSequence,
            samples,
        };
    });

    return {
        table,
        sampleIds: [...sampleSet].sort(),
    };
}

/**
 * Filter ASVs by various criteria
 */
export function filterASVs(
    asvs: ASV[],
    options: {
        minReads?: number;
        minSamples?: number;
        maxReads?: number;
        minLength?: number;
        maxLength?: number;
    } = {}
): { filtered: ASV[]; removed: number } {
    const {
        minReads = 0,
        minSamples = 0,
        maxReads = Infinity,
        minLength = 0,
        maxLength = Infinity,
    } = options;

    const filtered = asvs.filter(asv => {
        if (asv.totalReads < minReads) return false;
        if (asv.totalReads > maxReads) return false;
        if (asv.representativeSequence.length < minLength) return false;
        if (asv.representativeSequence.length > maxLength) return false;

        if (minSamples > 0) {
            const sampleCount = Object.keys(asv.abundance).length;
            if (sampleCount < minSamples) return false;
        }

        return true;
    });

    return {
        filtered,
        removed: asvs.length - filtered.length,
    };
}

export default {
    clusterSequences,
    dereplicateSequences,
    createAbundanceTable,
    filterASVs,
    calculateIdentity,
};
