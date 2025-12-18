import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import logger from './logger';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

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
}

// Export singleton instance
export const aiServiceClient = new AIServiceClient();
export default aiServiceClient;
