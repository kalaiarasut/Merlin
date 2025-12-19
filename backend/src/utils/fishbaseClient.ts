/**
 * FishBase API Client
 * 
 * Fetches species data from FishBase (https://fishbase.ropensci.org)
 * to auto-fill conservation status, habitat, and distribution information.
 * 
 * No API key required - completely free and open.
 */

import axios from 'axios';

// Simple logger for this module
const logger = {
    info: (msg: string) => console.log('[FishBase]', msg),
    warn: (msg: string) => console.warn('[FishBase]', msg),
    error: (msg: string) => console.error('[FishBase]', msg),
};

const FISHBASE_API_URL = 'https://fishbase.ropensci.org';

// Cache to avoid repeated lookups for the same species
const speciesCache: Map<string, any> = new Map();

interface FishBaseSpecies {
    SpecCode?: number;
    Genus?: string;
    Species?: string;
    Author?: string;
    FBname?: string;  // Common name
    FamCode?: number;
    Subfamily?: string;
    BodyShapeI?: string;
    DemersPelag?: string;  // Habitat type (demersal, pelagic, etc.)
    AnaCat?: string;
    Vulnerability?: number;
    Comments?: string;
}

interface FishBaseEcology {
    SpecCode?: number;
    Saltwater?: number;  // 1 = marine
    Brackish?: number;
    Fresh?: number;
    Climate?: string;
    Tropical?: number;
    Subtropical?: number;
    Temperate?: number;
    Boreal?: number;
    Polar?: number;
}

interface SpeciesLookupResult {
    found: boolean;
    scientificName?: string;
    commonName?: string;
    conservationStatus?: string;
    habitat?: string;
    distribution?: string[];
    family?: string;
    vulnerability?: string;
    source: string;
}

/**
 * Map vulnerability score to IUCN-like conservation status
 * FishBase vulnerability score ranges from 0-100
 */
function mapVulnerabilityToIUCN(vulnerability: number | undefined): string {
    if (vulnerability === undefined || vulnerability === null) return 'DD';

    // FishBase vulnerability index:
    // 0-10: Very low (LC)
    // 10-30: Low to moderate (LC)
    // 30-50: Moderate (NT)
    // 50-70: High (VU)
    // 70-85: Very high (EN)
    // 85-100: Extremely high (CR)

    if (vulnerability < 30) return 'LC';  // Least Concern
    if (vulnerability < 50) return 'NT';  // Near Threatened
    if (vulnerability < 70) return 'VU';  // Vulnerable
    if (vulnerability < 85) return 'EN';  // Endangered
    return 'CR';  // Critically Endangered
}

/**
 * Map habitat code to readable description
 */
function mapHabitat(demersPelag?: string): string {
    if (!demersPelag) return 'Unknown';

    const habitatMap: Record<string, string> = {
        'pelagic': 'Pelagic (open ocean)',
        'pelagic-neritic': 'Pelagic-neritic (coastal surface)',
        'pelagic-oceanic': 'Pelagic-oceanic (deep ocean)',
        'benthopelagic': 'Benthopelagic (near bottom, open water)',
        'demersal': 'Demersal (bottom-dwelling)',
        'bathydemersal': 'Bathydemersal (deep bottom)',
        'reef-associated': 'Coral reef',
    };

    return habitatMap[demersPelag.toLowerCase()] || demersPelag;
}

/**
 * Look up species information from FishBase
 */
export async function lookupSpecies(scientificName: string): Promise<SpeciesLookupResult> {
    // Check cache first
    if (speciesCache.has(scientificName)) {
        logger.info(`FishBase cache hit for: ${scientificName}`);
        return speciesCache.get(scientificName);
    }

    const result: SpeciesLookupResult = {
        found: false,
        source: 'FishBase API'
    };

    try {
        // Parse genus and species from scientific name
        const parts = scientificName.trim().split(/\s+/);
        if (parts.length < 2) {
            logger.warn(`Invalid scientific name format: ${scientificName}`);
            return result;
        }

        const genus = parts[0];
        const species = parts[1];

        // Query FishBase species endpoint
        const response = await axios.get(`${FISHBASE_API_URL}/species`, {
            params: {
                Genus: genus,
                Species: species,
                limit: 1
            },
            timeout: 10000  // 10 second timeout
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            const fishData: FishBaseSpecies = response.data.data[0];

            result.found = true;
            result.scientificName = `${fishData.Genus} ${fishData.Species}`;
            result.commonName = fishData.FBname || undefined;
            result.conservationStatus = mapVulnerabilityToIUCN(fishData.Vulnerability);
            result.habitat = mapHabitat(fishData.DemersPelag);
            result.vulnerability = fishData.Vulnerability !== undefined ?
                `${fishData.Vulnerability}/100` : undefined;

            // Try to get distribution from FAO areas or ecology
            result.distribution = await getDistribution(fishData.SpecCode);

            logger.info(`FishBase lookup success for ${scientificName}: Status=${result.conservationStatus}, Habitat=${result.habitat}`);
        } else {
            logger.info(`FishBase: No data found for ${scientificName}`);
        }

    } catch (error: any) {
        if (error.code === 'ECONNABORTED') {
            logger.warn(`FishBase lookup timeout for: ${scientificName}`);
        } else {
            logger.error(`FishBase lookup error for ${scientificName}: ${error.message}`);
        }
    }

    // Cache the result (even if not found, to avoid repeated failed lookups)
    speciesCache.set(scientificName, result);

    return result;
}

/**
 * Get distribution/geographic region from FishBase
 */
async function getDistribution(specCode?: number): Promise<string[]> {
    if (!specCode) return [];

    try {
        // Query FAO areas for this species
        const response = await axios.get(`${FISHBASE_API_URL}/faoareas`, {
            params: {
                SpecCode: specCode,
                limit: 10
            },
            timeout: 5000
        });

        if (response.data && response.data.data) {
            const areas = response.data.data
                .map((area: any) => area.AreaCode)
                .filter(Boolean);

            // Map FAO area codes to readable names (focusing on Indian Ocean)
            const areaNames: string[] = [];
            const faoToName: Record<number, string> = {
                51: 'Indian Ocean (Western)',
                57: 'Indian Ocean (Eastern)',
                34: 'Atlantic Ocean (Eastern Central)',
                47: 'Atlantic Ocean (Southeastern)',
                71: 'Pacific Ocean (Western Central)',
                // Add more as needed
            };

            for (const code of areas) {
                if (faoToName[code]) {
                    areaNames.push(faoToName[code]);
                }
            }

            // If found Indian Ocean areas, add specific regions
            if (areaNames.some(a => a.includes('Indian Ocean'))) {
                return ['Indian Ocean', 'Arabian Sea', 'Bay of Bengal'];
            }

            return areaNames.length > 0 ? areaNames : ['Unknown'];
        }
    } catch (error: any) {
        logger.warn(`FishBase distribution lookup failed: ${error.message}`);
    }

    return [];
}

/**
 * Batch lookup for multiple species (with rate limiting)
 */
export async function batchLookup(scientificNames: string[]): Promise<Map<string, SpeciesLookupResult>> {
    const results = new Map<string, SpeciesLookupResult>();

    for (const name of scientificNames) {
        // Rate limiting: 100ms delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));

        const result = await lookupSpecies(name);
        results.set(name, result);
    }

    return results;
}

/**
 * Clear the species cache
 */
export function clearCache(): void {
    speciesCache.clear();
    logger.info('FishBase cache cleared');
}

export default {
    lookupSpecies,
    batchLookup,
    clearCache
};
