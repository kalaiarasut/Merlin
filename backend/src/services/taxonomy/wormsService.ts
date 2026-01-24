/**
 * WoRMS (World Register of Marine Species) Service
 * 
 * Production-grade integration with the WoRMS REST API for
 * taxonomic authority resolution in marine biodiversity data.
 * 
 * Reference: https://www.marinespecies.org/rest/
 */

import axios, { AxiosInstance } from 'axios';
import logger from '../../utils/logger';

// WoRMS API base URL
const WORMS_API_BASE = 'https://www.marinespecies.org/rest';

// Rate limiting: WoRMS allows ~1000 requests/hour for unregistered users
const RATE_LIMIT_DELAY = 100; // ms between requests

// Response interfaces
export interface WoRMSTaxon {
    AphiaID: number;
    scientificname: string;
    authority: string;
    status: 'accepted' | 'unaccepted' | 'uncertain' | 'alternate representation';
    unacceptreason?: string;
    valid_AphiaID?: number;
    valid_name?: string;
    valid_authority?: string;
    kingdom?: string;
    phylum?: string;
    class?: string;
    order?: string;
    family?: string;
    genus?: string;
    isMarine?: boolean;
    isBrackish?: boolean;
    isFreshwater?: boolean;
    isTerrestrial?: boolean;
    isExtinct?: boolean;
    match_type?: 'exact' | 'phonetic' | 'near_1' | 'near_2' | 'near_3';
    modified?: string;
    rank?: string;
    lsid?: string;
}

export interface TaxonomyResult {
    success: boolean;
    source: 'worms' | 'itis' | 'unknown';
    originalName: string;
    resolvedName?: string;
    resolvedAuthority?: string;
    taxonId?: string;
    aphiaId?: number;
    lsid?: string;
    status?: string;
    isSynonym: boolean;
    acceptedName?: string;
    acceptedId?: string;
    classification?: {
        kingdom?: string;
        phylum?: string;
        class?: string;
        order?: string;
        family?: string;
        genus?: string;
    };
    habitat?: {
        isMarine?: boolean;
        isBrackish?: boolean;
        isFreshwater?: boolean;
        isTerrestrial?: boolean;
    };
    matchType?: string;
    confidence: number; // 0-100
    error?: string;
}

// Simple in-memory cache
const cache: Map<string, { data: TaxonomyResult; timestamp: number }> = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiter
let lastRequestTime = 0;

async function rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
    }

    lastRequestTime = Date.now();
    return fn();
}

// Create axios instance
const wormsClient: AxiosInstance = axios.create({
    baseURL: WORMS_API_BASE,
    timeout: 15000,
    headers: {
        'Accept': 'application/json',
        'User-Agent': 'CMLRE-Merlin/1.0 (Marine Data Platform; contact@cmlre.gov.in)',
    },
});

/**
 * Search for a taxon by scientific name
 */
export async function searchByName(scientificName: string): Promise<WoRMSTaxon[]> {
    try {
        const response = await rateLimitedRequest(() =>
            wormsClient.get('/AphiaRecordsByName/' + encodeURIComponent(scientificName), {
                params: {
                    like: 'false',
                    marine_only: 'false',
                },
            })
        );

        if (response.data && Array.isArray(response.data)) {
            return response.data;
        }

        return [];
    } catch (error: any) {
        if (error.response?.status === 204) {
            // No content - not found
            return [];
        }
        logger.warn(`WoRMS search failed for "${scientificName}": ${error.message}`);
        throw error;
    }
}

/**
 * Fuzzy search for names (handles typos)
 */
export async function fuzzySearch(scientificName: string): Promise<WoRMSTaxon[]> {
    try {
        const response = await rateLimitedRequest(() =>
            wormsClient.get('/AphiaRecordsByMatchNames', {
                params: {
                    scientificnames: [scientificName],
                    marine_only: 'false',
                },
            })
        );

        if (response.data && Array.isArray(response.data) && response.data[0]) {
            return response.data[0];
        }

        return [];
    } catch (error: any) {
        if (error.response?.status === 204) {
            return [];
        }
        logger.warn(`WoRMS fuzzy search failed for "${scientificName}": ${error.message}`);
        throw error;
    }
}

/**
 * Get taxon record by AphiaID
 */
export async function getByAphiaId(aphiaId: number): Promise<WoRMSTaxon | null> {
    try {
        const response = await rateLimitedRequest(() =>
            wormsClient.get(`/AphiaRecordByAphiaID/${aphiaId}`)
        );

        return response.data || null;
    } catch (error: any) {
        if (error.response?.status === 204 || error.response?.status === 404) {
            return null;
        }
        logger.warn(`WoRMS AphiaID lookup failed for ${aphiaId}: ${error.message}`);
        throw error;
    }
}

/**
 * Get full classification hierarchy
 */
export async function getClassification(aphiaId: number): Promise<WoRMSTaxon[]> {
    try {
        const response = await rateLimitedRequest(() =>
            wormsClient.get(`/AphiaClassificationByAphiaID/${aphiaId}`)
        );

        // Flatten the nested classification
        const flatten = (node: any): WoRMSTaxon[] => {
            const result: WoRMSTaxon[] = [node];
            if (node.child) {
                result.push(...flatten(node.child));
            }
            return result;
        };

        if (response.data) {
            return flatten(response.data);
        }

        return [];
    } catch (error: any) {
        logger.warn(`WoRMS classification lookup failed for ${aphiaId}: ${error.message}`);
        return [];
    }
}

