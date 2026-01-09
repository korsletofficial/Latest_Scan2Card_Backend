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
    otp: { 
      type: String, 
      required: true,
      minlength: [4, 'OTP must be at least 4 characters'],
      maxlength: [6, 'OTP must not exceed 6 characters'],
      trim: true
    },
    purpose: { type: String, enum: ["login", "enable_2fa", "disable_2fa", "verification", "forgot_password"], required: true },
    expiresAt: { 
      type: Date, 
      required: true,
      validate: {
        validator: function (v: Date) {
          return v instanceof Date && v > new Date();
        },
        message: 'expiresAt must be in the future'
      }
    },
    isUsed: { type: Boolean, default: false },
    verificationToken: { 
      type: String, 
      required: false,
      maxlength: [1000, 'Verification token must not exceed 1000 characters']
    },
    verificationTokenExpiry: { 
      type: Date, 
      required: false,
      validate: {
        validator: function (v: Date | undefined) {
          if (!v) return true; // Allow null/undefined
          return v instanceof Date && v > new Date();
        },
        message: 'verificationTokenExpiry must be in the future'
      }
    },
  },
  {
    timestamps: true,
  }
);

// Index for auto-deletion of expired OTPs
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OTPModel = model<IOTP>("OTP", OTPSchema);

export default OTPModel;
