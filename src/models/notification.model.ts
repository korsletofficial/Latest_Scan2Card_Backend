import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: "meeting_reminder" | "license_expiry" | "lead_update" | "team_update" | "event_update" | "system";
  title: string;
  message: string;
  data?: Record<string, any>; // Additional data for the notification
  priority: "low" | "medium" | "high";
  isRead: boolean;
  readAt?: Date;
  actionUrl?: string; // Deep link or URL for notification action
  expiresAt?: Date; // Optional: auto-delete old notifications
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["meeting_reminder", "license_expiry", "lead_update", "team_update", "event_update", "system"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    actionUrl: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
NotificationSchema.index({ userId: 1, isRead: 1, isDeleted: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1, isDeleted: 1 });

// Auto-delete expired notifications (optional - can be done via cron job)
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const NotificationModel = mongoose.model<INotification>("Notification", NotificationSchema);

export default NotificationModel;
