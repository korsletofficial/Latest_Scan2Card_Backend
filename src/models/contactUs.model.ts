import { Schema, Document, model, Types, PaginateModel } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

// ContactUs Interface - For contact form submissions
export interface IContactUs extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  subject: string;
  message: string;
  status: "pending" | "responded" | "resolved";
  addedBy?: Types.ObjectId;
  isActive: boolean;
  isDeleted: boolean;
}

// ContactUs Schema
const ContactUsSchema = new Schema<IContactUs>(
  {
    firstName: { 
      type: String, 
      required: true,
      minlength: [1, 'First name is required'],
      maxlength: [100, 'First name must not exceed 100 characters'],
      trim: true
    },
    lastName: { 
      type: String, 
      required: true,
      minlength: [1, 'Last name is required'],
      maxlength: [100, 'Last name must not exceed 100 characters'],
      trim: true
    },
    email: { 
      type: String, 
      required: true,
      maxlength: [255, 'Email must not exceed 255 characters'],
      trim: true,
      lowercase: true,
      validate: {
        validator: function (v: string) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(v);
        },
        message: 'Email must be a valid email address'
      }
    },
    phoneNumber: { 
      type: String,
      maxlength: [20, 'Phone number must not exceed 20 characters'],
      trim: true,
      validate: {
        validator: function (v: string | undefined) {
          if (!v) return true; // Allow null/undefined
          const phoneRegex = /^\+?[\d\s\-()]{7,20}$/;
          return phoneRegex.test(v);
        },
        message: 'Phone number must be a valid format'
      }
    },
    subject: { 
      type: String, 
      required: true,
      minlength: [5, 'Subject must be at least 5 characters'],
      maxlength: [200, 'Subject must not exceed 200 characters'],
      trim: true
    },
    message: { 
      type: String, 
      required: true,
      minlength: [10, 'Message must be at least 10 characters'],
      maxlength: [3000, 'Message must not exceed 3000 characters'],
      trim: true
    },
    status: { type: String, enum: ["pending", "responded", "resolved"], default: "pending" },
    addedBy: { type: Schema.Types.ObjectId, ref: "Users" },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

ContactUsSchema.plugin(mongoosePaginate);

const ContactUsModel = model<IContactUs, PaginateModel<IContactUs>>("ContactUs", ContactUsSchema);

export default ContactUsModel;
