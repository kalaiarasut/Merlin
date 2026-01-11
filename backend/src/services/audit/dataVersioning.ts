/**
 * Data Versioning Service
 * Git-like version control for datasets
 */

export interface DataVersion {
    id: string;
    datasetId: string;
    version: number;
    createdAt: Date;
    createdBy: string;
    createdByName: string;
    changeType: 'create' | 'update' | 'append' | 'delete' | 'restore';
    description: string;
    recordCount: number;
    sizeBytes: number;
    parentVersion?: number;
    checksum: string;
    changes: {
        added: number;
        modified: number;
        deleted: number;
    };
    metadata: Record<string, any>;
    isActive: boolean;
}

export interface DatasetVersionHistory {
    datasetId: string;
    datasetName: string;
    currentVersion: number;
    versions: DataVersion[];
    totalVersions: number;
}

// In-memory store
const versionStore: Map<string, DataVersion[]> = new Map();

/**
 * Generate a checksum for data
 */
function generateChecksum(data: any): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Create initial version for a new dataset
 */
export function createInitialVersion(params: {
    datasetId: string;
    createdBy: string;
    createdByName: string;
    description: string;
    recordCount: number;
    sizeBytes: number;
    data: any;
    metadata?: Record<string, any>;
}): DataVersion {
    const version: DataVersion = {
        id: `VER-${Date.now().toString(36).toUpperCase()}`,
        datasetId: params.datasetId,
        version: 1,
        createdAt: new Date(),
        createdBy: params.createdBy,
        createdByName: params.createdByName,
        changeType: 'create',
        description: params.description,
        recordCount: params.recordCount,
        sizeBytes: params.sizeBytes,
        checksum: generateChecksum(params.data),
        changes: { added: params.recordCount, modified: 0, deleted: 0 },
        metadata: params.metadata || {},
        isActive: true,
    };

    versionStore.set(params.datasetId, [version]);
    return version;
}

/**
 * Create a new version of an existing dataset
 */
export function createVersion(params: {
    datasetId: string;
    createdBy: string;
    createdByName: string;
    changeType: 'update' | 'append' | 'delete';
    description: string;
    recordCount: number;
    sizeBytes: number;
    data: any;
    changes: { added: number; modified: number; deleted: number };
    metadata?: Record<string, any>;
}): DataVersion | null {
    const versions = versionStore.get(params.datasetId);
    if (!versions || versions.length === 0) {
        return null;
    }

    // Deactivate previous active version
    versions.forEach(v => v.isActive = false);

    const currentMax = Math.max(...versions.map(v => v.version));
    const newVersion: DataVersion = {
        id: `VER-${Date.now().toString(36).toUpperCase()}`,
        datasetId: params.datasetId,
        version: currentMax + 1,
        createdAt: new Date(),
        createdBy: params.createdBy,
        createdByName: params.createdByName,
        changeType: params.changeType,
        description: params.description,
        recordCount: params.recordCount,
        sizeBytes: params.sizeBytes,
        parentVersion: currentMax,
        checksum: generateChecksum(params.data),
        changes: params.changes,
        metadata: params.metadata || {},
        isActive: true,
    };

    versions.push(newVersion);
    return newVersion;
}

/**
 * Get version history for a dataset
 */
export function getVersionHistory(datasetId: string): DatasetVersionHistory | null {
    const versions = versionStore.get(datasetId);
    if (!versions || versions.length === 0) {
        return null;
    }

    const activeVersion = versions.find(v => v.isActive);
    return {
        datasetId,
        datasetName: versions[0].metadata?.name || datasetId,
        currentVersion: activeVersion?.version || versions[versions.length - 1].version,
        versions: [...versions].reverse(), // Most recent first
        totalVersions: versions.length,
    };
}

/**
 * Get a specific version
 */
export function getVersion(datasetId: string, versionNumber: number): DataVersion | null {
    const versions = versionStore.get(datasetId);
    return versions?.find(v => v.version === versionNumber) || null;
}

/**
 * Restore a previous version (creates new version with restored content)
 */
export function restoreVersion(params: {
    datasetId: string;
    targetVersion: number;
    restoredBy: string;
    restoredByName: string;
}): DataVersion | null {
    const versions = versionStore.get(params.datasetId);
    const targetVer = versions?.find(v => v.version === params.targetVersion);

    if (!versions || !targetVer) {
        return null;
    }

    // Deactivate all versions
    versions.forEach(v => v.isActive = false);

    const currentMax = Math.max(...versions.map(v => v.version));
    const restoredVersion: DataVersion = {
        ...targetVer,
        id: `VER-${Date.now().toString(36).toUpperCase()}`,
        version: currentMax + 1,
        createdAt: new Date(),
        createdBy: params.restoredBy,
        createdByName: params.restoredByName,
        changeType: 'restore',
        description: `Restored from version ${params.targetVersion}`,
        parentVersion: currentMax,
        isActive: true,
    };

    versions.push(restoredVersion);
    return restoredVersion;
}

/**
 * Compare two versions
 */
export function compareVersions(datasetId: string, v1: number, v2: number): {
    version1: DataVersion | null;
    version2: DataVersion | null;
    diff: {
        recordCountDelta: number;
        sizeDelta: number;
        checksumMatch: boolean;
        changesSummary: string;
    } | null;
} {
    const versions = versionStore.get(datasetId);
    const ver1 = versions?.find(v => v.version === v1);
    const ver2 = versions?.find(v => v.version === v2);

    if (!ver1 || !ver2) {
        return { version1: ver1 || null, version2: ver2 || null, diff: null };
    }

    return {
        version1: ver1,
        version2: ver2,
        diff: {
            recordCountDelta: ver2.recordCount - ver1.recordCount,
            sizeDelta: ver2.sizeBytes - ver1.sizeBytes,
            checksumMatch: ver1.checksum === ver2.checksum,
            changesSummary: `+${ver2.changes.added - ver1.changes.added} added, ~${ver2.changes.modified - ver1.changes.modified} modified, -${ver2.changes.deleted - ver1.changes.deleted} deleted`,
        },
    };
}

/**
 * Get versioning statistics
 */
export function getVersioningStats(): {
    totalDatasets: number;
    totalVersions: number;
    datasetsWithMultipleVersions: number;
    avgVersionsPerDataset: number;
    recentVersions: DataVersion[];
} {
    let totalVersions = 0;
    let multipleVersions = 0;
    const allVersions: DataVersion[] = [];

    versionStore.forEach((versions) => {
        totalVersions += versions.length;
        if (versions.length > 1) multipleVersions++;
        allVersions.push(...versions);
    });

    allVersions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
        totalDatasets: versionStore.size,
        totalVersions,
        datasetsWithMultipleVersions: multipleVersions,
        avgVersionsPerDataset: versionStore.size > 0 ? totalVersions / versionStore.size : 0,
        recentVersions: allVersions.slice(0, 10),
    };
}

/**
 * List all versioned datasets
 */
export function listVersionedDatasets(): Array<{
    datasetId: string;
    currentVersion: number;
    totalVersions: number;
    lastUpdated: Date;
}> {
    const result: Array<{
        datasetId: string;
        currentVersion: number;
        totalVersions: number;
        lastUpdated: Date;
    }> = [];

    versionStore.forEach((versions, datasetId) => {
        const activeVer = versions.find(v => v.isActive) || versions[versions.length - 1];
        result.push({
            datasetId,
            currentVersion: activeVer.version,
            totalVersions: versions.length,
            lastUpdated: activeVer.createdAt,
        });
    });

    return result.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
}
