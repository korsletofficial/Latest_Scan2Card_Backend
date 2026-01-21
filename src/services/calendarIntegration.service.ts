/**
 * Unified Calendar Integration Service
 *
 * Provides a common interface for calendar operations across
 * Google Calendar and Microsoft Outlook.
 *
 * This service handles:
 * - Team Manager calendar connection lookup
 * - Unified event creation/update/deletion
 * - Provider-agnostic video conferencing link generation
 */

import UserModel from "../models/user.model";
import MeetingModel from "../models/meeting.model";
import LeadModel from "../models/leads.model";
import EventModel from "../models/event.model";
import RsvpModel from "../models/rsvp.model";
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  cancelGoogleCalendarEvent,
  isGoogleCalendarConfigured,
} from "./googleCalendar.service";
import {
  createOutlookCalendarEvent,
  updateOutlookCalendarEvent,
  deleteOutlookCalendarEvent,
  cancelOutlookCalendarEvent,
  isMicrosoftCalendarConfigured,
} from "./outlookCalendar.service";

// Interface for calendar event creation result
export interface CalendarEventResult {
  success: boolean;
  eventId?: string;
  videoLink?: string;
  provider?: "google" | "outlook";
  error?: string;
}

// Interface for meeting data used in calendar sync
interface MeetingData {
  _id: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  location?: string;
  meetingMode: "online" | "offline" | "phone";
  leadEmail?: string;
}

/**
 * Check if user has permission to use their own calendar and has it connected
 * Returns the user with calendar credentials if allowed, null otherwise
 */
export const findUserOwnCalendar = async (userId: string, eventId?: string) => {
  if (!eventId) {
    return null;
  }

  // Check if user has canUseOwnCalendar permission for this event
  const rsvp = await RsvpModel.findOne({
    userId: userId,
    eventId: eventId,
    isDeleted: false,
    canUseOwnCalendar: true,
  });

  if (!rsvp) {
    return null;
  }

  // Check if user has their own calendar connected
  const user = await UserModel.findOne({
    _id: userId,
    isDeleted: false,
    calendarProvider: { $in: ["google", "outlook"] },
  }).select(
    "_id calendarProvider calendarEmail calendarTokenExpiry +calendarAccessToken +calendarRefreshToken"
  );

  return user;
};

/**
 * Find the Team Manager for a given End User
 * Returns null if no Team Manager is found or not connected to calendar
 */
export const findTeamManagerForUser = async (endUserId: string, eventId?: string) => {
  // Get the end user's current event (from lead's event)
  let targetEventId = eventId;

  if (!targetEventId) {
    // Try to find from the user's leads
    const lead = await LeadModel.findOne({
      userId: endUserId,
      isDeleted: false,
    }).select("eventId");

    if (lead?.eventId) {
      targetEventId = lead.eventId.toString();
    }
  }

  if (!targetEventId) {
    return null;
  }

  // Find event with license keys to get the Team Manager
  // License keys are embedded in the Event model
  const event = await EventModel.findOne({
    _id: targetEventId,
    isDeleted: false,
    "licenseKeys.isActive": true,
  }).select("licenseKeys");

  if (!event || !event.licenseKeys || event.licenseKeys.length === 0) {
    return null;
  }

  // Find a license key with a team manager assigned
  const licenseKeyWithManager = event.licenseKeys.find(
    (key) => key.teamManagerId && key.isActive
  );

  if (!licenseKeyWithManager?.teamManagerId) {
    return null;
  }

  // Get Team Manager with calendar credentials
  const teamManager = await UserModel.findOne({
    _id: licenseKeyWithManager.teamManagerId,
    isDeleted: false,
    calendarProvider: { $in: ["google", "outlook"] },
  }).select(
    "_id calendarProvider calendarEmail calendarTokenExpiry +calendarAccessToken +calendarRefreshToken"
  );

  return teamManager;
};

/**
 * Create calendar event on user's own calendar OR Team Manager's calendar
 * Priority: User's own calendar (if permitted and connected) > Team Manager's calendar
 * Automatically determines the provider and creates video conferencing link
 */
