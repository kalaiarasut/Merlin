/**
 * Reproducibility Service
 * 
 * Ensures scientific reproducibility through cryptographic hashing
 * and version tracking. Guarantees same data → same result.
 */

import logger from '../../utils/logger';
import * as crypto from 'crypto';

export interface ReproducibilityRecord {
    reportId: string;
    hash: string;
    algorithm: string;
    createdAt: string;
    inputSummary: {
        dataType: string;
        recordCount: number;
        dateRange: { start: string; end: string };
        version: string;
    };
    parameters: Record<string, any>;
    verified: boolean;
}

export interface VersionInfo {
    platform: string;
    analysisEngine: string;
    dataSchemaVersion: string;
    reportTemplateVersion: string;
}

/**
 * Calculate reproducibility hash from input data
 */
export function calculateReproducibilityHash(data: any): string {
    // Canonicalize the data (sort keys, normalize values)
    const canonical = canonicalizeData(data);

    // Create SHA-256 hash
    const hash = crypto
        .createHash('sha256')
        .update(canonical)
        .digest('hex');

    return hash.substring(0, 16); // Use first 16 chars for readability
}

/**
 * Canonicalize data for consistent hashing
 */
function canonicalizeData(data: any): string {
    return JSON.stringify(sortObject(data));
}

/**
 * Recursively sort object keys
 */
function sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(sortObject);
    }

    const sorted: Record<string, any> = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObject(obj[key]);
    }

    return sorted;
}

/**
 * Create reproducibility record
 */
export function createReproducibilityRecord(
    reportId: string,
    data: any,
    parameters: Record<string, any> = {}
): ReproducibilityRecord {
    const hash = calculateReproducibilityHash({ data, parameters });

    return {
        reportId,
        hash,
        algorithm: 'SHA-256',
        createdAt: new Date().toISOString(),
        inputSummary: {
            dataType: data.type || 'unknown',
            recordCount: countRecords(data),
            dateRange: data.period || { start: 'N/A', end: 'N/A' },
            version: '1.0',
        },
        parameters,
        verified: true,
    };
}

/**
 * Count records in data
 */
function countRecords(data: any): number {
    if (!data || !data.data) return 0;

    if (Array.isArray(data.data)) {
        return data.data.length;
    }

    return Object.keys(data.data).length;
}

/**
 * Verify report hash matches expected
 */
export function verifyReproducibility(
    data: any,
    expectedHash: string,
    parameters: Record<string, any> = {}
): { verified: boolean; actualHash: string; match: boolean } {
    const actualHash = calculateReproducibilityHash({ data, parameters });
    const match = actualHash === expectedHash;

    return {
        verified: true,
        actualHash,
        match,
    };
}

/**
 * Get version information for reproducibility
 */
export function getVersionInfo(): VersionInfo {
    return {
        platform: 'CMLRE Marine Data Platform',
        analysisEngine: '1.0.0',
        dataSchemaVersion: '2.0',
        reportTemplateVersion: '1.0',
    };
}

/**
 * Create analysis snapshot for future reproduction
 */
export function createAnalysisSnapshot(
    analysisType: string,
    inputData: any,
    outputData: any,
    parameters: Record<string, any>
): {
    snapshotId: string;
    createdAt: string;
    inputHash: string;
    outputHash: string;
    parametersHash: string;
    reproducible: boolean;
} {
    const snapshotId = `SNAP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    return {
        snapshotId,
        createdAt: new Date().toISOString(),
        inputHash: calculateReproducibilityHash(inputData),
        outputHash: calculateReproducibilityHash(outputData),
        parametersHash: calculateReproducibilityHash(parameters),
        reproducible: true,
    };
}

/**
 * Generate reproducibility documentation
 */
export function generateReproducibilityDoc(
    record: ReproducibilityRecord,
    versionInfo: VersionInfo
): string {
    return `
# Reproducibility Documentation

## Report Information
- **Report ID**: ${record.reportId}
- **Generated At**: ${record.createdAt}

## Reproducibility Hash
- **Hash**: \`${record.hash}\`
- **Algorithm**: ${record.algorithm}

## Input Summary
- **Data Type**: ${record.inputSummary.dataType}
- **Record Count**: ${record.inputSummary.recordCount}
- **Date Range**: ${record.inputSummary.dateRange.start} to ${record.inputSummary.dateRange.end}

## Version Information
- **Platform**: ${versionInfo.platform}
- **Analysis Engine**: v${versionInfo.analysisEngine}
- **Data Schema**: v${versionInfo.dataSchemaVersion}
- **Template Version**: v${versionInfo.reportTemplateVersion}

## Verification
To verify this report, provide the same input data and parameters.
The calculated hash should match: \`${record.hash}\`

---
*This document ensures scientific reproducibility and data integrity.*
    `.trim();
}

export default {
    calculateReproducibilityHash,
    createReproducibilityRecord,
    verifyReproducibility,
    getVersionInfo,
    createAnalysisSnapshot,
    generateReproducibilityDoc,
};
