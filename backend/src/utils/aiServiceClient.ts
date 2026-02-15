import FormData from 'form-data';
import fs from 'fs';
import logger from './logger';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function getFetch(): Promise<typeof fetch> {
    // Prefer Node 18+ global fetch (works in modern runtimes and Jest)
    if (typeof (globalThis as any).fetch === 'function') {
        return (globalThis as any).fetch as typeof fetch;
    }

    // Fallback for older Node versions (node-fetch is ESM)
    const mod: any = await import('node-fetch');
    return (mod.default || mod) as typeof fetch;
}

export interface MetadataExtractionResult {
    success: boolean;
    filename: string;
    extracted_metadata: {
        species?: string[];
        dates?: string[];
        locations?: Array<{ lat: number; lon: number }>;
        parameters?: string[];
        methods?: string[];
        equipment?: string[];
    };
    auto_tags: string[];
    data_classification: string;
    confidence: number;
}

export interface DataCleaningResult {
    success: boolean;
    cleaned_data: any[];
    report: {
        duplicates_removed: number;
        values_standardized: number;
        missing_imputed: number;
        outliers_detected: number;
    };
    corrections: Array<{
        field: string;
        original: any;
        corrected: any;
        reason: string;
    }>;
    warnings: string[];
    summary: {
        original_records: number;
        cleaned_records: number;
        duplicates_removed: number;
        values_standardized: number;
        missing_values_imputed: number;
        outliers_detected: number;
    };
}

export interface NetcdfToPointsResult {
    success: boolean;
    filename: string;
    header?: any;
    points?: any[];
    warnings?: string[];
    stats?: any;
}

export interface PdfToTableResult {
    success: boolean;
    filename: string;
    rows?: any[];
    warnings?: string[];
    stats?: any;
}

/**
 * AI Service Client for CMLRE Platform
 * 
 * Provides methods to interact with the AI microservice for:
 * - Metadata extraction
 * - Data cleaning and standardization
 */
class AIServiceClient {
    private baseUrl: string;

    constructor(baseUrl: string = AI_SERVICE_URL) {
        this.baseUrl = baseUrl;
    }

    /**
     * Extract metadata from a file using AI
     */
    async extractMetadata(filePath: string): Promise<MetadataExtractionResult> {
        try {
            const fetch = await getFetch();
            const form = new FormData();
            form.append('file', fs.createReadStream(filePath));
            form.append('extract_tags', 'true');

            const response = await fetch(`${this.baseUrl}/extract-metadata`, {
                method: 'POST',
                body: form,
                headers: form.getHeaders(),
            });

            if (!response.ok) {
                throw new Error(`AI service returned ${response.status}: ${await response.text()}`);
            }

            const result = await response.json() as MetadataExtractionResult;
            logger.info(`✨ AI metadata extraction completed: ${result.auto_tags.length} tags, confidence ${result.confidence}`);

            return result;
        } catch (error: any) {
            logger.error('AI metadata extraction failed:', error);
            // Return empty result on failure
            return {
                success: false,
                filename: filePath,
                extracted_metadata: {},
                auto_tags: [],
                data_classification: 'unknown',
                confidence: 0,
            };
        }
    }

