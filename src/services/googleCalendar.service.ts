/**
 * Google Calendar OAuth Service
 *
 * Handles Google Calendar integration including:
 * - OAuth 2.0 authentication flow
 * - Calendar event creation with Google Meet links
 * - Event updates and deletion
 * - Token refresh management
 */

import { google, calendar_v3 } from "googleapis";
import { encrypt, decrypt } from "../utils/encryption.util";
import UserModel from "../models/user.model";

// Google OAuth2 configuration
const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

// Scopes required for calendar operations
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Generate OAuth authorization URL
 * @param state - State parameter to include (usually userId)
 */
export const getGoogleAuthUrl = (state: string): string => {
  const oauth2Client = getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline", // Get refresh token
    scope: SCOPES,
    state,
    prompt: "consent", // Force consent screen to ensure refresh token
  });
};

/**
 * Exchange authorization code for tokens
 * @param code - Authorization code from OAuth callback
 */
export const exchangeCodeForTokens = async (code: string) => {
  const oauth2Client = getOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to obtain tokens from Google");
  }

  // Get user email from tokens
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email;

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    email,
  };
};

/**
 * Refresh access token using refresh token
 * @param refreshToken - Encrypted refresh token
 */
export const refreshGoogleAccessToken = async (encryptedRefreshToken: string) => {
  const oauth2Client = getOAuth2Client();
  const refreshToken = decrypt(encryptedRefreshToken);

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error("Failed to refresh Google access token");
  }

  return {
    accessToken: credentials.access_token,
    expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
  };
};

/**
 * Get authenticated OAuth2 client for a user
 * Automatically refreshes token if expired
 */
export const getAuthenticatedClient = async (userId: string) => {
  const user = await UserModel.findById(userId).select(
    "+calendarAccessToken +calendarRefreshToken calendarTokenExpiry calendarProvider"
  );

  if (!user || user.calendarProvider !== "google") {
    throw new Error("User does not have Google Calendar connected");
  }

  if (!user.calendarAccessToken || !user.calendarRefreshToken) {
    throw new Error("Calendar tokens not found");
  }

  const oauth2Client = getOAuth2Client();

  // Check if token is expired or about to expire (within 5 minutes)
  const isExpired = user.calendarTokenExpiry &&
    new Date(user.calendarTokenExpiry).getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpired) {
    // Refresh the token
    const { accessToken, expiryDate } = await refreshGoogleAccessToken(user.calendarRefreshToken);

    // Update stored tokens
    user.calendarAccessToken = encrypt(accessToken);
    user.calendarTokenExpiry = expiryDate || undefined;
    await user.save();

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: decrypt(user.calendarRefreshToken),
    });
  } else {
    oauth2Client.setCredentials({
      access_token: decrypt(user.calendarAccessToken),
      refresh_token: decrypt(user.calendarRefreshToken),
    });
  }

  return oauth2Client;
};

// Interface for event data
interface CalendarEventData {
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  location?: string;
  meetingMode: "online" | "offline" | "phone";
  attendeeEmail?: string;
  meetingId: string; // For unique conference request ID
}

/**
 * Create calendar event with Google Meet link
 */
