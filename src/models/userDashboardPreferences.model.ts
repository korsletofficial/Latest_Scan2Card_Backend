import { Schema, Document, model, Types } from "mongoose";

export interface IUserDashboardPreferences extends Document {
  userId: Types.ObjectId;
  pinnedWidgets: string[];
  analyticsOrder: string[];
  updatedAt: Date;
}

const userDashboardPreferencesSchema = new Schema<IUserDashboardPreferences>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    pinnedWidgets: {
      type: [String],
      default: [],
    },
    analyticsOrder: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: "updatedAt" },
  }
);

const UserDashboardPreferences = model<IUserDashboardPreferences>(
  "UserDashboardPreferences",
  userDashboardPreferencesSchema
);

export default UserDashboardPreferences;
