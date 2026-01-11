/**
 * eDNA Quality Filter Service
 * 
 * Provides quality control and filtering for eDNA sequence data.
 * Includes Phred score filtering, read trimming, and quality metrics.
 */

import logger from '../../utils/logger';

// Quality thresholds
const DEFAULT_MIN_PHRED = 20; // Q20 = 1% error rate
const DEFAULT_MIN_LENGTH = 100;
const DEFAULT_MAX_N_RATIO = 0.1; // Max 10% ambiguous bases

export interface QualityMetrics {
    totalReads: number;
    passedReads: number;
    failedReads: number;
    passRate: number;
    averageQuality: number;
    averageLength: number;
    gcContent: number;
    nContent: number;
    qualityDistribution: Record<string, number>;
    lengthDistribution: Record<string, number>;
}

export interface SequenceRead {
    id: string;
    sequence: string;
    quality?: string; // Phred scores as ASCII
    metadata?: Record<string, any>;
}

export interface FilteredResult {
    passed: SequenceRead[];
    failed: SequenceRead[];
    metrics: QualityMetrics;
}

export interface FilterOptions {
    minPhred?: number;
    minLength?: number;
    maxLength?: number;
    maxNRatio?: number;
    trimFront?: number;
    trimTail?: number;
    slidingWindow?: {
        size: number;
        threshold: number;
    };
}

/**
 * Convert Phred ASCII to quality score
 */
function phredToScore(char: string): number {
    return char.charCodeAt(0) - 33;
}

/**
 * Calculate average Phred score for a quality string
 */
