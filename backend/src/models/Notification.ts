import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  userId: string; // PostgreSQL user ID (stored as string)
  title: string;
  description: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'system' | 'ingestion' | 'analysis' | 'ai' | 'user';
  read: boolean;
  link?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: String, // PostgreSQL user ID (not MongoDB ObjectId)
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      maxlength: 500,
    },
    type: {
      type: String,
      enum: ['info', 'success', 'warning', 'error'],
      default: 'info',
    },
    category: {
      type: String,
      enum: ['system', 'ingestion', 'analysis', 'ai', 'user'],
      default: 'system',
    },
    read: {
      type: Boolean,
      default: false,
    },
    link: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });

// Static method to create notification
NotificationSchema.statics.createNotification = async function(
  userId: string,
  title: string,
  description: string,
  options: {
    type?: 'info' | 'success' | 'warning' | 'error';
    category?: 'system' | 'ingestion' | 'analysis' | 'ai' | 'user';
    link?: string;
    metadata?: Record<string, any>;
  } = {}
) {
  return this.create({
    userId,
    title,
    description,
    ...options,
  });
};

export default mongoose.model<INotification>('Notification', NotificationSchema);
