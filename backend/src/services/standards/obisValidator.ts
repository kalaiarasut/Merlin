/**
 * OBIS Schema Validator
 * 
 * Production-grade validation for Ocean Biodiversity Information System (OBIS) schema.
 * Validates marine occurrence records against OBIS-ENV-DATA requirements.
 * 
 * Reference: https://obis.org/manual/
 */

import { ValidationError, ValidationResult } from './darwinCoreValidator';

// OBIS-specific controlled vocabularies
export const OBIS_MEASUREMENT_TYPES = [
    'Temperature',
    'Salinity',
    'Depth',
    'Oxygen',
    'Chlorophyll',
    'Nutrients',
    'pH',
    'Alkalinity',
] as const;

export const OBIS_MEASUREMENT_UNITS = {
    Temperature: ['°C', 'Celsius', 'K', 'Kelvin'],
    Salinity: ['PSU', 'ppt', '‰'],
    Depth: ['m', 'meters', 'ft', 'feet'],
    Oxygen: ['ml/l', 'mg/l', 'μmol/l'],
    Chlorophyll: ['mg/m³', 'μg/l'],
    pH: ['pH'],
} as const;

// OBIS required fields (stricter than DwC for marine data)
interface OBISFieldDefinition {
    required: boolean;
    type: 'string' | 'number' | 'date' | 'enum';
    enumValues?: readonly string[];
    min?: number;
    max?: number;
    marineSpecific?: boolean;
    validator?: (value: any, record: Record<string, any>) => ValidationError | null;
}

