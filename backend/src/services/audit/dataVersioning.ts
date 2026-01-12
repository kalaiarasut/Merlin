/**
 * Data Versioning Service
 * Git-like version control for datasets
 * Persistence: MongoDB (DataVersion model)
 */

import { DataVersion, IDataVersion, DatasetVersionHistory } from '../../models/DataVersion';

// Re-export types for consumers
export type { DatasetVersionHistory };
export type { IDataVersion as DataVersion };

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
export async function createInitialVersion(params: {
    datasetId: string;
    createdBy: string;
    createdByName: string;
    description: string;
    recordCount: number;
    sizeBytes: number;
    data: any;
    metadata?: Record<string, any>;
}): Promise<IDataVersion> {
    // Initialize counter
    await DatasetCounter.findOneAndUpdate(
        { datasetId: params.datasetId },
        { latestVersion: 1 },
        { upsert: true, new: true }
    );

    const version = new DataVersion({
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
    });

    return await version.save();
}

import { DatasetCounter } from '../../models/DatasetCounter';

/**
 * Create a new version of an existing dataset
 */
export async function createVersion(params: {
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
}): Promise<IDataVersion | null> {
    // 1. Atomically get next version number
    const counter = await DatasetCounter.findOneAndUpdate(
        { datasetId: params.datasetId },
        { $inc: { latestVersion: 1 } },
        { upsert: true, new: true }
    );

    const nextVersion = counter.latestVersion;

    // Note: If the code fails after this point but before saving the new DataVersion,
    // we will have a gap in version numbers (e.g., v1 -> v3). This is acceptable behavior
    // to avoid complex transactions in non-replica-set environments, as long as version
    // ordering remains consistent.

    // Deactivate previous active version (still needed for logic)
    // Note: This might theoretically miss if a new version was JUST created, but strictly speaking 
    // version numbers are now unique and ordered. The concept of "active" usually implies "HEAD".
    // Better to mark all previous versions as inactive.
    await DataVersion.updateMany(
        { datasetId: params.datasetId, version: { $lt: nextVersion }, isActive: true },
        { isActive: false }
    );

    // Get parent version (previous version)
    const parentVer = nextVersion > 1 ? nextVersion - 1 : undefined;

    const newVersion = new DataVersion({
        datasetId: params.datasetId,
        version: nextVersion,
        createdAt: new Date(),
        createdBy: params.createdBy,
        createdByName: params.createdByName,
        changeType: params.changeType,
        description: params.description,
        recordCount: params.recordCount,
        sizeBytes: params.sizeBytes,
        parentVersion: parentVer,
        checksum: generateChecksum(params.data),
        changes: params.changes,
        metadata: params.metadata || {},
        isActive: true,
    });

    return await newVersion.save();
}

/**
 * Get version history for a dataset
 */
export async function getVersionHistory(datasetId: string): Promise<DatasetVersionHistory | null> {
    const versions = await DataVersion.find({ datasetId }).sort({ version: -1 });

    if (!versions || versions.length === 0) {
        return null;
    }

    const activeVersion = versions.find(v => v.isActive) || versions[0];
    const initialVersion = versions[versions.length - 1]; // Last by negative sort is first created

    return {
        datasetId,
        datasetName: initialVersion.metadata?.name || datasetId,
        currentVersion: activeVersion.version,
        versions: versions,
        totalVersions: versions.length,
    };
}

/**
 * Get a specific version
 */
export async function getVersion(datasetId: string, versionNumber: number): Promise<IDataVersion | null> {
    return await DataVersion.findOne({ datasetId, version: versionNumber });
}

/**
 * Restore a previous version (creates new version with restored content)
 */
export async function restoreVersion(params: {
    datasetId: string;
    targetVersion: number;
    restoredBy: string;
    restoredByName: string;
}): Promise<IDataVersion | null> {
    const targetVer = await DataVersion.findOne({
        datasetId: params.datasetId,
        version: params.targetVersion
    });

    const latestVer = await DataVersion.findOne({ datasetId: params.datasetId })
        .sort({ version: -1 });

    if (!targetVer || !latestVer) {
        return null;
    }

    // Deactivate all versions
    await DataVersion.updateMany(
        { datasetId: params.datasetId, isActive: true },
        { isActive: false }
    );

    const restoredVersion = new DataVersion({
        datasetId: params.datasetId,
        version: latestVer.version + 1,
        createdAt: new Date(),
        createdBy: params.restoredBy,
        createdByName: params.restoredByName,
        changeType: 'restore',
        description: `Restored from version ${params.targetVersion}`,
        recordCount: targetVer.recordCount,
        sizeBytes: targetVer.sizeBytes,
        parentVersion: latestVer.version,
        checksum: targetVer.checksum,
        changes: { added: 0, modified: 0, deleted: 0 }, // It's a restore, changes logic might need more thought but 0 is safe
        metadata: targetVer.metadata,
        isActive: true, // New active
    });

    return await restoredVersion.save();
}

/**
 * Compare two versions
 */
export async function compareVersions(datasetId: string, v1: number, v2: number): Promise<{
    version1: IDataVersion | null;
    version2: IDataVersion | null;
    diff: {
        recordCountDelta: number;
        sizeDelta: number;
        checksumMatch: boolean;
        changesSummary: string;
    } | null;
}> {
    const [ver1, ver2] = await Promise.all([
        DataVersion.findOne({ datasetId, version: v1 }),
        DataVersion.findOne({ datasetId, version: v2 })
    ]);

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
export async function getVersioningStats(): Promise<{
    totalDatasets: number;
    totalVersions: number;
    datasetsWithMultipleVersions: number;
    avgVersionsPerDataset: number;
    recentVersions: IDataVersion[];
}> {
    const [totalDatasets, totalVersions, multipleVersions, recentVersions] = await Promise.all([
        DataVersion.distinct('datasetId').then(ids => ids.length),
        DataVersion.countDocuments(),
        // Count distinct datasetIds where count > 1 (requires aggregate)
        DataVersion.aggregate([
            { $group: { _id: '$datasetId', count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $count: 'count' }
        ]).then(res => res[0]?.count || 0),
        DataVersion.find().sort({ createdAt: -1 }).limit(10)
    ]);

    return {
        totalDatasets,
        totalVersions,
        datasetsWithMultipleVersions: multipleVersions,
        avgVersionsPerDataset: totalDatasets > 0 ? totalVersions / totalDatasets : 0,
        recentVersions,
    };
}

/**
 * List all versioned datasets
 */
export async function listVersionedDatasets(): Promise<Array<{
    datasetId: string;
    currentVersion: number;
    totalVersions: number;
    lastUpdated: Date;
}>> {
    // Aggregation to get latest summary per dataset
    const start = Date.now();
    const result = await DataVersion.aggregate([
        {
            $sort: { version: -1 } // Sort versions descending first
        },
        {
            $group: {
                _id: '$datasetId',
                currentVersion: { $first: '$version' }, // First is latest because of sort
                totalVersions: { $sum: 1 },
                lastUpdated: { $first: '$createdAt' }
            }
        },
        {
            $sort: { lastUpdated: -1 }
        }
    ]);

    return result.map(g => ({
        datasetId: g._id,
        currentVersion: g.currentVersion,
        totalVersions: g.totalVersions,
        lastUpdated: g.lastUpdated
    }));
}
