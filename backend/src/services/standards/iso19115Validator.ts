/**
 * ISO 19115 Metadata Validator
 * 
 * Production-grade validation for geographic metadata standard ISO 19115:2014.
 * Validates dataset metadata completeness for spatial data infrastructure.
 * 
 * Reference: https://www.iso.org/standard/53798.html
 */

import { ValidationError, ValidationResult } from './darwinCoreValidator';

// ISO 19115 Topic Categories
export const ISO_TOPIC_CATEGORIES = [
    'farming',
    'biota',
    'boundaries',
    'climatologyMeteorologyAtmosphere',
    'economy',
    'elevation',
    'environment',
    'geoscientificInformation',
    'health',
    'imageryBaseMapsEarthCover',
    'intelligenceMilitary',
    'inlandWaters',
    'location',
    'oceans',
    'planningCadastre',
    'society',
    'structure',
    'transportation',
    'utilitiesCommunication',
] as const;

// ISO 19115 Scope Codes
export const ISO_SCOPE_CODES = [
    'attribute',
    'attributeType',
    'collectionHardware',
    'collectionSession',
    'dataset',
    'series',
    'nonGeographicDataset',
    'dimensionGroup',
    'feature',
    'featureType',
    'propertyType',
    'fieldSession',
    'software',
    'service',
    'model',
    'tile',
] as const;

// ISO 19115 Date Types
export const ISO_DATE_TYPES = [
    'creation',
    'publication',
    'revision',
    'expiry',
    'lastUpdate',
    'lastRevision',
    'nextUpdate',
    'unavailable',
    'inForce',
    'adopted',
    'deprecated',
    'superseded',
    'validityBegins',
    'validityExpires',
    'released',
    'distribution',
] as const;

// ISO 19115 Role Codes
export const ISO_ROLE_CODES = [
    'resourceProvider',
    'custodian',
    'owner',
    'user',
    'distributor',
    'originator',
    'pointOfContact',
    'principalInvestigator',
    'processor',
    'publisher',
    'author',
    'sponsor',
    'coAuthor',
    'collaborator',
    'editor',
    'mediator',
    'rightsHolder',
    'contributor',
    'funder',
    'stakeholder',
] as const;

// ISO 19115 restriction codes
export const ISO_RESTRICTION_CODES = [
    'copyright',
    'patent',
    'patentPending',
    'trademark',
    'licence',
    'intellectualPropertyRights',
    'restricted',
    'otherRestrictions',
    'unrestricted',
    'licenceUnrestricted',
    'licenceEndUser',
    'licenceDistributor',
    'private',
    'statutory',
    'confidential',
    'sensitiveButUnclassified',
    'in-confidence',
] as const;

interface ISO19115FieldDefinition {
    required: boolean;
    type: 'string' | 'date' | 'enum' | 'array' | 'object' | 'number';
    section: 'identification' | 'spatial' | 'quality' | 'distribution' | 'contact' | 'constraints';
    enumValues?: readonly string[];
    minLength?: number;
    description: string;
}

