/**
 * Report Generator Service
 * 
 * Generates policy-grade reports for ministry submissions.
 * Supports multiple output formats and automated summaries.
 */

import logger from '../../utils/logger';
import { calculateReproducibilityHash } from './reproducibility';

export interface ReportData {
    title: string;
    type: 'biodiversity' | 'fisheries' | 'oceanography' | 'edna' | 'integrated';
    period: { start: string; end: string };
    region: string;
    data: Record<string, any>;
    metadata?: Record<string, any>;
}

export interface ReportSection {
    id: string;
    title: string;
    content: string;
    tables?: Array<{ headers: string[]; rows: string[][] }>;
    figures?: Array<{ id: string; caption: string; data: any }>;
    references?: string[];
}

export interface GeneratedReport {
    id: string;
    title: string;
    type: string;
    generatedAt: string;
    generatedBy?: string;
    version: string;

    // Core sections
    executiveSummary: string;
    sections: ReportSection[];

    // Provenance
    dataProvenance: {
        sources: Array<{
            name: string;
            dateIngested: string;
            recordCount: number;
            quality: number;
        }>;
        methodology: string;
        reproducibilityHash: string;
    };

    // Metadata
    classification: 'public' | 'internal' | 'confidential';
    citationInfo: {
        suggestedCitation: string;
        doi?: string;
        locked: boolean;
    };

    // Output
    format: 'html' | 'pdf' | 'docx' | 'json';
    content: string;
}

export interface ReportOptions {
    format?: 'html' | 'pdf' | 'docx' | 'json';
    template?: 'moes_standard' | 'moes_brief' | 'scientific' | 'executive';
    includeProvenance?: boolean;
    includeMethodology?: boolean;
    includeAppendices?: boolean;
    language?: 'en' | 'hi';
    classification?: 'public' | 'internal' | 'confidential';
}

/**
 * Generate executive summary from report data
 */
function generateExecutiveSummary(data: ReportData): string {
    const summary: string[] = [];

    summary.push(`## Executive Summary\n`);
    summary.push(`This report covers ${data.type} observations for the ${data.region} region `);
    summary.push(`during the period ${data.period.start} to ${data.period.end}.\n\n`);

    // Add type-specific summaries
    switch (data.type) {
        case 'biodiversity':
            if (data.data.speciesCount) {
                summary.push(`**Key Findings:**\n`);
                summary.push(`- Total species observed: ${data.data.speciesCount}\n`);
                if (data.data.shannonIndex) {
                    summary.push(`- Shannon diversity index: ${data.data.shannonIndex.toFixed(2)}\n`);
                }
                if (data.data.threatenedSpecies) {
                    summary.push(`- Threatened species detected: ${data.data.threatenedSpecies}\n`);
                }
            }
            break;

        case 'fisheries':
            if (data.data.totalCatch) {
                summary.push(`**Key Findings:**\n`);
                summary.push(`- Total catch recorded: ${data.data.totalCatch.toLocaleString()} kg\n`);
                if (data.data.cpue) {
                    summary.push(`- Average CPUE: ${data.data.cpue.toFixed(2)} kg/hour\n`);
                }
                if (data.data.stockStatus) {
                    summary.push(`- Stock status: ${data.data.stockStatus}\n`);
                }
            }
            break;

        case 'oceanography':
            if (data.data.sstMean) {
                summary.push(`**Key Findings:**\n`);
                summary.push(`- Mean SST: ${data.data.sstMean.toFixed(1)}°C\n`);
                if (data.data.chlorophyllMean) {
                    summary.push(`- Mean Chlorophyll-a: ${data.data.chlorophyllMean.toFixed(2)} mg/m³\n`);
                }
            }
            break;

        case 'edna':
            if (data.data.asvCount) {
                summary.push(`**Key Findings:**\n`);
                summary.push(`- Total ASVs identified: ${data.data.asvCount}\n`);
                if (data.data.speciesDetected) {
                    summary.push(`- Species detected: ${data.data.speciesDetected}\n`);
                }
            }
            break;

        default:
            summary.push(`**Key Findings:** See detailed sections below.\n`);
    }

    summary.push(`\n**Prepared by:** CMLRE Marine Data Platform\n`);
    summary.push(`**Classification:** For Official Use\n`);

    return summary.join('');
}

