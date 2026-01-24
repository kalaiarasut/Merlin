/**
 * ITIS (Integrated Taxonomic Information System) Service
 * 
 * Fallback taxonomic authority for non-marine species.
 * Used when WoRMS doesn't have a match.
 * 
 * Reference: https://www.itis.gov/ws_description.html
 */

import axios, { AxiosInstance } from 'axios';
import logger from '../../utils/logger';
import { TaxonomyResult } from './wormsService';

// ITIS API base URL
const ITIS_API_BASE = 'https://www.itis.gov/ITISWebService/jsonservice';

// Rate limit - ITIS is more generous but still be polite
const RATE_LIMIT_DELAY = 50; // ms

// ITIS response interfaces
export interface ITISTaxon {
    tsn: string;
    scientificName: string;
    author: string;
    nameUsage: string; // 'valid' | 'not accepted' | etc.
    kingdom: string;
    rankName: string;
    parentTsn?: string;
}

export interface ITISSearchResult {
    tsn: string;
    combinedName: string;
    author?: string;
}

export interface ITISAcceptedName {
    acceptedTsn: string;
    acceptedName: string;
    author: string;
}

export interface ITISHierarchy {
    tsn: string;
    rankName: string;
    taxonName: string;
    parentTsn?: string;
}

// Simple cache
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

// Axios instance
const itisClient: AxiosInstance = axios.create({
    baseURL: ITIS_API_BASE,
    timeout: 15000,
    headers: {
        'Accept': 'application/json',
        'User-Agent': 'CMLRE-Merlin/1.0 (Marine Data Platform; contact@cmlre.gov.in)',
    },
});

/**
 * Parse ITIS JSON-P response (remove callback wrapper if present)
 */
