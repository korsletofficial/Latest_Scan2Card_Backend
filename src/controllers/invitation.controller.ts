import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as invitationService from "../services/invitation.service";

// Get all team managers for the logged-in exhibitor
export const getTeamManagers = async (req: AuthRequest, res: Response) => {
  try {
    const exhibitorId = req.user?.userId;

    const teamManagers = await invitationService.getTeamManagersForExhibitor(
      exhibitorId!
    );

    return res.status(200).json({
      success: true,
      message: "Team managers retrieved successfully",
      data: { teamManagers },
    });
  } catch (error: any) {
    console.error("❌ Get team managers error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve team managers",
    });
  }
};

// Send invitations to recipients
export const sendInvitations = async (req: AuthRequest, res: Response) => {
  try {
    const { subject, message, recipients, channel = "email" } = req.body;
    const exhibitorId = req.user?.userId;

    // Validate required fields
    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject is required",
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one recipient is required",
      });
    }

    // Validate subject length (max 200)
    if (subject.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Subject must not exceed 200 characters",
      });
    }

    // Validate message length (max 5000)
    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Message must not exceed 5000 characters",
      });
    }

    // Validate channel
    if (!["email", "whatsapp"].includes(channel)) {
      return res.status(400).json({
        success: false,
        message: "Invalid channel. Must be 'email' or 'whatsapp'",
      });
    }

    // Validate recipients count (max 50)
    if (recipients.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Maximum 50 recipients allowed per invitation",
      });
    }

    const result = await invitationService.sendInvitations({
      exhibitorId: exhibitorId!,
      subject: subject.trim(),
      message: message.trim(),
      recipients,
      channel,
    });

    return res.status(200).json({
      success: true,
      message:
        result.sent > 0
          ? `Invitations sent successfully to ${result.sent} recipient(s)`
          : "No invitations were sent",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Send invitations error:", error);

    if (error.message === "WhatsApp invitations are not yet implemented") {
      return res.status(501).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Exhibitor not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "No valid email addresses provided") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send invitations",
    });
  }
};