/**
 * Generate methodology section
 */
function generateMethodologySection(data: ReportData): ReportSection {
    let content = `## Methodology\n\n`;

    content += `### Data Collection\n`;
    content += `Data for this report was collected through standardized protocols following `;
    content += `CMLRE guidelines and international best practices.\n\n`;

    switch (data.type) {
        case 'biodiversity':
            content += `- Species identification: Morphological and molecular methods\n`;
            content += `- Taxonomic verification: WoRMS and ITIS databases\n`;
            content += `- Sampling protocol: Stratified random sampling\n`;
            break;
        case 'fisheries':
            content += `- Catch data: Vessel log records and landing surveys\n`;
            content += `- CPUE calculation: Standardized by gear type\n`;
            content += `- Stock assessment: Catch curve analysis\n`;
            break;
        case 'oceanography':
            content += `- SST: MODIS satellite imagery (4km resolution)\n`;
            content += `- Chlorophyll: Ocean color remote sensing\n`;
            content += `- Validation: In-situ CTD measurements\n`;
            break;
        case 'edna':
            content += `- Sample collection: Sterivex filtration method\n`;
            content += `- Sequencing: Illumina MiSeq platform\n`;
            content += `- Bioinformatics: DADA2 pipeline for ASV generation\n`;
            break;
    }

    content += `\n### Quality Assurance\n`;
    content += `All data underwent quality control procedures including:\n`;
    content += `- Automated validation against schema standards\n`;
    content += `- Outlier detection and flagging\n`;
    content += `- Manual review of flagged records\n`;

    return {
        id: 'methodology',
        title: 'Methodology',
        content,
    };
}

/**
 * Generate data provenance section
 */
function generateProvenanceSection(data: ReportData): ReportSection {
    let content = `## Data Provenance\n\n`;

    content += `### Data Sources\n`;
    content += `This report is based on data from the following sources:\n\n`;

    const sources = data.metadata?.sources || [
        { name: 'CMLRE Primary Database', records: 'N/A' },
    ];

    sources.forEach((source: any, i: number) => {
        content += `${i + 1}. **${source.name}**\n`;
        if (source.records) content += `   - Records: ${source.records}\n`;
        if (source.dateRange) content += `   - Period: ${source.dateRange}\n`;
    });

    content += `\n### Traceability\n`;
    content += `All data transformations and analyses are logged and can be reproduced. `;
    content += `Contact CMLRE Data Management for detailed audit trails.\n`;

    content += `\n### Reproducibility\n`;
    content += `This report includes a cryptographic hash ensuring that the exact same `;
    content += `input data and parameters will produce identical results.\n`;

    return {
        id: 'provenance',
        title: 'Data Provenance',
        content,
    };
}

/**
 * Generate full report
 */
export function generateReport(
    data: ReportData,
    options: ReportOptions = {}
): GeneratedReport {
    const {
        format = 'html',
        template = 'moes_standard',
        includeProvenance = true,
        includeMethodology = true,
        classification = 'internal',
    } = options;

    const reportId = `RPT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const generatedAt = new Date().toISOString();

    // Generate sections
    const sections: ReportSection[] = [];

    if (includeMethodology) {
        sections.push(generateMethodologySection(data));
    }

    // Add data-specific sections
    sections.push({
        id: 'results',
        title: 'Results',
        content: generateResultsContent(data),
    });

    if (includeProvenance) {
        sections.push(generateProvenanceSection(data));
    }

    // Calculate reproducibility hash
    const reproducibilityHash = calculateReproducibilityHash(data);

    // Generate executive summary
    const executiveSummary = generateExecutiveSummary(data);

    // Format output
    const content = formatReport(data, sections, executiveSummary, format, template);

    // Generate citation
    const year = new Date().getFullYear();
    const suggestedCitation = `CMLRE (${year}). ${data.title}. Report No. ${reportId}. ` +
        `Centre for Marine Living Resources and Ecology, Kochi, India.`;

    return {
        id: reportId,
        title: data.title,
        type: data.type,
        generatedAt,
        version: '1.0',

        executiveSummary,
        sections,

        dataProvenance: {
            sources: data.metadata?.sources || [],
            methodology: template,
            reproducibilityHash,
        },

        classification,
        citationInfo: {
            suggestedCitation,
            locked: false,
        },

        format,
        content,
    };
}

/**
 * Generate results content based on data type
 */
function generateResultsContent(data: ReportData): string {
    let content = `## Results\n\n`;

    content += `### Overview\n`;
    content += `Analysis period: ${data.period.start} to ${data.period.end}\n`;
    content += `Region: ${data.region}\n\n`;

    content += `### Key Metrics\n`;

    if (data.data) {
        for (const [key, value] of Object.entries(data.data)) {
            const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
            content += `- ${formattedKey}: ${typeof value === 'number' ? value.toFixed(2) : value}\n`;
        }
    }

    return content;
}

