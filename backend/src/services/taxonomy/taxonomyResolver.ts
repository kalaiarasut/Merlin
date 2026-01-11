/**
 * Taxonomy Resolver Service
 * 
 * Combined taxonomy resolution using WoRMS (primary) and ITIS (fallback).
 * Provides unified API for resolving scientific names to authoritative
 * taxonomy with persistent IDs.
 */

import * as wormsService from './wormsService';
import * as itisService from './itisService';
import { TaxonomyResult } from './wormsService';
import logger from '../../utils/logger';

export interface BatchResolutionResult {
    total: number;
    resolved: number;
    unresolved: number;
    results: TaxonomyResult[];
    summary: {
        wormsMatches: number;
        itisMatches: number;
        noMatches: number;
        synonymsFound: number;
        averageConfidence: number;
    };
}

export interface TaxonomyValidationResult {
    valid: boolean;
    originalName: string;
    resolvedName?: string;
    taxonId?: string;
    source?: string;
    isMarine?: boolean;
    confidence: number;
    issues: string[];
}

/**
 * Resolve a single scientific name using WoRMS first, then ITIS fallback
 */
export async function resolveTaxon(scientificName: string): Promise<TaxonomyResult> {
    if (!scientificName || scientificName.trim() === '') {
        return {
            success: false,
            source: 'unknown',
            originalName: scientificName,
            isSynonym: false,
            confidence: 0,
            error: 'Empty scientific name provided',
        };
    }

    const cleanName = scientificName.trim();

    // Try WoRMS first (primary authority for marine species)
    logger.debug(`Resolving taxonomy for: ${cleanName}`);

    try {
        const wormsResult = await wormsService.resolveTaxon(cleanName);

        if (wormsResult.success && wormsResult.confidence >= 50) {
            logger.debug(`WoRMS match found for "${cleanName}" (confidence: ${wormsResult.confidence}%)`);
            return wormsResult;
        }

        // If WoRMS didn't find a good match, try ITIS
        logger.debug(`WoRMS no match for "${cleanName}", trying ITIS...`);

        const itisResult = await itisService.resolveTaxon(cleanName);

        if (itisResult.success) {
            logger.debug(`ITIS match found for "${cleanName}" (confidence: ${itisResult.confidence}%)`);
            return itisResult;
        }

        // If neither found a match, return the WoRMS result (better error message)
        return wormsResult;

    } catch (error: any) {
        logger.error(`Taxonomy resolution failed for "${cleanName}": ${error.message}`);
        return {
            success: false,
            source: 'unknown',
            originalName: cleanName,
            isSynonym: false,
            confidence: 0,
            error: error.message || 'Resolution failed',
        };
    }
}

/**
 * Batch resolve multiple names with progress tracking
 */
export async function batchResolveTaxons(
    names: string[],
    onProgress?: (current: number, total: number) => void
): Promise<BatchResolutionResult> {
    const results: TaxonomyResult[] = [];
    let wormsMatches = 0;
    let itisMatches = 0;
    let synonymsFound = 0;
    let totalConfidence = 0;

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const result = await resolveTaxon(name);
        results.push(result);

        if (result.success) {
            totalConfidence += result.confidence;
            if (result.source === 'worms') wormsMatches++;
            if (result.source === 'itis') itisMatches++;
            if (result.isSynonym) synonymsFound++;
        }

        if (onProgress) {
            onProgress(i + 1, names.length);
        }
    }

    const resolved = results.filter(r => r.success).length;

    return {
        total: names.length,
        resolved,
        unresolved: names.length - resolved,
        results,
        summary: {
            wormsMatches,
            itisMatches,
            noMatches: names.length - resolved,
            synonymsFound,
            averageConfidence: resolved > 0 ? Math.round(totalConfidence / resolved) : 0,
        },
    };
}

/**
 * Validate a scientific name and return detailed validation result
 */
export async function validateTaxon(scientificName: string): Promise<TaxonomyValidationResult> {
    const issues: string[] = [];

    // Basic validation
    if (!scientificName || scientificName.trim() === '') {
        return {
            valid: false,
            originalName: scientificName || '',
            confidence: 0,
            issues: ['Scientific name is empty'],
        };
    }

    const cleanName = scientificName.trim();

    // Check for common issues
    if (cleanName.length < 3) {
        issues.push('Name is too short');
    }
    if (/\d/.test(cleanName)) {
        issues.push('Name contains numbers');
    }
    if (!/^[A-Z]/.test(cleanName)) {
        issues.push('Generic name should start with uppercase');
    }
    if (cleanName.split(' ').length < 2) {
        issues.push('Name appears to be only genus (no species epithet)');
    }

    // Resolve the name
    const result = await resolveTaxon(cleanName);

    if (!result.success) {
        issues.push(result.error || 'Name not found in taxonomic databases');
        return {
            valid: false,
            originalName: cleanName,
            confidence: 0,
            issues,
        };
    }

    // Add synonym warning
    if (result.isSynonym) {
        issues.push(`Name is a synonym; accepted name is "${result.acceptedName}"`);
    }

    // Check match quality
    if (result.confidence < 70) {
        issues.push('Match confidence is low; verify spelling');
    }

    return {
        valid: true,
        originalName: cleanName,
        resolvedName: result.resolvedName,
        taxonId: result.taxonId || result.lsid,
        source: result.source,
        isMarine: result.habitat?.isMarine,
        confidence: result.confidence,
        issues,
    };
}

/**
 * Search for taxa (autocomplete functionality)
 */
export async function searchTaxa(query: string, limit: number = 10): Promise<{
    query: string;
    results: Array<{
        name: string;
        authority?: string;
        taxonId?: string;
        source: string;
        rank?: string;
    }>;
}> {
    if (!query || query.trim().length < 2) {
        return { query, results: [] };
    }

    const results: Array<{
        name: string;
        authority?: string;
        taxonId?: string;
        source: string;
        rank?: string;
    }> = [];

    try {
        // Search WoRMS
        const wormsResults = await wormsService.searchByName(query);

        for (const match of wormsResults.slice(0, limit)) {
            results.push({
                name: match.scientificname,
                authority: match.authority,
                taxonId: `urn:lsid:marinespecies.org:taxname:${match.AphiaID}`,
                source: 'worms',
                rank: match.rank,
            });
        }

        // If we need more results, search ITIS
        if (results.length < limit) {
            const itisResults = await itisService.searchByName(query);

            for (const match of itisResults.slice(0, limit - results.length)) {
                // Avoid duplicates
                if (!results.some(r => r.name.toLowerCase() === match.combinedName.toLowerCase())) {
                    results.push({
                        name: match.combinedName,
                        authority: match.author,
                        taxonId: `urn:lsid:itis.gov:itis_tsn:${match.tsn}`,
                        source: 'itis',
                    });
                }
            }
        }

    } catch (error: any) {
        logger.warn(`Taxonomy search failed for "${query}": ${error.message}`);
    }

    return {
        query,
        results: results.slice(0, limit),
    };
}

/**
 * Get taxonomy statistics
 */
export function getStats(): {
    wormsCacheSize: number;
    itisCacheSize: number;
} {
    return {
        wormsCacheSize: wormsService.getCacheStats().size,
        itisCacheSize: 0, // ITIS service doesn't expose this yet
    };
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
    wormsService.clearCache();
    itisService.clearCache();
}

export default {
    resolveTaxon,
    batchResolveTaxons,
    validateTaxon,
    searchTaxa,
    getStats,
    clearAllCaches,
};
