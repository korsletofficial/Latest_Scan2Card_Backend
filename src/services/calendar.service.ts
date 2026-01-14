import { nanoid } from "nanoid";
import UserModel from "../models/user.model";
import { getAllTeamMeetingsForCalendar } from "./teamManager.service";

// Generate a unique calendar feed token for a team manager
export const generateCalendarToken = async (userId: string) => {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Generate a unique token
  const token = nanoid(32);

  // Update user with the new token
  user.calendarFeedToken = token;
  user.calendarFeedEnabled = true;
  await user.save();

  return {
    token,
    feedUrl: `/api/calendar/feed/${token}`,
  };
};

// Revoke the calendar feed token
export const revokeCalendarToken = async (userId: string) => {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  user.calendarFeedToken = undefined;
  user.calendarFeedEnabled = false;
  await user.save();

  return { success: true };
};

// Get calendar feed status
export const getCalendarFeedStatus = async (userId: string) => {
  const user = await UserModel.findById(userId).select("calendarFeedToken calendarFeedEnabled");
  if (!user) {
    throw new Error("User not found");
  }

  return {
    enabled: user.calendarFeedEnabled || false,
    hasToken: !!user.calendarFeedToken,
    feedUrl: user.calendarFeedToken ? `/api/calendar/feed/${user.calendarFeedToken}` : null,
  };
};

// Get calendar feed by token (public access)
export const getCalendarFeedByToken = async (token: string) => {
  // Find user by calendar feed token
  const user = await UserModel.findOne({
    calendarFeedToken: token,
    calendarFeedEnabled: true,
    isDeleted: false,
  });

  if (!user) {
    return null;
  }

  // Get all meetings for this team manager
  const meetings = await getAllTeamMeetingsForCalendar(user._id.toString());

  // Convert to iCalendar format
  return formatMeetingsToICal(meetings, user.firstName, user.lastName);
};

// Format date to iCalendar format (YYYYMMDDTHHMMSSZ)
const formatDateToICal = (date: Date): string => {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
};

// Escape special characters in iCalendar text
const escapeICalText = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
};

// Format meetings to iCalendar format
const formatMeetingsToICal = (
  meetings: any[],
  managerFirstName: string,
  managerLastName: string
): string => {
  const calendarName = `${managerFirstName} ${managerLastName}'s Team Meetings`;
  const now = formatDateToICal(new Date());

  let ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scan2Card//Team Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICalText(calendarName)}`,
    "X-WR-TIMEZONE:UTC",
  ];

  for (const meeting of meetings) {
    const uid = `meeting_${meeting._id}@scan2card`;
    const startAt = formatDateToICal(new Date(meeting.startAt));
    const endAt = formatDateToICal(new Date(meeting.endAt));

    // Build description
    const descriptionParts = [];
    if (meeting.description) {
      descriptionParts.push(meeting.description);
    }
    descriptionParts.push(`Lead: ${meeting.lead.firstName} ${meeting.lead.lastName}`);
    if (meeting.lead.company) {
      descriptionParts.push(`Company: ${meeting.lead.company}`);
    }
    if (meeting.lead.email) {
      descriptionParts.push(`Email: ${meeting.lead.email}`);
    }
    descriptionParts.push(`Mode: ${meeting.meetingMode}`);
    descriptionParts.push(`Created by: ${meeting.createdBy.firstName} ${meeting.createdBy.lastName}`);
    if (meeting.eventName) {
      descriptionParts.push(`Event: ${meeting.eventName}`);
    }

    const description = escapeICalText(descriptionParts.join("\n"));

    // Determine location
    let location = "";
    if (meeting.meetingMode === "offline" && meeting.location) {
      location = meeting.location;
    } else if (meeting.meetingMode === "online") {
      location = "Online Meeting";
    } else if (meeting.meetingMode === "phone") {
      location = "Phone Call";
    }

    // Determine status
    const status = meeting.meetingStatus === "cancelled" ? "CANCELLED" : "CONFIRMED";

    ical.push("BEGIN:VEVENT");
    ical.push(`UID:${uid}`);
    ical.push(`DTSTAMP:${now}`);
    ical.push(`DTSTART:${startAt}`);
    ical.push(`DTEND:${endAt}`);
    ical.push(`SUMMARY:${escapeICalText(meeting.title)}`);
    ical.push(`DESCRIPTION:${description}`);
    if (location) {
      ical.push(`LOCATION:${escapeICalText(location)}`);
    }
    ical.push(`STATUS:${status}`);
    ical.push("END:VEVENT");
  }

  ical.push("END:VCALENDAR");

  return ical.join("\r\n");
};