export const createCalendarEventForMeeting = async (
  endUserId: string,
  meetingData: MeetingData,
  eventId?: string
): Promise<CalendarEventResult> => {
  try {
    // First, check if user has permission and has their own calendar connected
    let calendarUser = await findUserOwnCalendar(endUserId, eventId);
    let isUsingOwnCalendar = !!calendarUser;

    // If user doesn't have own calendar permission/setup, fall back to Team Manager
    if (!calendarUser) {
      calendarUser = await findTeamManagerForUser(endUserId, eventId);
    }

    if (!calendarUser) {
      return {
        success: false,
        error: isUsingOwnCalendar
          ? "Your calendar is not connected. Please connect your Google or Outlook calendar."
          : "No Team Manager with calendar integration found",
      };
    }

    const provider = calendarUser.calendarProvider;

    if (provider === "google") {
      if (!isGoogleCalendarConfigured()) {
        return {
          success: false,
          error: "Google Calendar not configured on server",
        };
      }

      const result = await createGoogleCalendarEvent(calendarUser._id.toString(), {
        title: meetingData.title,
        description: meetingData.description,
        startAt: meetingData.startAt,
        endAt: meetingData.endAt,
        location: meetingData.location,
        meetingMode: meetingData.meetingMode,
        attendeeEmail: meetingData.leadEmail,
        meetingId: meetingData._id,
      });

      return {
        success: true,
        eventId: result.eventId,
        videoLink: result.meetLink || undefined,
        provider: "google",
      };
    } else if (provider === "outlook") {
      if (!isMicrosoftCalendarConfigured()) {
        return {
          success: false,
          error: "Microsoft Outlook not configured on server",
        };
      }

      const result = await createOutlookCalendarEvent(calendarUser._id.toString(), {
        title: meetingData.title,
        description: meetingData.description,
        startAt: meetingData.startAt,
        endAt: meetingData.endAt,
        location: meetingData.location,
        meetingMode: meetingData.meetingMode,
        attendeeEmail: meetingData.leadEmail,
      });

      return {
        success: true,
        eventId: result.eventId,
        videoLink: result.teamsLink || undefined,
        provider: "outlook",
      };
    }

    return {
      success: false,
      error: `Unknown calendar provider: ${provider}`,
    };
  } catch (error: any) {
    console.error("Error creating calendar event:", error);
    return {
      success: false,
      error: error.message || "Failed to create calendar event",
    };
  }
};

/**
 * Update calendar event on Team Manager's calendar
 */
export const updateCalendarEventForMeeting = async (
  meetingId: string,
  updates: Partial<MeetingData>
): Promise<CalendarEventResult> => {
  try {
    // Get the meeting with calendar sync info
    const meeting = await MeetingModel.findById(meetingId);

    if (!meeting || !meeting.externalCalendarEventId || !meeting.externalCalendarProvider) {
      return {
        success: false,
        error: "Meeting not synced to external calendar",
      };
    }

    // Find Team Manager
    const teamManager = await findTeamManagerForUser(meeting.userId.toString());

    if (!teamManager) {
      return {
        success: false,
        error: "Team Manager not found or calendar disconnected",
      };
    }

    const provider = meeting.externalCalendarProvider;

    if (provider === "google") {
      const result = await updateGoogleCalendarEvent(
        teamManager._id.toString(),
        meeting.externalCalendarEventId,
        {
          title: updates.title,
          description: updates.description,
          startAt: updates.startAt,
          endAt: updates.endAt,
          location: updates.location,
          meetingMode: updates.meetingMode,
        }
      );

      return {
        success: true,
        eventId: result.eventId,
        videoLink: result.meetLink || undefined,
        provider: "google",
      };
    } else if (provider === "outlook") {
      const result = await updateOutlookCalendarEvent(
        teamManager._id.toString(),
        meeting.externalCalendarEventId,
        {
          title: updates.title,
          description: updates.description,
          startAt: updates.startAt,
          endAt: updates.endAt,
          location: updates.location,
          meetingMode: updates.meetingMode,
        }
      );

      return {
        success: true,
        eventId: result.eventId,
        videoLink: result.teamsLink || undefined,
        provider: "outlook",
      };
    }

    return {
      success: false,
      error: `Unknown calendar provider: ${provider}`,
    };
  } catch (error: any) {
    console.error("Error updating calendar event:", error);
    return {
      success: false,
      error: error.message || "Failed to update calendar event",
    };
  }
};

