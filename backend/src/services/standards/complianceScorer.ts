/**
 * Compliance Scorer Service
 * 
 * Aggregates validation results from all standards validators and
 * calculates an overall compliance score for datasets.
 */

import { ValidationResult, ValidationError } from './darwinCoreValidator';
import { validateDarwinCoreDataset } from './darwinCoreValidator';
import { validateOBISDataset } from './obisValidator';
import { validateMIxSDataset } from './mixsValidator';
import { validateISO19115Metadata } from './iso19115Validator';
import { validateCFConventions, CFMetadata } from './cfConventionValidator';

// Supported standards
export type StandardType = 'dwc' | 'obis' | 'mixs' | 'iso19115' | 'cf';

export interface StandardValidationResult extends ValidationResult {
    standard: StandardType;
    standardName: string;
    requiredFor?: string[];
}

export interface ComplianceReport {
    datasetId: string;
    timestamp: string;
    overallScore: number;
    overallValid: boolean;
    standardResults: StandardValidationResult[];
    summary: {
        totalErrors: number;
        totalWarnings: number;
        passedStandards: string[];
        failedStandards: string[];
    };
    recommendations: string[];
}

// Standard metadata
const STANDARD_INFO: Record<StandardType, { name: string; requiredFor: string[] }> = {
    dwc: {
        name: 'Darwin Core',
        requiredFor: ['GBIF submission', 'Biodiversity databases', 'OBIS'],
    },
    obis: {
        name: 'OBIS Schema',
        requiredFor: ['Ocean Biodiversity Information System', 'Marine data portals'],
    },
    mixs: {
        name: 'MIxS 6.0',
        requiredFor: ['eDNA/metabarcoding', 'INSDC submission', 'Sequence repositories'],
    },
    iso19115: {
        name: 'ISO 19115:2014',
        requiredFor: ['National SDI', 'INSPIRE', 'Geospatial catalogs'],
    },
    cf: {
        name: 'CF Conventions',
        requiredFor: ['NetCDF files', 'Climate data', 'ERDDAP servers'],
    },
};

/**
 * Validate dataset against a specific standard
 */
export async function validateAgainstStandard(
    standard: StandardType,
    data: Record<string, any>[] | Record<string, any>,
    options?: { envPackage?: string; cfMetadata?: CFMetadata }
): Promise<StandardValidationResult> {
    let result: ValidationResult;

    switch (standard) {
        case 'dwc': {
            const records: Record<string, any>[] = Array.isArray(data) ? data : [data];
            result = validateDarwinCoreDataset(records);
            break;
        }

        case 'obis': {
            const records: Record<string, any>[] = Array.isArray(data) ? data : [data];
            result = validateOBISDataset(records);
            break;
        }

        case 'mixs': {
            const records: Record<string, any>[] = Array.isArray(data) ? data : [data];
            result = validateMIxSDataset(records, options?.envPackage || 'water');
            break;
        }

        case 'iso19115':
            if (Array.isArray(data)) {
                data = data[0] || {};
            }
            result = validateISO19115Metadata(data);
            break;

        case 'cf':
            if (options?.cfMetadata) {
                result = validateCFConventions(options.cfMetadata);
            } else {
                result = {
                    valid: false,
                    score: 0,
                    totalFields: 0,
                    validFields: 0,
                    errors: [{
                        field: 'metadata',
                        value: null,
                        message: 'CF validation requires NetCDF metadata. Use cfMetadata option.',
                        severity: 'error',
                        code: 'CF_METADATA_REQUIRED',
                    }],
                    warnings: [],
                };
            }
            break;

        default:
            result = {
                valid: false,
                score: 0,
                totalFields: 0,
                validFields: 0,
                errors: [{
                    field: 'standard',
                    value: standard,
                    message: `Unknown standard: ${standard}`,
                    severity: 'error',
                    code: 'UNKNOWN_STANDARD',
                }],
                warnings: [],
            };
    }

    return {
        ...result,
        standard,
        standardName: STANDARD_INFO[standard]?.name || standard,
        requiredFor: STANDARD_INFO[standard]?.requiredFor,
    };
}

/**
 * Validate dataset against all applicable standards
 */
export async function validateAllStandards(
    data: Record<string, any>[] | Record<string, any>,
    metadata?: Record<string, any>,
    cfMetadata?: CFMetadata
): Promise<StandardValidationResult[]> {
    const results: StandardValidationResult[] = [];

    // Always validate Darwin Core for occurrence data
    if (Array.isArray(data) && data.length > 0) {
        const dwcResult = await validateAgainstStandard('dwc', data);
        results.push(dwcResult);

        // Check if it looks like marine data
        const hasMarine = data.some(d =>
            d.waterBody ||
            d.minimumDepthInMeters !== undefined ||
            d.kingdom?.toLowerCase() === 'animalia'
        );
        if (hasMarine) {
            const obisResult = await validateAgainstStandard('obis', data);
            results.push(obisResult);
        }

        // Check if it looks like eDNA data
        const haseDNA = data.some(d =>
            d.target_gene ||
            d.pcr_primers ||
            d.seq_meth
        );
        if (haseDNA) {
            const mixsResult = await validateAgainstStandard('mixs', data, { envPackage: 'water' });
            results.push(mixsResult);
        }
    }

    // Validate metadata if provided
    if (metadata) {
        const isoResult = await validateAgainstStandard('iso19115', metadata);
        results.push(isoResult);
    }

    // Validate CF if NetCDF metadata provided
    if (cfMetadata) {
        const cfResult = await validateAgainstStandard('cf', {}, { cfMetadata });
        results.push(cfResult);
    }

    return results;
}

