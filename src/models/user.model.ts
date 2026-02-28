import mongoose, { Schema, Document, model, Types, PaginateModel } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

// User Interface
export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  countryCode?: string;
  password: string;
  role: mongoose.Types.ObjectId;
  companyName?: string;
  exhibitorId?: mongoose.Types.ObjectId;
  team?: mongoose.Types.ObjectId;
  events?: mongoose.Types.ObjectId[];
  profileImage?: string;
  addedBy?: Types.ObjectId;
  trialLeadsCount?: number;
  hasJoinedTrialEvent?: boolean;
  twoFactorEnabled: boolean;
  isVerified: boolean;
  isActive: boolean;
  isDeleted: boolean;
  fcmTokens?: string[]; // Firebase Cloud Messaging tokens for push notifications
  refreshToken?: string; // Refresh token for session renewal
  refreshTokenExpiry?: Date; // Expiry date for refresh token
  // License key restrictions (for EXHIBITOR role only)
  maxLicenseKeys?: number; // Maximum number of license keys allowed
  maxTotalActivations?: number; // Maximum total activations across all keys
  currentLicenseKeyCount?: number; // Current number of license keys created
  currentTotalActivations?: number; // Current total activations allocated
  // Calendar feed subscription (for TEAMMANAGER role)
  calendarFeedToken?: string; // Unique token for calendar feed access
  calendarFeedEnabled?: boolean; // Whether calendar feed is active
  // Calendar OAuth integration (for TEAMMANAGER role)
  calendarProvider?: "google" | "outlook" | null; // Connected calendar provider
  calendarAccessToken?: string; // Encrypted OAuth access token
  calendarRefreshToken?: string; // Encrypted OAuth refresh token
  calendarTokenExpiry?: Date; // Access token expiry time
  calendarConnectedAt?: Date; // When the calendar was connected
  calendarEmail?: string; // Email of connected calendar account
  country?: string;
  address?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// User Schema
const UserSchema = new Schema<IUser>(
  {
    firstName: { 
      type: String, 
      required: true,
      minlength: 1,
      maxlength: 100,
      trim: true
    },
    lastName: { 
      type: String, 
      required: true,
      minlength: 1,
      maxlength: 100,
      trim: true
    },
    email: {
      type: String,
      // No unique constraint at DB level — uniqueness is enforced per-role in the service layer
      // so the same email can exist as both TEAMMANAGER and ENDUSER (separate accounts).
      sparse: true,
      maxlength: 255,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v: string) {
          if (!v) return true; // Allow null/undefined
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(v);
        },
        message: 'Invalid email format'
      }
    },
    phoneNumber: {
      type: String,
      sparse: true,
      maxlength: 20,
      validate: {
        validator: function (v: string) {
          if (!v) return true; // Allow null/undefined (sparse index)
          const phoneRegex = /^[\d\s\-\+\(\)]+$/;
          return phoneRegex.test(v);
        },
        message: 'Invalid phone format'
      }
    },
    countryCode: {
      type: String,
      maxlength: 5,
      trim: true,
      validate: {
        validator: function (v: string) {
          if (!v) return true; // Allow null/undefined
          return /^\+\d{1,4}$/.test(v);
        },
        message: 'Invalid country code format (e.g., +91, +1, +44)'
      }
    },
    password: { 
      type: String, 
      required: true, 
      select: false,
      minlength: 8,
      maxlength: 255
    },
    role: { type: Schema.Types.ObjectId, ref: "Roles", required: true },
    companyName: { 
      type: String,
      maxlength: 200,
      trim: true
    },
    exhibitorId: { type: Schema.Types.ObjectId, ref: "Users" },
    team: { type: Schema.Types.ObjectId, ref: "Teams" },
    events: [{ type: Schema.Types.ObjectId, ref: "Events" }],
    profileImage: { 
      type: String,
      maxlength: 1000,
      validate: {
        validator: function (v: string) {
          if (!v) return true; // Allow null/undefined
          // Basic URL validation
          try {
            new URL(v);
            return true;
          } catch {
            return false;
          }
        },
        message: 'Invalid URL format for profile image'
      }
    },
    addedBy: { type: Schema.Types.ObjectId, ref: "Users" },
    trialLeadsCount: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 5
    },
    hasJoinedTrialEvent: { type: Boolean, default: false },
    twoFactorEnabled: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    fcmTokens: { 
      type: [String], 
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length <= 10 && v.every((token: string) => token.length <= 500);
        },
        message: 'Maximum 10 FCM tokens allowed, each max 500 characters'
      }
    },
    refreshToken: {
      type: String,
      select: false,
      maxlength: 1000
    },
    refreshTokenExpiry: { type: Date, select: false },
    // License key restrictions (for EXHIBITOR role only)
    maxLicenseKeys: {
      type: Number,
      min: 0,
      default: 20 // Default: 20 license keys allowed
    },
    maxTotalActivations: {
      type: Number,
      min: 0,
      default: 100 // Default: 100 total activations allowed
    },
    currentLicenseKeyCount: {
      type: Number,
      min: 0,
      default: 0
    },
    currentTotalActivations: {
      type: Number,
      min: 0,
      default: 0
    },
    // Calendar feed subscription (for TEAMMANAGER role)
    calendarFeedToken: {
      type: String,
      unique: true,
      sparse: true,
      maxlength: 50,
      index: true
    },
    calendarFeedEnabled: {
      type: Boolean,
      default: false
    },
    // Calendar OAuth integration (for TEAMMANAGER role)
    calendarProvider: {
      type: String,
      enum: ["google", "outlook", null],
      default: null
    },
    calendarAccessToken: {
      type: String,
      select: false, // Don't include in normal queries for security
      maxlength: 5000
    },
    calendarRefreshToken: {
      type: String,
      select: false, // Don't include in normal queries for security
      maxlength: 5000
    },
    calendarTokenExpiry: {
      type: Date
    },
    calendarConnectedAt: {
      type: Date
    },
    calendarEmail: {
      type: String,
      maxlength: 255,
      lowercase: true,
      trim: true
    },
    country: {
      type: String,
      maxlength: 100,
      trim: true
    },
    address: {
      type: String,
      maxlength: 300,
      trim: true
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        delete (ret as any).__v;

        // Convert undefined/null to empty string for optional fields
        ret.phoneNumber = ret.phoneNumber ?? '';
        ret.countryCode = ret.countryCode ?? '';
        ret.companyName = ret.companyName ?? '';
        ret.profileImage = ret.profileImage ?? '';
        ret.events = ret.events ?? [];

        return ret;
      },
    },
  }
);

UserSchema.plugin(mongoosePaginate);

const UserModel = model<IUser, PaginateModel<IUser>>("Users", UserSchema);

export default UserModel;
