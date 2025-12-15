import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for sequence file uploads
const sequenceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../storage/sequences');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const sequenceUpload = multer({
  storage: sequenceStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.fasta', '.fa', '.fastq', '.fq', '.fas'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only FASTA and FASTQ files are allowed.'));
    }
  }
});

// eDNA Schema
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
  taxonomy: {
    kingdom: String,
    phylum: String,
    class: String,
    order: String,
    family: String,
    genus: String,
    species: String
  },
  qualityScore: Number,
  gcContent: Number,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const EdnaSample = mongoose.models.EdnaSample || mongoose.model('EdnaSample', ednaSchema);

// Get all eDNA samples with filtering
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { 
      species, 
      method, 
      region,
      minConfidence,
      startDate,
      endDate,
      page = 1, 
      limit = 50 
    } = req.query;

    const filter: any = {};
    
    if (species) {
      filter.detected_species = { $regex: species, $options: 'i' };
    }
    if (method) {
      filter.method = method;
    }
    if (region) {
      filter.region = region;
    }
    if (minConfidence) {
      filter.confidence = { $gte: parseFloat(minConfidence as string) };
    }
    if (startDate || endDate) {
      filter.sampleDate = {};
      if (startDate) filter.sampleDate.$gte = new Date(startDate as string);
      if (endDate) filter.sampleDate.$lte = new Date(endDate as string);
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const [samples, total] = await Promise.all([
      EdnaSample.find(filter)
        .sort({ sampleDate: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      EdnaSample.countDocuments(filter)
    ]);

    res.json({
      data: samples,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    logger.error('Error fetching eDNA samples:', error);
    res.status(500).json({ error: 'Failed to fetch eDNA samples' });
  }
});

// Get eDNA sample by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sample = await EdnaSample.findOne({ id: req.params.id });
    if (!sample) {
      return res.status(404).json({ error: 'eDNA sample not found' });
    }
    res.json(sample);
  } catch (error) {
    logger.error('Error fetching eDNA sample:', error);
    res.status(500).json({ error: 'Failed to fetch eDNA sample' });
  }
});

// Get eDNA statistics
router.get('/stats/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const [totalSamples, speciesCount, methodStats, regionStats, recentSamples] = await Promise.all([
      EdnaSample.countDocuments(),
      EdnaSample.distinct('detected_species'),
      EdnaSample.aggregate([
        { $group: { _id: '$method', count: { $sum: 1 }, avgConfidence: { $avg: '$confidence' } } }
      ]),
      EdnaSample.aggregate([
        { $group: { _id: '$region', count: { $sum: 1 } } }
      ]),
      EdnaSample.find().sort({ sampleDate: -1 }).limit(5).select('id detected_species sampleDate confidence')
    ]);

    res.json({
      totalSamples,
      uniqueSpecies: speciesCount.length,
      methodStats,
      regionStats,
      recentSamples
    });
  } catch (error) {
    logger.error('Error fetching eDNA stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get detections by species
router.get('/detections/by-species', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const detections = await EdnaSample.aggregate([
      { 
        $group: { 
          _id: '$detected_species', 
          count: { $sum: 1 },
          avgConfidence: { $avg: '$confidence' },
          totalReads: { $sum: '$reads' },
          regions: { $addToSet: '$region' }
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);
    res.json(detections);
  } catch (error) {
    logger.error('Error fetching detections by species:', error);
    res.status(500).json({ error: 'Failed to fetch detections' });
  }
});

// Get available methods
router.get('/meta/methods', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const methods = await EdnaSample.distinct('method');
    res.json(methods);
  } catch (error) {
    logger.error('Error fetching methods:', error);
    res.json(['BLAST', 'Kraken2']);
  }
});

// Get available regions
router.get('/meta/regions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const regions = await EdnaSample.distinct('region');
    res.json(regions);
  } catch (error) {
    logger.error('Error fetching regions:', error);
    res.json([]);
  }
});

