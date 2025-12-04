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
    eventId: { type: Schema.Types.ObjectId, required: true, ref: "Events" },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Users" },
    eventLicenseKey: { type: Schema.Types.String },
    expiresAt: { type: Schema.Types.Date },
    addedBy: { type: Schema.Types.ObjectId, ref: "Users" },
    status: { type: Number, required: true, default: 1 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        delete (ret as any).__v;

        // Convert undefined/null to empty string for optional fields
        ret.eventLicenseKey = ret.eventLicenseKey ?? '';
        ret.expiresAt = ret.expiresAt ?? null;

        return ret;
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
