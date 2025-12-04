import mongoose, { Schema, Document, model, Types, PaginateModel } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

// License Key Interface
export interface ILicenseKey {
  _id?: Types.ObjectId;
  key: string;
  stallName?: string;
  email: string;
  teamManagerId?: Types.ObjectId;
  expiresAt: Date;
  isActive: boolean;
  maxActivations: number;
  usedCount: number;
  usedBy: Types.ObjectId[];
  paymentStatus: "pending" | "completed";
  createdAt?: Date;
  updatedAt?: Date;
}

// Event Interface
export interface IEvent extends Document {
  eventName: string;
  description?: string;
  type: "Offline" | "Online" | "Hybrid";
  startDate: Date;
  endDate: Date;
  location?: {
    venue?: string;
    address?: string;
    city?: string;
  };
  licenseKeys: ILicenseKey[];
  exhibitorId?: Types.ObjectId;
  isTrialEvent?: boolean;
  isActive: boolean;
  isDeleted: boolean;
}

// Event Schema
const EventSchema = new Schema<IEvent>(
  {
    eventName: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ["Offline", "Online", "Hybrid"], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    location: {
      venue: { type: String },
      address: { type: String },
      city: { type: String },
    },
    licenseKeys: [
      new Schema(
        {
          key: { type: String, required: true },
          stallName: { type: String },
          email: { type: String, required: true },
          teamManagerId: { type: Schema.Types.ObjectId, ref: "Users" },
          expiresAt: { type: Date, required: true },
          isActive: { type: Boolean, default: true },
          maxActivations: { type: Number, default: 1 },
          usedCount: { type: Number, default: 0 },
          usedBy: [{ type: Schema.Types.ObjectId, ref: "Users" }],
          paymentStatus: { type: String, enum: ["pending", "completed"], default: "pending" },
        },
        { timestamps: true }
      ),
    ],
    exhibitorId: { type: Schema.Types.ObjectId, ref: "Users" },
    isTrialEvent: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        delete (ret as any).__v;

        // Convert undefined/null to empty string for optional fields
        ret.description = ret.description ?? '';

        // Handle nested location object
        if (ret.location) {
          ret.location.venue = ret.location.venue ?? '';
          ret.location.address = ret.location.address ?? '';
          ret.location.city = ret.location.city ?? '';
        }

        // Handle license keys array
        ret.licenseKeys = ret.licenseKeys ?? [];
        if (ret.licenseKeys && Array.isArray(ret.licenseKeys)) {
          ret.licenseKeys = ret.licenseKeys.map((lk: any) => ({
            ...lk,
            stallName: lk.stallName ?? '',
            usedBy: lk.usedBy ?? [],
          }));
        }

        return ret;
      },
    },
  }
);

// Pre-save validation: Regular events must have exhibitorId
EventSchema.pre('save', function(next) {
  if (!this.isTrialEvent && !this.exhibitorId) {
    next(new Error('exhibitorId is required for non-trial events'));
  } else {
    next();
  }
});

EventSchema.plugin(mongoosePaginate);

const EventModel = model<IEvent, PaginateModel<IEvent>>("Events", EventSchema);

export default EventModel;
