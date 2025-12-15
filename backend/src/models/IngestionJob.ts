import mongoose, { Schema, Document } from 'mongoose';

export interface IIngestionJob extends Document {
  filename: string;
  fileType: string;
  fileSize: number;
  dataType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  recordsProcessed?: number;
  recordsTotal?: number;
  errorMessages?: string[];
  warnings?: string[];
  metadata?: Record<string, any>;
  userId: string;
  createdAt: Date;
  completedAt?: Date;
}

const IngestionJobSchema = new Schema<IIngestionJob>(
  {
    filename: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    dataType: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    progress: { type: Number, default: 0 },
    recordsProcessed: Number,
    recordsTotal: Number,
    errorMessages: [String],
    warnings: [String],
    metadata: Schema.Types.Mixed,
    userId: { type: String, required: true },
    completedAt: Date,
  },
  { timestamps: true }
);

export const IngestionJob = mongoose.model<IIngestionJob>('IngestionJob', IngestionJobSchema);
