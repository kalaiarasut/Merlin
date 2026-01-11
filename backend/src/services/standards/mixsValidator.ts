/**
 * MIxS Validator
 * 
 * Production-grade validation for Minimum Information about any (x) Sequence (MIxS) 6.0 standard.
 * Specifically for eDNA and environmental sequencing data.
 * 
 * Reference: https://genomicsstandardsconsortium.github.io/mixs/
 */

import { ValidationError, ValidationResult } from './darwinCoreValidator';

// MIxS environmental packages
export const MIXS_ENV_PACKAGES = [
    'water',
    'sediment',
    'soil',
    'host-associated',
    'human-gut',
    'human-oral',
    'human-skin',
    'air',
    'built-environment',
    'plant-associated',
    'miscellaneous',
] as const;

// MIxS sequencing methods
export const MIXS_SEQ_METHODS = [
    'amplicon sequencing',
    'metagenomic',
    'metatranscriptomic',
    'targeted locus',
    'whole genome',
] as const;

// MIxS library strategies
export const MIXS_LIBRARY_STRATEGIES = [
    'AMPLICON',
    'WGS',
    'WXS',
    'RNA-Seq',
    'miRNA-Seq',
    'ChIP-Seq',
    'Hi-C',
    'ATAC-seq',
    'Bisulfite-Seq',
    'OTHER',
] as const;

// MIxS target genes for eDNA
export const MIXS_TARGET_GENES = [
    '16S rRNA',
    '18S rRNA',
    '23S rRNA',
    '28S rRNA',
    'COI',
    'ITS',
    'rbcL',
    'matK',
    'cytB',
    '12S rRNA',
    'other',
] as const;

// MIxS field definitions
interface MIxSFieldDefinition {
    required: boolean;
    section: 'core' | 'water' | 'sequencing' | 'edna';
    type: 'string' | 'number' | 'date' | 'enum' | 'ontology';
    enumValues?: readonly string[];
    min?: number;
    max?: number;
    pattern?: RegExp;
    unit?: string;
    description?: string;
}