function calculateAveragePhred(qualityString: string): number {
    if (!qualityString) return 0;
    const scores = qualityString.split('').map(phredToScore);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Calculate GC content of a sequence
 */
function calculateGCContent(sequence: string): number {
    const gc = (sequence.match(/[GC]/gi) || []).length;
    return gc / sequence.length;
}

/**
 * Calculate N (ambiguous base) content
 */
function calculateNContent(sequence: string): number {
    const n = (sequence.match(/N/gi) || []).length;
    return n / sequence.length;
}

/**
 * Trim sequence based on quality using sliding window
 */
function trimByQuality(
    sequence: string,
    quality: string,
    windowSize: number = 4,
    threshold: number = 20
): { sequence: string; quality: string } {
    if (!quality) return { sequence, quality };

    let start = 0;
    let end = sequence.length;

    // Trim from start
    for (let i = 0; i <= sequence.length - windowSize; i++) {
        const windowQuality = quality.slice(i, i + windowSize);
        const avgScore = calculateAveragePhred(windowQuality);
        if (avgScore >= threshold) {
            start = i;
            break;
        }
    }

    // Trim from end
    for (let i = sequence.length - windowSize; i >= 0; i--) {
        const windowQuality = quality.slice(i, i + windowSize);
        const avgScore = calculateAveragePhred(windowQuality);
        if (avgScore >= threshold) {
            end = i + windowSize;
            break;
        }
    }

    return {
        sequence: sequence.slice(start, end),
        quality: quality.slice(start, end),
    };
}

/**
 * Filter a single sequence read
 */
export function filterRead(
    read: SequenceRead,
    options: FilterOptions = {}
): { passed: boolean; read: SequenceRead; reason?: string } {
    const {
        minPhred = DEFAULT_MIN_PHRED,
        minLength = DEFAULT_MIN_LENGTH,
        maxLength = 10000,
        maxNRatio = DEFAULT_MAX_N_RATIO,
        trimFront = 0,
        trimTail = 0,
        slidingWindow,
    } = options;

    let { sequence, quality } = read;

    // Apply front/tail trimming
    if (trimFront > 0 || trimTail > 0) {
        const end = sequence.length - trimTail;
        sequence = sequence.slice(trimFront, end);
        if (quality) {
            quality = quality.slice(trimFront, end);
        }
    }

    // Apply sliding window quality trimming
    if (slidingWindow && quality) {
        const trimmed = trimByQuality(sequence, quality, slidingWindow.size, slidingWindow.threshold);
        sequence = trimmed.sequence;
        quality = trimmed.quality;
    }

    const processedRead: SequenceRead = {
        ...read,
        sequence,
        quality,
    };

    // Check minimum length
    if (sequence.length < minLength) {
        return { passed: false, read: processedRead, reason: 'Too short' };
    }

    // Check maximum length
    if (sequence.length > maxLength) {
        return { passed: false, read: processedRead, reason: 'Too long' };
    }

    // Check N content
    const nRatio = calculateNContent(sequence);
    if (nRatio > maxNRatio) {
        return { passed: false, read: processedRead, reason: 'High N content' };
    }

    // Check quality score
    if (quality) {
        const avgPhred = calculateAveragePhred(quality);
        if (avgPhred < minPhred) {
            return { passed: false, read: processedRead, reason: 'Low quality' };
        }
    }

    return { passed: true, read: processedRead };
}

/**
 * Filter a batch of sequence reads
 */
export function filterReads(
    reads: SequenceRead[],
    options: FilterOptions = {}
): FilteredResult {
    const passed: SequenceRead[] = [];
    const failed: SequenceRead[] = [];
    let totalQuality = 0;
    let totalLength = 0;
    let totalGC = 0;
    let totalN = 0;

    const qualityBins: Record<string, number> = {
        'Q0-10': 0,
        'Q10-20': 0,
        'Q20-30': 0,
        'Q30-40': 0,
        'Q40+': 0,
    };

    const lengthBins: Record<string, number> = {
        '0-100': 0,
        '100-200': 0,
        '200-300': 0,
        '300-500': 0,
        '500+': 0,
    };

    for (const read of reads) {
        const result = filterRead(read, options);

        if (result.passed) {
            passed.push(result.read);
        } else {
            failed.push(result.read);
        }

        // Calculate metrics
        const seq = result.read.sequence;
        totalLength += seq.length;
        totalGC += calculateGCContent(seq);
        totalN += calculateNContent(seq);

        // Length distribution
        if (seq.length < 100) lengthBins['0-100']++;
        else if (seq.length < 200) lengthBins['100-200']++;
        else if (seq.length < 300) lengthBins['200-300']++;
        else if (seq.length < 500) lengthBins['300-500']++;
        else lengthBins['500+']++;

        // Quality distribution
        if (result.read.quality) {
            const avgQ = calculateAveragePhred(result.read.quality);
            totalQuality += avgQ;

            if (avgQ < 10) qualityBins['Q0-10']++;
            else if (avgQ < 20) qualityBins['Q10-20']++;
            else if (avgQ < 30) qualityBins['Q20-30']++;
            else if (avgQ < 40) qualityBins['Q30-40']++;
            else qualityBins['Q40+']++;
        }
    }

    const total = reads.length;

    return {
        passed,
        failed,
        metrics: {
            totalReads: total,
            passedReads: passed.length,
            failedReads: failed.length,
            passRate: total > 0 ? (passed.length / total) * 100 : 0,
            averageQuality: total > 0 ? totalQuality / total : 0,
            averageLength: total > 0 ? totalLength / total : 0,
            gcContent: total > 0 ? (totalGC / total) * 100 : 0,
            nContent: total > 0 ? (totalN / total) * 100 : 0,
            qualityDistribution: qualityBins,
            lengthDistribution: lengthBins,
        },
    };
}

/**
 * Generate quality report for sequences
 */
export function generateQualityReport(reads: SequenceRead[]): QualityMetrics {
    return filterReads(reads, { minPhred: 0, minLength: 0 }).metrics;
}

/**
 * Parse FASTQ format string into reads
 */
export function parseFastq(content: string): SequenceRead[] {
    const reads: SequenceRead[] = [];
    const lines = content.split('\n').filter(l => l.trim());

    for (let i = 0; i < lines.length; i += 4) {
        if (lines[i]?.startsWith('@')) {
            reads.push({
                id: lines[i].slice(1).split(' ')[0],
                sequence: lines[i + 1] || '',
                quality: lines[i + 3] || '',
            });
        }
    }

    return reads;
}

/**
 * Parse FASTA format string into reads
 */
export function parseFasta(content: string): SequenceRead[] {
    const reads: SequenceRead[] = [];
    const entries = content.split('>').filter(e => e.trim());

    for (const entry of entries) {
        const lines = entry.split('\n');
        const id = lines[0].split(' ')[0];
        const sequence = lines.slice(1).join('').replace(/\s/g, '');
        reads.push({ id, sequence });
    }

    return reads;
}

export default {
    filterRead,
    filterReads,
    generateQualityReport,
    parseFastq,
    parseFasta,
    calculateGCContent,
    calculateNContent,
    calculateAveragePhred,
};
