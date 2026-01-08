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
      minlength: [2, 'Notification title must be at least 2 characters'],
      maxlength: [200, 'Notification title must not exceed 200 characters'],
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: [5, 'Notification message must be at least 5 characters'],
      maxlength: [1000, 'Notification message must not exceed 1000 characters'],
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
      validate: {
        validator: function (v: Date | undefined) {
          if (!v) return true; // Allow null/undefined
          return v instanceof Date && v <= new Date();
        },
        message: 'readAt must be today or in the past'
      }
    },
    actionUrl: {
      type: String,
      trim: true,
      maxlength: [500, 'Action URL must not exceed 500 characters'],
      validate: {
        validator: function (v: string | undefined) {
          if (!v) return true; // Allow null/undefined
          try {
            new URL(v);
            return true;
          } catch (e) {
            return false;
          }
        },
        message: 'actionUrl must be a valid URL'
      }
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