/**
 * Resolve a scientific name to its accepted name and taxonomy info
 */
export async function resolveTaxon(scientificName: string): Promise<TaxonomyResult> {
    // Check cache first
    const cacheKey = scientificName.toLowerCase().trim();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    const result: TaxonomyResult = {
        success: false,
        source: 'worms',
        originalName: scientificName,
        isSynonym: false,
        confidence: 0,
    };

    try {
        // First try exact match
        let matches = await searchByName(scientificName);

        // If no exact match, try fuzzy search
        if (matches.length === 0) {
            matches = await fuzzySearch(scientificName);
        }

        if (matches.length === 0) {
            result.error = 'No match found in WoRMS';
            cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        }

        // Find the best match (prefer exact, accepted)
        let bestMatch = matches[0];
        for (const match of matches) {
            if (match.status === 'accepted' && match.match_type === 'exact') {
                bestMatch = match;
                break;
            }
            if (match.status === 'accepted') {
                bestMatch = match;
            }
        }

        result.resolvedName = bestMatch.scientificname;
        result.resolvedAuthority = bestMatch.authority;
        result.aphiaId = bestMatch.AphiaID;
        result.taxonId = `urn:lsid:marinespecies.org:taxname:${bestMatch.AphiaID}`;
        result.lsid = bestMatch.lsid || result.taxonId;
        result.status = bestMatch.status;
        result.matchType = bestMatch.match_type;

        // Check if it's a synonym
        if (bestMatch.status === 'unaccepted' && bestMatch.valid_AphiaID) {
            result.isSynonym = true;
            result.acceptedName = bestMatch.valid_name;
            result.acceptedId = `urn:lsid:marinespecies.org:taxname:${bestMatch.valid_AphiaID}`;

            // Get the accepted taxon for full info
            const acceptedTaxon = await getByAphiaId(bestMatch.valid_AphiaID);
            if (acceptedTaxon) {
                result.resolvedName = acceptedTaxon.scientificname;
                result.resolvedAuthority = acceptedTaxon.authority;
                result.classification = {
                    kingdom: acceptedTaxon.kingdom,
                    phylum: acceptedTaxon.phylum,
                    class: acceptedTaxon.class,
                    order: acceptedTaxon.order,
                    family: acceptedTaxon.family,
                    genus: acceptedTaxon.genus,
                };
            }
        } else {
            result.classification = {
                kingdom: bestMatch.kingdom,
                phylum: bestMatch.phylum,
                class: bestMatch.class,
                order: bestMatch.order,
                family: bestMatch.family,
                genus: bestMatch.genus,
            };
        }

        // Habitat information
        result.habitat = {
            isMarine: bestMatch.isMarine,
            isBrackish: bestMatch.isBrackish,
            isFreshwater: bestMatch.isFreshwater,
            isTerrestrial: bestMatch.isTerrestrial,
        };

        // Calculate confidence score
        result.confidence = calculateConfidence(bestMatch, scientificName);
        result.success = true;

        // Cache result
        cache.set(cacheKey, { data: result, timestamp: Date.now() });

        return result;

    } catch (error: any) {
        result.error = error.message || 'WoRMS API error';
        logger.error(`WoRMS resolution failed for "${scientificName}": ${error.message}`);
        return result;
    }
}

/**
 * Calculate confidence score based on match quality
 */
function calculateConfidence(match: WoRMSTaxon, originalName: string): number {
    let confidence = 50; // Base score

    // Match type scoring
    switch (match.match_type) {
        case 'exact':
            confidence += 40;
            break;
        case 'phonetic':
            confidence += 25;
            break;
        case 'near_1':
            confidence += 20;
            break;
        case 'near_2':
            confidence += 10;
            break;
        case 'near_3':
            confidence += 5;
            break;
    }

    // Status scoring
    if (match.status === 'accepted') {
        confidence += 10;
    } else if (match.status === 'unaccepted' && match.valid_AphiaID) {
        confidence += 5; // Synonym with valid reference is still good
    }

    // Exact name match bonus
    if (match.scientificname.toLowerCase() === originalName.toLowerCase()) {
        confidence += 5;
    }

    return Math.min(100, confidence);
}

/**
 * Batch resolve multiple names
 */
export async function batchResolveTaxons(names: string[]): Promise<TaxonomyResult[]> {
    const results: TaxonomyResult[] = [];

    for (const name of names) {
        const result = await resolveTaxon(name);
        results.push(result);
    }

    return results;
}

/**
 * Validate if a name exists and is marine
 */
export async function validateMarineTaxon(scientificName: string): Promise<{
    valid: boolean;
    isMarine: boolean;
    name?: string;
    aphiaId?: number;
    reason?: string;
}> {
    const result = await resolveTaxon(scientificName);

    if (!result.success) {
        return {
            valid: false,
            isMarine: false,
            reason: result.error || 'Name not found',
        };
    }

    return {
        valid: true,
        isMarine: result.habitat?.isMarine || false,
        name: result.resolvedName,
        aphiaId: result.aphiaId,
    };
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; hitRate: number } {
    return {
        size: cache.size,
        hitRate: 0, // Would need to track hits/misses for actual hit rate
    };
}

/**
 * Clear the cache
 */
export function clearCache(): void {
    cache.clear();
}

export default {
    searchByName,
    fuzzySearch,
    getByAphiaId,
    getClassification,
    resolveTaxon,
    batchResolveTaxons,
    validateMarineTaxon,
    getCacheStats,
    clearCache,
};
