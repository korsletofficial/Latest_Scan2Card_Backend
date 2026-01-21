/**
 * Microsoft Outlook Calendar OAuth Service
 *
 * Handles Microsoft Outlook Calendar integration including:
 * - OAuth 2.0 authentication flow via Microsoft Identity Platform
 * - Calendar event creation with Microsoft Teams links
 * - Event updates and deletion
 * - Token refresh management
 */

import axios from "axios";
import { encrypt, decrypt } from "../utils/encryption.util";
import UserModel from "../models/user.model";

// Microsoft OAuth configuration
const getMicrosoftConfig = () => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Microsoft OAuth credentials not configured. Please set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI");
  }

  return { clientId, clientSecret, redirectUri, tenantId };
};

// Scopes required for calendar operations
const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Calendars.ReadWrite",
  "OnlineMeetings.ReadWrite",
];

// Microsoft Graph API base URL
const GRAPH_API_URL = "https://graph.microsoft.com/v1.0";

/**
 * Generate OAuth authorization URL
 * @param state - State parameter to include (usually userId)
 */
export const getMicrosoftAuthUrl = (state: string): string => {
  const { clientId, redirectUri, tenantId } = getMicrosoftConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
    prompt: "consent", // Force consent to get refresh token
  });

  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
};

/**
 * Exchange authorization code for tokens
 * @param code - Authorization code from OAuth callback
 */
export const exchangeMicrosoftCodeForTokens = async (code: string) => {
  const { clientId, clientSecret, redirectUri, tenantId } = getMicrosoftConfig();

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: SCOPES.join(" "),
  });

  const response = await axios.post(tokenUrl, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const { access_token, refresh_token, expires_in } = response.data;

  if (!access_token || !refresh_token) {
    throw new Error("Failed to obtain tokens from Microsoft");
  }

  // Calculate expiry date
  const expiryDate = new Date(Date.now() + expires_in * 1000);

  // Get user email from Graph API
  const userResponse = await axios.get(`${GRAPH_API_URL}/me`, {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });

  const email = userResponse.data.mail || userResponse.data.userPrincipalName;

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiryDate,
    email,
  };
};

/**
 * Refresh access token using refresh token
 * @param encryptedRefreshToken - Encrypted refresh token
 */
export const refreshMicrosoftAccessToken = async (encryptedRefreshToken: string) => {
  const { clientId, clientSecret, tenantId } = getMicrosoftConfig();
  const refreshToken = decrypt(encryptedRefreshToken);

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES.join(" "),
  });

  const response = await axios.post(tokenUrl, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const { access_token, expires_in, refresh_token: newRefreshToken } = response.data;

  if (!access_token) {
    throw new Error("Failed to refresh Microsoft access token");
  }

  const expiryDate = new Date(Date.now() + expires_in * 1000);

  return {
    accessToken: access_token,
    refreshToken: newRefreshToken, // Microsoft may return a new refresh token
    expiryDate,
  };
};

/**
 * Get valid access token for a user
 * Automatically refreshes token if expired
 */
export const getValidAccessToken = async (userId: string): Promise<string> => {
  const user = await UserModel.findById(userId).select(
    "+calendarAccessToken +calendarRefreshToken calendarTokenExpiry calendarProvider"
  );

  if (!user || user.calendarProvider !== "outlook") {
    throw new Error("User does not have Outlook Calendar connected");
  }

  if (!user.calendarAccessToken || !user.calendarRefreshToken) {
    throw new Error("Calendar tokens not found");
  }

  // Check if token is expired or about to expire (within 5 minutes)
  const isExpired = user.calendarTokenExpiry &&
    new Date(user.calendarTokenExpiry).getTime() < Date.now() + 5 * 60 * 1000;

  if (isExpired) {
    // Refresh the token
    const { accessToken, refreshToken, expiryDate } = await refreshMicrosoftAccessToken(user.calendarRefreshToken);

    // Update stored tokens
    user.calendarAccessToken = encrypt(accessToken);
    if (refreshToken) {
      user.calendarRefreshToken = encrypt(refreshToken);
    }
    user.calendarTokenExpiry = expiryDate;
    await user.save();

    return accessToken;
  }

  return decrypt(user.calendarAccessToken);
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
}

/**
 * Create calendar event with Microsoft Teams link
 */
