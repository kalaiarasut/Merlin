/**
 * Standards Validation Services - Index
 * 
 * Central export for all standards validation functionality.
 */

// Individual validators
export * from './darwinCoreValidator';
export * from './obisValidator';
export * from './mixsValidator';
export * from './iso19115Validator';
export * from './cfConventionValidator';

// Compliance scoring
export * from './complianceScorer';

// Default export with all validators
import darwinCoreValidator from './darwinCoreValidator';
import obisValidator from './obisValidator';
import mixsValidator from './mixsValidator';
import iso19115Validator from './iso19115Validator';
import cfConventionValidator from './cfConventionValidator';
import complianceScorer from './complianceScorer';

export default {
    darwinCore: darwinCoreValidator,
    obis: obisValidator,
    mixs: mixsValidator,
    iso19115: iso19115Validator,
    cfConvention: cfConventionValidator,
    compliance: complianceScorer,
};