const ISO19115_FIELDS: Record<string, ISO19115FieldDefinition> = {
    // ===== IDENTIFICATION SECTION =====
    title: {
        required: true,
        type: 'string',
        section: 'identification',
        minLength: 5,
        description: 'Title of the dataset',
    },
    abstract: {
        required: true,
        type: 'string',
        section: 'identification',
        minLength: 50,
        description: 'Brief description of the dataset',
    },
    purpose: {
        required: false,
        type: 'string',
        section: 'identification',
        description: 'Purpose for which the dataset was created',
    },
    status: {
        required: false,
        type: 'enum',
        section: 'identification',
        enumValues: ['completed', 'historicalArchive', 'obsolete', 'onGoing', 'planned', 'required', 'underDevelopment'],
        description: 'Current status of the dataset',
    },
    topicCategory: {
        required: true,
        type: 'array',
        section: 'identification',
        description: 'Main theme(s) of the dataset',
    },
    keywords: {
        required: true,
        type: 'array',
        section: 'identification',
        description: 'Keywords describing the dataset',
    },
    language: {
        required: true,
        type: 'string',
        section: 'identification',
        description: 'Language of the dataset (ISO 639-2)',
    },
    characterSet: {
        required: false,
        type: 'string',
        section: 'identification',
        description: 'Character encoding (e.g., UTF-8)',
    },

    // ===== SPATIAL SECTION =====
    spatialRepresentationType: {
        required: false,
        type: 'enum',
        section: 'spatial',
        enumValues: ['vector', 'grid', 'textTable', 'tin', 'stereoModel', 'video'],
        description: 'Type of spatial representation',
    },
    spatialResolution: {
        required: false,
        type: 'number',
        section: 'spatial',
        description: 'Ground sample distance in meters',
    },
    referenceSystemIdentifier: {
        required: true,
        type: 'string',
        section: 'spatial',
        description: 'Coordinate reference system (e.g., EPSG:4326)',
    },
    geographicBoundingBox: {
        required: true,
        type: 'object',
        section: 'spatial',
        description: 'Geographic extent (westBoundLongitude, eastBoundLongitude, southBoundLatitude, northBoundLatitude)',
    },
    temporalExtent: {
        required: false,
        type: 'object',
        section: 'spatial',
        description: 'Temporal coverage (beginDate, endDate)',
    },
    verticalExtent: {
        required: false,
        type: 'object',
        section: 'spatial',
        description: 'Vertical coverage (minimumValue, maximumValue, unitOfMeasure)',
    },

    // ===== DATA QUALITY SECTION =====
    scope: {
        required: false,
        type: 'enum',
        section: 'quality',
        enumValues: ISO_SCOPE_CODES,
        description: 'Scope of the quality information',
    },
    lineage: {
        required: true,
        type: 'string',
        section: 'quality',
        minLength: 20,
        description: 'Description of the source data and processing steps',
    },
    positionalAccuracy: {
        required: false,
        type: 'number',
        section: 'quality',
        description: 'Positional accuracy in meters',
    },
    completeness: {
        required: false,
        type: 'string',
        section: 'quality',
        description: 'Description of data completeness',
    },

    // ===== DISTRIBUTION SECTION =====
    distributorContact: {
        required: false,
        type: 'object',
        section: 'distribution',
        description: 'Contact information for data distribution',
    },
    distributionFormat: {
        required: true,
        type: 'string',
        section: 'distribution',
        description: 'Format of the data (e.g., CSV, NetCDF, GeoJSON)',
    },
    onlineResource: {
        required: false,
        type: 'string',
        section: 'distribution',
        description: 'URL for accessing the data',
    },

    // ===== CONTACT SECTION =====
    pointOfContact: {
        required: true,
        type: 'object',
        section: 'contact',
        description: 'Contact information for the dataset',
    },
    citationResponsibleParty: {
        required: true,
        type: 'object',
        section: 'contact',
        description: 'Organization or person responsible for the dataset',
    },

    // ===== CONSTRAINTS SECTION =====
    useLimitation: {
        required: false,
        type: 'string',
        section: 'constraints',
        description: 'Limitations on using the dataset',
    },
    accessConstraints: {
        required: false,
        type: 'enum',
        section: 'constraints',
        enumValues: ISO_RESTRICTION_CODES,
        description: 'Access restrictions',
    },
    useConstraints: {
        required: false,
        type: 'enum',
        section: 'constraints',
        enumValues: ISO_RESTRICTION_CODES,
        description: 'Use restrictions',
    },
    otherConstraints: {
        required: false,
        type: 'string',
        section: 'constraints',
        description: 'Other constraints if restriction code is "otherRestrictions"',
    },

    // ===== DATE INFORMATION =====
    dateStamp: {
        required: true,
        type: 'date',
        section: 'identification',
        description: 'Date the metadata was created or updated',
    },
    creationDate: {
        required: false,
        type: 'date',
        section: 'identification',
        description: 'Date the dataset was created',
    },
    publicationDate: {
        required: false,
        type: 'date',
        section: 'identification',
        description: 'Date the dataset was published',
    },
    revisionDate: {
        required: false,
        type: 'date',
        section: 'identification',
        description: 'Date the dataset was last revised',
    },

    // ===== METADATA SECTION =====
    fileIdentifier: {
        required: true,
        type: 'string',
        section: 'identification',
        description: 'Unique identifier for the metadata record',
    },
    metadataStandardName: {
        required: false,
        type: 'string',
        section: 'identification',
        description: 'Name of the metadata standard used',
    },
    metadataStandardVersion: {
        required: false,
        type: 'string',
        section: 'identification',
        description: 'Version of the metadata standard',
    },
};

/**
 * Validate geographic bounding box
 */
