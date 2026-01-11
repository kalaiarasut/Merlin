/**
 * Darwin Core Validator
 * 
 * Production-grade field-level validation for Darwin Core (DwC) standard.
 * Validates occurrence records against DwC terms and controlled vocabularies.
 * 
 * Reference: https://dwc.tdwg.org/terms/
 */

// Darwin Core controlled vocabularies
export const DWC_BASIS_OF_RECORD = [
    'HumanObservation',
    'MachineObservation',
    'MaterialSample',
    'PreservedSpecimen',
    'LivingSpecimen',
    'FossilSpecimen',
    'MaterialCitation',
    'Occurrence',
] as const;

export const DWC_OCCURRENCE_STATUS = ['present', 'absent'] as const;

export const DWC_ESTABLISHMENT_MEANS = [
    'native',
    'nativeReintroduced',
    'introduced',
    'introducedAssistedColonisation',
    'vagrant',
    'uncertain',
] as const;

// Validation error types
export interface ValidationError {
    field: string;
    value: any;
    message: string;
    severity: 'error' | 'warning';
    code: string;
}

export interface ValidationResult {
    valid: boolean;
    score: number;          // 0-100
    totalFields: number;
    validFields: number;
    errors: ValidationError[];
    warnings: ValidationError[];
}

// Darwin Core field definitions with validation rules
interface FieldDefinition {
    required: boolean;
    type: 'string' | 'number' | 'date' | 'enum' | 'uri';
    enumValues?: readonly string[];
    min?: number;
    max?: number;
    pattern?: RegExp;
    validator?: (value: any) => boolean;
}

const DWC_FIELDS: Record<string, FieldDefinition> = {
    // Record-level terms
    occurrenceID: {
        required: true,
        type: 'string',
        pattern: /^[a-zA-Z0-9\-_:/.]+$/,
    },
    basisOfRecord: {
        required: true,
        type: 'enum',
        enumValues: DWC_BASIS_OF_RECORD,
    },
    institutionCode: {
        required: false,
        type: 'string',
    },
    collectionCode: {
        required: false,
        type: 'string',
    },
    datasetName: {
        required: false,
        type: 'string',
    },

    // Occurrence terms
    catalogNumber: {
        required: false,
        type: 'string',
    },
    recordedBy: {
        required: false,
        type: 'string',
    },
    individualCount: {
        required: false,
        type: 'number',
        min: 0,
    },
    organismQuantity: {
        required: false,
        type: 'number',
        min: 0,
    },
    occurrenceStatus: {
        required: false,
        type: 'enum',
        enumValues: DWC_OCCURRENCE_STATUS,
    },
    occurrenceRemarks: {
        required: false,
        type: 'string',
    },

    // Event terms
    eventID: {
        required: false,
        type: 'string',
    },
    eventDate: {
        required: true,
        type: 'date',
    },
    year: {
        required: false,
        type: 'number',
        min: 1700,
        max: 2100,
    },
    month: {
        required: false,
        type: 'number',
        min: 1,
        max: 12,
    },
    day: {
        required: false,
        type: 'number',
        min: 1,
        max: 31,
    },
    habitat: {
        required: false,
        type: 'string',
    },
    samplingProtocol: {
        required: false,
        type: 'string',
    },
    sampleSizeValue: {
        required: false,
        type: 'number',
        min: 0,
    },
    sampleSizeUnit: {
        required: false,
        type: 'string',
    },

    // Location terms
    decimalLatitude: {
        required: true,
        type: 'number',
        min: -90,
        max: 90,
    },
    decimalLongitude: {
        required: true,
        type: 'number',
        min: -180,
        max: 180,
    },
    coordinateUncertaintyInMeters: {
        required: false,
        type: 'number',
        min: 0,
    },
    coordinatePrecision: {
        required: false,
        type: 'number',
        min: 0,
        max: 1,
    },
    geodeticDatum: {
        required: false,
        type: 'string',
    },
    country: {
        required: false,
        type: 'string',
    },
    countryCode: {
        required: false,
        type: 'string',
        pattern: /^[A-Z]{2}$/,
    },
    locality: {
        required: false,
        type: 'string',
    },
    minimumDepthInMeters: {
        required: false,
        type: 'number',
    },
    maximumDepthInMeters: {
        required: false,
        type: 'number',
    },
    verbatimDepth: {
        required: false,
        type: 'string',
    },
    waterBody: {
        required: false,
        type: 'string',
    },

    // Taxon terms
    scientificName: {
        required: true,
        type: 'string',
        pattern: /^[A-Z][a-z]+(\s[a-z]+)?(\s[a-z]+)?$/,
    },
    scientificNameAuthorship: {
        required: false,
        type: 'string',
    },
    kingdom: {
        required: false,
        type: 'string',
    },
    phylum: {
        required: false,
        type: 'string',
    },
    class: {
        required: false,
        type: 'string',
    },
    order: {
        required: false,
        type: 'string',
    },
    family: {
        required: false,
        type: 'string',
    },
    genus: {
        required: false,
        type: 'string',
    },
    specificEpithet: {
        required: false,
        type: 'string',
    },
    taxonRank: {
        required: false,
        type: 'string',
    },
    vernacularName: {
        required: false,
        type: 'string',
    },

    // Identification terms
    identifiedBy: {
        required: false,
        type: 'string',
    },
    dateIdentified: {
        required: false,
        type: 'date',
    },
    identificationRemarks: {
        required: false,
        type: 'string',
    },
    identificationQualifier: {
        required: false,
        type: 'string',
    },
};

