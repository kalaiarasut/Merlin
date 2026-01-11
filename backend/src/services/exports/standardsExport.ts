/**
 * Darwin Core Archive Export Service
 * 
 * Creates DwC-A ZIP files containing occurrence.csv, meta.xml, and eml.xml
 * for submission to GBIF, OBIS, and other biodiversity databases.
 */

import { Readable } from 'stream';

// DwC-A field mappings
const DWC_CORE_FIELDS = [
    'occurrenceID',
    'basisOfRecord',
    'scientificName',
    'scientificNameAuthorship',
    'kingdom',
    'phylum',
    'class',
    'order',
    'family',
    'genus',
    'specificEpithet',
    'taxonRank',
    'eventDate',
    'year',
    'month',
    'day',
    'decimalLatitude',
    'decimalLongitude',
    'coordinateUncertaintyInMeters',
    'geodeticDatum',
    'country',
    'countryCode',
    'locality',
    'waterBody',
    'minimumDepthInMeters',
    'maximumDepthInMeters',
    'occurrenceStatus',
    'individualCount',
    'recordedBy',
    'identifiedBy',
    'institutionCode',
    'collectionCode',
    'catalogNumber',
    'occurrenceRemarks',
];

/**
 * Generate meta.xml for DwC-A
 */
export function generateMetaXml(fields: string[]): string {
    const fieldElements = fields.map((field, index) =>
        `      <field index="${index}" term="http://rs.tdwg.org/dwc/terms/${field}"/>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<archive xmlns="http://rs.tdwg.org/dwc/text/" metadata="eml.xml">
  <core encoding="UTF-8" linesTerminatedBy="\\n" fieldsTerminatedBy="," fieldsEnclosedBy="&quot;" ignoreHeaderLines="1" rowType="http://rs.tdwg.org/dwc/terms/Occurrence">
    <files>
      <location>occurrence.csv</location>
    </files>
    <id index="0"/>
${fieldElements}
  </core>
</archive>`;
}

/**
 * Generate EML (Ecological Metadata Language) document
 */
export function generateEmlXml(metadata: {
    title: string;
    abstract?: string;
    creator?: { name: string; email?: string; institution?: string };
    pubDate?: string;
    language?: string;
    keywords?: string[];
    geographicCoverage?: {
        westBoundingCoordinate: number;
        eastBoundingCoordinate: number;
        northBoundingCoordinate: number;
        southBoundingCoordinate: number;
    };
    temporalCoverage?: { beginDate: string; endDate: string };
}): string {
    const creator = metadata.creator || { name: 'Unknown', institution: 'Unknown' };
    const keywords = metadata.keywords?.map(k => `        <keyword>${escapeXml(k)}</keyword>`).join('\n') || '';

    let geoCoverage = '';
    if (metadata.geographicCoverage) {
        geoCoverage = `
    <geographicCoverage>
      <geographicDescription>Study area</geographicDescription>
      <boundingCoordinates>
        <westBoundingCoordinate>${metadata.geographicCoverage.westBoundingCoordinate}</westBoundingCoordinate>
        <eastBoundingCoordinate>${metadata.geographicCoverage.eastBoundingCoordinate}</eastBoundingCoordinate>
        <northBoundingCoordinate>${metadata.geographicCoverage.northBoundingCoordinate}</northBoundingCoordinate>
        <southBoundingCoordinate>${metadata.geographicCoverage.southBoundingCoordinate}</southBoundingCoordinate>
      </boundingCoordinates>
    </geographicCoverage>`;
    }

    let tempCoverage = '';
    if (metadata.temporalCoverage) {
        tempCoverage = `
    <temporalCoverage>
      <rangeOfDates>
        <beginDate><calendarDate>${metadata.temporalCoverage.beginDate}</calendarDate></beginDate>
        <endDate><calendarDate>${metadata.temporalCoverage.endDate}</calendarDate></endDate>
      </rangeOfDates>
    </temporalCoverage>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<eml:eml xmlns:eml="eml://ecoinformatics.org/eml-2.1.1"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="eml://ecoinformatics.org/eml-2.1.1
                             http://rs.gbif.org/schema/eml-gbif-profile/1.1/eml.xsd"
         packageId="cmlre-export-${Date.now()}" system="CMLRE" scope="system"
         xml:lang="${metadata.language || 'en'}">
  <dataset>
    <title>${escapeXml(metadata.title)}</title>
    <creator>
      <individualName>
        <surName>${escapeXml(creator.name)}</surName>
      </individualName>
      ${creator.email ? `<electronicMailAddress>${escapeXml(creator.email)}</electronicMailAddress>` : ''}
      ${creator.institution ? `<organizationName>${escapeXml(creator.institution)}</organizationName>` : ''}
    </creator>
    <pubDate>${metadata.pubDate || new Date().toISOString().split('T')[0]}</pubDate>
    <language>${metadata.language || 'en'}</language>
    <abstract>
      <para>${escapeXml(metadata.abstract || 'Marine biodiversity dataset exported from CMLRE platform.')}</para>
    </abstract>
    ${keywords ? `<keywordSet>\n${keywords}\n    </keywordSet>` : ''}
    <intellectualRights>
      <para>This dataset is made available under the Creative Commons Attribution License (CC-BY 4.0).</para>
    </intellectualRights>
    <coverage>${geoCoverage}${tempCoverage}
    </coverage>
  </dataset>
</eml:eml>`;
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Convert record to DwC CSV row
 */
function recordToCsvRow(record: Record<string, any>, fields: string[]): string {
    return fields.map(field => {
        const value = record[field];
        if (value === undefined || value === null) return '';
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }).join(',');
}

/**
 * Generate occurrence.csv content
 */
export function generateOccurrenceCsv(records: Record<string, any>[], fields?: string[]): string {
    const useFields = fields || DWC_CORE_FIELDS;
    const header = useFields.join(',');
    const rows = records.map(record => recordToCsvRow(record, useFields));
    return [header, ...rows].join('\n');
}

/**
 * Create full DwC-A package data
 */
export interface DwCArchiveData {
    occurrenceCsv: string;
    metaXml: string;
    emlXml: string;
}

export function createDarwinCoreArchive(
    records: Record<string, any>[],
    metadata: {
        title: string;
        abstract?: string;
        creator?: { name: string; email?: string; institution?: string };
        keywords?: string[];
        geographicCoverage?: {
            westBoundingCoordinate: number;
            eastBoundingCoordinate: number;
            northBoundingCoordinate: number;
            southBoundingCoordinate: number;
        };
        temporalCoverage?: { beginDate: string; endDate: string };
    }
): DwCArchiveData {
    // Determine which fields are actually present in the data
    const presentFields = DWC_CORE_FIELDS.filter(field =>
        records.some(r => r[field] !== undefined && r[field] !== null && r[field] !== '')
    );

    // Always include occurrenceID as first field
    if (!presentFields.includes('occurrenceID')) {
        presentFields.unshift('occurrenceID');
    }

    return {
        occurrenceCsv: generateOccurrenceCsv(records, presentFields),
        metaXml: generateMetaXml(presentFields),
        emlXml: generateEmlXml(metadata),
    };
}

/**
 * Generate OBIS-CSV format
 */
export function createObisCsv(records: Record<string, any>[]): string {
    const OBIS_FIELDS = [
        'id',
        'scientificName',
        'scientificNameID',
        'eventDate',
        'decimalLatitude',
        'decimalLongitude',
        'minimumDepthInMeters',
        'maximumDepthInMeters',
        'basisOfRecord',
        'occurrenceStatus',
        'coordinateUncertaintyInMeters',
        'institutionCode',
        'datasetID',
    ];

    // Map records to OBIS format
    const obisRecords = records.map((record, index) => ({
        id: record.id || record.occurrenceID || `obis-${index + 1}`,
        scientificName: record.scientificName,
        scientificNameID: record.scientificNameID || '',
        eventDate: record.eventDate,
        decimalLatitude: record.decimalLatitude,
        decimalLongitude: record.decimalLongitude,
        minimumDepthInMeters: record.minimumDepthInMeters || '',
        maximumDepthInMeters: record.maximumDepthInMeters || '',
        basisOfRecord: record.basisOfRecord || 'HumanObservation',
        occurrenceStatus: record.occurrenceStatus || 'present',
        coordinateUncertaintyInMeters: record.coordinateUncertaintyInMeters || '',
        institutionCode: record.institutionCode || 'CMLRE',
        datasetID: record.datasetID || '',
    }));

    const header = OBIS_FIELDS.join(',');
    const rows = obisRecords.map(record => recordToCsvRow(record, OBIS_FIELDS));
    return [header, ...rows].join('\n');
}

/**
 * Generate MIxS-JSON format
 */
export function createMixsJson(records: Record<string, any>[], envPackage: string = 'water'): string {
    const MIXS_CORE_FIELDS = [
        'sample_name',
        'project_name',
        'lat_lon',
        'geo_loc_name',
        'collection_date',
        'env_broad_scale',
        'env_local_scale',
        'env_medium',
    ];

    const MIXS_WATER_FIELDS = [
        'depth',
        'temp',
        'salinity',
        'ph',
        'diss_oxygen',
        'chlorophyll',
    ];

    const MIXS_SEQ_FIELDS = [
        'seq_meth',
        'lib_layout',
        'lib_strategy',
        'target_gene',
        'target_subfragment',
        'pcr_primers',
    ];

    // Convert records to MIxS format
    const mixsRecords = records.map((record, index) => {
        const mixsRecord: Record<string, any> = {
            // Core fields
            sample_name: record.sample_name || record.occurrenceID || `sample-${index + 1}`,
            project_name: record.project_name || 'CMLRE Export',
            lat_lon: record.lat_lon || (record.decimalLatitude && record.decimalLongitude
                ? `${record.decimalLatitude} ${record.decimalLongitude}` : ''),
            geo_loc_name: record.geo_loc_name || record.locality || '',
            collection_date: record.collection_date || record.eventDate || '',
            env_broad_scale: record.env_broad_scale || 'ENVO:00000447',  // marine biome
            env_local_scale: record.env_local_scale || '',
            env_medium: record.env_medium || 'ENVO:00002149',  // sea water
        };

        // Add water-specific fields
        if (envPackage === 'water') {
            mixsRecord.depth = record.depth || record.minimumDepthInMeters || '';
            mixsRecord.temp = record.temp || record.temperature || '';
            mixsRecord.salinity = record.salinity || '';
            mixsRecord.ph = record.ph || '';
            mixsRecord.diss_oxygen = record.diss_oxygen || '';
            mixsRecord.chlorophyll = record.chlorophyll || '';
        }

        // Add sequencing fields if present
        if (record.seq_meth || record.target_gene) {
            mixsRecord.seq_meth = record.seq_meth || '';
            mixsRecord.lib_layout = record.lib_layout || '';
            mixsRecord.lib_strategy = record.lib_strategy || '';
            mixsRecord.target_gene = record.target_gene || '';
            mixsRecord.target_subfragment = record.target_subfragment || '';
            mixsRecord.pcr_primers = record.pcr_primers || '';
        }

        return mixsRecord;
    });

    return JSON.stringify({
        schema: 'MIxS',
        version: '6.0',
        env_package: envPackage,
        exported_at: new Date().toISOString(),
        samples: mixsRecords,
    }, null, 2);
}

export default {
    createDarwinCoreArchive,
    createObisCsv,
    createMixsJson,
    generateOccurrenceCsv,
    generateMetaXml,
    generateEmlXml,
    DWC_CORE_FIELDS,
};
