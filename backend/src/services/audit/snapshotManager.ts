/**
 * Snapshot Manager Service
 * Creates reproducible analysis state snapshots
 */

export interface AnalysisSnapshot {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    createdBy: string;
    createdByName: string;
    analysisType: 'biodiversity' | 'fisheries' | 'causal' | 'edna' | 'niche' | 'custom';

    // Input data references
    inputDatasets: Array<{
        datasetId: string;
        version: number;
        checksum: string;
    }>;

    // Parameters used
    parameters: Record<string, any>;

    // Environment info for reproducibility
    environment: {
        platformVersion: string;
        nodeVersion: string;
        timestamp: string;
        timezone: string;
    };

    // Results summary
    resultsSummary: Record<string, any>;
    resultsChecksum: string;

    // Status
    status: 'active' | 'archived' | 'invalidated';
    tags: string[];
}

// In-memory store
const snapshots: Map<string, AnalysisSnapshot> = new Map();

/**
 * Create an analysis snapshot
 */
export function createSnapshot(params: {
    name: string;
    description: string;
    createdBy: string;
    createdByName: string;
    analysisType: AnalysisSnapshot['analysisType'];
    inputDatasets: AnalysisSnapshot['inputDatasets'];
    parameters: Record<string, any>;
    resultsSummary: Record<string, any>;
    tags?: string[];
}): AnalysisSnapshot {
    const id = `SNAP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const snapshot: AnalysisSnapshot = {
        id,
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
    };

    snapshots.set(id, snapshot);
    return snapshot;
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
export function getSnapshot(id: string): AnalysisSnapshot | null {
    return snapshots.get(id) || null;
}

/**
 * List snapshots with filtering
 */
export function listSnapshots(filters?: {
    createdBy?: string;
    analysisType?: string;
    status?: string;
    tags?: string[];
    limit?: number;
}): AnalysisSnapshot[] {
    let result = Array.from(snapshots.values());

    if (filters?.createdBy) {
        result = result.filter(s => s.createdBy === filters.createdBy);
    }
    if (filters?.analysisType) {
        result = result.filter(s => s.analysisType === filters.analysisType);
    }
    if (filters?.status) {
        result = result.filter(s => s.status === filters.status);
    }
    if (filters?.tags && filters.tags.length > 0) {
        result = result.filter(s => filters.tags!.some(t => s.tags.includes(t)));
    }

    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (filters?.limit) {
        result = result.slice(0, filters.limit);
    }

    return result;
}

/**
 * Archive a snapshot
 */
export function archiveSnapshot(id: string): boolean {
    const snapshot = snapshots.get(id);
    if (snapshot) {
        snapshot.status = 'archived';
        return true;
    }
    return false;
}

/**
 * Invalidate a snapshot (data has changed)
 */
export function invalidateSnapshot(id: string, reason: string): boolean {
    const snapshot = snapshots.get(id);
    if (snapshot) {
        snapshot.status = 'invalidated';
        snapshot.tags.push(`invalidated: ${reason}`);
        return true;
    }
    return false;
}

/**
 * Verify if a snapshot is still reproducible
 */
export function verifySnapshot(snapshot: AnalysisSnapshot, currentDatasets: Array<{ datasetId: string; version: number; checksum: string }>): {
    reproducible: boolean;
    issues: string[];
} {
    const issues: string[] = [];

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
export function cloneSnapshot(id: string, modifications: {
    name: string;
    createdBy: string;
    createdByName: string;
    parameterOverrides?: Record<string, any>;
}): AnalysisSnapshot | null {
    const original = snapshots.get(id);
    if (!original) return null;

    return createSnapshot({
        name: modifications.name,
        description: `Cloned from ${original.id}: ${original.name}`,
        createdBy: modifications.createdBy,
        createdByName: modifications.createdByName,
        analysisType: original.analysisType,
        inputDatasets: original.inputDatasets,
        parameters: { ...original.parameters, ...modifications.parameterOverrides },
        resultsSummary: {}, // Results need to be recomputed
        tags: [...original.tags, `cloned-from:${original.id}`],
    });
}

/**
 * Get snapshot statistics
 */
export function getSnapshotStats(): {
    total: number;
    active: number;
    archived: number;
    invalidated: number;
    byType: Record<string, number>;
    byUser: Array<{ userId: string; userName: string; count: number }>;
} {
    const all = Array.from(snapshots.values());
    const byType: Record<string, number> = {};
    const userCounts: Map<string, { userName: string; count: number }> = new Map();

    all.forEach(s => {
        byType[s.analysisType] = (byType[s.analysisType] || 0) + 1;

        const uc = userCounts.get(s.createdBy) || { userName: s.createdByName, count: 0 };
        uc.count++;
        userCounts.set(s.createdBy, uc);
    });

    return {
        total: all.length,
        active: all.filter(s => s.status === 'active').length,
        archived: all.filter(s => s.status === 'archived').length,
        invalidated: all.filter(s => s.status === 'invalidated').length,
        byType,
        byUser: Array.from(userCounts.entries())
            .map(([userId, data]) => ({ userId, ...data }))
            .sort((a, b) => b.count - a.count),
    };
}

/**
 * Export snapshot for sharing
 */
export function exportSnapshot(id: string): string | null {
    const snapshot = snapshots.get(id);
    if (!snapshot) return null;
    return JSON.stringify(snapshot, null, 2);
}