/**
 * Generate a full compliance report
 */
export async function generateComplianceReport(
    datasetId: string,
    data: Record<string, any>[] | Record<string, any>,
    metadata?: Record<string, any>,
    cfMetadata?: CFMetadata
): Promise<ComplianceReport> {
    const standardResults = await validateAllStandards(data, metadata, cfMetadata);

    // Calculate overall score (weighted average)
    const weights: Record<StandardType, number> = {
        dwc: 1.0,
        obis: 0.8,
        mixs: 0.8,
        iso19115: 1.0,
        cf: 0.7,
    };

    let weightedSum = 0;
    let weightSum = 0;
    let totalErrors = 0;
    let totalWarnings = 0;
    const passedStandards: string[] = [];
    const failedStandards: string[] = [];

    for (const result of standardResults) {
        const weight = weights[result.standard] || 1.0;
        weightedSum += result.score * weight;
        weightSum += weight;
        totalErrors += result.errors.length;
        totalWarnings += result.warnings.length;

        if (result.valid) {
            passedStandards.push(result.standardName);
        } else {
            failedStandards.push(result.standardName);
        }
    }

    const overallScore = weightSum > 0 ? Math.round(weightedSum / weightSum) : 0;
    const overallValid = failedStandards.length === 0;

    // Generate recommendations
    const recommendations: string[] = [];

    if (!standardResults.some(r => r.standard === 'dwc' && r.valid)) {
        recommendations.push('Fix Darwin Core errors to enable GBIF submission');
    }
    if (!standardResults.some(r => r.standard === 'obis' && r.valid)) {
        recommendations.push('Add WoRMS scientificNameID for OBIS compatibility');
    }
    if (!standardResults.some(r => r.standard === 'iso19115')) {
        recommendations.push('Add ISO 19115 metadata for SDI integration');
    }
    if (overallScore < 70) {
        recommendations.push('Overall compliance is low. Review required fields.');
    }
    if (totalWarnings > 10) {
        recommendations.push('Consider addressing warnings to improve data quality');
    }

    return {
        datasetId,
        timestamp: new Date().toISOString(),
        overallScore,
        overallValid,
        standardResults,
        summary: {
            totalErrors,
            totalWarnings,
            passedStandards,
            failedStandards,
        },
        recommendations,
    };
}

/**
 * Check if dataset should be rejected based on compliance
 */
export function shouldRejectUpload(report: ComplianceReport, threshold: number = 50): {
    reject: boolean;
    reason?: string;
} {
    // Reject if overall score is below threshold
    if (report.overallScore < threshold) {
        return {
            reject: true,
            reason: `Compliance score ${report.overallScore}% is below minimum threshold of ${threshold}%`,
        };
    }

    // Reject if Darwin Core validation fails completely (essential)
    const dwcResult = report.standardResults.find(r => r.standard === 'dwc');
    if (dwcResult && dwcResult.score < 30) {
        return {
            reject: true,
            reason: 'Darwin Core compliance is critically low. Required fields are missing.',
        };
    }

    // Reject if too many critical errors
    const criticalErrors = report.standardResults.flatMap(r =>
        r.errors.filter(e =>
            e.code.includes('REQUIRED') ||
            e.code.includes('EMPTY') ||
            e.code.includes('MISSING')
        )
    );
    if (criticalErrors.length > 10) {
        return {
            reject: true,
            reason: `Too many critical errors (${criticalErrors.length}). Please fix required fields.`,
        };
    }

    return { reject: false };
}

/**
 * Get compliance grade from score
 */
export function getComplianceGrade(score: number): {
    grade: string;
    label: string;
    color: string;
} {
    if (score >= 90) return { grade: 'A', label: 'Excellent', color: 'green' };
    if (score >= 80) return { grade: 'B', label: 'Good', color: 'blue' };
    if (score >= 70) return { grade: 'C', label: 'Acceptable', color: 'yellow' };
    if (score >= 60) return { grade: 'D', label: 'Needs Improvement', color: 'orange' };
    return { grade: 'F', label: 'Failing', color: 'red' };
}

export default {
    validateAgainstStandard,
    validateAllStandards,
    generateComplianceReport,
    shouldRejectUpload,
    getComplianceGrade,
    STANDARD_INFO,
};
