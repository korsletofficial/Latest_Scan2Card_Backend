import { Schema, Document, model, Types, PaginateModel } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

// Catalog Category enum
export enum CatalogCategory {
  PRODUCT = "product",
  SERVICE = "service",
  BROCHURE = "brochure",
  PRICING = "pricing",
  OTHER = "other"
}

// Email Template Interface
interface IEmailTemplate {
  subject: string;
  body: string;
}

// Assigned License Key Interface
interface IAssignedLicenseKey {
  eventId: Types.ObjectId;
  licenseKey: string;
}

// Catalog Interface
export interface ICatalog extends Document {
  teamManagerId: Types.ObjectId;
  name: string;
  description?: string;
  category: CatalogCategory;
  docLink: string;
  s3Key: string;
  originalFileName: string;
  fileSize?: number;
  contentType?: string;
  whatsappTemplate: string;
  emailTemplate: IEmailTemplate;
  assignedLicenseKeys: IAssignedLicenseKey[];
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Catalog Schema
const CatalogSchema = new Schema<ICatalog>(
  {
    teamManagerId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    category: {
      type: String,
      enum: Object.values(CatalogCategory),
      required: true,
      default: CatalogCategory.PRODUCT
    },
    docLink: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    s3Key: {
      type: String,
      required: true,
      trim: true
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    fileSize: {
      type: Number
    },
    contentType: {
      type: String,
      trim: true
    },
    whatsappTemplate: {
      type: String,
      required: true,
      maxlength: 1000
      // Example: "Hi {{leadName}}, here's our {{catalogName}} catalog: {{docLink}}"
    },
    emailTemplate: {
      subject: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
      },
      body: {
        type: String,
        required: true,
        maxlength: 5000
      }
    },
    assignedLicenseKeys: [{
      eventId: {
        type: Schema.Types.ObjectId,
        ref: "Events",
        required: true
      },
      licenseKey: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
      }
    }],
    isActive: {
      type: Boolean,
      default: true
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        delete (ret as any).__v;

        // Convert undefined/null to empty string for optional fields
        ret.description = ret.description ?? '';
        ret.assignedLicenseKeys = ret.assignedLicenseKeys ?? [];

        return ret;
      }
    }
  }
);

// Indexes for efficient querying
CatalogSchema.index({ teamManagerId: 1, isDeleted: 1 });
CatalogSchema.index({ category: 1, isDeleted: 1 });
CatalogSchema.index({ "assignedLicenseKeys.eventId": 1, "assignedLicenseKeys.licenseKey": 1 });
CatalogSchema.index({ name: "text", description: "text" }); // Text search index

CatalogSchema.plugin(mongoosePaginate);

const CatalogModel = model<ICatalog, PaginateModel<ICatalog>>("Catalogs", CatalogSchema);

export default CatalogModel;
