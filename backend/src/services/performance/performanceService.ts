/**
 * Performance Service
 * Background job queue, caching, and system metrics
 */

// ==================== TYPES ====================

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobType = 'analysis' | 'export' | 'import' | 'validation' | 'report' | 'sync';

export interface BackgroundJob {
    id: string;
    type: JobType;
    name: string;
    description: string;
    status: JobStatus;
    priority: 1 | 2 | 3 | 4 | 5; // 1 = highest
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    createdBy: string;
    progress: number; // 0-100
    result?: any;
    error?: string;
    metadata: Record<string, any>;
}

export interface CacheEntry {
    key: string;
    value: any;
    createdAt: Date;
    expiresAt?: Date;
    hits: number;
    sizeBytes: number;
}

export interface SystemMetrics {
    timestamp: Date;
    memory: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    uptime: number;
    activeJobs: number;
    queuedJobs: number;
    cacheStats: {
        hits: number;
        misses: number;
        size: number;
        entries: number;
    };
}

// ==================== DATA STORES ====================

const jobQueue: Map<string, BackgroundJob> = new Map();
const cache: Map<string, CacheEntry> = new Map();
let cacheHits = 0;
let cacheMisses = 0;

// ==================== JOB QUEUE ====================

/**
 * Submit a new background job
 */
