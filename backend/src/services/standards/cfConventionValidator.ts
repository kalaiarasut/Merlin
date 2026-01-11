/**
 * CF-Convention Validator
 * 
 * Production-grade validation for Climate and Forecast (CF) Conventions.
 * Validates NetCDF file metadata against CF-1.8 standard.
 * 
 * Reference: http://cfconventions.org/Data/cf-conventions/cf-conventions-1.8/cf-conventions.html
 */

import { ValidationError, ValidationResult } from './darwinCoreValidator';

// CF Standard Names (subset of most common oceanographic variables)
export const CF_STANDARD_NAMES = [
    // Temperature
    'sea_water_temperature',
    'sea_surface_temperature',
    'air_temperature',
    'sea_water_potential_temperature',

    // Salinity
    'sea_water_salinity',
    'sea_water_practical_salinity',
    'sea_surface_salinity',

    // Currents
    'eastward_sea_water_velocity',
    'northward_sea_water_velocity',
    'sea_water_speed',

    // Oxygen
    'mole_concentration_of_dissolved_molecular_oxygen_in_sea_water',
    'mass_concentration_of_oxygen_in_sea_water',
    'volume_fraction_of_oxygen_in_sea_water',

    // Chlorophyll
    'mass_concentration_of_chlorophyll_a_in_sea_water',
    'mass_concentration_of_chlorophyll_in_sea_water',

    // Nutrients
    'mole_concentration_of_nitrate_in_sea_water',
    'mole_concentration_of_phosphate_in_sea_water',
    'mole_concentration_of_silicate_in_sea_water',

    // Carbon
    'sea_water_ph_reported_on_total_scale',
    'surface_partial_pressure_of_carbon_dioxide_in_sea_water',
    'mole_concentration_of_dissolved_inorganic_carbon_in_sea_water',

    // Physical
    'sea_surface_height_above_geoid',
    'sea_floor_depth_below_geoid',
    'ocean_mixed_layer_thickness',

    // Coordinates
    'latitude',
    'longitude',
    'depth',
    'time',
    'altitude',
] as const;

// CF Axis types
export const CF_AXIS_TYPES = ['X', 'Y', 'Z', 'T'] as const;

// CF Calendar types
export const CF_CALENDAR_TYPES = [
    'gregorian',
    'standard',
    'proleptic_gregorian',
    'noleap',
    '365_day',
    'all_leap',
    '366_day',
    '360_day',
    'julian',
    'none',
] as const;

// Standard CF units for common variables
export const CF_STANDARD_UNITS: Record<string, string[]> = {
    sea_water_temperature: ['K', 'kelvin', 'degree_Celsius', 'degC', 'celsius'],
    sea_surface_temperature: ['K', 'kelvin', 'degree_Celsius', 'degC', 'celsius'],
    sea_water_salinity: ['1', 'PSU', 'psu', '1e-3', '0.001'],
    sea_water_practical_salinity: ['1', 'PSU', 'psu', '1e-3', '0.001'],
    latitude: ['degrees_north', 'degree_north', 'degrees_N', 'degree_N'],
    longitude: ['degrees_east', 'degree_east', 'degrees_E', 'degree_E'],
    depth: ['m', 'meters', 'metre', 'metres'],
    time: ['days since', 'hours since', 'minutes since', 'seconds since'],
};

interface CFGlobalAttribute {
    name: string;
    required: boolean;
    type: 'string' | 'number' | 'any';
    description: string;
}

const CF_GLOBAL_ATTRIBUTES: CFGlobalAttribute[] = [
    { name: 'Conventions', required: true, type: 'string', description: 'CF version (e.g., CF-1.8)' },
    { name: 'title', required: true, type: 'string', description: 'Short title for the dataset' },
    { name: 'institution', required: true, type: 'string', description: 'Institution producing the data' },
    { name: 'source', required: false, type: 'string', description: 'Method of production' },
    { name: 'history', required: false, type: 'string', description: 'Processing history' },
    { name: 'references', required: false, type: 'string', description: 'References or documentation' },
    { name: 'comment', required: false, type: 'string', description: 'Additional information' },
    { name: 'summary', required: false, type: 'string', description: 'Dataset summary' },
    { name: 'keywords', required: false, type: 'string', description: 'Keywords describing data' },
    { name: 'creator_name', required: false, type: 'string', description: 'Creator name' },
    { name: 'creator_email', required: false, type: 'string', description: 'Creator email' },
    { name: 'creator_institution', required: false, type: 'string', description: 'Creator institution' },
    { name: 'date_created', required: false, type: 'string', description: 'Date of creation (ISO 8601)' },
    { name: 'date_modified', required: false, type: 'string', description: 'Date of last modification' },
    { name: 'geospatial_lat_min', required: false, type: 'number', description: 'Southern latitude' },
    { name: 'geospatial_lat_max', required: false, type: 'number', description: 'Northern latitude' },
    { name: 'geospatial_lon_min', required: false, type: 'number', description: 'Western longitude' },
    { name: 'geospatial_lon_max', required: false, type: 'number', description: 'Eastern longitude' },
    { name: 'geospatial_vertical_min', required: false, type: 'number', description: 'Minimum depth/altitude' },
    { name: 'geospatial_vertical_max', required: false, type: 'number', description: 'Maximum depth/altitude' },
    { name: 'time_coverage_start', required: false, type: 'string', description: 'Start time (ISO 8601)' },
    { name: 'time_coverage_end', required: false, type: 'string', description: 'End time (ISO 8601)' },
];

