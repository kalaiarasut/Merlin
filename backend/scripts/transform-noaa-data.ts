/**
 * NOAA Data Transformer for Marlin
 * 
 * Transforms NOAA fisheries survey data into Marlin's expected schema.
 * 
 * Usage: npx ts-node scripts/transform-noaa-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// CONFIGURATION
// ============================================================

// Selected species for testing (scientific names)
const SELECTED_SPECIES = [
    'Gadus morhua',           // Atlantic cod
    'Clupea harengus',        // Atlantic herring
    'Merluccius bilinearis',  // Silver hake
    'Squalus acanthias',      // Spiny dogfish
    'Hippoglossoides platessoides', // American plaice
    'Homarus americanus',     // American lobster
];

// NOAA maturity code mapping to Marlin format
const MATURITY_MAP: Record<string, string> = {
    'I': 'immature',
    'T': 'maturing',      // Transitional → maturing
    'D': 'maturing',      // Developing → maturing  
    'R': 'mature',        // Ripe → mature
    'S': 'spent',
    'X': 'immature',      // Unknown → default to immature
    'U': 'immature',      // Unknown
};

// Sex code mapping
const SEX_MAP: Record<string, string> = {
    '0': 'U',
    '1': 'M',
    '2': 'F',
};

// Input files (relative to project root)
const INPUT_DIR = path.join(__dirname, '../../');
const OUTPUT_DIR = path.join(__dirname, '../../');

const SVCAT_FILE = path.join(INPUT_DIR, '22562_UNION_FSCS_SVCAT.csv');
const SVLEN_FILE = path.join(INPUT_DIR, '22562_UNION_FSCS_SVLEN.csv');
const SVBIO_FILE = path.join(INPUT_DIR, '22562_UNION_FSCS_SVBIO.csv');
const CRUISES_FILE = path.join(INPUT_DIR, '22562_SVDBS_CRUISES.csv');
const SVSTA_FILE = path.join(INPUT_DIR, '22562_UNION_FSCS_SVSTA.csv');  // Station data with lat/lon/depth

// ============================================================
// UTILITIES
// ============================================================

/**
 * Parse CSV line handling quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
}

/**
 * Extract scientific name from NOAA format: "Gadus morhua (Atlantic cod)"
 */
