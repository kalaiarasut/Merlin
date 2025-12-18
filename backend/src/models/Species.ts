import mongoose, { Schema, Document } from 'mongoose';

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
  },
  { timestamps: true }
);

SpeciesSchema.index({ scientificName: 'text', commonName: 'text' });

export const Species = mongoose.model<ISpecies>('Species', SpeciesSchema);
