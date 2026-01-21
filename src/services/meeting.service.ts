import MeetingModel from "../models/meeting.model";
import LeadModel from "../models/leads.model";
import RsvpModel from "../models/rsvp.model";
import EventModel from "../models/event.model";
import mongoose from "mongoose";
import {
  createCalendarEventForMeeting,
  updateCalendarEventForMeeting,
  cancelCalendarEventForMeeting,
} from "./calendarIntegration.service";

interface CreateMeetingData {
  userId: string;
  leadId: string;
  title: string;
  description?: string;
  meetingMode: string;
  startAt: Date;
  endAt: Date;
  location?: string;
  notifyAttendees?: boolean;
  // Optional: skip calendar sync (e.g., for bulk operations)
  skipCalendarSync?: boolean;
}

interface GetMeetingsFilter {
  userId: string;
  leadId?: string;
  meetingStatus?: string;
  meetingMode?: string;
  page?: number;
  limit?: number;
  sortBy?: "startAt" | "createdAt";
  sortOrder?: "asc" | "desc";
}

interface UpdateMeetingData {
  title?: string;
  description?: string;
  meetingMode?: "online" | "offline" | "phone";
  meetingStatus?: "scheduled" | "completed" | "cancelled" | "rescheduled";
  startAt?: Date;
  endAt?: Date;
  location?: string;
  notifyAttendees?: boolean;
  isActive?: boolean;
}

// Create Meeting
export const createMeeting = async (data: CreateMeetingData) => {
  // Verify lead exists and belongs to user
  const lead = await LeadModel.findOne({
    _id: data.leadId,
    userId: data.userId,
    isDeleted: false,
  });

  if (!lead) {
    throw new Error("Lead not found or access denied");
  }

  // Check meeting creation permission
  // Priority: Individual RSVP permission > License key bulk permission
  // This allows team manager to give exceptions after bulk revoke
  const rsvp = await RsvpModel.findOne({
    userId: new mongoose.Types.ObjectId(data.userId),
    eventId: lead.eventId,
    isDeleted: false,
  });

  // If individual permission is explicitly set to false, deny
  if (rsvp && rsvp.canCreateMeeting === false) {
    throw new Error("Meeting creation has been disabled for you on this event by your team manager");
  }

  // If individual permission is explicitly set to true (restored as exception), allow
  // Skip license key check - individual override takes priority
  const hasIndividualPermissionGranted = rsvp && rsvp.canCreateMeeting === true;

  // Check license key-level permission (bulk) only if no individual exception
  if (!hasIndividualPermissionGranted && rsvp?.eventLicenseKey) {
    const event = await EventModel.findOne({
      _id: lead.eventId,
      isDeleted: false,
    });

    if (event) {
      const licenseKey = event.licenseKeys.find(
        (lk) => lk.key === rsvp.eventLicenseKey
      );

      // If bulk permission is disabled and user has no individual exception, deny
      if (licenseKey && licenseKey.allowTeamMeetings === false) {
        throw new Error("Meeting creation has been disabled for this event by your team manager");
      }
    }
  }

  // Get lead email for calendar invite
  const leadEmail = lead.details?.emails?.[0] || (lead.details as any)?.email;

  const meeting = await MeetingModel.create({
    userId: data.userId,
    leadId: data.leadId,
    title: data.title,
    description: data.description,
    meetingMode: data.meetingMode,
    startAt: data.startAt,
    endAt: data.endAt,
    location: data.location,
    notifyAttendees: data.notifyAttendees || false,
    calendarSyncStatus: "pending", // Will be updated after sync attempt
  });

  // Attempt to sync with Team Manager's calendar (async, non-blocking)
  if (!data.skipCalendarSync) {
    try {
      const calendarResult = await createCalendarEventForMeeting(
        data.userId,
        {
          _id: meeting._id.toString(),
          title: data.title,
          description: data.description,
          startAt: data.startAt,
          endAt: data.endAt,
          location: data.location,
          meetingMode: data.meetingMode as "online" | "offline" | "phone",
          leadEmail,
        },
        lead.eventId?.toString()
      );

      if (calendarResult.success) {
        // Update meeting with calendar sync info
        meeting.externalCalendarEventId = calendarResult.eventId;
        meeting.externalCalendarProvider = calendarResult.provider;
        meeting.calendarSyncStatus = "synced";
        meeting.calendarSyncedAt = new Date();

        // Set video conference link if generated
        if (calendarResult.videoLink) {
          meeting.videoConferenceLink = calendarResult.videoLink;
          meeting.videoConferenceProvider =
            calendarResult.provider === "google" ? "google_meet" : "teams";

          // Also update location for online meetings with the video link
          if (data.meetingMode === "online" && !data.location) {
            meeting.location = calendarResult.videoLink;
          }
        }

        await meeting.save();
      } else {
        // Calendar sync failed but meeting was created
        meeting.calendarSyncStatus = "failed";
        meeting.calendarSyncError = calendarResult.error;
        await meeting.save();
        console.log("Calendar sync failed:", calendarResult.error);
      }
    } catch (syncError: any) {
      // Log error but don't fail meeting creation
      console.error("Calendar sync error:", syncError);
      meeting.calendarSyncStatus = "failed";
      meeting.calendarSyncError = syncError.message;
      await meeting.save();
    }
  } else {
    // Calendar sync skipped
    meeting.calendarSyncStatus = "not_applicable";
    await meeting.save();
  }

  await meeting.populate([
    {
      path: "leadId",
      select: "details.firstName details.lastName details.emails"
    },
  ]);

  return meeting;
};