interface CFVariableAttribute {
    name: string;
    required: boolean;
    type: 'string' | 'number' | 'array' | 'any';
    description: string;
}

const CF_VARIABLE_ATTRIBUTES: CFVariableAttribute[] = [
    { name: 'long_name', required: true, type: 'string', description: 'Descriptive name' },
    { name: 'standard_name', required: false, type: 'string', description: 'CF standard name' },
    { name: 'units', required: true, type: 'string', description: 'Physical units' },
    { name: '_FillValue', required: false, type: 'number', description: 'Fill value for missing data' },
    { name: 'missing_value', required: false, type: 'number', description: 'Missing value indicator' },
    { name: 'valid_min', required: false, type: 'number', description: 'Minimum valid value' },
    { name: 'valid_max', required: false, type: 'number', description: 'Maximum valid value' },
    { name: 'valid_range', required: false, type: 'array', description: 'Valid value range [min, max]' },
    { name: 'scale_factor', required: false, type: 'number', description: 'Scale factor for unpacking' },
    { name: 'add_offset', required: false, type: 'number', description: 'Offset for unpacking' },
    { name: 'calendar', required: false, type: 'string', description: 'Calendar type for time' },
    { name: 'axis', required: false, type: 'string', description: 'Axis type (X, Y, Z, T)' },
    { name: 'positive', required: false, type: 'string', description: 'Direction for Z axis (up/down)' },
    { name: 'coordinates', required: false, type: 'string', description: 'Coordinate variables' },
    { name: 'cell_methods', required: false, type: 'string', description: 'Statistical method' },
    { name: 'ancillary_variables', required: false, type: 'string', description: 'Related variables' },
];

/**
 * Represents a NetCDF-style variable for validation
 */
export interface CFVariable {
    name: string;
    dimensions: string[];
    attributes: Record<string, any>;
    dataType?: string;
}

/**
 * Represents NetCDF metadata for validation
 */
export interface CFMetadata {
    globalAttributes: Record<string, any>;
    variables: CFVariable[];
    dimensions: Record<string, number>;
}

/**
 * Validate CF Conventions version string
 */
function validateConventionsVersion(value: string): ValidationError | null {
    if (!value) {
        return {
            field: 'Conventions',
            value,
            message: 'Conventions attribute is required and must specify CF version',
            severity: 'error',
            code: 'CF_CONVENTIONS_MISSING',
        };
    }

    if (!value.includes('CF-')) {
        return {
            field: 'Conventions',
            value,
            message: 'Conventions must include CF version (e.g., "CF-1.8")',
            severity: 'error',
            code: 'CF_CONVENTIONS_FORMAT',
        };
    }

    // Extract version number
    const match = value.match(/CF-(\d+\.\d+)/);
    if (!match) {
        return {
            field: 'Conventions',
            value,
            message: 'Could not parse CF version number',
            severity: 'warning',
            code: 'CF_VERSION_PARSE',
        };
    }

    const version = parseFloat(match[1]);
    if (version < 1.6) {
        return {
            field: 'Conventions',
            value,
            message: `CF version ${version} is outdated. Consider updating to CF-1.8+`,
            severity: 'warning',
            code: 'CF_VERSION_OLD',
        };
    }

    return null;
}

/**
 * Validate a variable's standard_name
 */
function validateStandardName(name: string, standardName: string): ValidationError | null {
    if (!standardName) {
        return null; // standard_name is optional
    }

    // Check if it's a known standard name
    const isKnown = CF_STANDARD_NAMES.includes(standardName as any);
    if (!isKnown) {
        return {
            field: `${name}.standard_name`,
            value: standardName,
            message: `Unknown CF standard name '${standardName}'. May be valid but not in common list.`,
            severity: 'warning',
            code: 'CF_UNKNOWN_STANDARD_NAME',
        };
    }

    return null;
}

/**
 * Validate units against standard_name
 */