function extractSpeciesName(noaaName: string): string {
    if (!noaaName) return '';
    // Remove quotes and extract part before parenthesis
    const cleaned = noaaName.replace(/"/g, '').trim();
    const match = cleaned.match(/^([^(]+)/);
    return match ? match[1].trim() : cleaned;
}

/**
 * Check if species is in selected list
 */
function isSelectedSpecies(speciesName: string): boolean {
    return SELECTED_SPECIES.some(s =>
        speciesName.toLowerCase().includes(s.toLowerCase())
    );
}

/**
 * Parse cruise year from CRUISE6 code (e.g., "199103" → 1991)
 */
function parseCruiseYear(cruise6: string): number {
    if (!cruise6) return 1991;
    const cleaned = cruise6.replace(/"/g, '');
    return parseInt(cleaned.substring(0, 4)) || 1991;
}

/**
 * Generate date string for summer survey (June 1st)
 */
function generateSummerDate(year: number): string {
    return `${year}-06-01`;
}

/**
 * Convert NOAA latitude format (DDMM.M) to decimal degrees
 * e.g., 4303 (43°03') → 43.05
 */
function convertLatitude(noaaLat: number): number {
    if (isNaN(noaaLat)) return NaN;
    const degrees = Math.floor(noaaLat / 100);
    const minutes = noaaLat % 100;
    return degrees + (minutes / 60);
}

/**
 * Convert NOAA longitude format (DDDMM.M) to decimal degrees (negative for West)
 * e.g., 7023 (70°23') → -70.38
 */
function convertLongitude(noaaLon: number): number {
    if (isNaN(noaaLon)) return NaN;
    const degrees = Math.floor(noaaLon / 100);
    const minutes = noaaLon % 100;
    // NOAA US East Coast data is Western longitude (negative)
    return -(degrees + (minutes / 60));
}

// ============================================================
// INTERFACES
// ============================================================

interface MarlinCatchRecord {
    date: string;
    species: string;
    catch: number;      // kg
    effort: number;     // tow duration in minutes, or 1 if not available
    effortUnit: string;
    location?: {
        lat?: number;
        lon?: number;
        area?: string;
        depth?: number;  // Average depth in meters
    };
}

interface MarlinLengthRecord {
    date: string;
    species: string;
    length: number;     // cm
    weight?: number;    // kg
    sex?: string;
    maturity?: string;
    age?: number;
}

// ============================================================
// STATION DATA LOOKUP (for lat/lon/depth joining)
// ============================================================

interface StationData {
    lat: number;
    lon: number;
    depth: number;
    towDur: number;  // Tow duration in minutes
}

/**
 * Load station data from SVSTA file to create lookup map
 * Key: "CRUISE6-TOW-STATION"
 */
function loadStationData(): Map<string, StationData> {
    console.log('\n📍 Loading station data from SVSTA...');
    const stationMap = new Map<string, StationData>();

    if (!fs.existsSync(SVSTA_FILE)) {
        console.error(`  ❌ Station file not found: ${SVSTA_FILE}`);
        return stationMap;
    }

    const content = fs.readFileSync(SVSTA_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    // Parse header
    const header = parseCSVLine(lines[0]);
    const colIndex = {
        CRUISE6: header.findIndex(h => h.includes('CRUISE6')),
        TOW: header.findIndex(h => h === 'TOW' || h.includes('TOW')),
        STATION: header.findIndex(h => h.includes('STATION')),
        BEGLAT: header.findIndex(h => h.includes('BEGLAT')),
        BEGLON: header.findIndex(h => h.includes('BEGLON')),
        AVGDEPTH: header.findIndex(h => h.includes('AVGDEPTH')),
        BOTDEPTH: header.findIndex(h => h.includes('BOTDEPTH')),
        TOWDUR: header.findIndex(h => h.includes('TOWDUR') || h.includes('TOW_DURATION')),
    };

    console.log(`  📋 Station columns: BEGLAT=${colIndex.BEGLAT}, BEGLON=${colIndex.BEGLON}, AVGDEPTH=${colIndex.AVGDEPTH}, TOWDUR=${colIndex.TOWDUR}`);

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 5) continue;

        const cruise6 = cols[colIndex.CRUISE6]?.replace(/"/g, '') || '';
        const tow = cols[colIndex.TOW]?.replace(/"/g, '') || '';
        const station = cols[colIndex.STATION]?.replace(/"/g, '') || '';
        const key = `${cruise6}-${tow}-${station}`;

        const rawLat = colIndex.BEGLAT >= 0 ? parseFloat(cols[colIndex.BEGLAT]) : NaN;
        const rawLon = colIndex.BEGLON >= 0 ? parseFloat(cols[colIndex.BEGLON]) : NaN;
        const lat = convertLatitude(rawLat);
        const lon = convertLongitude(rawLon);
        const depth = colIndex.AVGDEPTH >= 0 ? parseFloat(cols[colIndex.AVGDEPTH]) :
            (colIndex.BOTDEPTH >= 0 ? parseFloat(cols[colIndex.BOTDEPTH]) : NaN);
        const towDur = colIndex.TOWDUR >= 0 ? parseFloat(cols[colIndex.TOWDUR]) : 0;

        if (!isNaN(lat) && !isNaN(lon)) {
            stationMap.set(key, {
                lat,
                lon,
                depth: isNaN(depth) ? 0 : depth,
                towDur: isNaN(towDur) ? 0 : towDur,
            });
        }
    }

    console.log(`  ✅ Loaded ${stationMap.size} station records with location data`);
    return stationMap;
}

// ============================================================
// TRANSFORMERS
// ============================================================

/**
 * Transform SVCAT (catch data) into Marlin CPUE format
 * Joins with SVSTA station data to get lat/lon/depth
 */
function transformCatchData(): MarlinCatchRecord[] {
    console.log('\n📊 Transforming SVCAT (Catch Data)...');

    if (!fs.existsSync(SVCAT_FILE)) {
        console.error(`  ❌ File not found: ${SVCAT_FILE}`);
        return [];
    }

    // First, load station data for joining
    const stationMap = loadStationData();

    const content = fs.readFileSync(SVCAT_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    // Parse header
    const header = parseCSVLine(lines[0]);
    const colIndex = {
        CRUISE6: header.findIndex(h => h.includes('CRUISE6')),
        TOW: header.findIndex(h => h === 'TOW' || h.includes('TOW')),
        STATION: header.findIndex(h => h.includes('STATION')),
        EXPCATCHWT: header.findIndex(h => h.includes('EXPCATCHWT')),
        SCIENTIFIC_NAME: header.findIndex(h => h.includes('SCIENTIFIC_NAME')),
        STRATUM: header.findIndex(h => h.includes('STRATUM')),
    };

    console.log(`  📋 Columns: CRUISE6=${colIndex.CRUISE6}, TOW=${colIndex.TOW}, STATION=${colIndex.STATION}, EXPCATCHWT=${colIndex.EXPCATCHWT}`);

    const records: MarlinCatchRecord[] = [];
    const speciesCounts: Record<string, number> = {};
    let totalRows = 0;
    let filteredRows = 0;
    let matchedStations = 0;

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 5) continue;

        totalRows++;

        const rawSpecies = cols[colIndex.SCIENTIFIC_NAME] || '';
        const species = extractSpeciesName(rawSpecies);

        if (!isSelectedSpecies(species)) continue;

        filteredRows++;
        speciesCounts[species] = (speciesCounts[species] || 0) + 1;

        const cruise6 = (cols[colIndex.CRUISE6] || '').replace(/"/g, '');
        const tow = (cols[colIndex.TOW] || '').replace(/"/g, '');
        const station = (cols[colIndex.STATION] || '').replace(/"/g, '');
        const year = parseCruiseYear(cruise6);
        const catchWt = parseFloat(cols[colIndex.EXPCATCHWT]) || 0;

        // Lookup station data for lat/lon/depth
        const stationKey = `${cruise6}-${tow}-${station}`;
        const stationData = stationMap.get(stationKey);

        if (stationData) {
            matchedStations++;
        }

        // Use station data if available
        const lat = stationData?.lat;
        const lon = stationData?.lon;
        const depth = stationData?.depth;
        const towDur = stationData?.towDur || 0;

        const effortUnit = towDur > 0 ? 'hours' : 'tows';

        records.push({
            date: generateSummerDate(year),
            species: species,
            catch: catchWt,
            effort: towDur > 0 ? towDur / 60 : 1,  // Convert minutes to hours, or 1 tow
            effortUnit: effortUnit,
            location: {
                lat: lat && !isNaN(lat) ? lat : undefined,
                lon: lon && !isNaN(lon) ? lon : undefined,
                area: cols[colIndex.STRATUM]?.replace(/"/g, '') || 'Gulf of Maine',
                depth: depth && !isNaN(depth) ? depth : undefined,
            },
        });
    }

    console.log(`  ✅ Processed ${totalRows} rows → ${filteredRows} records for selected species`);
    console.log(`  � Matched ${matchedStations}/${filteredRows} records with station location data (${Math.round(matchedStations / filteredRows * 100)}%)`);
    console.log(`  �📈 Species breakdown:`, speciesCounts);

    return records;
}

/**
 * Transform SVLEN (length frequency data) into Marlin format
 */
function transformLengthData(): MarlinLengthRecord[] {
    console.log('\n📏 Transforming SVLEN (Length Frequency Data)...');

    if (!fs.existsSync(SVLEN_FILE)) {
        console.error(`  ❌ File not found: ${SVLEN_FILE}`);
        return [];
    }

    const content = fs.readFileSync(SVLEN_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    // Parse header
    const header = parseCSVLine(lines[0]);
    const colIndex = {
        CRUISE6: header.findIndex(h => h.includes('CRUISE6')),
        LENGTH: header.findIndex(h => h === 'LENGTH' || h.includes('LENGTH')),
        EXPNUMLEN: header.findIndex(h => h.includes('EXPNUMLEN')),
        SCIENTIFIC_NAME: header.findIndex(h => h.includes('SCIENTIFIC_NAME')),
    };

    console.log(`  📋 Columns found: CRUISE6=${colIndex.CRUISE6}, LENGTH=${colIndex.LENGTH}, EXPNUMLEN=${colIndex.EXPNUMLEN}, SCIENTIFIC_NAME=${colIndex.SCIENTIFIC_NAME}`);

    const records: MarlinLengthRecord[] = [];
    const speciesCounts: Record<string, number> = {};
    let totalRows = 0;
    let filteredRows = 0;

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 5) continue;

        totalRows++;

        const rawSpecies = cols[colIndex.SCIENTIFIC_NAME] || '';
        const species = extractSpeciesName(rawSpecies);

        if (!isSelectedSpecies(species)) continue;

        const cruise6 = cols[colIndex.CRUISE6] || '';
        const year = parseCruiseYear(cruise6);
        const length = parseFloat(cols[colIndex.LENGTH]) || 0;
        const count = parseInt(cols[colIndex.EXPNUMLEN]) || 1;

        // Expand count into individual records (up to 10 per row to avoid explosion)
        const numRecords = Math.min(count, 10);
        for (let j = 0; j < numRecords; j++) {
            filteredRows++;
            speciesCounts[species] = (speciesCounts[species] || 0) + 1;

            records.push({
                date: generateSummerDate(year),
                species: species,
                length: length,
            });
        }
    }

    console.log(`  ✅ Processed ${totalRows} rows → ${filteredRows} records for selected species`);
    console.log(`  📈 Species breakdown:`, speciesCounts);

    return records;
}

/**
 * Transform SVBIO (biological data) into Marlin format
 */
function transformBioData(): MarlinLengthRecord[] {
    console.log('\n🧬 Transforming SVBIO (Biological Data)...');

    if (!fs.existsSync(SVBIO_FILE)) {
        console.error(`  ❌ File not found: ${SVBIO_FILE}`);
        return [];
    }

    const content = fs.readFileSync(SVBIO_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    // Parse header
    const header = parseCSVLine(lines[0]);
    const colIndex = {
        CRUISE6: header.findIndex(h => h.includes('CRUISE6')),
        LENGTH: header.findIndex(h => h === 'LENGTH' || h.includes('LENGTH')),
        INDWT: header.findIndex(h => h.includes('INDWT')),
        SEX: header.findIndex(h => h === 'SEX' || h.includes('SEX')),
        MATURITY: header.findIndex(h => h === 'MATURITY' || h.includes('MATURITY')),
        AGE: header.findIndex(h => h === 'AGE' || h.includes('AGE')),
        SVSPP: header.findIndex(h => h.includes('SVSPP')),
    };

    console.log(`  📋 Columns found: LENGTH=${colIndex.LENGTH}, INDWT=${colIndex.INDWT}, SEX=${colIndex.SEX}, MATURITY=${colIndex.MATURITY}`);

    // Note: SVBIO doesn't have SCIENTIFIC_NAME, so we need to use cruise file to join
    // For simplicity, we'll include all records and filter by species code later
    // Or we can load the species lookup from the sample data

    const records: MarlinLengthRecord[] = [];
    let totalRows = 0;

    // Known NOAA species codes for our selected species
    const speciesCodes: Record<string, string> = {
        '073': 'Gadus morhua',
        '032': 'Clupea harengus',
        '072': 'Merluccius bilinearis',
        '015': 'Squalus acanthias',
        '102': 'Hippoglossoides platessoides',
        '301': 'Homarus americanus',
    };

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 10) continue;

        totalRows++;

        // Get species from SVSPP code
        const svspp = cols[colIndex.SVSPP]?.replace(/"/g, '') || '';
        const species = speciesCodes[svspp];

        if (!species) continue;

        const cruise6 = cols[colIndex.CRUISE6] || '';
        const year = parseCruiseYear(cruise6);

        const length = parseFloat(cols[colIndex.LENGTH]) || 0;
        const weight = parseFloat(cols[colIndex.INDWT]) || undefined;
        const sexCode = cols[colIndex.SEX]?.replace(/"/g, '') || '';
        const maturityCode = cols[colIndex.MATURITY]?.replace(/"/g, '') || '';
        const age = parseFloat(cols[colIndex.AGE]) || undefined;

        if (length <= 0) continue;

        records.push({
            date: generateSummerDate(year),
            species: species,
            length: length,
            weight: weight,
            sex: SEX_MAP[sexCode] || 'U',
            maturity: MATURITY_MAP[maturityCode] || 'immature',
            age: age,
        });
    }

    console.log(`  ✅ Processed ${totalRows} rows → ${records.length} records for selected species`);

    // Count by species
    const speciesCounts: Record<string, number> = {};
    records.forEach(r => {
        speciesCounts[r.species] = (speciesCounts[r.species] || 0) + 1;
    });
    console.log(`  📈 Species breakdown:`, speciesCounts);

    return records;
}

// ============================================================
// OUTPUT
// ============================================================

function ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`📁 Created output directory: ${OUTPUT_DIR}`);
    }
}


function writeCSV(filename: string, data: any[], headers: string[]) {
    const filepath = path.join(OUTPUT_DIR, filename);
    const rows = [headers.join(',')];

    for (const row of data) {
        const values = headers.map(h => {
            // Handle nested location object
            if (h === 'lat') return row.location?.lat ?? '';
            if (h === 'lon') return row.location?.lon ?? '';
            if (h === 'area') return row.location?.area ?? '';
            if (h === 'depth') return row.location?.depth ?? '';

            const val = row[h];
            if (val === undefined || val === null) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
        });
        rows.push(values.join(','));
    }

    fs.writeFileSync(filepath, rows.join('\n'));
    console.log(`  💾 Saved: ${filepath} (${data.length} records)`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log('🚀 NOAA Data Transformer for Marlin');
    console.log('====================================');
    console.log(`📍 Input directory: ${INPUT_DIR}`);
    console.log(`📍 Output directory: ${OUTPUT_DIR}`);
    console.log(`🎯 Selected species: ${SELECTED_SPECIES.join(', ')}`);

    ensureOutputDir();

    // Transform catch data
    const catchRecords = transformCatchData();
    writeCSV('catch_records.csv', catchRecords, ['date', 'species', 'catch', 'effort', 'effortUnit', 'lat', 'lon', 'area', 'depth']);

    // Transform length frequency data
    const lengthRecords = transformLengthData();
    writeCSV('length_records.csv', lengthRecords, ['date', 'species', 'length']);

    // Transform biological data
    const bioRecords = transformBioData();
    writeCSV('bio_records.csv', bioRecords, ['date', 'species', 'length', 'weight', 'sex', 'maturity', 'age']);

    // Combined length data (length frequency + bio)
    const combinedLength = [...lengthRecords, ...bioRecords];
    writeCSV('combined_length_records.csv', combinedLength, ['date', 'species', 'length', 'weight', 'sex', 'maturity', 'age']);

    console.log('\n✅ Transformation complete!');
    console.log('\n📋 Summary:');
    console.log(`   Catch records: ${catchRecords.length}`);
    console.log(`   Length frequency records: ${lengthRecords.length}`);
    console.log(`   Biological records: ${bioRecords.length}`);
    console.log(`   Combined length records: ${combinedLength.length}`);
    console.log('\n🎯 Use these files to test the Fisheries Analytics module.');
}

main().catch(console.error);