// Get All Meetings (with pagination and filters)
export const getMeetings = async (filter: GetMeetingsFilter) => {
  const {
    userId,
    leadId,
    meetingStatus,
    meetingMode,
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = filter;

  // Build filter query
  const query: any = { userId, isDeleted: false };

  if (leadId) {
    query.leadId = leadId;
  }

  if (meetingStatus) {
    query.meetingStatus = meetingStatus;
  }

  if (meetingMode) {
    query.meetingMode = meetingMode;
  }

  // Build sort object
  const sortField = sortBy === "startAt" ? "startAt" : "createdAt";
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const options = {
    page: Number(page),
    limit: Number(limit),
    sort: { [sortField]: sortDirection },
    populate: [
      {
        path: "leadId",
        select: "details.firstName details.lastName details.emails"
      },
    ],
  };

  const meetings = await MeetingModel.paginate(query, options);

  return {
    meetings: meetings.docs,
    pagination: {
      total: meetings.totalDocs,
      page: meetings.page,
      limit: meetings.limit,
      totalPages: meetings.totalPages,
      hasNextPage: meetings.hasNextPage,
      hasPrevPage: meetings.hasPrevPage,
    },
  };
};

// Get Meeting by ID
export const getMeetingById = async (id: string, userId: string) => {
  const meeting = await MeetingModel.findOne({
    _id: id,
    userId,
    isDeleted: false,
  }).populate("leadId", "details.firstName details.lastName details.emails");

  if (!meeting) {
    throw new Error("Meeting not found");
  }

  return meeting;
};

// Update Meeting
export const updateMeeting = async (
  id: string,
  userId: string,
  data: UpdateMeetingData
) => {
  const meeting = await MeetingModel.findOne({
    _id: id,
    userId,
    isDeleted: false,
  });

  if (!meeting) {
    throw new Error("Meeting not found");
  }

  // Check if meeting is being cancelled
  const isBeingCancelled = data.meetingStatus === "cancelled" && meeting.meetingStatus !== "cancelled";

  // Update fields
  if (data.title !== undefined) meeting.title = data.title;
  if (data.description !== undefined) meeting.description = data.description;
  if (data.meetingMode !== undefined) meeting.meetingMode = data.meetingMode;
  if (data.meetingStatus !== undefined)
    meeting.meetingStatus = data.meetingStatus;
  if (data.startAt !== undefined) meeting.startAt = data.startAt;
  if (data.endAt !== undefined) meeting.endAt = data.endAt;
  if (data.location !== undefined) meeting.location = data.location;
  if (data.notifyAttendees !== undefined)
    meeting.notifyAttendees = data.notifyAttendees;
  if (typeof data.isActive === "boolean") meeting.isActive = data.isActive;

  await meeting.save();

  // Sync changes to external calendar if connected
  if (meeting.externalCalendarEventId && meeting.calendarSyncStatus === "synced") {
    try {
      if (isBeingCancelled) {
        // Cancel the calendar event
        const cancelResult = await cancelCalendarEventForMeeting(id);
        if (cancelResult.success) {
          meeting.calendarSyncStatus = "synced";
          meeting.calendarSyncedAt = new Date();
          meeting.calendarSyncError = undefined;
        } else {
          meeting.calendarSyncError = cancelResult.error;
        }
      } else {
        // Update the calendar event
        const updateResult = await updateCalendarEventForMeeting(id, {
          title: data.title,
          description: data.description,
          startAt: data.startAt,
          endAt: data.endAt,
          location: data.location,
          meetingMode: data.meetingMode,
        });

        if (updateResult.success) {
          meeting.calendarSyncedAt = new Date();
          meeting.calendarSyncError = undefined;

          // Update video link if changed
          if (updateResult.videoLink) {
            meeting.videoConferenceLink = updateResult.videoLink;
          }
        } else {
          meeting.calendarSyncError = updateResult.error;
        }
      }

      await meeting.save();
    } catch (syncError: any) {
      console.error("Calendar sync error on update:", syncError);
      meeting.calendarSyncError = syncError.message;
      await meeting.save();
    }
  }

  await meeting.populate([
    {
      path: "leadId",
      select: "details.firstName details.lastName details.emails"
    },
  ]);

  return meeting;
};

// Delete Meeting (soft delete)
export const deleteMeeting = async (id: string, userId: string) => {
  const meeting = await MeetingModel.findOne({
    _id: id,
    userId,
    isDeleted: false,
  });

  if (!meeting) {
    throw new Error("Meeting not found");
  }

  // Cancel calendar event if synced
  if (meeting.externalCalendarEventId && meeting.calendarSyncStatus === "synced") {
    try {
      await cancelCalendarEventForMeeting(id);
    } catch (syncError: any) {
      console.error("Calendar sync error on delete:", syncError);
      // Continue with deletion even if calendar sync fails
    }
  }

  // Soft delete the meeting
  meeting.isDeleted = true;
  await meeting.save();

  return { message: "Meeting deleted successfully" };
};