function validateUnits(varName: string, standardName: string, units: string): ValidationError | null {
    if (!units) {
        return {
            field: `${varName}.units`,
            value: units,
            message: `Variable '${varName}' is missing units attribute`,
            severity: 'error',
            code: 'CF_UNITS_MISSING',
        };
    }

    // Check if units match expected for standard_name
    if (standardName && CF_STANDARD_UNITS[standardName]) {
        const validUnits = CF_STANDARD_UNITS[standardName];
        const unitsLower = units.toLowerCase();
        const isValid = validUnits.some(u => unitsLower.includes(u.toLowerCase()));

        if (!isValid) {
            return {
                field: `${varName}.units`,
                value: units,
                message: `Units '${units}' may not be standard for '${standardName}'. Expected: ${validUnits.join(' or ')}`,
                severity: 'warning',
                code: 'CF_UNITS_MISMATCH',
            };
        }
    }

    return null;
}

/**
 * Validate coordinate variable
 */
function validateCoordinateVariable(variable: CFVariable): ValidationError[] {
    const errors: ValidationError[] = [];
    const name = variable.name;
    const attrs = variable.attributes;

    // Check axis attribute
    if (attrs.axis) {
        if (!CF_AXIS_TYPES.includes(attrs.axis)) {
            errors.push({
                field: `${name}.axis`,
                value: attrs.axis,
                message: `Invalid axis type. Must be one of: ${CF_AXIS_TYPES.join(', ')}`,
                severity: 'error',
                code: 'CF_AXIS_INVALID',
            });
        }
    }

    // Check calendar for time coordinates
    if (name === 'time' || attrs.axis === 'T') {
        if (attrs.calendar && !CF_CALENDAR_TYPES.includes(attrs.calendar.toLowerCase())) {
            errors.push({
                field: `${name}.calendar`,
                value: attrs.calendar,
                message: `Unknown calendar type. Common values: ${CF_CALENDAR_TYPES.slice(0, 5).join(', ')}`,
                severity: 'warning',
                code: 'CF_CALENDAR_UNKNOWN',
            });
        }
    }

    // Check positive attribute for Z axis
    if (name === 'depth' || name === 'altitude' || attrs.axis === 'Z') {
        if (attrs.positive && !['up', 'down'].includes(attrs.positive.toLowerCase())) {
            errors.push({
                field: `${name}.positive`,
                value: attrs.positive,
                message: 'Positive attribute must be "up" or "down"',
                severity: 'error',
                code: 'CF_POSITIVE_INVALID',
            });
        }
    }

    return errors;
}

/**
 * Validate global attributes
 */
function validateGlobalAttributes(attrs: Record<string, any>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let validFields = 0;
    let totalFields = 0;

    for (const attrDef of CF_GLOBAL_ATTRIBUTES) {
        totalFields++;
        const value = attrs[attrDef.name];

        if (attrDef.required && (value === undefined || value === null || value === '')) {
            errors.push({
                field: attrDef.name,
                value,
                message: `Required global attribute '${attrDef.name}' is missing`,
                severity: 'error',
                code: 'CF_GLOBAL_REQUIRED',
            });
        } else if (value !== undefined && value !== null && value !== '') {
            validFields++;
        }
    }

    // Validate Conventions specifically
    const convError = validateConventionsVersion(attrs.Conventions);
    if (convError) {
        if (convError.severity === 'error') errors.push(convError);
        else warnings.push(convError);
    }

    // Validate geospatial consistency
    if (attrs.geospatial_lat_min !== undefined && attrs.geospatial_lat_max !== undefined) {
        if (attrs.geospatial_lat_min > attrs.geospatial_lat_max) {
            errors.push({
                field: 'geospatial_lat',
                value: `${attrs.geospatial_lat_min} - ${attrs.geospatial_lat_max}`,
                message: 'geospatial_lat_min cannot be greater than geospatial_lat_max',
                severity: 'error',
                code: 'CF_GEOSPATIAL_LAT_ORDER',
            });
        }
    }

    const score = totalFields > 0 ? Math.round((validFields / totalFields) * 100) : 0;

    return { valid: errors.length === 0, score, totalFields, validFields, errors, warnings };
}

/**
 * Validate a single variable
 */
