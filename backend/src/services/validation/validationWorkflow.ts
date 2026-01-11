/**
 * Validation Workflow Engine
 * Expert review workflows with approval chains
 */

export type ValidationStatus =
    | 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_revision';

export type ValidationItemType =
    | 'ai_identification' | 'dataset' | 'analysis' | 'report' | 'species_record';

export interface ValidationItem {
    id: string;
    type: ValidationItemType;
    entityId: string;
    entityName: string;

    // Source info
    createdBy: string;
    createdByName: string;
    createdAt: Date;

    // AI info (if AI-generated)
    isAIGenerated: boolean;
    aiConfidence?: number;
    aiModel?: string;

    // Review status
    status: ValidationStatus;
    priority: 'low' | 'medium' | 'high' | 'critical';

    // Assignment
    assignedTo?: string;
    assignedToName?: string;
    assignedAt?: Date;

    // Review details
    reviews: ValidationReview[];

    // Metadata
    data: Record<string, any>;
    tags: string[];
}

export interface ValidationReview {
    id: string;
    reviewerId: string;
    reviewerName: string;
    reviewerRole: string;
    reviewedAt: Date;
    decision: 'approve' | 'reject' | 'request_changes';
    comments: string;
    suggestedChanges?: string;
    confidence: number; // Reviewer's confidence in their decision
}

// In-memory store
const validationQueue: Map<string, ValidationItem> = new Map();

// Auto-acceptance thresholds
let thresholds = {
    ai_identification: { autoApproveAbove: 0.95, autoRejectBelow: 0.3 },
    dataset: { autoApproveAbove: 0.99, autoRejectBelow: 0.5 },
    analysis: { autoApproveAbove: 0.9, autoRejectBelow: 0.4 },
    report: { autoApproveAbove: 0.85, autoRejectBelow: 0.3 },
    species_record: { autoApproveAbove: 0.9, autoRejectBelow: 0.2 },
};

/**
 * Submit item for validation
 */