export function submitJob(params: {
    type: JobType;
    name: string;
    description?: string;
    priority?: 1 | 2 | 3 | 4 | 5;
    createdBy: string;
    metadata?: Record<string, any>;
}): BackgroundJob {
    const id = `JOB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const job: BackgroundJob = {
        id,
        type: params.type,
        name: params.name,
        description: params.description || '',
        status: 'pending',
        priority: params.priority || 3,
        createdAt: new Date(),
        createdBy: params.createdBy,
        progress: 0,
        metadata: params.metadata || {},
    };

    jobQueue.set(id, job);

    // Auto-start job after short delay (simulated)
    setTimeout(() => startJob(id), 100);

    return job;
}

/**
 * Start a job (internal)
 */
function startJob(id: string): void {
    const job = jobQueue.get(id);
    if (!job || job.status !== 'pending') return;

    job.status = 'running';
    job.startedAt = new Date();

    // Simulate job progress
    const progressInterval = setInterval(() => {
        const currentJob = jobQueue.get(id);
        if (!currentJob || currentJob.status !== 'running') {
            clearInterval(progressInterval);
            return;
        }

        currentJob.progress = Math.min(currentJob.progress + Math.random() * 20, 100);

        if (currentJob.progress >= 100) {
            currentJob.status = 'completed';
            currentJob.completedAt = new Date();
            currentJob.progress = 100;
            currentJob.result = { message: 'Job completed successfully', processedItems: Math.floor(Math.random() * 1000) };
            clearInterval(progressInterval);
        }
    }, 500);
}

/**
 * Get job by ID
 */
export function getJob(id: string): BackgroundJob | null {
    return jobQueue.get(id) || null;
}

/**
 * List jobs with filters
 */
export function listJobs(filters?: {
    status?: JobStatus;
    type?: JobType;
    createdBy?: string;
    limit?: number;
}): BackgroundJob[] {
    let jobs = Array.from(jobQueue.values());

    if (filters?.status) {
        jobs = jobs.filter(j => j.status === filters.status);
    }
    if (filters?.type) {
        jobs = jobs.filter(j => j.type === filters.type);
    }
    if (filters?.createdBy) {
        jobs = jobs.filter(j => j.createdBy === filters.createdBy);
    }

    // Sort by priority then creation date
    jobs.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.createdAt.getTime() - a.createdAt.getTime();
    });

    if (filters?.limit) {
        jobs = jobs.slice(0, filters.limit);
    }

    return jobs;
}

/**
 * Cancel a job
 */
export function cancelJob(id: string): boolean {
    const job = jobQueue.get(id);
    if (!job || !['pending', 'running'].includes(job.status)) return false;

    job.status = 'cancelled';
    job.completedAt = new Date();
    return true;
}

/**
 * Retry a failed job
 */
export function retryJob(id: string): BackgroundJob | null {
    const job = jobQueue.get(id);
    if (!job || job.status !== 'failed') return null;

    job.status = 'pending';
    job.progress = 0;
    job.error = undefined;
    job.startedAt = undefined;
    job.completedAt = undefined;

    setTimeout(() => startJob(id), 100);
    return job;
}

// ==================== CACHE ====================

/**
 * Set a cache entry
 */
export function cacheSet(key: string, value: any, ttlSeconds?: number): void {
    const sizeBytes = JSON.stringify(value).length;

    cache.set(key, {
        key,
        value,
        createdAt: new Date(),
        expiresAt: ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : undefined,
        hits: 0,
        sizeBytes,
    });
}

/**
 * Get a cache entry
 */
export function cacheGet(key: string): any | null {
    const entry = cache.get(key);

    if (!entry) {
        cacheMisses++;
        return null;
    }

    // Check expiry
    if (entry.expiresAt && entry.expiresAt < new Date()) {
        cache.delete(key);
        cacheMisses++;
        return null;
    }

    entry.hits++;
    cacheHits++;
    return entry.value;
}

/**
 * Delete a cache entry
 */
export function cacheDelete(key: string): boolean {
    return cache.delete(key);
}

/**
 * Clear all cache
 */
export function cacheClear(): number {
    const count = cache.size;
    cache.clear();
    return count;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
    entries: number;
    totalSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    topKeys: Array<{ key: string; hits: number; size: number }>;
} {
    const entries = Array.from(cache.values());
    const totalSize = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
    const total = cacheHits + cacheMisses;

    return {
        entries: cache.size,
        totalSize,
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: total > 0 ? (cacheHits / total) * 100 : 0,
        topKeys: entries
            .sort((a, b) => b.hits - a.hits)
            .slice(0, 10)
            .map(e => ({ key: e.key, hits: e.hits, size: e.sizeBytes })),
    };
}

// ==================== SYSTEM METRICS ====================

/**
 * Get current system metrics
 */
export function getSystemMetrics(): SystemMetrics {
    const memory = process.memoryUsage();
    const cacheStats = getCacheStats();
    const jobs = Array.from(jobQueue.values());

    return {
        timestamp: new Date(),
        memory: {
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            external: memory.external,
            rss: memory.rss,
        },
        uptime: process.uptime(),
        activeJobs: jobs.filter(j => j.status === 'running').length,
        queuedJobs: jobs.filter(j => j.status === 'pending').length,
        cacheStats: {
            hits: cacheStats.hits,
            misses: cacheStats.misses,
            size: cacheStats.totalSize,
            entries: cacheStats.entries,
        },
    };
}

/**
 * Get job queue statistics
 */
export function getJobStats(): {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    avgCompletionTime: number;
    successRate: number;
} {
    const jobs = Array.from(jobQueue.values());

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};

    jobs.forEach(j => {
        byStatus[j.status] = (byStatus[j.status] || 0) + 1;
        byType[j.type] = (byType[j.type] || 0) + 1;
    });

    const completed = jobs.filter(j => j.status === 'completed' && j.startedAt && j.completedAt);
    const avgTime = completed.length > 0
        ? completed.reduce((sum, j) => sum + (j.completedAt!.getTime() - j.startedAt!.getTime()), 0) / completed.length
        : 0;

    const finished = jobs.filter(j => ['completed', 'failed'].includes(j.status));
    const successRate = finished.length > 0
        ? (completed.length / finished.length) * 100
        : 100;

    return {
        total: jobs.length,
        byStatus,
        byType,
        avgCompletionTime: Math.round(avgTime),
        successRate: Math.round(successRate * 10) / 10,
    };
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