    /**
     * Extract metadata from text content
     */
    async extractMetadataFromText(content: string, contentType: string = 'text'): Promise<MetadataExtractionResult> {
        try {
            const fetch = await getFetch();
            const response = await fetch(`${this.baseUrl}/extract-metadata-text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, content_type: contentType }),
            });

            if (!response.ok) {
                throw new Error(`AI service returned ${response.status}`);
            }

            return await response.json() as MetadataExtractionResult;
        } catch (error: any) {
            logger.error('AI text metadata extraction failed:', error);
            return {
                success: false,
                filename: 'text_content',
                extracted_metadata: {},
                auto_tags: [],
                data_classification: 'unknown',
                confidence: 0,
            };
        }
    }

    /**
     * Clean and standardize data using AI
     */
    async cleanData(data: any[], options?: {
        remove_duplicates?: boolean;
        standardize?: boolean;
        impute_missing?: boolean;
        detect_outliers?: boolean;
        normalize_formats?: boolean;
        fuzzy_threshold?: number;
        imputation_strategy?: 'mean' | 'median' | 'mode' | 'interpolate';
    }): Promise<DataCleaningResult> {
        try {
            const fetch = await getFetch();
            const response = await fetch(`${this.baseUrl}/clean-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data, options }),
            });

            if (!response.ok) {
                throw new Error(`AI service returned ${response.status}`);
            }

            const result = await response.json() as DataCleaningResult;
            logger.info(`🧹 AI data cleaning completed: ${result.summary.duplicates_removed} duplicates removed, ${result.summary.values_standardized} values standardized`);

            return result;
        } catch (error: any) {
            logger.error('AI data cleaning failed:', error);
            // Return original data on failure
            return {
                success: false,
                cleaned_data: data,
                report: {
                    duplicates_removed: 0,
                    values_standardized: 0,
                    missing_imputed: 0,
                    outliers_detected: 0,
                },
                corrections: [],
                warnings: [`AI cleaning failed: ${error.message}`],
                summary: {
                    original_records: data.length,
                    cleaned_records: data.length,
                    duplicates_removed: 0,
                    values_standardized: 0,
                    missing_values_imputed: 0,
                    outliers_detected: 0,
                },
            };
        }
    }

    /**
     * Check if AI service is available
     */
    async healthCheck(): Promise<boolean> {
        try {
            const fetch = await getFetch();
            const response = await fetch(`${this.baseUrl}/`, {
                method: 'GET',
                timeout: 5000,
            } as any);
            return response.ok;
        } catch (error) {
            logger.warn('AI service health check failed - service may be unavailable');
            return false;
        }
    }

    /**
     * Parse a NetCDF file into oceanography-style point records.
     * Uses Python netCDF4 on the AI service, which supports many NetCDF4/HDF5 files.
     */
    async parseNetcdfToPoints(filePath: string, options?: {
        maxPoints?: number;
        variables?: string[];
        defaultSource?: string;
    }): Promise<NetcdfToPointsResult> {
        try {
            const fetch = await getFetch();
            const form = new FormData();
            form.append('file', fs.createReadStream(filePath));
            if (options?.maxPoints !== undefined) form.append('max_points', String(options.maxPoints));
            if (options?.variables?.length) form.append('variables', options.variables.join(','));
            if (options?.defaultSource) form.append('default_source', options.defaultSource);

            const response = await fetch(`${this.baseUrl}/parse/netcdf-to-points`, {
                method: 'POST',
                body: form,
                headers: form.getHeaders(),
            });

            if (!response.ok) {
                throw new Error(`AI service returned ${response.status}: ${await response.text()}`);
            }

            return await response.json() as NetcdfToPointsResult;
        } catch (error: any) {
            logger.error('AI NetCDF parsing failed:', error);
            return { success: false, filename: filePath, points: [], warnings: [`NetCDF parsing failed: ${error.message}`] };
        }
    }

    /**
     * Attempt to extract tables from a PDF into rows (list of dicts).
     */
    async extractPdfTables(filePath: string, options?: {
        maxRows?: number;
    }): Promise<PdfToTableResult> {
        try {
            const fetch = await getFetch();
            const form = new FormData();
            form.append('file', fs.createReadStream(filePath));
            if (options?.maxRows !== undefined) form.append('max_rows', String(options.maxRows));

            const response = await fetch(`${this.baseUrl}/parse/pdf-to-table`, {
                method: 'POST',
                body: form,
                headers: form.getHeaders(),
            });

            if (!response.ok) {
                throw new Error(`AI service returned ${response.status}: ${await response.text()}`);
            }

            return await response.json() as PdfToTableResult;
        } catch (error: any) {
            logger.error('AI PDF table extraction failed:', error);
            return { success: false, filename: filePath, rows: [], warnings: [`PDF table extraction failed: ${error.message}`] };
        }
    }
}

// Export singleton instance
export const aiServiceClient = new AIServiceClient();
export default aiServiceClient;
