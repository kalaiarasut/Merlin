import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { authenticate, AuthRequest } from '../middleware/auth';
import { IngestionJob } from '../models/IngestionJob';
import { Species } from '../models/Species';
import logger from '../utils/logger';
import notificationService from '../utils/notificationService';
import aiServiceClient from '../utils/aiServiceClient';
import { lookupSpecies } from '../utils/fishbaseClient';

const router = Router();

// Store uploads outside the repo so dev hot-reload isn't triggered
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(os.tmpdir(), 'cmlre-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

router.post('/', authenticate, upload.single('file'), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const job = await IngestionJob.create({
      filename: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      dataType: req.body.dataType,
      status: 'pending',
      progress: 0,
      userId: req.user.id,
    });

    // Process file asynchronously
    processFile(req.file.path, req.body.dataType, job._id.toString(), req.user.id).catch((error) => {
      logger.error('File processing error:', error);
    });

    res.json({ message: 'File uploaded successfully', jobId: job._id });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const jobs = await IngestionJob.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(jobs);
  } catch (error) {
    next(error);
  }
});

// Process uploaded file
async function processFile(filePath: string, dataType: string, jobId: string, userId: string) {
  try {
    logger.info(`🔄 Starting file processing: ${filePath}, type: ${dataType}`);
    await IngestionJob.findByIdAndUpdate(jobId, { status: 'processing', progress: 10 });

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    let data: any[];
    let recordsProcessedCount = 0;

    // Parse file based on type
    if (filePath.endsWith('.json')) {
      data = JSON.parse(fileContent);
      if (!Array.isArray(data)) {
        data = [data];
      }
    } else if (filePath.endsWith('.csv')) {
      // Simple CSV parsing (for production use a proper CSV library)
      const lines = fileContent.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      data = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj: any = {};
        headers.forEach((header, i) => {
          obj[header] = values[i]?.trim();
        });
        return obj;
      });
    } else {
      throw new Error('Unsupported file format');
    }

    logger.info(`📊 Parsed ${data.length} records from file`);
    recordsProcessedCount = data.length;
    await IngestionJob.findByIdAndUpdate(jobId, { progress: 30, recordsTotal: data.length });

    // AI-powered metadata extraction
    logger.info('🤖 Extracting metadata using AI...');
    const metadataResult = await aiServiceClient.extractMetadata(filePath);
    await IngestionJob.findByIdAndUpdate(jobId, { progress: 40 });

    // AI-powered data cleaning and standardization
    logger.info('🧹 Cleaning and standardizing data using AI...');
    const cleaningResult = await aiServiceClient.cleanData(data, {
      remove_duplicates: true,
      standardize: true,
      normalize_formats: true,
    });

    // Use cleaned data if AI processing succeeded
    if (cleaningResult.success && cleaningResult.cleaned_data.length > 0) {
      data = cleaningResult.cleaned_data;
      logger.info(`✨ AI cleaning applied: ${cleaningResult.summary.duplicates_removed} duplicates removed, ${cleaningResult.summary.values_standardized} values standardized`);
    }

    await IngestionJob.findByIdAndUpdate(jobId, { progress: 50 });

    // ====================================
    // DATA STANDARDISATION VALIDATION
    // ====================================
    logger.info('📋 Running data standardisation validation...');

    let validationResults: any = {
      isValid: true,
      standard: 'auto',
      errors: [],
      warnings: [],
      completenessScore: 0,
      validatedRecords: 0,
      invalidRecords: 0
    };

    try {
      const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
      const fetch = (await import('node-fetch')).default;

      // Select validator based on data type
      let validatorEndpoint = '';
      let validationPayload: any = {};

      if (dataType === 'species' || dataType === 'Species') {
        validatorEndpoint = '/validate/darwin-core';
        // Validate first record as sample
        const sampleRecord = data[0];
        validationPayload = {
          occurrence: {
            occurrenceID: sampleRecord.id || `sp_${Date.now()}`,
            scientificName: sampleRecord.scientificName || sampleRecord.scientific_name,
            eventDate: sampleRecord.date || new Date().toISOString().split('T')[0],
            decimalLatitude: sampleRecord.latitude || 0,
            decimalLongitude: sampleRecord.longitude || 0,
            kingdom: sampleRecord.kingdom,
            phylum: sampleRecord.phylum,
            class: sampleRecord.class,
            order: sampleRecord.order,
            family: sampleRecord.family,
            genus: sampleRecord.genus,
            basisOfRecord: 'HumanObservation'
          },
          validation_level: 'standard'
        };
      } else if (dataType === 'oceanography' || dataType === 'Oceanography') {
        validatorEndpoint = '/validate/iso19115';
        const sampleRecord = data[0];
        validationPayload = {
          metadata: {
            title: `Oceanographic Data - ${new Date().toISOString()}`,
            abstract: `Ingested oceanographic data from ${filePath}`,
            language: 'eng',
            character_set: 'UTF-8',
            hierarchy_level: 'dataset',
            date_stamp: new Date().toISOString().split('T')[0],
            west_bound_longitude: Math.min(...data.map(d => parseFloat(d.longitude || d.lon || 0))),
            east_bound_longitude: Math.max(...data.map(d => parseFloat(d.longitude || d.lon || 0))),
            south_bound_latitude: Math.min(...data.map(d => parseFloat(d.latitude || d.lat || 0))),
            north_bound_latitude: Math.max(...data.map(d => parseFloat(d.latitude || d.lat || 0))),
            spatial_representation_type: 'point'
          },
          validation_level: 'standard'
        };
      } else if (dataType === 'edna' || dataType === 'eDNA' || dataType === 'Edna') {
        validatorEndpoint = '/validate/mixs';
        const sampleRecord = data[0];
        validationPayload = {
          metadata: {
            sample_name: sampleRecord.id || sampleRecord.sample_id || 'EDNA_SAMPLE',
            investigation_type: 'metagenome',
            project_name: 'CMLRE eDNA Survey',
            lat_lon: `${sampleRecord.latitude || 0}, ${sampleRecord.longitude || 0}`,
            geo_loc_name: sampleRecord.region || 'Indian Ocean',
            collection_date: sampleRecord.date || sampleRecord.sampleDate || new Date().toISOString().split('T')[0],
            env_broad_scale: 'marine biome',
            env_local_scale: 'ocean water body',
            env_medium: 'sea water',
            depth: sampleRecord.depth || 0,
            temp: sampleRecord.temperature || 25,
            seq_meth: sampleRecord.method || 'Illumina',
            target_gene: sampleRecord.gene || sampleRecord.marker || '16S'
          },
          sample_type: 'water',
          validation_level: 'standard'
        };
      }

      if (validatorEndpoint) {
        const response = await fetch(`${AI_SERVICE_URL}${validatorEndpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validationPayload)
        });

        if (response.ok) {
          const result = await response.json() as any;
          validationResults = {
            isValid: result.is_valid,
            standard: result.standard,
            errors: result.errors || [],
            warnings: result.warnings || [],
            completenessScore: result.completeness_score || 0,
            validatedRecords: data.length,
            invalidRecords: result.is_valid ? 0 : data.length,
            validatedFields: result.validated_fields || {}
          };

          if (result.is_valid) {
            logger.info(`✅ Validation passed: ${result.standard} (${result.completeness_score}% complete)`);
          } else {
            logger.warn(`⚠️ Validation issues: ${result.errors.slice(0, 3).join(', ')}`);
          }
        }
      }
    } catch (validationError: any) {
      logger.warn(`Validation service unavailable: ${validationError.message}`);
      validationResults.warnings.push('Validation service unavailable - data imported without validation');
    }

    await IngestionJob.findByIdAndUpdate(jobId, {
      progress: 55,
      metadata: { validation: validationResults }
    });

    // Insert data based on dataType
    if (dataType === 'species' || dataType === 'Species') {
      logger.info('🐟 Processing species data...');
      let processed = 0;
      let created = 0;
      let updated = 0;
      let failed = 0;

      for (const record of data) {
        try {
          if (!record.scientificName) {
            logger.warn('Skipping record without scientificName:', record);
            failed++;
            continue;
          }

          // Smart validation for conservation status
          const validConservationCodes = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD', 'NE'];
          const locationKeywords = ['ocean', 'sea', 'bengal', 'arabian', 'indian', 'pacific', 'atlantic', 'coastal', 'reef'];

          let rawStatus = record.conservationStatus || record.conservation_status || '';
          let finalConservationStatus = 'DD'; // Default to Data Deficient

          if (rawStatus) {
            const upperStatus = String(rawStatus).toUpperCase().trim();
            // Check if it's a valid IUCN code
            if (validConservationCodes.includes(upperStatus)) {
              finalConservationStatus = upperStatus;
            } else if (locationKeywords.some(kw => String(rawStatus).toLowerCase().includes(kw))) {
              // Looks like a location - this was likely a data mapping error
              // Keep it as DD and log warning
              console.warn(`Conservation status looks like location: "${rawStatus}" - setting to DD`);
            }
          }

          // FishBase API lookup to auto-fill missing data
          let fishbaseHabitat = record.habitat;
          let fishbaseDistribution = record.distribution ? (Array.isArray(record.distribution) ? record.distribution : [record.distribution]) : [];
          let fishbaseCommonName = record.commonName || record.common_name;

          // Only call FishBase if we're missing conservation status or habitat
          if (finalConservationStatus === 'DD' || !record.habitat) {
            try {
              const fishbaseResult = await lookupSpecies(record.scientificName);
              if (fishbaseResult.found) {
                // Use FishBase conservation status if we don't have a valid one
                if (finalConservationStatus === 'DD' && fishbaseResult.conservationStatus) {
                  finalConservationStatus = fishbaseResult.conservationStatus;
                  logger.info(`FishBase provided conservation status for ${record.scientificName}: ${finalConservationStatus}`);
                }
                // Use FishBase habitat if not provided
                if (!record.habitat && fishbaseResult.habitat) {
                  fishbaseHabitat = fishbaseResult.habitat;
                }
                // Use FishBase distribution if not provided
                if (fishbaseDistribution.length === 0 && fishbaseResult.distribution) {
                  fishbaseDistribution = fishbaseResult.distribution;
                }
                // Use FishBase common name if not provided
                if (!fishbaseCommonName && fishbaseResult.commonName) {
                  fishbaseCommonName = fishbaseResult.commonName;
                }
              }
            } catch (fishbaseError: any) {
              logger.warn(`FishBase lookup failed for ${record.scientificName}: ${fishbaseError.message}`);
            }
          }

          const speciesData = {
            scientificName: record.scientificName,
            commonName: fishbaseCommonName,
            taxonomicRank: record.taxonomicRank || record.taxonomic_rank || 'species',
            kingdom: record.kingdom || 'Animalia',
            phylum: record.phylum || 'Chordata',
            class: record.class || 'Actinopterygii',
            order: record.order || 'Unknown',
            family: record.family || 'Unknown',
            genus: record.genus || record.scientificName?.split(' ')[0] || 'Unknown',
            habitat: fishbaseHabitat,
            conservationStatus: finalConservationStatus,
            distribution: fishbaseDistribution,
            jobId: jobId,
            aiMetadata: {
              extractedTags: metadataResult.auto_tags || [],
              confidence: metadataResult.confidence || 0,
              dataQuality: cleaningResult.success ? 'cleaned' : 'raw',
              cleaningApplied: cleaningResult.corrections?.map(c => c.reason) || [],
              dataClassification: metadataResult.data_classification || 'unknown',
              fishbaseEnhanced: finalConservationStatus !== 'DD',
            },
          };

          const result = await Species.updateOne(
            { scientificName: record.scientificName },
            { $set: speciesData },
            { upsert: true }
          );

          processed++;
          if (result.upsertedCount && result.upsertedCount > 0) {
            created += result.upsertedCount;
          } else if (result.modifiedCount && result.modifiedCount > 0) {
            updated += result.modifiedCount;
          }

          if (processed % 10 === 0 || processed === data.length) {
            logger.info(`  ✓ Processed ${processed}/${data.length} records (created: ${created}, updated: ${updated})`);
          }

          await IngestionJob.findByIdAndUpdate(jobId, {
            progress: 30 + Math.floor((processed / data.length) * 60),
            recordsProcessed: processed,
            metadata: { created, updated }
          });
        } catch (err: any) {
          logger.warn(`Failed to insert species record: ${err.message}`);
          failed++;
        }
      }

      logger.info(`✅ Species import complete: processed ${processed}, created ${created}, updated ${updated}, failed ${failed}`);
      recordsProcessedCount = processed;
    } else if (dataType === 'oceanography' || dataType === 'Oceanography') {
      logger.info('🌊 Processing oceanography data...');
      const { getSequelize } = await import('../config/database');
      const sequelize = getSequelize();

      let processed = 0;
      let created = 0;
      let failed = 0;

      for (const record of data) {
        try {
          // Extract fields - handle various field name formats
          const parameter = record.parameter || record.Parameter;
          const value = parseFloat(record.value || record.Value || 0);
          const unit = record.unit || record.Unit || '';
          const latitude = parseFloat(record.latitude || record.Latitude || record.lat || 0);
          const longitude = parseFloat(record.longitude || record.Longitude || record.lon || record.lng || 0);
          const depth = parseFloat(record.depth || record.Depth || 0);
          const timestamp = record.timestamp || record.Timestamp || record.date || record.Date || new Date().toISOString();
          const source = record.source || record.Source || 'Upload';
          const qualityFlag = record.quality_flag || record.quality || record.Quality || 'unknown';
          const metadata = record.metadata || { region: record.region, id: record.id, jobId: jobId };
          if (!metadata.jobId) metadata.jobId = jobId;

          // Add AI metadata to oceanography records
          metadata.aiMetadata = {
            extractedTags: metadataResult.auto_tags || [],
            confidence: metadataResult.confidence || 0,
            dataQuality: cleaningResult.success ? 'cleaned' : 'raw',
            dataClassification: metadataResult.data_classification || 'unknown',
          };

          if (!parameter) {
            logger.warn('Skipping record without parameter:', record);
            failed++;
            continue;
          }

          // Insert into PostgreSQL with PostGIS
          await sequelize.query(`
            INSERT INTO oceanographic_data 
            (parameter, value, unit, location, depth, timestamp, source, quality_flag, metadata)
            VALUES 
            ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8, $9, $10)
          `, {
            bind: [
              parameter,
              value,
              unit,
              longitude,
              latitude,
              depth,
              new Date(timestamp),
              source,
              qualityFlag,
              JSON.stringify(metadata)
            ]
          });

          processed++;
          created++;

          // Stream real-time update via WebSocket
          try {
            const { websocketService } = await import('../utils/websocket');
            websocketService.streamOceanographyData({
              parameter,
              value,
              unit,
              latitude,
              longitude,
              depth,
              timestamp: new Date(timestamp),
              source: 'ingestion'
            });
          } catch (wsError) {
            // WebSocket streaming is non-critical, continue on error
          }

          if (processed % 50 === 0 || processed === data.length) {
            logger.info(`  ✓ Processed ${processed}/${data.length} oceanography records`);
          }

          await IngestionJob.findByIdAndUpdate(jobId, {
            progress: 30 + Math.floor((processed / data.length) * 60),
            recordsProcessed: processed,
            metadata: { created }
          });
        } catch (err: any) {
          logger.warn(`Failed to insert oceanography record: ${err.message}`);
          failed++;
        }
      }

      logger.info(`✅ Oceanography import complete: processed ${processed}, created ${created}, failed ${failed}`);
      recordsProcessedCount = processed;
    } else if (dataType === 'edna' || dataType === 'eDNA' || dataType === 'Edna') {
      logger.info('🧬 Processing eDNA data...');

      // Import the EdnaSample model from edna routes or create it here
      const mongoose = await import('mongoose');
      const ednaSchema = new mongoose.Schema({
        id: { type: String, unique: true },
        sequence: String,
        length: Number,
        detected_species: String,
        confidence: Number,
        method: String,
        latitude: Number,
        longitude: Number,
        sampleDate: Date,
        depth: Number,
        reads: Number,
        region: String,
        metadata: mongoose.Schema.Types.Mixed,
        jobId: { type: String, index: true },
        aiMetadata: {
          extractedTags: [String],
          confidence: Number,
          dataQuality: String,
          cleaningApplied: [String],
          dataClassification: String,
        },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
      });
      const EdnaSample = mongoose.models.EdnaSample || mongoose.model('EdnaSample', ednaSchema);

      let processed = 0;
      let created = 0;
      let updated = 0;
      let failed = 0;

      for (const record of data) {
        try {
          // Generate ID if not provided
          const recordId = record.id || record.ID || record.sample_id || `EDNA_${Date.now()}_${processed}`;

          const ednaData = {
            id: recordId,
            sequence: record.sequence || record.Sequence || '',
            length: parseInt(record.length || record.Length || record.sequence?.length || 0),
            detected_species: record.detected_species || record.species || record.Species || record.taxon || 'Unknown',
            confidence: parseFloat(record.confidence || record.Confidence || record.probability || 0),
            method: record.method || record.Method || record.analysis_method || 'Unknown',
            latitude: parseFloat(record.latitude || record.Latitude || record.lat || 0),
            longitude: parseFloat(record.longitude || record.Longitude || record.lon || record.lng || 0),
            sampleDate: record.sampleDate || record.sample_date || record.date || record.Date || new Date(),
            depth: parseFloat(record.depth || record.Depth || 0),
            reads: parseInt(record.reads || record.Reads || record.read_count || 0),
            region: record.region || record.Region || record.location || 'Unknown',
            metadata: record.metadata || {
              primer: record.primer,
              barcode: record.barcode,
              marker: record.marker,
              gene: record.gene
            },
            jobId: jobId,
            aiMetadata: {
              extractedTags: metadataResult.auto_tags || [],
              confidence: metadataResult.confidence || 0,
              dataQuality: cleaningResult.success ? 'cleaned' : 'raw',
              cleaningApplied: cleaningResult.corrections?.map(c => c.reason) || [],
              dataClassification: metadataResult.data_classification || 'unknown',
            },
            updatedAt: new Date()
          };

          const result = await EdnaSample.updateOne(
            { id: recordId },
            { $set: ednaData },
            { upsert: true }
          );

          processed++;
          if (result.upsertedCount && result.upsertedCount > 0) {
            created++;
          } else if (result.modifiedCount && result.modifiedCount > 0) {
            updated++;
          }

          if (processed % 10 === 0 || processed === data.length) {
            logger.info(`  ✓ Processed ${processed}/${data.length} eDNA records (created: ${created}, updated: ${updated})`);
          }

          await IngestionJob.findByIdAndUpdate(jobId, {
            progress: 30 + Math.floor((processed / data.length) * 60),
            recordsProcessed: processed,
            metadata: { created, updated }
          });
        } catch (err: any) {
          logger.warn(`Failed to insert eDNA record: ${err.message}`);
          failed++;
        }
      }

      logger.info(`✅ eDNA import complete: processed ${processed}, created ${created}, updated ${updated}, failed ${failed}`);
      recordsProcessedCount = processed;
    } else if (dataType === 'fisheries' || dataType === 'Fisheries') {
      // ============================================================
      // FISHERIES DATA INGESTION
      // Routes to dataStorage service for Fisheries Analytics access
      // ============================================================
      logger.info('🐟 Processing fisheries data...');
      const { dataStorage } = await import('../services/fisheries');

      // Detect if this is catch data or length data based on field presence
      const hasCatchFields = data.some(r =>
        r.catch !== undefined || r.Catch !== undefined || r.CATCH !== undefined ||
        r.effort !== undefined || r.Effort !== undefined || r.EFFORT !== undefined
      );
      const hasLengthFields = data.some(r =>
        r.length !== undefined || r.Length !== undefined || r.LENGTH !== undefined
      );

      let datasetType: 'catch' | 'length' | 'mixed' = 'mixed';
      if (hasCatchFields && !hasLengthFields) {
        datasetType = 'catch';
      } else if (hasLengthFields && !hasCatchFields) {
        datasetType = 'length';
      }

      logger.info(`  📋 Detected fisheries data type: ${datasetType}`);
      logger.info(`  📋 Has catch fields: ${hasCatchFields}, Has length fields: ${hasLengthFields}`);

      try {
        // Create dataset using the fisheries dataStorage service
        const dataset = dataStorage.createDataset({
          name: `Ingested Fisheries Data - ${new Date().toISOString().split('T')[0]}`,
          type: datasetType,
          records: data,
          uploadedBy: userId,
        });

        logger.info(`✅ Fisheries import complete: ${data.length} records stored in dataset ${dataset.id}`);
        logger.info(`  📈 Species in dataset: ${dataset.species.join(', ')}`);
        logger.info(`  📅 Date range: ${dataset.dateRange.start} to ${dataset.dateRange.end}`);

        recordsProcessedCount = data.length;

        // Update job metadata with dataset info
        await IngestionJob.findByIdAndUpdate(jobId, {
          metadata: {
            datasetId: dataset.id,
            datasetType,
            species: dataset.species,
            dateRange: dataset.dateRange,
            ...metadataResult.extracted_metadata
          }
        });
      } catch (fishError: any) {
        logger.error(`Fisheries data storage error: ${fishError.message}`);
        throw fishError;
      }
    } else {
      // For other data types, just mark as complete for now
      logger.info(`📦 Processing ${dataType} data (basic handling)...`);
      recordsProcessedCount = data.length;
      logger.info(`✅ ${dataType} import complete: ${data.length} records`);
    }

    await IngestionJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      progress: 100,
      recordsProcessed: recordsProcessedCount
    });

    // Send notification to user
    await notificationService.notifyIngestionComplete(userId, dataType, recordsProcessedCount, jobId);

    logger.info(`✅ Job ${jobId} completed`);

    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      logger.warn('Failed to clean up file:', err);
    }
  } catch (error: any) {
    logger.error(`❌ Processing error for job ${jobId}:`, error);
    await IngestionJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      errorMessages: [error.message]
    }).catch(err => logger.error('Failed to update job status:', err));

    // Send failure notification to user
    await notificationService.notifyIngestionFailed(userId, dataType, error.message, jobId);
  }
}

// Detect data type from file content
interface DataTypeDetection {
  detectedType: string;
  confidence: number;
  indicators: string[];
  sampleFields: string[];
}

function detectDataType(data: any[]): DataTypeDetection {
  if (!data || data.length === 0) {
    return { detectedType: 'unknown', confidence: 0, indicators: ['Empty data'], sampleFields: [] };
  }

  const sample = data[0];
  const fields = Object.keys(sample).map(f => f.toLowerCase());
  const sampleFields = Object.keys(sample).slice(0, 10);

  // Species indicators
  const speciesFields = ['scientificname', 'scientific_name', 'commonname', 'common_name', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species', 'taxonomicrank', 'taxonomic_rank'];
  const speciesMatches = fields.filter(f => speciesFields.some(sf => f.includes(sf)));

  // Oceanography indicators
  const oceanFields = ['temperature', 'salinity', 'depth', 'latitude', 'longitude', 'parameter', 'value', 'unit', 'quality', 'quality_flag', 'dissolved_oxygen', 'chlorophyll', 'ph'];
  const oceanMatches = fields.filter(f => oceanFields.some(of => f.includes(of)));

  // eDNA indicators
  const ednaFields = ['sequence', 'primer', 'barcode', 'read', 'sample_id', 'otu', 'asv', 'marker', 'gene', 'amplicon'];
  const ednaMatches = fields.filter(f => ednaFields.some(ef => f.includes(ef)));

  // Otolith indicators
  const otolithFields = ['otolith', 'age', 'growth', 'ring', 'increment', 'measurement', 'fish_id', 'specimen'];
  const otolithMatches = fields.filter(f => otolithFields.some(of => f.includes(of)));

  // Survey indicators
  const surveyFields = ['station', 'survey', 'transect', 'quadrat', 'plot', 'observer', 'recorded_by', 'sampling'];
  const surveyMatches = fields.filter(f => surveyFields.some(sf => f.includes(sf)));

  // Fisheries indicators (catch data, length data, stock assessment)
  const fisheriesFields = ['catch', 'effort', 'cpue', 'stock', 'fishing', 'vessel', 'gear', 'tow', 'haul', 'landings', 'biomass', 'weight', 'maturity', 'effortunit', 'effort_unit'];
  const fisheriesMatches = fields.filter(f => fisheriesFields.some(ff => f.includes(ff)));

  // Calculate scores
  const scores = [
    { type: 'species', score: speciesMatches.length, matches: speciesMatches },
    { type: 'oceanography', score: oceanMatches.length, matches: oceanMatches },
    { type: 'edna', score: ednaMatches.length, matches: ednaMatches },
    { type: 'otolith', score: otolithMatches.length, matches: otolithMatches },
    { type: 'survey', score: surveyMatches.length, matches: surveyMatches },
    { type: 'fisheries', score: fisheriesMatches.length, matches: fisheriesMatches },
  ].sort((a, b) => b.score - a.score);

  const bestMatch = scores[0];
  const totalFields = fields.length;
  const confidence = totalFields > 0 ? Math.min(100, Math.round((bestMatch.score / Math.min(totalFields, 5)) * 100)) : 0;

  return {
    detectedType: bestMatch.score > 0 ? bestMatch.type : 'unknown',
    confidence,
    indicators: bestMatch.matches,
    sampleFields,
  };
}

// Analyze file and detect data type
router.post('/analyze', authenticate, upload.single('file'), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    let data: any[] = [];

    // Parse file
    if (filePath.endsWith('.json')) {
      data = JSON.parse(fileContent);
      if (!Array.isArray(data)) {
        data = [data];
      }
    } else if (filePath.endsWith('.csv')) {
      const lines = fileContent.split('\n').filter(line => line.trim());
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        data = lines.slice(1, Math.min(11, lines.length)).map(line => {
          const values = line.split(',');
          const obj: any = {};
          headers.forEach((header, i) => {
            obj[header] = values[i]?.trim().replace(/^"|"$/g, '');
          });
          return obj;
        });
      }
    }

    // Clean up temp file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      logger.warn('Failed to clean up analysis file:', err);
    }

    const detection = detectDataType(data);

    res.json({
      filename: req.file.originalname,
      fileSize: req.file.size,
      recordCount: data.length,
      ...detection,
      sampleData: data.slice(0, 3),
    });
  } catch (error) {
    next(error);
  }
});

// Extract metadata from file using AI
router.post('/extract-metadata', authenticate, upload.single('file'), async (req: AuthRequest, res: Response, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    const FormData = (await import('form-data')).default;
    const fetch = (await import('node-fetch')).default;

    // Create form data to send to AI service
    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    formData.append('extract_tags', 'true');

    const response = await fetch(`${AI_SERVICE_URL}/extract-metadata`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    // Clean up temp file
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      logger.warn('Failed to clean up temp file:', err);
    }

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.detail || 'Metadata extraction failed');
    }

    const result = await response.json();

    res.json({
      success: true,
      filename: req.file.originalname,
      fileSize: req.file.size,
      ...(result as any)
    });
  } catch (error: any) {
    logger.error('Metadata extraction error:', error);
    res.status(500).json({ error: error.message || 'Metadata extraction failed' });
  }
});

// Extract metadata from text content
router.post('/extract-metadata-text', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { content, content_type } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'No content provided' });
    }

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    const response = await fetch(`${AI_SERVICE_URL}/extract-metadata-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        content_type: content_type || 'text'
      })
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.detail || 'Metadata extraction failed');
    }

    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    logger.error('Text metadata extraction error:', error);
    res.status(500).json({ error: error.message || 'Metadata extraction failed' });
  }
});