const MIXS_FIELDS: Record<string, MIxSFieldDefinition> = {
    // ===== CORE FIELDS =====
    sample_name: {
        required: true,
        section: 'core',
        type: 'string',
        description: 'Unique sample identifier',
    },
    project_name: {
        required: true,
        section: 'core',
        type: 'string',
        description: 'Name of the project',
    },
    lat_lon: {
        required: true,
        section: 'core',
        type: 'string',
        pattern: /^-?\d+\.?\d*\s+-?\d+\.?\d*$/,
        description: 'Latitude and longitude (space-separated)',
    },
    geo_loc_name: {
        required: true,
        section: 'core',
        type: 'string',
        description: 'Geographic location (country:region:locality)',
    },
    collection_date: {
        required: true,
        section: 'core',
        type: 'date',
        description: 'Date of sample collection (ISO 8601)',
    },
    env_broad_scale: {
        required: true,
        section: 'core',
        type: 'ontology',
        description: 'Broad-scale environmental context (ENVO term)',
    },
    env_local_scale: {
        required: true,
        section: 'core',
        type: 'ontology',
        description: 'Local environmental context (ENVO term)',
    },
    env_medium: {
        required: true,
        section: 'core',
        type: 'ontology',
        description: 'Environmental medium (ENVO term)',
    },

    // ===== WATER-SPECIFIC FIELDS =====
    depth: {
        required: false,
        section: 'water',
        type: 'number',
        min: 0,
        max: 11000,
        unit: 'm',
        description: 'Depth of sampling in meters',
    },
    temp: {
        required: false,
        section: 'water',
        type: 'number',
        min: -5,
        max: 50,
        unit: '°C',
        description: 'Temperature at sampling',
    },
    salinity: {
        required: false,
        section: 'water',
        type: 'number',
        min: 0,
        max: 50,
        unit: 'PSU',
        description: 'Salinity',
    },
    ph: {
        required: false,
        section: 'water',
        type: 'number',
        min: 0,
        max: 14,
        description: 'pH of water',
    },
    diss_oxygen: {
        required: false,
        section: 'water',
        type: 'number',
        min: 0,
        unit: 'mg/L',
        description: 'Dissolved oxygen concentration',
    },
    chlorophyll: {
        required: false,
        section: 'water',
        type: 'number',
        min: 0,
        unit: 'mg/m³',
        description: 'Chlorophyll concentration',
    },
    turbidity: {
        required: false,
        section: 'water',
        type: 'number',
        min: 0,
        unit: 'NTU',
        description: 'Turbidity',
    },

    // ===== SEQUENCING FIELDS =====
    seq_meth: {
        required: true,
        section: 'sequencing',
        type: 'string',
        description: 'Sequencing method/platform',
    },
    lib_layout: {
        required: false,
        section: 'sequencing',
        type: 'enum',
        enumValues: ['PAIRED', 'SINGLE'],
        description: 'Library layout',
    },
    lib_strategy: {
        required: false,
        section: 'sequencing',
        type: 'enum',
        enumValues: MIXS_LIBRARY_STRATEGIES,
        description: 'Library preparation strategy',
    },
    nucl_acid_ext: {
        required: false,
        section: 'sequencing',
        type: 'string',
        description: 'DNA/RNA extraction method',
    },
    nucl_acid_amp: {
        required: false,
        section: 'sequencing',
        type: 'string',
        description: 'Nucleic acid amplification method',
    },

    // ===== eDNA-SPECIFIC FIELDS =====
    target_gene: {
        required: true,
        section: 'edna',
        type: 'string',
        description: 'Target gene for amplicon sequencing',
    },
    target_subfragment: {
        required: false,
        section: 'edna',
        type: 'string',
        description: 'Target subfragment (e.g., V4, V3-V4)',
    },
    pcr_primers: {
        required: true,
        section: 'edna',
        type: 'string',
        pattern: /^FWD:.+;REV:.+$/,
        description: 'PCR primers (FWD:sequence;REV:sequence)',
    },
    pcr_cond: {
        required: false,
        section: 'edna',
        type: 'string',
        description: 'PCR conditions',
    },
    samp_vol_we_dna_ext: {
        required: false,
        section: 'edna',
        type: 'number',
        min: 0,
        unit: 'mL',
        description: 'Volume of sample used for DNA extraction',
    },
    filter_type: {
        required: false,
        section: 'edna',
        type: 'string',
        description: 'Type of filter used',
    },
    filter_pore_size: {
        required: false,
        section: 'edna',
        type: 'number',
        min: 0,
        unit: 'μm',
        description: 'Filter pore size',
    },
    samp_store_temp: {
        required: false,
        section: 'edna',
        type: 'number',
        unit: '°C',
        description: 'Sample storage temperature',
    },
    samp_store_dur: {
        required: false,
        section: 'edna',
        type: 'string',
        description: 'Sample storage duration',
    },
};

/**
 * Validate ENVO ontology term format
 */
function validateENVOTerm(value: string): boolean {
    // ENVO terms should be URIs or formatted with underscores
    return /^ENVO[_:]?\d+$/.test(value) || value.includes('purl.obolibrary.org/obo/ENVO');
}

/**
 * Validate lat_lon format
 */
function parseLatLon(value: string): { lat: number; lon: number } | null {
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 2) return null;
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lon)) return null;
    if (lat < -90 || lat > 90) return null;
    if (lon < -180 || lon > 180) return null;
    return { lat, lon };
}

/**
 * Validate a single MIxS record
 */
