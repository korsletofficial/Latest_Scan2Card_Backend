import mongoose, { Schema, Document } from "mongoose";

export interface ICrmToken extends Document {
  userId: mongoose.Types.ObjectId;
  provider: "zoho" | "salesforce";
  accessToken: string;
  refreshToken: string;
  instanceUrl?: string; // Salesforce instance URL
  apiDomain?: string; // Zoho API domain
  accountsUrl?: string; // Zoho accounts server URL (varies by region)
  tokenType: string;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CrmTokenSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    provider: {
      type: String,
      enum: ["zoho", "salesforce"],
      required: true,
    },
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
      required: true,
    },
    instanceUrl: {
      type: String,
      default: "",
    },
    apiDomain: {
      type: String,
      default: "",
    },
    accountsUrl: {
      type: String,
      default: "",
    },
    tokenType: {
      type: String,
      default: "Bearer",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: one token per user per provider
CrmTokenSchema.index({ userId: 1, provider: 1 }, { unique: true });

const CrmToken = mongoose.model<ICrmToken>("CrmToken", CrmTokenSchema);

export default CrmToken;
