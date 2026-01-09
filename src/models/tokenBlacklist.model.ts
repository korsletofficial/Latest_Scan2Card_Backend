import { Schema, Document, model, Types } from "mongoose";

// TokenBlacklist Interface - For JWT logout/security
export interface ITokenBlacklist extends Document {
  token: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  blacklistedAt: Date;
  reason: "logout" | "password_change" | "account_deletion" | "admin_action";
  userAgent?: string;
  ipAddress?: string;
}

// TokenBlacklist Schema
const TokenBlacklistSchema = new Schema<ITokenBlacklist>(
  {
    token: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true,
      minlength: [50, 'Token must be at least 50 characters'],
      maxlength: [2000, 'Token must not exceed 2000 characters']
    },
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true, index: true },
    expiresAt: { 
      type: Date, 
      required: true, 
      index: true, 
      expires: 0, // TTL index
      validate: {
        validator: function (v: Date) {
          return v instanceof Date && v > new Date();
        },
        message: 'expiresAt must be in the future'
      }
    },
    blacklistedAt: { 
      type: Date, 
      default: Date.now, 
      index: true,
      validate: {
        validator: function (v: Date) {
          return v instanceof Date && v <= new Date();
        },
        message: 'blacklistedAt must be today or in the past'
      }
    },
    reason: { type: String, enum: ["logout", "password_change", "account_deletion", "admin_action"], default: "logout" },
    userAgent: { 
      type: String,
      maxlength: [500, 'userAgent must not exceed 500 characters']
    },
    ipAddress: { 
      type: String,
      maxlength: [45, 'ipAddress must not exceed 45 characters'],
      validate: {
        validator: function (v: string | undefined) {
          if (!v) return true; // Allow null/undefined
          // IPv4 and IPv6 validation
          const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
          const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
          return ipv4Regex.test(v) || ipv6Regex.test(v);
        },
        message: 'ipAddress must be a valid IPv4 or IPv6 address'
      }
    },
  },
  {
    timestamps: true,
    collection: "tokenBlacklists",
  }
);

const TokenBlacklistModel = model<ITokenBlacklist>("TokenBlacklist", TokenBlacklistSchema);

export default TokenBlacklistModel;