// Create new eDNA sample
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sample = new EdnaSample({
      ...req.body,
      id: req.body.id || `EDNA_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await sample.save();
    logger.info(`eDNA sample created: ${sample.id}`);
    res.status(201).json(sample);
  } catch (error) {
    logger.error('Error creating eDNA sample:', error);
    res.status(500).json({ error: 'Failed to create eDNA sample' });
  }
});

// Bulk import eDNA samples
router.post('/bulk', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { samples } = req.body;
    if (!Array.isArray(samples)) {
      return res.status(400).json({ error: 'samples must be an array' });
    }

    const operations = samples.map(sample => ({
      updateOne: {
        filter: { id: sample.id },
        update: { $set: { ...sample, updatedAt: new Date() } },
        upsert: true
      }
    }));

    const result = await EdnaSample.bulkWrite(operations);
    logger.info(`Bulk import: ${result.upsertedCount} created, ${result.modifiedCount} updated`);
    
    res.json({
      created: result.upsertedCount,
      updated: result.modifiedCount,
      total: samples.length
    });
  } catch (error) {
    logger.error('Error bulk importing eDNA samples:', error);
    res.status(500).json({ error: 'Failed to import samples' });
  }
});

// ================================
// ENHANCED ENDPOINTS
// ================================

// Upload sequence file
router.post('/upload/sequence', authenticate, sequenceUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const filename = req.file.originalname;
    const isFastq = /\.(fastq|fq)$/i.test(filename);
    
    // Parse sequences
    const sequences: any[] = [];
    if (isFastq) {
      const lines = fileContent.split('\n');
      for (let i = 0; i < lines.length - 3; i += 4) {
        const header = lines[i]?.substring(1).trim();
        const sequence = lines[i + 1]?.trim();
        const quality = lines[i + 3]?.trim();
        if (header && sequence) {
          const gcCount = (sequence.match(/[GC]/gi) || []).length;
          const qualityScores = quality ? quality.split('').map(c => c.charCodeAt(0) - 33) : [];
          const avgQuality = qualityScores.length > 0 
            ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length 
            : null;
          
          sequences.push({
            header,
            sequence,
            quality,
            length: sequence.length,
            gcContent: (gcCount / sequence.length) * 100,
            avgQuality
          });
        }
      }
    } else {
      // FASTA format
      const entries = fileContent.split('>').filter(Boolean);
      entries.forEach(entry => {
        const lines = entry.split('\n');
        const header = lines[0]?.trim();
        const sequence = lines.slice(1).join('').replace(/\s/g, '');
        if (header && sequence) {
          const gcCount = (sequence.match(/[GC]/gi) || []).length;
          sequences.push({
            header,
            sequence,
            length: sequence.length,
            gcContent: (gcCount / sequence.length) * 100
          });
        }
      });
    }

    logger.info(`Uploaded sequence file: ${filename} with ${sequences.length} sequences`);
    
    res.json({
      filename: req.file.originalname,
      filepath: filePath,
      format: isFastq ? 'FASTQ' : 'FASTA',
      sequenceCount: sequences.length,
      sequences: sequences.slice(0, 100), // Return first 100 for preview
      totalSize: req.file.size
    });
  } catch (error) {
    logger.error('Error uploading sequence file:', error);
    res.status(500).json({ error: 'Failed to process sequence file' });
  }
});

// Get biodiversity metrics
router.get('/analysis/biodiversity', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { region, startDate, endDate } = req.query;
    
    const filter: any = {};
    if (region) filter.region = region;
    if (startDate || endDate) {
      filter.sampleDate = {};
      if (startDate) filter.sampleDate.$gte = new Date(startDate as string);
      if (endDate) filter.sampleDate.$lte = new Date(endDate as string);
    }

    // Get species counts
    const speciesCounts = await EdnaSample.aggregate([
      { $match: filter },
      { $group: { _id: '$detected_species', count: { $sum: 1 } } }
    ]);

    if (speciesCounts.length === 0) {
      return res.json({
        shannonIndex: 0,
        simpsonIndex: 0,
        chao1: 0,
        observedSpecies: 0,
        evenness: 0,
        dominance: 0,
        speciesAbundance: []
      });
    }

    const counts = speciesCounts.map(s => s.count);
    const total = counts.reduce((a, b) => a + b, 0);
    const S = counts.length;

    // Shannon Index: H' = -Σ(pi * ln(pi))
    const shannonIndex = counts.reduce((sum, count) => {
      const p = count / total;
      return sum - (p > 0 ? p * Math.log(p) : 0);
    }, 0);

    // Simpson Index: D = 1 - Σ(pi^2)
    const simpsonIndex = 1 - counts.reduce((sum, count) => {
      const p = count / total;
      return sum + p * p;
    }, 0);

    // Pielou's Evenness: J = H' / ln(S)
    const evenness = S > 1 ? shannonIndex / Math.log(S) : 0;

    // Dominance: λ = Σ(pi^2)
    const dominance = counts.reduce((sum, count) => {
      const p = count / total;
      return sum + p * p;
    }, 0);

    // Chao1 estimator
    const singletons = counts.filter(c => c === 1).length;
    const doubletons = counts.filter(c => c === 2).length;
    const chao1 = doubletons > 0
      ? S + (singletons * singletons) / (2 * doubletons)
      : S + (singletons * (singletons - 1)) / 2;

    res.json({
      shannonIndex,
      simpsonIndex,
      chao1,
      observedSpecies: S,
      evenness,
      dominance,
      totalIndividuals: total,
      speciesAbundance: speciesCounts.sort((a, b) => b.count - a.count).slice(0, 20)
    });
  } catch (error) {
    logger.error('Error calculating biodiversity metrics:', error);
    res.status(500).json({ error: 'Failed to calculate biodiversity metrics' });
  }
});

// Get taxonomy hierarchy
router.get('/analysis/taxonomy', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { level = 'species' } = req.query;
    
    // Aggregate by taxonomy levels
    const taxonomyAgg = await EdnaSample.aggregate([
      {
        $group: {
          _id: {
            kingdom: '$taxonomy.kingdom',
            phylum: '$taxonomy.phylum',
            class: '$taxonomy.class',
            order: '$taxonomy.order',
            family: '$taxonomy.family',
            genus: '$taxonomy.genus',
            species: '$detected_species'
          },
          count: { $sum: 1 },
          avgConfidence: { $avg: '$confidence' },
          totalReads: { $sum: '$reads' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Build hierarchy tree
    const buildTree = (data: any[]) => {
      const root: any = { name: 'All Taxa', rank: 'Root', count: 0, children: [] };
      const map: Record<string, any> = { Root: root };

      data.forEach(item => {
        const tax = item._id;
        const ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
        let parent = root;
        
        ranks.forEach((rank, idx) => {
          const value = tax[rank] || `Unknown ${rank}`;
          const key = ranks.slice(0, idx + 1).map(r => tax[r] || `Unknown ${r}`).join('>');
          
          if (!map[key]) {
            map[key] = {
              name: value,
              rank: rank.charAt(0).toUpperCase() + rank.slice(1),
              count: 0,
              confidence: 0,
              children: []
            };
            parent.children.push(map[key]);
          }
          
          map[key].count += item.count;
          parent = map[key];
        });
        
        root.count += item.count;
      });

      return root;
    };

    const tree = buildTree(taxonomyAgg);

    res.json({
      tree,
      totalTaxa: taxonomyAgg.length,
      summary: {
        kingdoms: new Set(taxonomyAgg.map(t => t._id.kingdom).filter(Boolean)).size,
        phyla: new Set(taxonomyAgg.map(t => t._id.phylum).filter(Boolean)).size,
        classes: new Set(taxonomyAgg.map(t => t._id.class).filter(Boolean)).size,
        orders: new Set(taxonomyAgg.map(t => t._id.order).filter(Boolean)).size,
        families: new Set(taxonomyAgg.map(t => t._id.family).filter(Boolean)).size,
        genera: new Set(taxonomyAgg.map(t => t._id.genus).filter(Boolean)).size,
        species: taxonomyAgg.length
      }
    });
  } catch (error) {
    logger.error('Error fetching taxonomy:', error);
    res.status(500).json({ error: 'Failed to fetch taxonomy data' });
  }
});

// Get quality metrics summary
router.get('/analysis/quality', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const qualityStats = await EdnaSample.aggregate([
      {
        $group: {
          _id: null,
          avgQuality: { $avg: '$qualityScore' },
          avgGC: { $avg: '$gcContent' },
          avgLength: { $avg: '$length' },
          avgConfidence: { $avg: '$confidence' },
          totalReads: { $sum: '$reads' },
          count: { $sum: 1 }
        }
      }
    ]);

    const lengthDistribution = await EdnaSample.aggregate([
      {
        $bucket: {
          groupBy: '$length',
          boundaries: [0, 100, 200, 300, 500, 1000, 5000],
          default: 'Other',
          output: { count: { $sum: 1 } }
        }
      }
    ]);

    const confidenceDistribution = await EdnaSample.aggregate([
      {
        $bucket: {
          groupBy: '$confidence',
          boundaries: [0, 0.5, 0.7, 0.9, 1.0],
          default: 'Other',
          output: { count: { $sum: 1 } }
        }
      }
    ]);

    const methodQuality = await EdnaSample.aggregate([
      {
        $group: {
          _id: '$method',
          avgConfidence: { $avg: '$confidence' },
          avgQuality: { $avg: '$qualityScore' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      summary: qualityStats[0] || {},
      lengthDistribution,
      confidenceDistribution,
      methodQuality
    });
  } catch (error) {
    logger.error('Error fetching quality metrics:', error);
    res.status(500).json({ error: 'Failed to fetch quality metrics' });
  }
});

// Export samples to CSV
router.get('/export/csv', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { species, method, region, startDate, endDate } = req.query;
    
    const filter: any = {};
    if (species) filter.detected_species = { $regex: species, $options: 'i' };
    if (method) filter.method = method;
    if (region) filter.region = region;
    if (startDate || endDate) {
      filter.sampleDate = {};
      if (startDate) filter.sampleDate.$gte = new Date(startDate as string);
      if (endDate) filter.sampleDate.$lte = new Date(endDate as string);
    }

    const samples = await EdnaSample.find(filter).lean();

    const headers = [
      'id', 'detected_species', 'confidence', 'method', 'reads', 
      'region', 'latitude', 'longitude', 'depth', 'sampleDate', 
      'length', 'gcContent', 'qualityScore'
    ];

    const csvRows = [
      headers.join(','),
      ...samples.map(s => headers.map(h => {
        const val = (s as any)[h];
        if (val === null || val === undefined) return '';
        if (h === 'sampleDate' && val) return new Date(val).toISOString();
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val;
      }).join(','))
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=edna_samples_${Date.now()}.csv`);
    res.send(csvRows.join('\n'));
  } catch (error) {
    logger.error('Error exporting to CSV:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Export sequences to FASTA
router.get('/export/fasta', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { species, method, region } = req.query;
    
    const filter: any = { sequence: { $exists: true, $ne: '' } };
    if (species) filter.detected_species = { $regex: species, $options: 'i' };
    if (method) filter.method = method;
    if (region) filter.region = region;

    const samples = await EdnaSample.find(filter).select('id detected_species sequence').lean();

    const fastaContent = samples
      .filter(s => s.sequence)
      .map(s => `>${s.id}|${s.detected_species}\n${s.sequence}`)
      .join('\n');

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename=edna_sequences_${Date.now()}.fasta`);
    res.send(fastaContent);
  } catch (error) {
    logger.error('Error exporting to FASTA:', error);
    res.status(500).json({ error: 'Failed to export sequences' });
  }
});

// Geographic distribution endpoint
router.get('/analysis/distribution', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const distribution = await EdnaSample.aggregate([
      {
        $match: {
          latitude: { $exists: true, $ne: null },
          longitude: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            lat: { $round: ['$latitude', 2] },
            lng: { $round: ['$longitude', 2] }
          },
          count: { $sum: 1 },
          species: { $addToSet: '$detected_species' },
          avgConfidence: { $avg: '$confidence' }
        }
      },
      {
        $project: {
          latitude: '$_id.lat',
          longitude: '$_id.lng',
          count: 1,
          speciesCount: { $size: '$species' },
          avgConfidence: 1
        }
      }
    ]);

    const regionSummary = await EdnaSample.aggregate([
      {
        $group: {
          _id: '$region',
          count: { $sum: 1 },
          species: { $addToSet: '$detected_species' },
          avgConfidence: { $avg: '$confidence' }
        }
      },
      {
        $project: {
          region: '$_id',
          count: 1,
          speciesCount: { $size: '$species' },
          avgConfidence: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      points: distribution,
      regions: regionSummary
    });
  } catch (error) {
    logger.error('Error fetching distribution:', error);
    res.status(500).json({ error: 'Failed to fetch distribution data' });
  }
});

export default router;