export function submitForValidation(params: {
    type: ValidationItemType;
    entityId: string;
    entityName: string;
    createdBy: string;
    createdByName: string;
    isAIGenerated: boolean;
    aiConfidence?: number;
    aiModel?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    data?: Record<string, any>;
    tags?: string[];
}): ValidationItem {
    const id = `VAL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Check auto-approval/rejection thresholds
    let initialStatus: ValidationStatus = 'pending';
    const typeThresholds = thresholds[params.type];

    if (params.isAIGenerated && params.aiConfidence !== undefined) {
        if (params.aiConfidence >= typeThresholds.autoApproveAbove) {
            initialStatus = 'approved';
        } else if (params.aiConfidence <= typeThresholds.autoRejectBelow) {
            initialStatus = 'rejected';
        }
    }

    const item: ValidationItem = {
        id,
        type: params.type,
        entityId: params.entityId,
        entityName: params.entityName,
        createdBy: params.createdBy,
        createdByName: params.createdByName,
        createdAt: new Date(),
        isAIGenerated: params.isAIGenerated,
        aiConfidence: params.aiConfidence,
        aiModel: params.aiModel,
        status: initialStatus,
        priority: params.priority || 'medium',
        reviews: [],
        data: params.data || {},
        tags: params.tags || [],
    };

    // If auto-approved/rejected, add system review
    if (initialStatus !== 'pending') {
        item.reviews.push({
            id: `REV-${Date.now().toString(36)}`,
            reviewerId: 'system',
            reviewerName: 'Auto-Validation System',
            reviewerRole: 'system',
            reviewedAt: new Date(),
            decision: initialStatus === 'approved' ? 'approve' : 'reject',
            comments: initialStatus === 'approved'
                ? `Auto-approved: AI confidence ${(params.aiConfidence! * 100).toFixed(1)}% exceeds threshold ${(typeThresholds.autoApproveAbove * 100).toFixed(1)}%`
                : `Auto-rejected: AI confidence ${(params.aiConfidence! * 100).toFixed(1)}% below threshold ${(typeThresholds.autoRejectBelow * 100).toFixed(1)}%`,
            confidence: 1.0,
        });
    }

    validationQueue.set(id, item);
    return item;
}

/**
 * Get pending items for review
 */
export function getPendingItems(filters?: {
    type?: ValidationItemType;
    priority?: string;
    assignedTo?: string;
    limit?: number;
}): ValidationItem[] {
    let items = Array.from(validationQueue.values()).filter(
        i => i.status === 'pending' || i.status === 'in_review'
    );

    if (filters?.type) {
        items = items.filter(i => i.type === filters.type);
    }
    if (filters?.priority) {
        items = items.filter(i => i.priority === filters.priority);
    }
    if (filters?.assignedTo) {
        items = items.filter(i => i.assignedTo === filters.assignedTo);
    }

    // Sort by priority then date
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    items.sort((a, b) => {
        const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (pDiff !== 0) return pDiff;
        return a.createdAt.getTime() - b.createdAt.getTime();
    });

    if (filters?.limit) {
        items = items.slice(0, filters.limit);
    }

    return items;
}

/**
 * Assign item to reviewer
 */
export function assignToReviewer(itemId: string, reviewerId: string, reviewerName: string): boolean {
    const item = validationQueue.get(itemId);
    if (!item) return false;

    item.assignedTo = reviewerId;
    item.assignedToName = reviewerName;
    item.assignedAt = new Date();
    item.status = 'in_review';
    return true;
}

/**
 * Submit a review
 */
export function submitReview(params: {
    itemId: string;
    reviewerId: string;
    reviewerName: string;
    reviewerRole: string;
    decision: 'approve' | 'reject' | 'request_changes';
    comments: string;
    suggestedChanges?: string;
    confidence: number;
}): ValidationItem | null {
    const item = validationQueue.get(params.itemId);
    if (!item) return null;

    const review: ValidationReview = {
        id: `REV-${Date.now().toString(36).toUpperCase()}`,
        reviewerId: params.reviewerId,
        reviewerName: params.reviewerName,
        reviewerRole: params.reviewerRole,
        reviewedAt: new Date(),
        decision: params.decision,
        comments: params.comments,
        suggestedChanges: params.suggestedChanges,
        confidence: params.confidence,
    };

    item.reviews.push(review);

    // Update status based on decision
    if (params.decision === 'approve') {
        item.status = 'approved';
    } else if (params.decision === 'reject') {
        item.status = 'rejected';
    } else {
        item.status = 'needs_revision';
    }

    return item;
}

/**
 * Get validation item by ID
 */
export function getValidationItem(id: string): ValidationItem | null {
    return validationQueue.get(id) || null;
}

/**
 * Get validation history for an entity
 */
export function getEntityValidationHistory(entityId: string): ValidationItem[] {
    return Array.from(validationQueue.values())
        .filter(i => i.entityId === entityId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Get/set auto-approval thresholds
 */
export function getThresholds() {
    return { ...thresholds };
}

export function setThresholds(newThresholds: Partial<typeof thresholds>) {
    thresholds = { ...thresholds, ...newThresholds };
    return thresholds;
}

/**
 * Get validation statistics
 */
export function getValidationStats(): {
    total: number;
    pending: number;
    inReview: number;
    approved: number;
    rejected: number;
    needsRevision: number;
    autoApproved: number;
    autoRejected: number;
    avgReviewTime: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
} {
    const all = Array.from(validationQueue.values());

    const byStatus = {
        pending: all.filter(i => i.status === 'pending').length,
        inReview: all.filter(i => i.status === 'in_review').length,
        approved: all.filter(i => i.status === 'approved').length,
        rejected: all.filter(i => i.status === 'rejected').length,
        needsRevision: all.filter(i => i.status === 'needs_revision').length,
    };

    const autoApproved = all.filter(i =>
        i.status === 'approved' &&
        i.reviews.length > 0 &&
        i.reviews[0].reviewerId === 'system'
    ).length;

    const autoRejected = all.filter(i =>
        i.status === 'rejected' &&
        i.reviews.length > 0 &&
        i.reviews[0].reviewerId === 'system'
    ).length;

    // Calculate avg review time for human-reviewed items
    const humanReviewed = all.filter(i =>
        i.reviews.length > 0 &&
        i.reviews.some(r => r.reviewerId !== 'system')
    );

    let avgReviewTime = 0;
    if (humanReviewed.length > 0) {
        const totalTime = humanReviewed.reduce((sum, i) => {
            const firstHumanReview = i.reviews.find(r => r.reviewerId !== 'system');
            if (firstHumanReview) {
                return sum + (firstHumanReview.reviewedAt.getTime() - i.createdAt.getTime());
            }
            return sum;
        }, 0);
        avgReviewTime = totalTime / humanReviewed.length / (1000 * 60); // minutes
    }

    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    all.forEach(i => {
        byType[i.type] = (byType[i.type] || 0) + 1;
        byPriority[i.priority] = (byPriority[i.priority] || 0) + 1;
    });

    return {
        total: all.length,
        ...byStatus,
        autoApproved,
        autoRejected,
        avgReviewTime: Math.round(avgReviewTime * 10) / 10,
        byType,
        byPriority,
    };
}
