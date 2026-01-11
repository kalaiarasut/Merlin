/**
 * Taxonomic Assignment Service
 * 
 * Assigns taxonomy to ASVs using reference databases.
 * Integrates with WoRMS for marine species verification.
 */

import logger from '../../utils/logger';
import { ASV } from './asvClustering';
import { taxonomyResolver } from '../taxonomy';

export interface TaxonomicAssignment {
    asvId: string;
    kingdom?: string;
    phylum?: string;
    class?: string;
    order?: string;
    family?: string;
    genus?: string;
    species?: string;
    confidence: number;
    method: 'blast' | 'reference' | 'worms' | 'manual';
    referenceId?: string;
    isMarine?: boolean;
}

export interface AssignmentResult {
    assignments: TaxonomicAssignment[];
    assignedCount: number;
    unassignedCount: number;
    averageConfidence: number;
    taxonomicSummary: {
        kingdoms: Record<string, number>;
        phyla: Record<string, number>;
        families: Record<string, number>;
        species: Record<string, number>;
    };
}

// Common marine marker gene reference sequences (simplified demo)
const REFERENCE_DATABASE: Array<{
    id: string;
    sequence: string;
    taxonomy: Omit<TaxonomicAssignment, 'asvId' | 'confidence' | 'method'>;
}> = [
        {
            id: 'REF_001',
            sequence: 'ATGCGTACGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG',
            taxonomy: {
                kingdom: 'Animalia',
                phylum: 'Chordata',
                class: 'Actinopterygii',
                order: 'Perciformes',
                family: 'Scombridae',
                genus: 'Thunnus',
                species: 'Thunnus albacares',
                isMarine: true,
            },
        },
        {
            id: 'REF_002',
            sequence: 'GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAG',
            taxonomy: {
                kingdom: 'Animalia',
                phylum: 'Chordata',
                class: 'Actinopterygii',
                order: 'Clupeiformes',
                family: 'Clupeidae',
                genus: 'Sardina',
                species: 'Sardina pilchardus',
                isMarine: true,
            },
        },
        {
            id: 'REF_003',
            sequence: 'TACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT',
            taxonomy: {
                kingdom: 'Animalia',
                phylum: 'Chordata',
                class: 'Actinopterygii',
                order: 'Perciformes',
                family: 'Scombridae',
                genus: 'Rastrelliger',
                species: 'Rastrelliger kanagurta',
                isMarine: true,
            },
        },
    ];

/**
 * Calculate k-mer similarity between two sequences
 */
function kmerSimilarity(seq1: string, seq2: string, k: number = 8): number {
    if (seq1.length < k || seq2.length < k) return 0;

    const kmers1 = new Set<string>();
    const kmers2 = new Set<string>();

    for (let i = 0; i <= seq1.length - k; i++) {
        kmers1.add(seq1.slice(i, i + k).toUpperCase());
    }
    for (let i = 0; i <= seq2.length - k; i++) {
        kmers2.add(seq2.slice(i, i + k).toUpperCase());
    }

    const intersection = [...kmers1].filter(kmer => kmers2.has(kmer)).length;
    const union = new Set([...kmers1, ...kmers2]).size;

    return union > 0 ? intersection / union : 0;
}

/**
 * Assign taxonomy to a single ASV using reference database
 */
export async function assignTaxonomy(
    asv: ASV,
    minIdentity: number = 0.80
): Promise<TaxonomicAssignment> {
    let bestMatch: typeof REFERENCE_DATABASE[0] | null = null;
    let bestScore = 0;

    // Search reference database
    for (const ref of REFERENCE_DATABASE) {
        const score = kmerSimilarity(asv.representativeSequence, ref.sequence);
        if (score > bestScore && score >= minIdentity) {
            bestScore = score;
            bestMatch = ref;
        }
    }

    if (bestMatch) {
        // Verify with WoRMS if species-level assignment
        let isMarine = bestMatch.taxonomy.isMarine;
        if (bestMatch.taxonomy.species) {
            try {
                const wormsResult = await taxonomyResolver.resolveTaxon(bestMatch.taxonomy.species);
                if (wormsResult.success && wormsResult.habitat) {
                    isMarine = wormsResult.habitat.isMarine;
                }
            } catch (error) {
                logger.debug(`WoRMS verification skipped for ${bestMatch.taxonomy.species}`);
            }
        }

        return {
            asvId: asv.id,
            ...bestMatch.taxonomy,
            confidence: Math.round(bestScore * 100),
            method: 'reference',
            referenceId: bestMatch.id,
            isMarine,
        };
    }

    // No match found
    return {
        asvId: asv.id,
        confidence: 0,
        method: 'reference',
    };
}

/**
 * Batch assign taxonomy to multiple ASVs
 */
export async function assignTaxonomyBatch(
    asvs: ASV[],
    options: {
        minIdentity?: number;
        verifyWithWorms?: boolean;
    } = {}
): Promise<AssignmentResult> {
    const { minIdentity = 0.80 } = options;

    const assignments: TaxonomicAssignment[] = [];
    let totalConfidence = 0;

    for (const asv of asvs) {
        const assignment = await assignTaxonomy(asv, minIdentity);
        assignments.push(assignment);
        totalConfidence += assignment.confidence;
    }

    const assignedCount = assignments.filter(a => a.confidence > 0).length;

    // Build summary
    const summary = {
        kingdoms: {} as Record<string, number>,
        phyla: {} as Record<string, number>,
        families: {} as Record<string, number>,
        species: {} as Record<string, number>,
    };

    for (const a of assignments) {
        if (a.kingdom) {
            summary.kingdoms[a.kingdom] = (summary.kingdoms[a.kingdom] || 0) + 1;
        }
        if (a.phylum) {
            summary.phyla[a.phylum] = (summary.phyla[a.phylum] || 0) + 1;
        }
        if (a.family) {
            summary.families[a.family] = (summary.families[a.family] || 0) + 1;
        }
        if (a.species) {
            summary.species[a.species] = (summary.species[a.species] || 0) + 1;
        }
    }

    return {
        assignments,
        assignedCount,
        unassignedCount: asvs.length - assignedCount,
        averageConfidence: asvs.length > 0 ? Math.round(totalConfidence / asvs.length) : 0,
        taxonomicSummary: summary,
    };
}

/**
 * Filter assignments by confidence threshold
 */
export function filterByConfidence(
    assignments: TaxonomicAssignment[],
    minConfidence: number = 70
): { high: TaxonomicAssignment[]; low: TaxonomicAssignment[] } {
    return {
        high: assignments.filter(a => a.confidence >= minConfidence),
        low: assignments.filter(a => a.confidence < minConfidence && a.confidence > 0),
    };
}

/**
 * Get LCA (Lowest Common Ancestor) taxonomy for uncertain assignments
 */
export function getLowestCommonAncestor(
    assignments: TaxonomicAssignment[]
): Partial<TaxonomicAssignment> {
    if (assignments.length === 0) return {};
    if (assignments.length === 1) return assignments[0];

    const result: Partial<TaxonomicAssignment> = {};
    const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'] as const;

    for (const rank of ranks) {
        const values = assignments.map(a => a[rank]).filter(Boolean);
        const uniqueValues = [...new Set(values)];

        if (uniqueValues.length === 1) {
            result[rank] = uniqueValues[0];
        } else {
            break; // Stop at first disagreement
        }
    }

    return result;
}

export default {
    assignTaxonomy,
    assignTaxonomyBatch,
    filterByConfidence,
    getLowestCommonAncestor,
};