function validateBoundingBox(box: any): ValidationError | null {
    if (!box || typeof box !== 'object') {
        return {
            field: 'geographicBoundingBox',
            value: box,
            message: 'Geographic bounding box must be an object',
            severity: 'error',
            code: 'ISO_BBOX_INVALID',
        };
    }

    const { westBoundLongitude, eastBoundLongitude, southBoundLatitude, northBoundLatitude } = box;

    // Check all values present
    if ([westBoundLongitude, eastBoundLongitude, southBoundLatitude, northBoundLatitude].some(v => v === undefined)) {
        return {
            field: 'geographicBoundingBox',
            value: box,
            message: 'Bounding box must include westBoundLongitude, eastBoundLongitude, southBoundLatitude, northBoundLatitude',
            severity: 'error',
            code: 'ISO_BBOX_INCOMPLETE',
        };
    }

    // Validate ranges
    if (westBoundLongitude < -180 || westBoundLongitude > 180 ||
        eastBoundLongitude < -180 || eastBoundLongitude > 180) {
        return {
            field: 'geographicBoundingBox',
            value: box,
            message: 'Longitude values must be between -180 and 180',
            severity: 'error',
            code: 'ISO_BBOX_LONGITUDE',
        };
    }

    if (southBoundLatitude < -90 || southBoundLatitude > 90 ||
        northBoundLatitude < -90 || northBoundLatitude > 90) {
        return {
            field: 'geographicBoundingBox',
            value: box,
            message: 'Latitude values must be between -90 and 90',
            severity: 'error',
            code: 'ISO_BBOX_LATITUDE',
        };
    }

    if (southBoundLatitude > northBoundLatitude) {
        return {
            field: 'geographicBoundingBox',
            value: box,
            message: 'southBoundLatitude cannot be greater than northBoundLatitude',
            severity: 'error',
            code: 'ISO_BBOX_LAT_ORDER',
        };
    }

    return null;
}

/**
 * Validate contact object
 */
function validateContact(contact: any, fieldName: string): ValidationError | null {
    if (!contact || typeof contact !== 'object') {
        return {
            field: fieldName,
            value: contact,
            message: `${fieldName} must be an object with contact details`,
            severity: 'error',
            code: 'ISO_CONTACT_INVALID',
        };
    }

    // Check for required contact fields
    const hasName = contact.individualName || contact.organisationName;
    if (!hasName) {
        return {
            field: fieldName,
            value: contact,
            message: `${fieldName} must include individualName or organisationName`,
            severity: 'error',
            code: 'ISO_CONTACT_NO_NAME',
        };
    }

    return null;
}

/**
 * Validate ISO 19115 metadata record
 */
