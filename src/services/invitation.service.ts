import EventModel from "../models/event.model";
import UserModel from "../models/user.model";
import { sendCustomInvitationEmail } from "./email.service";

interface TeamManagerInfo {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName?: string;
}

interface SendInvitationsData {
  exhibitorId: string;
  subject: string;
  message: string;
  recipients: string[];
  channel: "email" | "whatsapp";
}

interface SendInvitationsResult {
  sent: number;
  failed: number;
  failedRecipients: string[];
}

// Get all team managers for an exhibitor (from their events' license keys)
export const getTeamManagersForExhibitor = async (
  exhibitorId: string
): Promise<TeamManagerInfo[]> => {
  // Find all events belonging to this exhibitor
  const events = await EventModel.find({
    exhibitorId,
    isDeleted: false,
  }).select("licenseKeys");

  // Extract unique team manager IDs from all license keys
  const teamManagerIds = new Set<string>();
  events.forEach((event) => {
    event.licenseKeys.forEach((lk) => {
      if (lk.teamManagerId) {
        teamManagerIds.add(lk.teamManagerId.toString());
      }
    });
  });

  if (teamManagerIds.size === 0) {
    return [];
  }

  // Get user details for all team managers
  const teamManagers = await UserModel.find({
    _id: { $in: Array.from(teamManagerIds) },
    isDeleted: false,
    isActive: true,
  }).select("_id email firstName lastName companyName");

  return teamManagers.map((tm) => ({
    _id: tm._id.toString(),
    email: tm.email || "",
    firstName: tm.firstName,
    lastName: tm.lastName,
    companyName: tm.companyName,
  }));
};

// Send invitations to recipients
export const sendInvitations = async (
  data: SendInvitationsData
): Promise<SendInvitationsResult> => {
  const { exhibitorId, subject, message, recipients, channel } = data;

  // Validate exhibitor exists
  const exhibitor = await UserModel.findOne({
    _id: exhibitorId,
    isDeleted: false,
    isActive: true,
  }).select("firstName lastName companyName");

  if (!exhibitor) {
    throw new Error("Exhibitor not found");
  }

  // Handle WhatsApp placeholder
  if (channel === "whatsapp") {
    throw new Error("WhatsApp invitations are not yet implemented");
  }

  // Filter out empty/invalid emails
  const validRecipients = recipients.filter((email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return email && emailRegex.test(email.trim());
  });

  if (validRecipients.length === 0) {
    throw new Error("No valid email addresses provided");
  }

  // Send emails to each recipient
  const senderName = `${exhibitor.firstName} ${exhibitor.lastName}`;
  const senderCompany = exhibitor.companyName;

  const results = await Promise.allSettled(
    validRecipients.map((email) =>
      sendCustomInvitationEmail({
        recipientEmail: email.trim(),
        subject,
        message,
        senderName,
        senderCompany,
      })
    )
  );

  // Count successes and failures
  let sent = 0;
  let failed = 0;
  const failedRecipients: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value === true) {
      sent++;
    } else {
      failed++;
      failedRecipients.push(validRecipients[index]);
    }
  });

  return {
    sent,
    failed,
    failedRecipients,
  };
};
