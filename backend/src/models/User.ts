import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'expert' | 'researcher' | 'viewer';
  status: 'active' | 'inactive' | 'pending';
  organization: string;
  avatar?: string;
  lastActive?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['admin', 'expert', 'researcher', 'viewer'], default: 'researcher' },
    status: { type: String, enum: ['active', 'inactive', 'pending'], default: 'active' },
    organization: { type: String, required: true },
    avatar: String,
    lastActive: Date,
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
