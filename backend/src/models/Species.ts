import mongoose, { Schema, Document } from 'mongoose';
import { IValidationStatus, ValidationStatusSchema } from './ValidationStatus';

export interface ISpecies extends Document {
  scientificName: string;
  commonName?: string;
  taxonomicRank: string;
  kingdom: string;
  phylum: string;
  class: string;
  order: string;
  family: string;
  genus: string;
  taxonId?: string;
  aphiaId?: string;
  description?: string;
  habitat?: string;
  distribution?: string[];
  images?: string[];
  conservationStatus?: string;
  jobId?: string;

  // CMFRI INMARLH Data (official Indian marine life history data)
  inmarlh?: {
    // Identification
    isscapCode?: number;           // FAO ISSCAP code
    category?: string;             // SP (Small Pelagic), LD (Large Demersal), etc.
    region?: string;               // SW, SE, NW, NE (Indian coastal regions)
    studyLocality?: string;        // Specific study location

    // Growth Parameters (Von Bertalanffy)
    K?: number;                    // Growth coefficient (per year)
    Linf?: number;                 // Asymptotic length (mm)
    Tzero?: number;                // Age at zero length

    // Maturity (length-based)
    LmMin?: number;                // Minimum length at maturity (mm)
    LmMax?: number;                // Maximum length at maturity (mm)
    Lm?: number;                   // Mean length at maturity (mm)
    LmBL?: number;                 // Lm as ratio of Linf

    // Reproduction
    fecundityMin?: number;         // Minimum fecundity
    fecundityMax?: number;         // Maximum fecundity
    fecundity?: number;            // Mean fecundity
    spawningSeason?: string;       // e.g., "Sep,Oct,Feb,Mar"
    numSpawningMonths?: number;    // Number of spawning months

    // Ecology
    MTL?: number;                  // Mean Trophic Level
    Dist?: number;                 // Distribution index
    BLD?: number;                  // Body length/depth ratio
    CPI?: number;                  // Catch Per Index

    // Mortality & Fishery
    M?: number;                    // Natural mortality
    F?: number;                    // Fishing mortality
    Z?: number;                    // Total mortality (M + F)
    yield?: number;                // Yield data

    dataSource?: string;           // "CMFRI INMARLH"
  };

  // Life History Traits (derived/computed from INMARLH)
  lifeHistory?: {
    ageAtMaturity?: number;
    maxLifespan?: number;
    sizeAtMaturity?: number;
    maxSize?: number;
    growthRate?: number;
    spawningMonths?: string[];
    spawningPeak?: string;
    fecundity?: string;
    reproductiveStrategy?: string;
    dataSource?: string;
  };

  // Ecomorphology
  ecomorphology?: {
    bodyShape?: string;
    bodyLength?: number;
    bodyDepth?: number;
    headLength?: number;
    eyeDiameter?: number;
    mouthPosition?: string;
    mouthType?: string;
    finConfiguration?: string;
    caudal?: string;
    swimType?: string;
    depthRange?: string;
  };

  // Abundance records
  abundanceRecords?: Array<{
    date: Date;
    count: number;
    location?: string;
    method?: string;
    source?: string;
  }>;

  aiMetadata?: {
    extractedTags?: string[];
    confidence?: number;
    dataQuality?: string;
    cleaningApplied?: string[];
    dataClassification?: string;
  };

  validationStatus?: IValidationStatus;

  createdAt: Date;
  updatedAt: Date;
}

const SpeciesSchema = new Schema<ISpecies>(
  {
    scientificName: { type: String, required: true, unique: true },
    commonName: String,
    taxonomicRank: { type: String, required: true },
    kingdom: { type: String, required: true },
    phylum: { type: String, required: true },
    class: { type: String, required: true },
    order: { type: String, required: true },
    family: { type: String, required: true },
    genus: { type: String, required: true },
    taxonId: String,
    aphiaId: String,
    description: String,
    habitat: String,
    distribution: [String],
    images: [String],
    conservationStatus: String,
    jobId: { type: String, index: true },

    // CMFRI INMARLH Data (official database)
    inmarlh: {
      isscapCode: Number,
      category: String,
      region: String,
      studyLocality: String,
      K: Number,
      Linf: Number,
      Tzero: Number,
      LmMin: Number,
      LmMax: Number,
      Lm: Number,
      LmBL: Number,
      fecundityMin: Number,
      fecundityMax: Number,
      fecundity: Number,
      spawningSeason: String,
      numSpawningMonths: Number,
      MTL: Number,
      Dist: Number,
      BLD: Number,
      CPI: Number,
      M: Number,
      F: Number,
      Z: Number,
      yield: Number,
      dataSource: { type: String, default: 'CMFRI INMARLH' },
    },

    // Life History Traits (derived/computed)
    lifeHistory: {
      ageAtMaturity: Number,
      maxLifespan: Number,
      sizeAtMaturity: Number,
      maxSize: Number,
      growthRate: Number,
      spawningMonths: [String],
      spawningPeak: String,
      fecundity: String,
      reproductiveStrategy: String,
      dataSource: String,
    },

    // Ecomorphology
    ecomorphology: {
      bodyShape: String,
      bodyLength: Number,
      bodyDepth: Number,
      headLength: Number,
      eyeDiameter: Number,
      mouthPosition: String,
      mouthType: String,
      finConfiguration: String,
      caudal: String,
      swimType: String,
      depthRange: String,
    },

    // Abundance records
    abundanceRecords: [{
      date: Date,
      count: Number,
      location: String,
      method: String,
      source: String,
    }],

    aiMetadata: {
      extractedTags: [String],
      confidence: Number,
      dataQuality: String,
      cleaningApplied: [String],
      dataClassification: String,
    },

    validationStatus: ValidationStatusSchema,
  },
  { timestamps: true }
);

SpeciesSchema.index({ scientificName: 'text', commonName: 'text' });

export const Species = mongoose.model<ISpecies>('Species', SpeciesSchema);
