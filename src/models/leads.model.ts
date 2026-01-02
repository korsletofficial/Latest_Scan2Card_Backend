import { Schema, Document, model, Types, PaginateModel } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

// Lead Details Interface
interface ILeadDetails {
  firstName?: string;
  lastName?: string;
  company?: string;
  position?: string;
  emails?: string[];      // Array of email addresses
  phoneNumbers?: string[]; // Array of phone numbers
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
}

// Lead Interface
export interface ILead extends Document {
  userId: Types.ObjectId;
  eventId?: Types.ObjectId;
  isIndependentLead: boolean;
  leadType: "full_scan" | "entry_code" | "manual"; // Type of lead capture
  scannedCardImage?: string; // @deprecated - kept for backward compatibility
  images?: string[]; // Array of S3 URLs for lead images (max 3)
  entryCode?: string; // Entry code from organizational QR cards
  ocrText?: string;
  details?: ILeadDetails;
  rating?: number;
  isActive: boolean;
  isDeleted: boolean;
}

// Lead Schema
const LeadSchema = new Schema<ILead>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Events" },
    isIndependentLead: { type: Boolean, default: false },
    leadType: {
      type: String,
      enum: ["full_scan", "entry_code", "manual"],
      default: "full_scan",
      required: true,
    },
    scannedCardImage: { type: String }, // @deprecated - kept for backward compatibility
    images: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length <= 3;
        },
        message: 'Maximum 3 images allowed per lead'
      }
    },
    entryCode: { type: String }, // Entry code from organizational QR cards
    ocrText: { type: String },
    details: {
      firstName: { type: String },
      lastName: { type: String },
      company: { type: String },
      position: { type: String },
      emails: { type: [String], default: [] },
      phoneNumbers: { type: [String], default: [] },
      website: { type: String },
      address: { type: String },
      city: { type: String },
      country: { type: String },
      notes: { type: String },
    },
    rating: { type: Number, min: 1, max: 5 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        delete (ret as any).__v;

        // Convert undefined/null to empty string for top-level fields
        ret.entryCode = ret.entryCode ?? '';
        ret.ocrText = ret.ocrText ?? '';
        ret.scannedCardImage = ret.scannedCardImage ?? '';
        ret.images = ret.images ?? [];

        // Convert undefined/null to empty arrays/strings for details fields
        if (ret.details) {
          ret.details.firstName = ret.details.firstName ?? '';
          ret.details.lastName = ret.details.lastName ?? '';
          ret.details.company = ret.details.company ?? '';
          ret.details.position = ret.details.position ?? '';
          ret.details.emails = ret.details.emails ?? [];
          ret.details.phoneNumbers = ret.details.phoneNumbers ?? [];
          ret.details.website = ret.details.website ?? '';
          ret.details.address = ret.details.address ?? '';
          ret.details.city = ret.details.city ?? '';
          ret.details.country = ret.details.country ?? '';
          ret.details.notes = ret.details.notes ?? '';
        }

        return ret;
      },
    },
  }
);

LeadSchema.plugin(mongoosePaginate);

const LeadModel = model<ILead, PaginateModel<ILead>>("Leads", LeadSchema);

export default LeadModel;
