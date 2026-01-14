/**
 * BLAST Audit Log Model
 * 
 * Tracks NCBI BLAST usage for institutional review and compliance.
 * Required for production NCBI usage monitoring.
 */

import mongoose from 'mongoose';

const blastAuditLogSchema = new mongoose.Schema({
    // Request metadata
    timestamp: { type: Date, default: Date.now, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    jobId: { type: String, index: true },

    // Query details
    queryCount: { type: Number, required: true },
    database: { type: String, default: 'nt' },
    databaseVersion: { type: String },

    // Performance
    cacheHit: { type: Boolean, default: false },
    durationSeconds: { type: Number },

    // Results summary
    totalHits: { type: Number, default: 0 },
    filteredHits: { type: Number, default: 0 },
    topSpecies: [{ type: String }],

    // Provenance
    clientVersion: { type: String, default: '1.0.0' },
    filterThresholds: {
        minPident: { type: Number, default: 85 },
        minQcovs: { type: Number, default: 70 },
        minLength: { type: Number, default: 100 },
    },

    // Request context
    ipAddress: { type: String },
    userAgent: { type: String },
});

// Indexes for compliance queries
blastAuditLogSchema.index({ timestamp: -1, userId: 1 });
blastAuditLogSchema.index({ 'filterThresholds.minPident': 1 });

// Static methods for audit queries
blastAuditLogSchema.statics.getUsageStats = async function (startDate: Date, endDate: Date) {
    return this.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: null,
                totalQueries: { $sum: '$queryCount' },
                totalRequests: { $sum: 1 },
                cacheHits: { $sum: { $cond: ['$cacheHit', 1, 0] } },
                avgDuration: { $avg: '$durationSeconds' },
                uniqueUsers: { $addToSet: '$userId' },
            }
        }
    ]);
};

blastAuditLogSchema.statics.getUserUsage = async function (userId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                timestamp: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                queries: { $sum: '$queryCount' },
                requests: { $sum: 1 },
            }
        },
        { $sort: { _id: 1 } }
    ]);
};

const BlastAuditLog = mongoose.model('BlastAuditLog', blastAuditLogSchema);

export default BlastAuditLog;
