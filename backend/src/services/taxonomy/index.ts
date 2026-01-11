/**
 * Taxonomy Services Index
 * 
 * Central export for all taxonomy resolution functionality.
 */

// WoRMS Service - import as namespace to avoid conflicts
import wormsService from './wormsService';
export { wormsService };
export type { WoRMSTaxon, TaxonomyResult } from './wormsService';

// ITIS Service - import as namespace
import itisService from './itisService';
export { itisService };
export type { ITISTaxon, ITISSearchResult } from './itisService';

// Unified Resolver - this is the main export users should use
import taxonomyResolver from './taxonomyResolver';
export { taxonomyResolver };
export type { BatchResolutionResult, TaxonomyValidationResult } from './taxonomyResolver';

// Default export is the unified resolver
export default taxonomyResolver;
