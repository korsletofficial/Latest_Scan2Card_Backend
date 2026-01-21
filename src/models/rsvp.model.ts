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
  isRevoked: boolean; // Access revoked by team manager
  revokedBy?: Types.ObjectId; // Team manager who revoked access
  revokedAt?: Date; // When access was revoked
  // Meeting creation permission control
  canCreateMeeting: boolean; // Whether member can create meetings for this event
  meetingPermissionRevokedBy?: Types.ObjectId; // Team manager who revoked meeting permission
  meetingPermissionRevokedAt?: Date; // When meeting permission was revoked
  // Calendar integration permission - allows team member to use their own calendar
  canUseOwnCalendar: boolean; // Whether member can use their own Google/Outlook calendar
  calendarPermissionGrantedBy?: Types.ObjectId; // Team manager who granted calendar permission
  calendarPermissionGrantedAt?: Date; // When calendar permission was granted
  createdAt: Date;
  updatedAt: Date;
}

// Define Schema
const RsvpSchema = new Schema<IRsvp>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Events"
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Users"
    },
    eventLicenseKey: {
      type: String,
      maxlength: 100,
      trim: true,
      uppercase: true
    },
    expiresAt: {
      type: Date,
      validate: {
        validator: function (this: any, v: Date | undefined) {
          if (!v) return true; // Allow null/undefined
          // Only validate if the field is being modified
          if (!this.isModified('expiresAt')) return true;
          return v instanceof Date && v >= new Date();
        },
        message: 'expiresAt must be today or in the future'
      }
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: "Users"
    },
    status: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
      max: 10
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    isRevoked: { type: Boolean, default: false },
    revokedBy: {
      type: Schema.Types.ObjectId,
      ref: "Users"
    },
    revokedAt: { type: Date },
    // Meeting creation permission control
    canCreateMeeting: { type: Boolean, default: true },
    meetingPermissionRevokedBy: {
      type: Schema.Types.ObjectId,
      ref: "Users"
    },
    meetingPermissionRevokedAt: { type: Date },
    // Calendar integration permission - allows team member to use their own calendar
    canUseOwnCalendar: { type: Boolean, default: false },
    calendarPermissionGrantedBy: {
      type: Schema.Types.ObjectId,
      ref: "Users"
    },
    calendarPermissionGrantedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        const output = ret as any;
        delete output.__v;

        // Convert undefined/null to empty string for optional fields
        output.eventLicenseKey = output.eventLicenseKey ?? '';
        output.expiresAt = output.expiresAt ?? null;

        return output;
      },
    },
  }
);

// Add indexes for better query performance
RsvpSchema.index({ eventId: 1, userId: 1 });
RsvpSchema.index({ eventLicenseKey: 1 });
RsvpSchema.index({ userId: 1, isDeleted: 1 });
RsvpSchema.index({ eventId: 1, isDeleted: 1 });
RsvpSchema.index({ userId: 1, isRevoked: 1 }); // For filtering revoked access
RsvpSchema.index({ eventId: 1, canCreateMeeting: 1 }); // For filtering meeting permission
RsvpSchema.index({ eventLicenseKey: 1, canCreateMeeting: 1 }); // For bulk meeting permission by license key
RsvpSchema.index({ userId: 1, canUseOwnCalendar: 1 }); // For calendar permission lookup

// Add Pagination Plugin
RsvpSchema.plugin(mongoosePaginate);

// Define IRsvpModel with Pagination Support
export interface IRsvpModel extends PaginateModel<IRsvp> { }

// Create Model with Pagination Type
const RsvpModel = model<IRsvp, IRsvpModel>("Rsvp", RsvpSchema);

export default RsvpModel;
