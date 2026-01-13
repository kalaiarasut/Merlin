import mongoose, { Schema, Document, Types } from 'mongoose';

export type UserRole = 'admin' | 'institute-admin' | 'expert' | 'researcher' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'pending';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  status: UserStatus;

  // Multi-Institute Governance
  instituteId?: Types.ObjectId;           // Primary institute
  sharedInstituteIds: Types.ObjectId[];   // MOU collaborations
  projectIds: Types.ObjectId[];           // Projects user belongs to
  permissions: string[];                   // Fine-grained permissions

  // Legacy field (deprecated, use instituteId)
  organization?: string;

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
    role: {
      type: String,
      enum: ['admin', 'institute-admin', 'expert', 'researcher', 'viewer'],
      default: 'researcher'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending'],
      default: 'active'
    },

    // Multi-Institute Governance
    instituteId: {
      type: Schema.Types.ObjectId,
      ref: 'Institute',
      index: true
    },
    sharedInstituteIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Institute'
    }],
    projectIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Project'
    }],
    permissions: [String],

    // Legacy (deprecated)
    organization: String,

    avatar: String,
    lastActive: Date,
  },
  { timestamps: true }
);

// Indexes
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ instituteId: 1, role: 1 });
UserSchema.index({ projectIds: 1 });

// Helper: Check if user has access to an institute (own or shared)
UserSchema.methods.hasInstituteAccess = function (instituteId: Types.ObjectId): boolean {
  if (this.role === 'admin') return true;
  if (this.instituteId?.toString() === instituteId.toString()) return true;
  return this.sharedInstituteIds?.some(
    (id: Types.ObjectId) => id.toString() === instituteId.toString()
  ) ?? false;
};

// Helper: Check if user is system or institute admin
UserSchema.methods.isAdmin = function (): boolean {
  return this.role === 'admin' || this.role === 'institute-admin';
};

export const User = mongoose.model<IUser>('User', UserSchema);