export function validateMIxSRecord(
    record: Record<string, any>,
    envPackage: string = 'water'
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let validFields = 0;
    let totalFields = 0;

    // Determine which fields are relevant for this package
    const relevantSections = ['core', 'sequencing', 'edna', envPackage];

    for (const [fieldName, definition] of Object.entries(MIXS_FIELDS)) {
        // Skip fields not in relevant sections
        if (!relevantSections.includes(definition.section) && definition.section !== 'core') {
            continue;
        }

        const value = record[fieldName];

        if (definition.required || value !== undefined) {
            totalFields++;

            // Required field check
            if (definition.required && (value === undefined || value === null || value === '')) {
                errors.push({
                    field: fieldName,
                    value,
                    message: `Required MIxS field '${fieldName}' is missing`,
                    severity: 'error',
                    code: 'MIXS_REQUIRED_MISSING',
                });
                continue;
            }

            // Skip empty optional fields
            if (value === undefined || value === null || value === '') {
                continue;
            }

            let fieldValid = true;

            // Type-specific validation
            switch (definition.type) {
                case 'string':
                    if (typeof value !== 'string') {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be a string`,
                            severity: 'error',
                            code: 'MIXS_TYPE_STRING',
                        });
                        fieldValid = false;
                    } else if (definition.pattern && !definition.pattern.test(value)) {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' does not match expected format`,
                            severity: 'error',
                            code: 'MIXS_PATTERN_MISMATCH',
                        });
                        fieldValid = false;
                    }
                    break;

                case 'number':
                    const num = typeof value === 'number' ? value : parseFloat(value);
                    if (isNaN(num)) {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be a number`,
                            severity: 'error',
                            code: 'MIXS_TYPE_NUMBER',
                        });
                        fieldValid = false;
                    } else {
                        if (definition.min !== undefined && num < definition.min) {
                            errors.push({
                                field: fieldName,
                                value,
                                message: `Field '${fieldName}' must be >= ${definition.min}`,
                                severity: 'error',
                                code: 'MIXS_RANGE_MIN',
                            });
                            fieldValid = false;
                        }
                        if (definition.max !== undefined && num > definition.max) {
                            errors.push({
                                field: fieldName,
                                value,
                                message: `Field '${fieldName}' must be <= ${definition.max}`,
                                severity: 'error',
                                code: 'MIXS_RANGE_MAX',
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
                            code: 'MIXS_DATE_FORMAT',
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
                            code: 'MIXS_ENUM_INVALID',
                        });
                        fieldValid = false;
                    }
                    break;

                case 'ontology':
                    if (!validateENVOTerm(value)) {
                        warnings.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' should be a valid ENVO ontology term`,
                            severity: 'warning',
                            code: 'MIXS_ONTOLOGY_FORMAT',
                        });
                    }
                    break;
            }

            if (fieldValid) {
                validFields++;
            }
        }
    }

    // Validate lat_lon specifically
    if (record.lat_lon) {
        const coords = parseLatLon(record.lat_lon);
        if (!coords) {
            errors.push({
                field: 'lat_lon',
                value: record.lat_lon,
                message: 'lat_lon must be in format "latitude longitude" (e.g., "12.34 56.78")',
                severity: 'error',
                code: 'MIXS_LATLON_FORMAT',
            });
        }
    }

    // eDNA-specific validations
    if (record.target_gene) {
        const knownGenes = MIXS_TARGET_GENES.map(g => g.toLowerCase());
        if (!knownGenes.includes(record.target_gene.toLowerCase())) {
            warnings.push({
                field: 'target_gene',
                value: record.target_gene,
                message: `Unknown target gene '${record.target_gene}'. Common genes: ${MIXS_TARGET_GENES.join(', ')}`,
                severity: 'warning',
                code: 'MIXS_UNKNOWN_TARGET_GENE',
            });
        }
    }

    // PCR primer format validation
    if (record.pcr_primers && typeof record.pcr_primers === 'string') {
        if (!record.pcr_primers.includes('FWD:') || !record.pcr_primers.includes('REV:')) {
            warnings.push({
                field: 'pcr_primers',
                value: record.pcr_primers,
                message: 'pcr_primers should be in format "FWD:sequence;REV:sequence"',
                severity: 'warning',
                code: 'MIXS_PRIMER_FORMAT',
            });
        }
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
 * Validate multiple MIxS records (full dataset)
 */
export function validateMIxSDataset(
    records: Record<string, any>[],
    envPackage: string = 'water'
): ValidationResult {
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
                code: 'MIXS_EMPTY_DATASET',
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
        const result = validateMIxSRecord(record, envPackage);
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
 * Get required MIxS fields for a given package
 */
export function getRequiredMIxSFields(envPackage: string = 'water'): string[] {
    const relevantSections = ['core', 'sequencing', 'edna', envPackage];
    return Object.entries(MIXS_FIELDS)
        .filter(([_, def]) => def.required && relevantSections.includes(def.section))
        .map(([name, _]) => name);
}

/**
 * Get all MIxS field definitions
 */
export function getMIxSFieldDefinitions(): Record<string, MIxSFieldDefinition> {
    return { ...MIXS_FIELDS };
}

export default {
    validateMIxSRecord,
    validateMIxSDataset,
    getRequiredMIxSFields,
    getMIxSFieldDefinitions,
    MIXS_ENV_PACKAGES,
    MIXS_SEQ_METHODS,
    MIXS_TARGET_GENES,
    MIXS_LIBRARY_STRATEGIES,
};
