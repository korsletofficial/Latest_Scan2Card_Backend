import { Schema, Document, model, Types, PaginateModel } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

// Feedback Interface - For user feedback
export interface IFeedback extends Document {
  userId: Types.ObjectId;
  message: string;
  rating?: number; // 1-5 stars
  category?: "bug" | "feature_request" | "improvement" | "other";
  status: "pending" | "reviewed" | "resolved";
  isActive: boolean;
  isDeleted: boolean;
}

// Feedback Schema
const FeedbackSchema = new Schema<IFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    message: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5 },
    category: { type: String, enum: ["bug", "feature_request", "improvement", "other"], default: "other" },
    status: { type: String, enum: ["pending", "reviewed", "resolved"], default: "pending" },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        delete (ret as any).__v;

        // Convert undefined/null to empty string for optional fields
        ret.rating = ret.rating ?? 0;
        ret.category = ret.category ?? '';

        return ret;
      },
    },
  }
);

FeedbackSchema.plugin(mongoosePaginate);

const FeedbackModel = model<IFeedback, PaginateModel<IFeedback>>("Feedback", FeedbackSchema);

export default FeedbackModel;