function parseITISResponse(data: any): any {
    if (typeof data === 'string') {
        // Remove JSONP wrapper if present
        const match = data.match(/^[^(]+\((.+)\)$/s);
        if (match) {
            return JSON.parse(match[1]);
        }
        return JSON.parse(data);
    }
    return data;
}

/**
 * Search for taxon by scientific name
 */
export async function searchByName(scientificName: string): Promise<ITISSearchResult[]> {
    try {
        const response = await rateLimitedRequest(() =>
            itisClient.get('/searchByScientificName', {
                params: { srchKey: scientificName },
            })
        );

        const data = parseITISResponse(response.data);

        if (data.scientificNames && Array.isArray(data.scientificNames)) {
            // Filter out null items and items without tsn
            return data.scientificNames.filter((item: any) => item && item.tsn);
        }

        return [];
    } catch (error: any) {
        logger.warn(`ITIS search failed for "${scientificName}": ${error.message}`);
        return [];
    }
}

/**
 * Get full taxon record by TSN
 */
export async function getByTsn(tsn: string): Promise<ITISTaxon | null> {
    try {
        const response = await rateLimitedRequest(() =>
            itisClient.get('/getFullRecordFromTSN', {
                params: { tsn },
            })
        );

        const data = parseITISResponse(response.data);

        if (data && data.scientificName) {
            return {
                tsn: data.tsn,
                scientificName: data.scientificName?.combinedName || '',
                author: data.taxonAuthor?.authorship || '',
                nameUsage: data.usage?.taxonUsageRating || 'unknown',
                kingdom: extractKingdom(data),
                rankName: data.taxRank?.rankName || '',
            };
        }

        return null;
    } catch (error: any) {
        logger.warn(`ITIS TSN lookup failed for ${tsn}: ${error.message}`);
        return null;
    }
}

/**
 * Extract kingdom from ITIS hierarchy
 */
function extractKingdom(data: any): string {
    if (data.kingdom?.kingdomName) {
        return data.kingdom.kingdomName;
    }
    return '';
}

/**
 * Get accepted name for a TSN (follow synonyms)
 */
export async function getAcceptedName(tsn: string): Promise<ITISAcceptedName | null> {
    try {
        const response = await rateLimitedRequest(() =>
            itisClient.get('/getAcceptedNamesFromTSN', {
                params: { tsn },
            })
        );

        const data = parseITISResponse(response.data);

        if (data.acceptedNames && data.acceptedNames.length > 0) {
            const accepted = data.acceptedNames[0];
            return {
                acceptedTsn: accepted.acceptedTsn,
                acceptedName: accepted.acceptedName,
                author: accepted.author || '',
            };
        }

        return null;
    } catch (error: any) {
        logger.warn(`ITIS accepted name lookup failed for ${tsn}: ${error.message}`);
        return null;
    }
}

/**
 * Get taxonomic hierarchy for a TSN
 */
export async function getHierarchy(tsn: string): Promise<ITISHierarchy[]> {
    try {
        const response = await rateLimitedRequest(() =>
            itisClient.get('/getFullHierarchyFromTSN', {
                params: { tsn },
            })
        );

        const data = parseITISResponse(response.data);

        if (data.hierarchyList && Array.isArray(data.hierarchyList)) {
            return data.hierarchyList.map((item: any) => ({
                tsn: item.tsn,
                rankName: item.rankName,
                taxonName: item.taxonName,
                parentTsn: item.parentTsn,
            }));
        }

        return [];
    } catch (error: any) {
        logger.warn(`ITIS hierarchy lookup failed for ${tsn}: ${error.message}`);
        return [];
    }
}

/**
 * Resolve a scientific name using ITIS
 */
export async function resolveTaxon(scientificName: string): Promise<TaxonomyResult> {
    // Check cache first
    const cacheKey = `itis:${scientificName.toLowerCase().trim()}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    const result: TaxonomyResult = {
        success: false,
        source: 'itis',
        originalName: scientificName,
        isSynonym: false,
        confidence: 0,
    };

    try {
        // Search for the name
        const matches = await searchByName(scientificName);

        if (matches.length === 0) {
            result.error = 'No match found in ITIS';
            cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        }

        // Get the best match (first result or exact match)
        let bestMatch = matches[0];
        for (const match of matches) {
            if (match.combinedName.toLowerCase() === scientificName.toLowerCase()) {
                bestMatch = match;
                break;
            }
        }

        // Get full record
        const taxon = await getByTsn(bestMatch.tsn);

        if (!taxon) {
            result.error = 'Could not retrieve taxon details';
            cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        }

        result.resolvedName = taxon.scientificName;
        result.resolvedAuthority = taxon.author;
        result.taxonId = `urn:lsid:itis.gov:itis_tsn:${taxon.tsn}`;
        result.status = taxon.nameUsage;

        // Check for synonym
        if (taxon.nameUsage !== 'valid' && taxon.nameUsage !== 'accepted') {
            const accepted = await getAcceptedName(taxon.tsn);
            if (accepted) {
                result.isSynonym = true;
                result.acceptedName = accepted.acceptedName;
                result.acceptedId = `urn:lsid:itis.gov:itis_tsn:${accepted.acceptedTsn}`;

                // Get accepted taxon details
                const acceptedTaxon = await getByTsn(accepted.acceptedTsn);
                if (acceptedTaxon) {
                    result.resolvedName = acceptedTaxon.scientificName;
                    result.resolvedAuthority = acceptedTaxon.author;
                }
            }
        }

        // Get hierarchy for classification
        const tsnForHierarchy = result.isSynonym && result.acceptedId
            ? result.acceptedId.split(':').pop()!
            : taxon.tsn;
        const hierarchy = await getHierarchy(tsnForHierarchy);

        result.classification = extractClassification(hierarchy);

        // Calculate confidence
        result.confidence = calculateITISConfidence(taxon, scientificName);
        result.success = true;

        // Cache result
        cache.set(cacheKey, { data: result, timestamp: Date.now() });

        return result;

    } catch (error: any) {
        result.error = error.message || 'ITIS API error';
        logger.error(`ITIS resolution failed for "${scientificName}": ${error.message}`);
        return result;
    }
}

/**
 * Extract classification from ITIS hierarchy
 */
function extractClassification(hierarchy: ITISHierarchy[]): TaxonomyResult['classification'] {
    const classification: TaxonomyResult['classification'] = {};

    for (const level of hierarchy) {
        switch (level.rankName.toLowerCase()) {
            case 'kingdom':
                classification.kingdom = level.taxonName;
                break;
            case 'phylum':
            case 'division':
                classification.phylum = level.taxonName;
                break;
            case 'class':
                classification.class = level.taxonName;
                break;
            case 'order':
                classification.order = level.taxonName;
                break;
            case 'family':
                classification.family = level.taxonName;
                break;
            case 'genus':
                classification.genus = level.taxonName;
                break;
        }
    }

    return classification;
}

/**
 * Calculate confidence score for ITIS match
 */
function calculateITISConfidence(taxon: ITISTaxon, originalName: string): number {
    let confidence = 60; // Base score (slightly lower than WoRMS for marine data)

    // Exact name match
    if (taxon.scientificName.toLowerCase() === originalName.toLowerCase()) {
        confidence += 30;
    } else if (taxon.scientificName.toLowerCase().includes(originalName.toLowerCase())) {
        confidence += 15;
    }

    // Valid name bonus
    if (taxon.nameUsage === 'valid' || taxon.nameUsage === 'accepted') {
        confidence += 10;
    }

    return Math.min(100, confidence);
}

/**
 * Clear cache
 */
export function clearCache(): void {
    cache.clear();
}

export default {
    searchByName,
    getByTsn,
    getAcceptedName,
    getHierarchy,
    resolveTaxon,
    clearCache,
};