/**
 * Validate a single field against Darwin Core rules
 */
function validateField(
    fieldName: string,
    value: any,
    definition: FieldDefinition
): ValidationError | null {
    // Check required fields
    if (definition.required && (value === undefined || value === null || value === '')) {
        return {
            field: fieldName,
            value,
            message: `Required field '${fieldName}' is missing`,
            severity: 'error',
            code: 'DWC_REQUIRED_MISSING',
        };
    }

    // Skip validation for empty optional fields
    if (value === undefined || value === null || value === '') {
        return null;
    }

    // Type validation
    switch (definition.type) {
        case 'string':
            if (typeof value !== 'string') {
                return {
                    field: fieldName,
                    value,
                    message: `Field '${fieldName}' must be a string`,
                    severity: 'error',
                    code: 'DWC_TYPE_STRING',
                };
            }
            if (definition.pattern && !definition.pattern.test(value)) {
                return {
                    field: fieldName,
                    value,
                    message: `Field '${fieldName}' does not match expected pattern`,
                    severity: 'warning',
                    code: 'DWC_PATTERN_MISMATCH',
                };
            }
            break;

        case 'number':
            const num = typeof value === 'number' ? value : parseFloat(value);
            if (isNaN(num)) {
                return {
                    field: fieldName,
                    value,
                    message: `Field '${fieldName}' must be a number`,
                    severity: 'error',
                    code: 'DWC_TYPE_NUMBER',
                };
            }
            if (definition.min !== undefined && num < definition.min) {
                return {
                    field: fieldName,
                    value,
                    message: `Field '${fieldName}' must be >= ${definition.min}`,
                    severity: 'error',
                    code: 'DWC_RANGE_MIN',
                };
            }
            if (definition.max !== undefined && num > definition.max) {
                return {
                    field: fieldName,
                    value,
                    message: `Field '${fieldName}' must be <= ${definition.max}`,
                    severity: 'error',
                    code: 'DWC_RANGE_MAX',
                };
            }
            break;

        case 'date':
            const dateStr = String(value);
            // ISO 8601 date validation
            const isoDateRegex = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;
            if (!isoDateRegex.test(dateStr)) {
                return {
                    field: fieldName,
                    value,
                    message: `Field '${fieldName}' must be a valid ISO 8601 date`,
                    severity: 'error',
                    code: 'DWC_DATE_FORMAT',
                };
            }
            break;

        case 'enum':
            if (definition.enumValues && !definition.enumValues.includes(value as any)) {
                return {
                    field: fieldName,
                    value,
                    message: `Field '${fieldName}' must be one of: ${definition.enumValues.join(', ')}`,
                    severity: 'error',
                    code: 'DWC_ENUM_INVALID',
                };
            }
            break;

        case 'uri':
            try {
                new URL(value);
            } catch {
                return {
                    field: fieldName,
                    value,
                    message: `Field '${fieldName}' must be a valid URI`,
                    severity: 'warning',
                    code: 'DWC_URI_INVALID',
                };
            }
            break;
    }

    // Custom validator
    if (definition.validator && !definition.validator(value)) {
        return {
            field: fieldName,
            value,
            message: `Field '${fieldName}' failed custom validation`,
            severity: 'error',
            code: 'DWC_CUSTOM_VALIDATION',
        };
    }

    return null;
}