export function validateISO19115Metadata(metadata: Record<string, any>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let validFields = 0;
    let totalFields = 0;

    for (const [fieldName, definition] of Object.entries(ISO19115_FIELDS)) {
        const value = metadata[fieldName];

        if (definition.required || value !== undefined) {
            totalFields++;

            // Required field check
            if (definition.required && (value === undefined || value === null || value === '')) {
                errors.push({
                    field: fieldName,
                    value,
                    message: `Required ISO 19115 field '${fieldName}' is missing`,
                    severity: 'error',
                    code: 'ISO_REQUIRED_MISSING',
                });
                continue;
            }

            // Skip empty optional fields
            if (value === undefined || value === null || value === '') {
                continue;
            }

            let fieldValid = true;

            switch (definition.type) {
                case 'string':
                    if (typeof value !== 'string') {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be a string`,
                            severity: 'error',
                            code: 'ISO_TYPE_STRING',
                        });
                        fieldValid = false;
                    } else if (definition.minLength && value.length < definition.minLength) {
                        warnings.push({
                            field: fieldName,
                            value: value.substring(0, 50) + '...',
                            message: `Field '${fieldName}' should be at least ${definition.minLength} characters`,
                            severity: 'warning',
                            code: 'ISO_MIN_LENGTH',
                        });
                    }
                    break;

                case 'date':
                    const dateStr = String(value);
                    if (isNaN(Date.parse(dateStr))) {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be a valid date`,
                            severity: 'error',
                            code: 'ISO_DATE_FORMAT',
                        });
                        fieldValid = false;
                    }
                    break;

                case 'enum':
                    if (definition.enumValues && !definition.enumValues.includes(value)) {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be one of: ${definition.enumValues.slice(0, 5).join(', ')}...`,
                            severity: 'error',
                            code: 'ISO_ENUM_INVALID',
                        });
                        fieldValid = false;
                    }
                    break;

                case 'array':
                    if (!Array.isArray(value)) {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be an array`,
                            severity: 'error',
                            code: 'ISO_TYPE_ARRAY',
                        });
                        fieldValid = false;
                    } else if (value.length === 0) {
                        warnings.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' is empty`,
                            severity: 'warning',
                            code: 'ISO_EMPTY_ARRAY',
                        });
                    }
                    break;

                case 'object':
                    if (typeof value !== 'object' || value === null) {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be an object`,
                            severity: 'error',
                            code: 'ISO_TYPE_OBJECT',
                        });
                        fieldValid = false;
                    }
                    break;

                case 'number':
                    if (typeof value !== 'number' && isNaN(parseFloat(value))) {
                        errors.push({
                            field: fieldName,
                            value,
                            message: `Field '${fieldName}' must be a number`,
                            severity: 'error',
                            code: 'ISO_TYPE_NUMBER',
                        });
                        fieldValid = false;
                    }
                    break;
            }

            if (fieldValid) {
                validFields++;
            }
        }
    }

    // Validate specific complex fields
    if (metadata.geographicBoundingBox) {
        const bboxError = validateBoundingBox(metadata.geographicBoundingBox);
        if (bboxError) errors.push(bboxError);
    }

    if (metadata.pointOfContact) {
        const contactError = validateContact(metadata.pointOfContact, 'pointOfContact');
        if (contactError) errors.push(contactError);
    }

    if (metadata.citationResponsibleParty) {
        const partyError = validateContact(metadata.citationResponsibleParty, 'citationResponsibleParty');
        if (partyError) errors.push(partyError);
    }

    // Validate topic categories if present
    if (metadata.topicCategory && Array.isArray(metadata.topicCategory)) {
        metadata.topicCategory.forEach((topic: string) => {
            if (!ISO_TOPIC_CATEGORIES.includes(topic as any)) {
                warnings.push({
                    field: 'topicCategory',
                    value: topic,
                    message: `Unknown topic category '${topic}'`,
                    severity: 'warning',
                    code: 'ISO_UNKNOWN_TOPIC',
                });
            }
        });
    }

    // Check for at least one date
    if (!metadata.creationDate && !metadata.publicationDate && !metadata.revisionDate) {
        warnings.push({
            field: 'dates',
            value: null,
            message: 'At least one of creationDate, publicationDate, or revisionDate should be provided',
            severity: 'warning',
            code: 'ISO_NO_DATES',
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
 * Get required ISO 19115 fields
 */
export function getRequiredISO19115Fields(): string[] {
    return Object.entries(ISO19115_FIELDS)
        .filter(([_, def]) => def.required)
        .map(([name, _]) => name);
}

/**
 * Get ISO 19115 fields by section
 */
export function getISO19115FieldsBySection(section: string): string[] {
    return Object.entries(ISO19115_FIELDS)
        .filter(([_, def]) => def.section === section)
        .map(([name, _]) => name);
}

/**
 * Calculate metadata completeness percentage
 */
export function calculateMetadataCompleteness(metadata: Record<string, any>): {
    overall: number;
    bySection: Record<string, number>;
} {
    const sections = ['identification', 'spatial', 'quality', 'distribution', 'contact', 'constraints'];
    const bySection: Record<string, number> = {};

    let totalRequired = 0;
    let totalFilled = 0;

    for (const section of sections) {
        const sectionFields = Object.entries(ISO19115_FIELDS)
            .filter(([_, def]) => def.section === section);

        let sectionRequired = 0;
        let sectionFilled = 0;

        for (const [fieldName, def] of sectionFields) {
            if (def.required) {
                sectionRequired++;
                totalRequired++;
                if (metadata[fieldName] !== undefined && metadata[fieldName] !== null && metadata[fieldName] !== '') {
                    sectionFilled++;
                    totalFilled++;
                }
            }
        }

        bySection[section] = sectionRequired > 0 ? Math.round((sectionFilled / sectionRequired) * 100) : 100;
    }

    return {
        overall: totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 0,
        bySection,
    };
}

export default {
    validateISO19115Metadata,
    getRequiredISO19115Fields,
    getISO19115FieldsBySection,
    calculateMetadataCompleteness,
    ISO_TOPIC_CATEGORIES,
    ISO_SCOPE_CODES,
    ISO_DATE_TYPES,
    ISO_ROLE_CODES,
    ISO_RESTRICTION_CODES,
};