function validateVariable(variable: CFVariable): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let validFields = 0;
    let totalFields = 0;

    const attrs = variable.attributes;
    const name = variable.name;

    // Check required variable attributes
    for (const attrDef of CF_VARIABLE_ATTRIBUTES) {
        if (attrDef.required) {
            totalFields++;
            const value = attrs[attrDef.name];

            if (value === undefined || value === null || value === '') {
                errors.push({
                    field: `${name}.${attrDef.name}`,
                    value,
                    message: `Variable '${name}' is missing required attribute '${attrDef.name}'`,
                    severity: 'error',
                    code: 'CF_VAR_ATTR_REQUIRED',
                });
            } else {
                validFields++;
            }
        }
    }

    // Validate standard_name
    if (attrs.standard_name) {
        const snError = validateStandardName(name, attrs.standard_name);
        if (snError) warnings.push(snError);
    }

    // Validate units
    const unitsError = validateUnits(name, attrs.standard_name, attrs.units);
    if (unitsError) {
        if (unitsError.severity === 'error') errors.push(unitsError);
        else warnings.push(unitsError);
    }

    // Validate coordinate variables
    const coordName = name.toLowerCase();
    if (['latitude', 'longitude', 'depth', 'time', 'altitude', 'lat', 'lon'].includes(coordName) || attrs.axis) {
        const coordErrors = validateCoordinateVariable(variable);
        errors.push(...coordErrors.filter(e => e.severity === 'error'));
        warnings.push(...coordErrors.filter(e => e.severity === 'warning'));
    }

    const score = totalFields > 0 ? Math.round((validFields / totalFields) * 100) : 0;

    return { valid: errors.length === 0, score, totalFields, validFields, errors, warnings };
}

/**
 * Validate complete CF metadata (full NetCDF validation)
 */
export function validateCFConventions(metadata: CFMetadata): ValidationResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationError[] = [];
    let totalScore = 0;
    let scoreCount = 0;

    // Validate global attributes
    const globalResult = validateGlobalAttributes(metadata.globalAttributes);
    allErrors.push(...globalResult.errors);
    allWarnings.push(...globalResult.warnings);
    totalScore += globalResult.score;
    scoreCount++;

    // Validate each variable
    for (const variable of metadata.variables) {
        const varResult = validateVariable(variable);
        allErrors.push(...varResult.errors);
        allWarnings.push(...varResult.warnings);
        totalScore += varResult.score;
        scoreCount++;
    }

    // Check for coordinate variables
    const hasLat = metadata.variables.some(v =>
        v.name.toLowerCase() === 'latitude' || v.name.toLowerCase() === 'lat' || v.attributes.axis === 'Y'
    );
    const hasLon = metadata.variables.some(v =>
        v.name.toLowerCase() === 'longitude' || v.name.toLowerCase() === 'lon' || v.attributes.axis === 'X'
    );
    const hasTime = metadata.variables.some(v =>
        v.name.toLowerCase() === 'time' || v.attributes.axis === 'T'
    );

    if (!hasLat || !hasLon) {
        allWarnings.push({
            field: 'coordinates',
            value: null,
            message: 'Dataset should include latitude and longitude coordinate variables',
            severity: 'warning',
            code: 'CF_MISSING_COORDS',
        });
    }

    if (!hasTime) {
        allWarnings.push({
            field: 'time',
            value: null,
            message: 'Dataset should include a time coordinate variable',
            severity: 'warning',
            code: 'CF_MISSING_TIME',
        });
    }

    // Limit output
    const maxItems = 100;

    return {
        valid: allErrors.length === 0,
        score: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
        totalFields: metadata.variables.length + CF_GLOBAL_ATTRIBUTES.length,
        validFields: Math.round((totalScore / scoreCount / 100) * (metadata.variables.length + CF_GLOBAL_ATTRIBUTES.length)),
        errors: allErrors.slice(0, maxItems),
        warnings: allWarnings.slice(0, maxItems),
    };
}

/**
 * Create CF metadata object from parsed NetCDF headers
 */
export function createCFMetadataFromNetCDF(ncHeaders: any): CFMetadata {
    // This would be called by the NetCDF parser
    return {
        globalAttributes: ncHeaders.globalAttributes || {},
        variables: (ncHeaders.variables || []).map((v: any) => ({
            name: v.name,
            dimensions: v.dimensions || [],
            attributes: v.attributes || {},
            dataType: v.type,
        })),
        dimensions: ncHeaders.dimensions || {},
    };
}

/**
 * Get required CF global attributes
 */
export function getRequiredCFGlobalAttributes(): string[] {
    return CF_GLOBAL_ATTRIBUTES.filter(a => a.required).map(a => a.name);
}

/**
 * Get required CF variable attributes
 */
export function getRequiredCFVariableAttributes(): string[] {
    return CF_VARIABLE_ATTRIBUTES.filter(a => a.required).map(a => a.name);
}

export default {
    validateCFConventions,
    createCFMetadataFromNetCDF,
    getRequiredCFGlobalAttributes,
    getRequiredCFVariableAttributes,
    CF_STANDARD_NAMES,
    CF_AXIS_TYPES,
    CF_CALENDAR_TYPES,
    CF_STANDARD_UNITS,
};