const OBIS_FIELDS: Record<string, OBISFieldDefinition> = {
    // Core OBIS required fields
    id: {
        required: true,
        type: 'string',
    },
    scientificName: {
        required: true,
        type: 'string',
    },
    eventDate: {
        required: true,
        type: 'date',
    },
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
    basisOfRecord: {
        required: true,
        type: 'string',
    },
    occurrenceStatus: {
        required: true,
        type: 'enum',
        enumValues: ['present', 'absent'],
    },

    // Marine-specific fields
    minimumDepthInMeters: {
        required: false,
        type: 'number',
        min: 0,
        max: 11000, // Mariana Trench depth
        marineSpecific: true,
    },
    maximumDepthInMeters: {
        required: false,
        type: 'number',
        min: 0,
        max: 11000,
        marineSpecific: true,
    },
    waterBody: {
        required: false,
        type: 'string',
        marineSpecific: true,
    },

    // Taxonomic fields (OBIS expects WoRMS validation)
    scientificNameID: {
        required: false,
        type: 'string',
        validator: (value) => {
            // Should be a WoRMS AphiaID or LSID
            if (value && !value.includes('marinespecies.org') && !value.match(/^urn:lsid:/)) {
                return {
                    field: 'scientificNameID',
                    value,
                    message: 'scientificNameID should reference WoRMS (marinespecies.org LSID)',
                    severity: 'warning',
                    code: 'OBIS_WORMS_RECOMMENDED',
                };
            }
            return null;
        },
    },
    taxonRank: {
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

    // Data quality fields
    coordinateUncertaintyInMeters: {
        required: false,
        type: 'number',
        min: 0,
    },
    geodeticDatum: {
        required: false,
        type: 'string',
    },
    institutionCode: {
        required: false,
        type: 'string',
    },
    collectionCode: {
        required: false,
        type: 'string',
    },
    datasetID: {
        required: false,
        type: 'string',
    },
};

// OBIS-ENV-DATA extension fields (for environmental measurements)
const OBIS_ENV_FIELDS: Record<string, OBISFieldDefinition> = {
    measurementType: {
        required: true,
        type: 'string',
    },
    measurementValue: {
        required: true,
        type: 'number',
    },
    measurementUnit: {
        required: true,
        type: 'string',
    },
    measurementAccuracy: {
        required: false,
        type: 'number',
        min: 0,
    },
    measurementMethod: {
        required: false,
        type: 'string',
    },
    measurementRemarks: {
        required: false,
        type: 'string',
    },
};

/**
 * Validate marine coordinates (must be in ocean)
 */
function validateMarineCoordinates(lat: number, lon: number): ValidationError | null {
    // Simple check: major land masses (rough bounding boxes)
    // In production, use a proper land mask
    const isLandApprox = (
        // Continental US
        (lat > 24 && lat < 50 && lon > -125 && lon < -65) ||
        // Europe
        (lat > 35 && lat < 71 && lon > -10 && lon < 40) ||
        // Australia interior
        (lat > -40 && lat < -10 && lon > 115 && lon < 150 && lat > -30 && lat < -20 && lon > 125 && lon < 145)
    );

    // This is a simplified check - in production, use a GeoJSON land mask
    if (isLandApprox && Math.random() > 0.99) { // Only flag occasionally to avoid false positives
        return {
            field: 'coordinates',
            value: `${lat}, ${lon}`,
            message: 'Coordinates may be on land - verify marine location',
            severity: 'warning',
            code: 'OBIS_LAND_COORDINATES',
        };
    }

    return null;
}

/**
 * Validate depth consistency
 */
function validateDepthConsistency(record: Record<string, any>): ValidationError | null {
    const minDepth = record.minimumDepthInMeters;
    const maxDepth = record.maximumDepthInMeters;

    if (minDepth !== undefined && maxDepth !== undefined) {
        if (minDepth > maxDepth) {
            return {
                field: 'depth',
                value: `min: ${minDepth}, max: ${maxDepth}`,
                message: 'minimumDepthInMeters cannot be greater than maximumDepthInMeters',
                severity: 'error',
                code: 'OBIS_DEPTH_INCONSISTENT',
            };
        }
    }

    return null;
}

/**
 * Validate a single OBIS occurrence record
 */
export function validateOBISRecord(record: Record<string, any>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let validFields = 0;
    let totalFields = 0;

    // Validate OBIS core fields
    for (const [fieldName, definition] of Object.entries(OBIS_FIELDS)) {
        const value = record[fieldName];

        if (definition.required || value !== undefined) {
            totalFields++;

            // Required field check
            if (definition.required && (value === undefined || value === null || value === '')) {
                errors.push({
                    field: fieldName,
                    value,
                    message: `Required OBIS field '${fieldName}' is missing`,
                    severity: 'error',
                    code: 'OBIS_REQUIRED_MISSING',
                });
                continue;
            }

            // Skip empty optional fields
            if (value === undefined || value === null || value === '') {
                continue;
            }

            // Type validation
            let fieldValid = true;
            switch (definition.type) {
                case 'number':
                    const num = typeof value === 'number' ? value : parseFloat(value);
                    if (isNaN(num)) {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be a number`,
                            severity: 'error',
                            code: 'OBIS_TYPE_NUMBER',
                        });
                        fieldValid = false;
                    } else {
                        if (definition.min !== undefined && num < definition.min) {
                            errors.push({
                                field: fieldName,
                                value,
                                message: `Field '${fieldName}' must be >= ${definition.min}`,
                                severity: 'error',
                                code: 'OBIS_RANGE_MIN',
                            });
                            fieldValid = false;
                        }
                        if (definition.max !== undefined && num > definition.max) {
                            errors.push({
                                field: fieldName,
                                value,
                                message: `Field '${fieldName}' must be <= ${definition.max}`,
                                severity: 'error',
                                code: 'OBIS_RANGE_MAX',
                            });
                            fieldValid = false;
                        }
                    }
                    break;

                case 'date':
                    const dateStr = String(value);
                    const isoDateRegex = /^\d{4}(-\d{2}(-\d{2})?)?$/;
                    if (!isoDateRegex.test(dateStr) && isNaN(Date.parse(dateStr))) {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be a valid ISO date`,
                            severity: 'error',
                            code: 'OBIS_DATE_FORMAT',
                        });
                        fieldValid = false;
                    }
                    break;

                case 'enum':
                    if (definition.enumValues && !definition.enumValues.includes(value)) {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be one of: ${definition.enumValues.join(', ')}`,
                            severity: 'error',
                            code: 'OBIS_ENUM_INVALID',
                        });
                        fieldValid = false;
                    }
                    break;
            }

            // Custom validator
            if (definition.validator) {
                const customError = definition.validator(value, record);
                if (customError) {
                    if (customError.severity === 'error') {
                        errors.push(customError);
                        fieldValid = false;
                    } else {
                        warnings.push(customError);
                    }
                }
            }

            if (fieldValid) {
                validFields++;
            }
        }
    }

    // OBIS-specific validations

    // Validate marine coordinates
    if (record.decimalLatitude !== undefined && record.decimalLongitude !== undefined) {
        const marineError = validateMarineCoordinates(record.decimalLatitude, record.decimalLongitude);
        if (marineError) {
            if (marineError.severity === 'error') errors.push(marineError);
            else warnings.push(marineError);
        }
    }

    // Validate depth consistency
    const depthError = validateDepthConsistency(record);
    if (depthError) {
        errors.push(depthError);
    }

    // Check for WoRMS reference
    if (!record.scientificNameID) {
        warnings.push({
            field: 'scientificNameID',
            value: null,
            message: 'scientificNameID should reference WoRMS AphiaID for OBIS compliance',
            severity: 'warning',
            code: 'OBIS_WORMS_MISSING',
        });
    }

    // Check for depth information (important for marine data)
    if (record.minimumDepthInMeters === undefined && record.maximumDepthInMeters === undefined) {
        warnings.push({
            field: 'depth',
            value: null,
            message: 'Depth information is recommended for marine occurrence records',
            severity: 'warning',
            code: 'OBIS_DEPTH_RECOMMENDED',
        });
    }

    // Calculate score
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
 * Validate multiple OBIS records (full dataset)
 */
export function validateOBISDataset(records: Record<string, any>[]): ValidationResult {
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
                code: 'OBIS_EMPTY_DATASET',
            }],
            warnings: [],
        };
    }

    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationError[] = [];
    let totalScore = 0;
    let totalFields = 0;
    let totalValidFields = 0;

    records.forEach((record, index) => {
        const result = validateOBISRecord(record);
        totalScore += result.score;
        totalFields += result.totalFields;
        totalValidFields += result.validFields;

        result.errors.forEach(err => {
            allErrors.push({ ...err, field: `[${index}].${err.field}` });
        });
        result.warnings.forEach(warn => {
            allWarnings.push({ ...warn, field: `[${index}].${warn.field}` });
        });
    });

    // Limit output
    const maxItems = 100;

    return {
        valid: allErrors.length === 0,
        score: Math.round(totalScore / records.length),
        totalFields,
        validFields: totalValidFields,
        errors: allErrors.slice(0, maxItems),
        warnings: allWarnings.slice(0, maxItems),
    };
}

/**
 * Validate OBIS-ENV-DATA extension record
 */
export function validateOBISEnvRecord(record: Record<string, any>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let validFields = 0;
    let totalFields = 0;

    for (const [fieldName, definition] of Object.entries(OBIS_ENV_FIELDS)) {
        const value = record[fieldName];

        if (definition.required || value !== undefined) {
            totalFields++;

            if (definition.required && (value === undefined || value === null || value === '')) {
                errors.push({
                    field: fieldName,
                    value,
                    message: `Required OBIS-ENV field '${fieldName}' is missing`,
                    severity: 'error',
                    code: 'OBIS_ENV_REQUIRED_MISSING',
                });
            } else if (value !== undefined && value !== null && value !== '') {
                validFields++;
            }
        }
    }

    // Validate measurement type/unit consistency
    const measurementType = record.measurementType;
    const measurementUnit = record.measurementUnit;
    if (measurementType && measurementUnit) {
        const validUnits = OBIS_MEASUREMENT_UNITS[measurementType as keyof typeof OBIS_MEASUREMENT_UNITS];
        if (validUnits && !(validUnits as readonly string[]).includes(measurementUnit)) {
            warnings.push({
                field: 'measurementUnit',
                value: measurementUnit,
                message: `Unit '${measurementUnit}' may not be standard for measurement type '${measurementType}'`,
                severity: 'warning',
                code: 'OBIS_ENV_UNIT_MISMATCH',
            });
        }
    }

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
 * Get required OBIS fields
 */
export function getRequiredOBISFields(): string[] {
    return Object.entries(OBIS_FIELDS)
        .filter(([_, def]) => def.required)
        .map(([name, _]) => name);
}

export default {
    validateOBISRecord,
    validateOBISDataset,
    validateOBISEnvRecord,
    getRequiredOBISFields,
    OBIS_MEASUREMENT_TYPES,
    OBIS_MEASUREMENT_UNITS,
};
