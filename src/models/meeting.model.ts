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
  isActive: boolean;
  isDeleted: boolean;
}

// Meeting Schema
const MeetingSchema = new Schema<IMeeting>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Leads", required: true },
    title: { type: String, required: true },
    description: { type: String },
    meetingMode: { type: String, enum: ["online", "offline", "phone"], required: true },
    meetingStatus: { type: String, enum: ["scheduled", "completed", "cancelled", "rescheduled"], default: "scheduled" },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    location: { type: String },
    notifyAttendees: { type: Boolean, default: false },
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

        return ret;
      },
    },
  }
);

MeetingSchema.plugin(mongoosePaginate);

const MeetingModel = model<IMeeting, PaginateModel<IMeeting>>("Meetings", MeetingSchema);

export default MeetingModel;
