import { Schema, Document, model, Types, PaginateModel } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

// Meeting Interface - For scheduling follow-ups with leads
export interface IMeeting extends Document {
  userId: Types.ObjectId; // User who created the meeting
  leadId: Types.ObjectId; // Lead this meeting is for (lead already has eventId)
  title: string;
  description?: string;
  meetingMode: "online" | "offline" | "phone";
  meetingStatus: "scheduled" | "completed" | "cancelled" | "rescheduled";
  startAt: Date; // Meeting start time in UTC
  endAt: Date; // Meeting end time in UTC
  location?: string; // Address for offline or meeting link for online
  notifyAttendees: boolean;
  reminderSent: boolean; // Track if reminder notification has been sent
  // Video conferencing integration
  videoConferenceLink?: string; // Auto-generated Google Meet or Teams link
  videoConferenceProvider?: "google_meet" | "teams" | null;
  // External calendar sync
  externalCalendarEventId?: string; // Event ID in external calendar (Google/Outlook)
  externalCalendarProvider?: "google" | "outlook" | null;
  calendarSyncStatus: "pending" | "synced" | "failed" | "not_applicable";
  calendarSyncError?: string; // Error message if sync failed
  calendarSyncedAt?: Date; // Last successful sync time
  isActive: boolean;
  isDeleted: boolean;
}

// Meeting Schema
const MeetingSchema = new Schema<IMeeting>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Leads", required: true },
    title: { 
      type: String, 
      required: true,
      minlength: [3, 'Meeting title must be at least 3 characters'],
      maxlength: [200, 'Meeting title must not exceed 200 characters'],
      trim: true
    },
    description: { 
      type: String,
      maxlength: [2000, 'Meeting description must not exceed 2000 characters'],
      trim: true
    },
    meetingMode: { type: String, enum: ["online", "offline", "phone"], required: true },
    meetingStatus: { type: String, enum: ["scheduled", "completed", "cancelled", "rescheduled"], default: "scheduled" },
    startAt: { 
      type: Date, 
      required: true,
      validate: {
        validator: function (v: Date) {
          return v instanceof Date && v >= new Date();
        },
        message: 'startAt must be today or in the future'
      }
    },
    endAt: { 
      type: Date, 
      required: true,
      validate: {
        validator: function (this: IMeeting, v: Date) {
          return v instanceof Date && v > this.startAt;
        },
        message: 'endAt must be after startAt'
      }
    },
    location: { 
      type: String,
      maxlength: [300, 'Location must not exceed 300 characters'],
      trim: true
    },
    notifyAttendees: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false },
    // Video conferencing integration
    videoConferenceLink: {
      type: String,
      maxlength: 500,
      trim: true
    },
    videoConferenceProvider: {
      type: String,
      enum: ["google_meet", "teams", null],
      default: null
    },
    // External calendar sync
    externalCalendarEventId: {
      type: String,
      maxlength: 500
    },
    externalCalendarProvider: {
      type: String,
      enum: ["google", "outlook", null],
      default: null
    },
    calendarSyncStatus: {
      type: String,
      enum: ["pending", "synced", "failed", "not_applicable"],
      default: "not_applicable"
    },
    calendarSyncError: {
      type: String,
      maxlength: 1000
    },
    calendarSyncedAt: {
      type: Date
    },
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
        ret.location = ret.location ?? '';
        ret.videoConferenceLink = ret.videoConferenceLink ?? '';
        ret.calendarSyncError = ret.calendarSyncError ?? '';

        return ret;
      },
    },
  }
);

MeetingSchema.plugin(mongoosePaginate);

const MeetingModel = model<IMeeting, PaginateModel<IMeeting>>("Meetings", MeetingSchema);

export default MeetingModel;