export const createGoogleCalendarEvent = async (
  userId: string,
  eventData: CalendarEventData
): Promise<{
  eventId: string;
  meetLink: string | null;
  htmlLink: string;
}> => {
  const oauth2Client = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // Build event resource
  const event: calendar_v3.Schema$Event = {
    summary: eventData.title,
    description: eventData.description || "",
    start: {
      dateTime: eventData.startAt.toISOString(),
      timeZone: "UTC",
    },
    end: {
      dateTime: eventData.endAt.toISOString(),
      timeZone: "UTC",
    },
  };

  // Add location based on meeting mode
  if (eventData.meetingMode === "offline" && eventData.location) {
    event.location = eventData.location;
  } else if (eventData.meetingMode === "phone") {
    event.location = "Phone Call";
  }

  // Add attendee if provided
  if (eventData.attendeeEmail) {
    event.attendees = [{ email: eventData.attendeeEmail }];
  }

  // Add conference data for online meetings (Google Meet)
  if (eventData.meetingMode === "online") {
    event.conferenceData = {
      createRequest: {
        requestId: `meeting_${eventData.meetingId}_${Date.now()}`,
        conferenceSolutionKey: {
          type: "hangoutsMeet",
        },
      },
    };
  }

  // Create the event
  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
    conferenceDataVersion: eventData.meetingMode === "online" ? 1 : 0, // Required for Meet link generation
    sendUpdates: eventData.attendeeEmail ? "all" : "none",
  });

  const createdEvent = response.data;

  // Extract Meet link if available
  let meetLink: string | null = null;
  if (createdEvent.conferenceData?.entryPoints) {
    const videoEntry = createdEvent.conferenceData.entryPoints.find(
      (ep) => ep.entryPointType === "video"
    );
    meetLink = videoEntry?.uri || null;
  }

  return {
    eventId: createdEvent.id || "",
    meetLink,
    htmlLink: createdEvent.htmlLink || "",
  };
};

/**
 * Update existing calendar event
 */
export const updateGoogleCalendarEvent = async (
  userId: string,
  externalEventId: string,
  eventData: Partial<CalendarEventData>
): Promise<{
  eventId: string;
  meetLink: string | null;
  htmlLink: string;
}> => {
  const oauth2Client = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // Build update resource
  const updateData: calendar_v3.Schema$Event = {};

  if (eventData.title) {
    updateData.summary = eventData.title;
  }
  if (eventData.description !== undefined) {
    updateData.description = eventData.description;
  }
  if (eventData.startAt) {
    updateData.start = {
      dateTime: eventData.startAt.toISOString(),
      timeZone: "UTC",
    };
  }
  if (eventData.endAt) {
    updateData.end = {
      dateTime: eventData.endAt.toISOString(),
      timeZone: "UTC",
    };
  }
  if (eventData.meetingMode === "offline" && eventData.location) {
    updateData.location = eventData.location;
  }

  const response = await calendar.events.patch({
    calendarId: "primary",
    eventId: externalEventId,
    requestBody: updateData,
    sendUpdates: "all",
  });

  const updatedEvent = response.data;

  // Extract Meet link if available
  let meetLink: string | null = null;
  if (updatedEvent.conferenceData?.entryPoints) {
    const videoEntry = updatedEvent.conferenceData.entryPoints.find(
      (ep) => ep.entryPointType === "video"
    );
    meetLink = videoEntry?.uri || null;
  }

  return {
    eventId: updatedEvent.id || "",
    meetLink,
    htmlLink: updatedEvent.htmlLink || "",
  };
};

/**
 * Delete calendar event
 */
export const deleteGoogleCalendarEvent = async (
  userId: string,
  externalEventId: string
): Promise<void> => {
  const oauth2Client = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  await calendar.events.delete({
    calendarId: "primary",
    eventId: externalEventId,
    sendUpdates: "all",
  });
};

/**
 * Cancel calendar event (mark as cancelled instead of deleting)
 */
export const cancelGoogleCalendarEvent = async (
  userId: string,
  externalEventId: string
): Promise<void> => {
  const oauth2Client = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  await calendar.events.patch({
    calendarId: "primary",
    eventId: externalEventId,
    requestBody: {
      status: "cancelled",
    },
    sendUpdates: "all",
  });
};

/**
 * Revoke Google OAuth access
 */
export const revokeGoogleAccess = async (encryptedRefreshToken: string): Promise<void> => {
  try {
    const oauth2Client = getOAuth2Client();
    const refreshToken = decrypt(encryptedRefreshToken);
    await oauth2Client.revokeToken(refreshToken);
  } catch (error) {
    // Log but don't throw - user may have already revoked access
    console.error("Error revoking Google access:", error);
  }
};

/**
 * Check if Google Calendar is configured
 */
export const isGoogleCalendarConfigured = (): boolean => {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  );
};