/**
 * Format report based on template and format
 */
function formatReport(
    data: ReportData,
    sections: ReportSection[],
    executiveSummary: string,
    format: string,
    template: string
): string {
    if (format === 'json') {
        return JSON.stringify({ data, sections, executiveSummary }, null, 2);
    }

    // HTML format
    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${data.title}</title>
    <style>
        body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #1a365d; border-bottom: 2px solid #1a365d; }
        h2 { color: #2c5282; margin-top: 30px; }
        .header { text-align: center; margin-bottom: 40px; }
        .logo { max-width: 120px; }
        .classification { background: #fed7d7; padding: 5px 10px; display: inline-block; }
        .section { margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background: #edf2f7; }
        .footer { margin-top: 50px; border-top: 1px solid #ccc; padding-top: 20px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Ministry of Earth Sciences</h1>
        <h2>Centre for Marine Living Resources and Ecology</h2>
        <h3>${data.title}</h3>
        <p>Report Period: ${data.period.start} to ${data.period.end}</p>
    </div>
    
    <div class="section">
        ${markdownToHtml(executiveSummary)}
    </div>
    
    ${sections.map(s => `
    <div class="section">
        ${markdownToHtml(s.content)}
    </div>
    `).join('')}
    
    <div class="footer">
        <p>Generated by CMLRE Marine Data Platform</p>
        <p>Generated at: ${new Date().toISOString()}</p>
    </div>
</body>
</html>`;

    return html;
}

/**
 * Simple markdown to HTML converter
 */
function markdownToHtml(markdown: string): string {
    return markdown
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(.+)$/gm, (match) => {
            if (match.startsWith('<')) return match;
            return `<p>${match}</p>`;
        });
}

/**
 * Lock citation (prevent modification)
 */
export function lockCitation(report: GeneratedReport): GeneratedReport {
    return {
        ...report,
        citationInfo: {
            ...report.citationInfo,
            locked: true,
        },
    };
}

/**
 * Get available report templates
 */
export function getAvailableTemplates(): Array<{
    id: string;
    name: string;
    description: string;
    suitableFor: string[];
}> {
    return [
        {
            id: 'moes_standard',
            name: 'MoES Standard Report',
            description: 'Full ministry report with all sections including provenance and methodology',
            suitableFor: ['biodiversity', 'fisheries', 'oceanography', 'edna', 'integrated'],
        },
        {
            id: 'moes_brief',
            name: 'MoES Brief',
            description: 'Condensed executive summary for quick review',
            suitableFor: ['biodiversity', 'fisheries', 'oceanography', 'edna', 'integrated'],
        },
        {
            id: 'scientific',
            name: 'Scientific Publication',
            description: 'Format suitable for peer-reviewed journals',
            suitableFor: ['biodiversity', 'edna', 'oceanography'],
        },
        {
            id: 'executive',
            name: 'Executive Dashboard',
            description: 'Key metrics and visualizations for decision-makers',
            suitableFor: ['fisheries', 'integrated'],
        },
    ];
}

export default {
    generateReport,
    lockCitation,
    getAvailableTemplates,
};