// Delete a job and its associated data
router.delete('/jobs/:id', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const job = await IngestionJob.findOne({ _id: req.params.id, userId: req.user.id });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Delete associated data based on data type
    const dataType = job.dataType?.toLowerCase();
    const recordsDeleted = job.recordsProcessed || 0;

    // Note: In a real application, you'd track which records belong to which job
    // and delete only those records. For now, we just delete the job metadata.

    // Delete associated data
    if (dataType === 'species') {
      const result = await Species.deleteMany({ jobId: req.params.id });
      logger.info(`  ✓ Deleted ${result.deletedCount} associated species records`);
    } else if (dataType === 'oceanography') {
      const { getSequelize } = await import('../config/database');
      const sequelize = getSequelize();
      await sequelize.query(
        "DELETE FROM oceanographic_data WHERE metadata->>'jobId' = :jobId",
        { replacements: { jobId: req.params.id } }
      );
      logger.info(`  ✓ Deleted associated oceanography records`);
    } else if (dataType === 'edna') {
      // Get model reference (might be registered in previous calls)
      const mongoose = await import('mongoose');
      const EdnaSample = mongoose.models.EdnaSample || mongoose.model('EdnaSample', new mongoose.Schema({}, { strict: false }));
      if (EdnaSample.schema.paths.jobId) {
        const result = await EdnaSample.deleteMany({ jobId: req.params.id });
        logger.info(`  ✓ Deleted ${result.deletedCount} associated eDNA records`);
      }
    }

    await IngestionJob.findByIdAndDelete(req.params.id);

    logger.info(`🗑️ Deleted job ${req.params.id} (${dataType}, ${recordsDeleted} records)`);

    res.json({
      message: 'Job and associated data deleted successfully',
      jobId: req.params.id,
      dataType,
      recordsDeleted,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
