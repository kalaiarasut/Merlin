/**
 * Data Provenance Tracker Service
 * 
 * Tracks data lineage and transformation history
 * for audit and compliance requirements.
 */

import logger from '../../utils/logger';

export interface ProvenanceEvent {
    id: string;
    timestamp: string;
    eventType: 'ingest' | 'transform' | 'validate' | 'export' | 'analyze';
    actor: string;
    action: string;
    inputData?: string;
    outputData?: string;
    metadata?: Record<string, any>;
}

export interface DataLineage {
    datasetId: string;
    name: string;
    createdAt: string;
    lastModified: string;
    version: number;
    events: ProvenanceEvent[];
    sources: Array<{
        name: string;
        type: string;
        dateIngested: string;
        recordCount: number;
        qualityScore: number;
    }>;
    transformations: string[];
}

export interface AuditTrail {
    datasetId: string;
    entries: Array<{
        timestamp: string;
        user: string;
        action: string;
        details: string;
        ipAddress?: string;
    }>;
}

// In-memory provenance store (would be database in production)
const provenanceStore: Map<string, DataLineage> = new Map();
const auditStore: Map<string, AuditTrail> = new Map();

/**
 * Initialize provenance tracking for a dataset
 */
export function initializeProvenance(
    datasetId: string,
    name: string,
    sources: DataLineage['sources']
): DataLineage {
    const lineage: DataLineage = {
        datasetId,
        name,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        version: 1,
        events: [{
            id: `EVT-${Date.now()}`,
            timestamp: new Date().toISOString(),
            eventType: 'ingest',
            actor: 'system',
            action: 'Dataset initialized',
        }],
        sources,
        transformations: [],
    };

    provenanceStore.set(datasetId, lineage);

    return lineage;
}

/**
 * Record a provenance event
 */
export function recordEvent(
    datasetId: string,
    eventType: ProvenanceEvent['eventType'],
    actor: string,
    action: string,
    metadata?: Record<string, any>
): ProvenanceEvent {
    const event: ProvenanceEvent = {
        id: `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toISOString(),
        eventType,
        actor,
        action,
        metadata,
    };

    const lineage = provenanceStore.get(datasetId);
    if (lineage) {
        lineage.events.push(event);
        lineage.lastModified = event.timestamp;
        lineage.version++;

        if (eventType === 'transform') {
            lineage.transformations.push(action);
        }
    }

    return event;
}

/**
 * Get provenance for a dataset
 */
export function getProvenance(datasetId: string): DataLineage | null {
    return provenanceStore.get(datasetId) || null;
}

/**
 * Record audit entry
 */
export function recordAuditEntry(
    datasetId: string,
    user: string,
    action: string,
    details: string
): void {
    let trail = auditStore.get(datasetId);

    if (!trail) {
        trail = {
            datasetId,
            entries: [],
        };
        auditStore.set(datasetId, trail);
    }

    trail.entries.push({
        timestamp: new Date().toISOString(),
        user,
        action,
        details,
    });
}

/**
 * Get audit trail
 */
export function getAuditTrail(datasetId: string): AuditTrail | null {
    return auditStore.get(datasetId) || null;
}

/**
 * Generate provenance report
 */
export function generateProvenanceReport(datasetId: string): string {
    const lineage = provenanceStore.get(datasetId);

    if (!lineage) {
        return `No provenance information found for dataset ${datasetId}`;
    }

    let report = `# Data Provenance Report\n\n`;
    report += `## Dataset Information\n`;
    report += `- **ID**: ${lineage.datasetId}\n`;
    report += `- **Name**: ${lineage.name}\n`;
    report += `- **Created**: ${lineage.createdAt}\n`;
    report += `- **Last Modified**: ${lineage.lastModified}\n`;
    report += `- **Version**: ${lineage.version}\n\n`;

    report += `## Data Sources\n`;
    for (const source of lineage.sources) {
        report += `### ${source.name}\n`;
        report += `- Type: ${source.type}\n`;
        report += `- Ingested: ${source.dateIngested}\n`;
        report += `- Records: ${source.recordCount}\n`;
        report += `- Quality Score: ${source.qualityScore}%\n\n`;
    }

    report += `## Transformation History\n`;
    for (const transform of lineage.transformations) {
        report += `- ${transform}\n`;
    }

    report += `\n## Event Log\n`;
    for (const event of lineage.events.slice(-10)) {
        report += `- **${event.timestamp}**: [${event.eventType}] ${event.action} (${event.actor})\n`;
    }

    return report;
}

/**
 * Create data citation
 */
export function createDataCitation(
    datasetId: string,
    authors: string[],
    year: number
): {
    citation: string;
    bibtex: string;
    doi?: string;
} {
    const lineage = provenanceStore.get(datasetId);
    const name = lineage?.name || datasetId;

    const authorStr = authors.length > 3
        ? `${authors[0]} et al.`
        : authors.join(', ');

    const citation = `${authorStr} (${year}). ${name}. ` +
        `Centre for Marine Living Resources and Ecology, Kochi, India. ` +
        `Dataset ID: ${datasetId}. Version ${lineage?.version || 1}.`;

    const bibtex = `@dataset{${datasetId.replace(/[^a-zA-Z0-9]/g, '_')},
    author = {${authors.join(' and ')}},
    title = {${name}},
    year = {${year}},
    publisher = {Centre for Marine Living Resources and Ecology},
    version = {${lineage?.version || 1}},
    note = {Dataset ID: ${datasetId}}
}`;

    return {
        citation,
        bibtex,
    };
}

/**
 * Get all tracked datasets
 */
export function getAllTrackedDatasets(): Array<{
    id: string;
    name: string;
    version: number;
    eventCount: number;
}> {
    return Array.from(provenanceStore.values()).map(l => ({
        id: l.datasetId,
        name: l.name,
        version: l.version,
        eventCount: l.events.length,
    }));
}

export default {
    initializeProvenance,
    recordEvent,
    getProvenance,
    recordAuditEntry,
    getAuditTrail,
    generateProvenanceReport,
    createDataCitation,
    getAllTrackedDatasets,
};
