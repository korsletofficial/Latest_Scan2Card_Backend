import { Schema, Document, model, Types, PaginateModel } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

// Verification Interface - For OTP/Email verification
export interface IVerification extends Document {
  sentTo: string; // Email or phone number
  otp: number;
  otpValidTill: number; // Timestamp
  source: "email" | "phoneNumber";
  verificationCodeUsed: number; // How many times OTP was attempted
  addedBy?: Types.ObjectId;
  status: "pending" | "sent" | "failed";
  isVerified: boolean;
  isDeleted: boolean;
}

// Verification Schema
const VerificationSchema = new Schema<IVerification>(
  {
    sentTo: { 
      type: String, 
      required: true,
      maxlength: [255, 'sentTo must not exceed 255 characters'],
      trim: true,
      validate: {
        validator: function (v: string) {
          // Basic email/phone validation
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const phoneRegex = /^\+?[\d\s\-()]+$/;
          return emailRegex.test(v) || phoneRegex.test(v);
        },
        message: 'sentTo must be a valid email or phone number'
      }
    },
    otp: { 
      type: Number, 
      required: true,
      min: [100000, 'OTP must be a valid 6-digit number'],
      max: [999999, 'OTP must be a valid 6-digit number']
    },
    otpValidTill: { 
      type: Number, 
      required: true,
      validate: {
        validator: function (v: number) {
          return v > Date.now();
        },
        message: 'otpValidTill must be in the future'
      }
    },
    source: { type: String, enum: ["email", "phoneNumber"], required: true },
    verificationCodeUsed: { 
      type: Number, 
      default: 0,
      min: [0, 'verificationCodeUsed cannot be negative'],
      max: [10, 'verificationCodeUsed cannot exceed 10']
    },
    addedBy: { type: Schema.Types.ObjectId, ref: "Users" },
    status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
    isVerified: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

VerificationSchema.plugin(mongoosePaginate);

const VerificationModel = model<IVerification, PaginateModel<IVerification>>("Verifications", VerificationSchema);

export default VerificationModel;