/**
 * Validate a single occurrence record against Darwin Core standard
 */
export function validateDarwinCoreRecord(record: Record<string, any>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let validFields = 0;
    let totalFields = 0;

    // Validate known Darwin Core fields
    for (const [fieldName, definition] of Object.entries(DWC_FIELDS)) {
        if (definition.required || record[fieldName] !== undefined) {
            totalFields++;
            const error = validateField(fieldName, record[fieldName], definition);
            if (error) {
                if (error.severity === 'error') {
                    errors.push(error);
                } else {
                    warnings.push(error);
                    validFields++; // Warnings don't count as invalid
                }
            } else if (record[fieldName] !== undefined) {
                validFields++;
            }
        }
    }

    // Check for unknown fields (non-DwC fields)
    for (const fieldName of Object.keys(record)) {
        if (!DWC_FIELDS[fieldName] && !fieldName.startsWith('_')) {
            warnings.push({
                field: fieldName,
                value: record[fieldName],
                message: `Unknown Darwin Core field: '${fieldName}'`,
                severity: 'warning',
                code: 'DWC_UNKNOWN_FIELD',
            });
        }
    }

    // Calculate score (0-100)
    const score = totalFields > 0 ? Math.round((validFields / totalFields) * 100) : 0;

    return {
        valid: errors.length === 0,
        score,
        totalFields,
        validFields,
        errors,
        warnings,
    };
}

/**
 * Validate multiple occurrence records (full dataset)
 */
export function validateDarwinCoreDataset(records: Record<string, any>[]): ValidationResult {
    if (records.length === 0) {
        return {
            valid: false,
            score: 0,
            totalFields: 0,
            validFields: 0,
            errors: [{
                field: 'dataset',
                value: null,
                message: 'Dataset is empty',
                severity: 'error',
                code: 'DWC_EMPTY_DATASET',
            }],
            warnings: [],
        };
    }

    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationError[] = [];
    let totalScore = 0;
    let totalFields = 0;
    let totalValidFields = 0;

    // Validate each record
    records.forEach((record, index) => {
        const result = validateDarwinCoreRecord(record);
        totalScore += result.score;
        totalFields += result.totalFields;
        totalValidFields += result.validFields;

        // Add record index to errors
        result.errors.forEach(err => {
            allErrors.push({
                ...err,
                field: `[${index}].${err.field}`,
            });
        });
        result.warnings.forEach(warn => {
            allWarnings.push({
                ...warn,
                field: `[${index}].${warn.field}`,
            });
        });
    });

    // Limit errors/warnings for large datasets
    const maxErrors = 100;
    const limitedErrors = allErrors.slice(0, maxErrors);
    const limitedWarnings = allWarnings.slice(0, maxErrors);

    if (allErrors.length > maxErrors) {
        limitedErrors.push({
            field: 'dataset',
            value: null,
            message: `... and ${allErrors.length - maxErrors} more errors`,
            severity: 'error',
            code: 'DWC_TRUNCATED_ERRORS',
        });
    }

    return {
        valid: allErrors.length === 0,
        score: Math.round(totalScore / records.length),
        totalFields,
        validFields: totalValidFields,
        errors: limitedErrors,
        warnings: limitedWarnings,
    };
}

/**
 * Get list of required Darwin Core fields
 */
export function getRequiredDarwinCoreFields(): string[] {
    return Object.entries(DWC_FIELDS)
        .filter(([_, def]) => def.required)
        .map(([name, _]) => name);
}

/**
 * Get all Darwin Core field definitions
 */
export function getDarwinCoreFieldDefinitions(): Record<string, FieldDefinition> {
    return { ...DWC_FIELDS };
}

export default {
    validateDarwinCoreRecord,
    validateDarwinCoreDataset,
    getRequiredDarwinCoreFields,
    getDarwinCoreFieldDefinitions,
    DWC_BASIS_OF_RECORD,
    DWC_OCCURRENCE_STATUS,
    DWC_ESTABLISHMENT_MEANS,
};
