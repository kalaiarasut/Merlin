/**
 * Snapshot Manager Service
 * Creates reproducible analysis state snapshots
 * Persistence: MongoDB (AnalysisSnapshot model)
 */

import { AnalysisSnapshot, IAnalysisSnapshot } from '../../models/AnalysisSnapshot';

// Re-export type
export type { IAnalysisSnapshot as AnalysisSnapshot };

/**
 * Create an analysis snapshot
 */
export async function createSnapshot(params: {
    name: string;
    description: string;
    createdBy: string;
    createdByName: string;
    analysisType: IAnalysisSnapshot['analysisType'];
    inputDatasets: IAnalysisSnapshot['inputDatasets'];
    parameters: Record<string, any>;
    resultsSummary: Record<string, any>;
    tags?: string[];
}): Promise<IAnalysisSnapshot> {
    const snapshot = new AnalysisSnapshot({
        name: params.name,
        description: params.description,
        createdAt: new Date(),
        createdBy: params.createdBy,
        createdByName: params.createdByName,
        analysisType: params.analysisType,
        inputDatasets: params.inputDatasets,
        parameters: params.parameters,
        environment: {
            platformVersion: '1.0.0',
            nodeVersion: process.version,
            timestamp: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        resultsSummary: params.resultsSummary,
        resultsChecksum: generateResultsChecksum(params.resultsSummary),
        status: 'active',
        tags: params.tags || [],
    });

    return await snapshot.save();
}

/**
 * Generate checksum for results
 */
function generateResultsChecksum(results: any): string {
    const str = JSON.stringify(results);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Get a snapshot by ID
 */
export async function getSnapshot(id: string): Promise<IAnalysisSnapshot | null> {
    // Support searching by Mongo _id or our custom ID format if we kept it? 
    // We switched to Mongo _id in the model (auto-generated). 
    // But existing frontend might expect string IDs. Mongoose handles string->ObjectId casting usually.
    return await AnalysisSnapshot.findById(id);
}

/**
 * List snapshots with filtering
 */
export async function listSnapshots(filters?: {
    createdBy?: string;
    analysisType?: string;
    status?: string;
    tags?: string[];
    limit?: number;
}): Promise<IAnalysisSnapshot[]> {
    const query: any = {};

    if (filters?.createdBy) query.createdBy = filters.createdBy;
    if (filters?.analysisType) query.analysisType = filters.analysisType;
    if (filters?.status) query.status = filters.status;
    if (filters?.tags && filters.tags.length > 0) {
        query.tags = { $in: filters.tags };
    }

    const cursor = AnalysisSnapshot.find(query).sort({ createdAt: -1 });

    if (filters?.limit) {
        cursor.limit(filters.limit);
    }

    return await cursor;
}

/**
 * Archive a snapshot
 */
export async function archiveSnapshot(id: string): Promise<boolean> {
    const result = await AnalysisSnapshot.findByIdAndUpdate(id, { status: 'archived' });
    return !!result;
}

/**
 * Invalidate a snapshot (data has changed)
 */
export async function invalidateSnapshot(id: string, reason: string): Promise<boolean> {
    const result = await AnalysisSnapshot.findByIdAndUpdate(id, {
        status: 'invalidated',
        $push: { tags: `invalidated: ${reason}` }
    });
    return !!result;
}

/**
 * Verify if a snapshot is still reproducible
 */
export async function verifySnapshot(snapshot: IAnalysisSnapshot, currentDatasets: Array<{ datasetId: string; version: number; checksum: string }>): Promise<{
    reproducible: boolean;
    issues: string[];
}> {
    const issues: string[] = [];

    // This logic operates on the passed snapshot object, not DB query, so it stays sync mostly, 
    // but the function itself is async enabled for consistence.
    // Actually, no DB calls here, but I'll make it async Promise resolving for consistency.

    for (const input of snapshot.inputDatasets) {
        const current = currentDatasets.find(d => d.datasetId === input.datasetId);

        if (!current) {
            issues.push(`Dataset ${input.datasetId} not found`);
        } else if (current.version !== input.version) {
            issues.push(`Dataset ${input.datasetId} version mismatch: snapshot uses v${input.version}, current is v${current.version}`);
        } else if (current.checksum !== input.checksum) {
            issues.push(`Dataset ${input.datasetId} checksum mismatch`);
        }
    }

    return {
        reproducible: issues.length === 0,
        issues,
    };
}

/**
 * Clone a snapshot with new parameters
 */
export async function cloneSnapshot(id: string, modifications: {
    name: string;
    createdBy: string;
    createdByName: string;
    parameterOverrides?: Record<string, any>;
}): Promise<IAnalysisSnapshot | null> {
    const original = await AnalysisSnapshot.findById(id);
    if (!original) return null;

    return await createSnapshot({
        name: modifications.name,
        description: `Cloned from snapshot: ${original.name}`,
        createdBy: modifications.createdBy,
        createdByName: modifications.createdByName,
        analysisType: original.analysisType,
        inputDatasets: original.inputDatasets,
        parameters: { ...original.parameters, ...modifications.parameterOverrides },
        resultsSummary: {}, // Results need to be recomputed
        tags: [...original.tags, `cloned-from:${original._id}`],
    });
}

/**
 * Get snapshot statistics
 */
export async function getSnapshotStats(): Promise<{
    total: number;
    active: number;
    archived: number;
    invalidated: number;
    byType: Record<string, number>;
    byUser: Array<{ userId: string; userName: string; count: number }>;
}> {
    const [total, active, archived, invalidated, typeStats, userStats] = await Promise.all([
        AnalysisSnapshot.countDocuments(),
        AnalysisSnapshot.countDocuments({ status: 'active' }),
        AnalysisSnapshot.countDocuments({ status: 'archived' }),
        AnalysisSnapshot.countDocuments({ status: 'invalidated' }),
        AnalysisSnapshot.aggregate([
            { $group: { _id: '$analysisType', count: { $sum: 1 } } }
        ]),
        AnalysisSnapshot.aggregate([
            { $group: { _id: { userId: '$createdBy', userName: '$createdByName' }, count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ])
    ]);

    const byType: Record<string, number> = {};
    typeStats.forEach((t: any) => { byType[t._id] = t.count; });

    const byUser = userStats.map((u: any) => ({
        userId: u._id.userId,
        userName: u._id.userName,
        count: u.count
    }));

    return {
        total,
        active,
        archived,
        invalidated,
        byType,
        byUser
    };
}

/**
 * Export snapshot for sharing
 */
export async function exportSnapshot(id: string): Promise<string | null> {
    const snapshot = await AnalysisSnapshot.findById(id);
    if (!snapshot) return null;
    return JSON.stringify(snapshot, null, 2);
}