export const createOutlookCalendarEvent = async (
  userId: string,
  eventData: CalendarEventData
): Promise<{
  eventId: string;
  teamsLink: string | null;
  webLink: string;
}> => {
  const accessToken = await getValidAccessToken(userId);

  // Build event resource for Microsoft Graph API
  const event: any = {
    subject: eventData.title,
    body: {
      contentType: "text",
      content: eventData.description || "",
    },
    start: {
      dateTime: eventData.startAt.toISOString().replace("Z", ""),
      timeZone: "UTC",
    },
    end: {
      dateTime: eventData.endAt.toISOString().replace("Z", ""),
      timeZone: "UTC",
    },
  };

  // Add location based on meeting mode
  if (eventData.meetingMode === "offline" && eventData.location) {
    event.location = {
      displayName: eventData.location,
    };
  } else if (eventData.meetingMode === "phone") {
    event.location = {
      displayName: "Phone Call",
    };
  }

  // Add attendee if provided
  if (eventData.attendeeEmail) {
    event.attendees = [
      {
        emailAddress: {
          address: eventData.attendeeEmail,
        },
        type: "required",
      },
    ];
  }

  // Enable Teams meeting for online meetings
  if (eventData.meetingMode === "online") {
    event.isOnlineMeeting = true;
    event.onlineMeetingProvider = "teamsForBusiness";
  }

  // Create the event
  const response = await axios.post(
    `${GRAPH_API_URL}/me/events`,
    event,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  const createdEvent = response.data;

  // Extract Teams link if available
  let teamsLink: string | null = null;
  if (createdEvent.onlineMeeting?.joinUrl) {
    teamsLink = createdEvent.onlineMeeting.joinUrl;
  }

  return {
    eventId: createdEvent.id,
    teamsLink,
    webLink: createdEvent.webLink || "",
  };
};

/**
 * Update existing calendar event
 */
export const updateOutlookCalendarEvent = async (
  userId: string,
  externalEventId: string,
  eventData: Partial<CalendarEventData>
): Promise<{
  eventId: string;
  teamsLink: string | null;
  webLink: string;
}> => {
  const accessToken = await getValidAccessToken(userId);

  // Build update resource
  const updateData: any = {};

  if (eventData.title) {
    updateData.subject = eventData.title;
  }
  if (eventData.description !== undefined) {
    updateData.body = {
      contentType: "text",
      content: eventData.description,
    };
  }
  if (eventData.startAt) {
    updateData.start = {
      dateTime: eventData.startAt.toISOString().replace("Z", ""),
      timeZone: "UTC",
    };
  }
  if (eventData.endAt) {
    updateData.end = {
      dateTime: eventData.endAt.toISOString().replace("Z", ""),
      timeZone: "UTC",
    };
  }
  if (eventData.meetingMode === "offline" && eventData.location) {
    updateData.location = {
      displayName: eventData.location,
    };
  }

  const response = await axios.patch(
    `${GRAPH_API_URL}/me/events/${externalEventId}`,
    updateData,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  const updatedEvent = response.data;

  // Extract Teams link if available
  let teamsLink: string | null = null;
  if (updatedEvent.onlineMeeting?.joinUrl) {
    teamsLink = updatedEvent.onlineMeeting.joinUrl;
  }

  return {
    eventId: updatedEvent.id,
    teamsLink,
    webLink: updatedEvent.webLink || "",
  };
};

/**
 * Delete calendar event
 */
export const deleteOutlookCalendarEvent = async (
  userId: string,
  externalEventId: string
): Promise<void> => {
  const accessToken = await getValidAccessToken(userId);

  await axios.delete(
    `${GRAPH_API_URL}/me/events/${externalEventId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
};

/**
 * Cancel calendar event (mark as cancelled)
 */
export const cancelOutlookCalendarEvent = async (
  userId: string,
  externalEventId: string
): Promise<void> => {
  const accessToken = await getValidAccessToken(userId);

  // Microsoft Graph uses POST to /cancel endpoint
  await axios.post(
    `${GRAPH_API_URL}/me/events/${externalEventId}/cancel`,
    {
      comment: "Meeting cancelled",
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
};

/**
 * Revoke Microsoft OAuth access
 * Note: Microsoft doesn't have a direct token revocation endpoint,
 * but we can clear our stored tokens
 */
export const revokeMicrosoftAccess = async (): Promise<void> => {
  // Microsoft OAuth tokens can't be programmatically revoked
  // Users need to revoke access from https://account.microsoft.com/permissions
  // We just clear our stored tokens
  console.log("Microsoft tokens cleared. User should revoke access from Microsoft account settings.");
};

/**
 * Check if Microsoft Calendar is configured
 */
export const isMicrosoftCalendarConfigured = (): boolean => {
  return !!(
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.MICROSOFT_REDIRECT_URI
  );
};
