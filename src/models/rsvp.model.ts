import mongoose, {
  Schema,
  Document,
  model,
  Types,
  PaginateModel,
} from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

// Define Rsvp Interface
export interface IRsvp extends Document {
  eventId: Types.ObjectId;
  userId: Types.ObjectId;
  addedBy?: Types.ObjectId;
  eventLicenseKey?: string;
  expiresAt?: Date;
  status: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Define Schema
const RsvpSchema = new Schema<IRsvp>(
  {
    eventId: { 
      type: Schema.Types.ObjectId, 
      required: true, 
      ref: "Events" 
    },
    userId: { 
      type: Schema.Types.ObjectId, 
      required: true, 
      ref: "Users" 
    },
    eventLicenseKey: { 
      type: String,
      maxlength: 100,
      trim: true,
      uppercase: true
    },
    expiresAt: { 
      type: Date,
      validate: {
        validator: function (v: Date | undefined) {
          if (!v) return true; // Allow null/undefined
          return v instanceof Date && v >= new Date();
        },
        message: 'expiresAt must be today or in the future'
      }
    },
    addedBy: { 
      type: Schema.Types.ObjectId, 
      ref: "Users" 
    },
    status: { 
      type: Number, 
      required: true, 
      default: 1,
      min: 0,
      max: 10
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        const output = ret as any;
        delete output.__v;

        // Convert undefined/null to empty string for optional fields
        output.eventLicenseKey = output.eventLicenseKey ?? '';
        output.expiresAt = output.expiresAt ?? null;

        return output;
      },
    },
  }
);

// Add indexes for better query performance
RsvpSchema.index({ eventId: 1, userId: 1 });
RsvpSchema.index({ eventLicenseKey: 1 });
RsvpSchema.index({ userId: 1, isDeleted: 1 });
RsvpSchema.index({ eventId: 1, isDeleted: 1 });

// Add Pagination Plugin
RsvpSchema.plugin(mongoosePaginate);

// Define IRsvpModel with Pagination Support
export interface IRsvpModel extends PaginateModel<IRsvp> {}

// Create Model with Pagination Type
const RsvpModel = model<IRsvp, IRsvpModel>("Rsvp", RsvpSchema);

export default RsvpModel;