/**
 * Cancel calendar event on Team Manager's calendar
 */
export const cancelCalendarEventForMeeting = async (
  meetingId: string
): Promise<CalendarEventResult> => {
  try {
    // Get the meeting with calendar sync info
    const meeting = await MeetingModel.findById(meetingId);

    if (!meeting || !meeting.externalCalendarEventId || !meeting.externalCalendarProvider) {
      return {
        success: false,
        error: "Meeting not synced to external calendar",
      };
    }

    // Find Team Manager
    const teamManager = await findTeamManagerForUser(meeting.userId.toString());

    if (!teamManager) {
      return {
        success: false,
        error: "Team Manager not found or calendar disconnected",
      };
    }

    const provider = meeting.externalCalendarProvider;

    if (provider === "google") {
      await cancelGoogleCalendarEvent(
        teamManager._id.toString(),
        meeting.externalCalendarEventId
      );
    } else if (provider === "outlook") {
      await cancelOutlookCalendarEvent(
        teamManager._id.toString(),
        meeting.externalCalendarEventId
      );
    } else {
      return {
        success: false,
        error: `Unknown calendar provider: ${provider}`,
      };
    }

    return {
      success: true,
      provider,
    };
  } catch (error: any) {
    console.error("Error cancelling calendar event:", error);
    return {
      success: false,
      error: error.message || "Failed to cancel calendar event",
    };
  }
};

/**
 * Delete calendar event from Team Manager's calendar
 */
export const deleteCalendarEventForMeeting = async (
  meetingId: string
): Promise<CalendarEventResult> => {
  try {
    // Get the meeting with calendar sync info
    const meeting = await MeetingModel.findById(meetingId);

    if (!meeting || !meeting.externalCalendarEventId || !meeting.externalCalendarProvider) {
      return {
        success: false,
        error: "Meeting not synced to external calendar",
      };
    }

    // Find Team Manager
    const teamManager = await findTeamManagerForUser(meeting.userId.toString());

    if (!teamManager) {
      return {
        success: false,
        error: "Team Manager not found or calendar disconnected",
      };
    }

    const provider = meeting.externalCalendarProvider;

    if (provider === "google") {
      await deleteGoogleCalendarEvent(
        teamManager._id.toString(),
        meeting.externalCalendarEventId
      );
    } else if (provider === "outlook") {
      await deleteOutlookCalendarEvent(
        teamManager._id.toString(),
        meeting.externalCalendarEventId
      );
    } else {
      return {
        success: false,
        error: `Unknown calendar provider: ${provider}`,
      };
    }

    return {
      success: true,
      provider,
    };
  } catch (error: any) {
    console.error("Error deleting calendar event:", error);
    return {
      success: false,
      error: error.message || "Failed to delete calendar event",
    };
  }
};

/**
 * Get calendar integration status for a Team Manager
 */
export const getCalendarIntegrationStatus = async (userId: string) => {
  const user = await UserModel.findById(userId).select(
    "calendarProvider calendarEmail calendarConnectedAt calendarTokenExpiry"
  );

  if (!user) {
    throw new Error("User not found");
  }

  const isConnected = !!user.calendarProvider;
  const isTokenValid = user.calendarTokenExpiry
    ? new Date(user.calendarTokenExpiry).getTime() > Date.now()
    : false;

  return {
    isConnected,
    provider: user.calendarProvider || null,
    email: user.calendarEmail || null,
    connectedAt: user.calendarConnectedAt || null,
    isTokenValid: isConnected ? isTokenValid : null,
    availableProviders: {
      google: isGoogleCalendarConfigured(),
      outlook: isMicrosoftCalendarConfigured(),
    },
  };
};

/**
 * Check if any calendar provider is configured
 */
export const isAnyCalendarConfigured = (): boolean => {
  return isGoogleCalendarConfigured() || isMicrosoftCalendarConfigured();
};
