import { Schema, Document, model, Types } from "mongoose";

export interface IOTP extends Document {
  userId: Types.ObjectId;
  otp: string;
  purpose: "login" | "enable_2fa" | "disable_2fa" | "verification" | "forgot_password";
  expiresAt: Date;
  isUsed: boolean;
  verificationToken?: string; // JWT token for password reset verification
  verificationTokenExpiry?: Date; // Token expiration time
}

const OTPSchema = new Schema<IOTP>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    otp: { type: String, required: true },
    purpose: { type: String, enum: ["login", "enable_2fa", "disable_2fa", "verification", "forgot_password"], required: true },
    expiresAt: { type: Date, required: true },
    isUsed: { type: Boolean, default: false },
    verificationToken: { type: String, required: false }, // Optional JWT for password reset
    verificationTokenExpiry: { type: Date, required: false }, // Optional token expiry
  },
  {
    timestamps: true,
  }
);

// Index for auto-deletion of expired OTPs
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OTPModel = model<IOTP>("OTP", OTPSchema);

export default OTPModel;
