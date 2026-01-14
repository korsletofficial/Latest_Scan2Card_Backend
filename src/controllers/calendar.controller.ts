import { Response, Request } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as calendarService from "../services/calendar.service";

// Generate calendar feed token
export const generateToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await calendarService.generateCalendarToken(userId);

    // Build full URL with host
    const protocol = req.protocol;
    const host = req.get("host");
    const fullFeedUrl = `${protocol}://${host}${result.feedUrl}`;

    return res.status(200).json({
      success: true,
      message: "Calendar feed token generated successfully",
      data: {
        token: result.token,
        feedUrl: fullFeedUrl,
        webcalUrl: fullFeedUrl.replace(/^https?:/, "webcal:"),
      },
    });
  } catch (error: any) {
    console.error("Generate calendar token error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate calendar token",
    });
  }
};

// Revoke calendar feed token
export const revokeToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    await calendarService.revokeCalendarToken(userId);

    return res.status(200).json({
      success: true,
      message: "Calendar feed token revoked successfully",
    });
  } catch (error: any) {
    console.error("Revoke calendar token error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to revoke calendar token",
    });
  }
};

// Get calendar feed status
export const getFeedStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const status = await calendarService.getCalendarFeedStatus(userId);

    // Build full URL if feed URL exists
    let fullFeedUrl = null;
    let webcalUrl = null;
    if (status.feedUrl) {
      const protocol = req.protocol;
      const host = req.get("host");
      fullFeedUrl = `${protocol}://${host}${status.feedUrl}`;
      webcalUrl = fullFeedUrl.replace(/^https?:/, "webcal:");
    }

    return res.status(200).json({
      success: true,
      data: {
        enabled: status.enabled,
        hasToken: status.hasToken,
        feedUrl: fullFeedUrl,
        webcalUrl: webcalUrl,
      },
    });
  } catch (error: any) {
    console.error("Get feed status error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get calendar feed status",
    });
  }
};

// Get calendar feed (public endpoint - no auth required)
export const getCalendarFeed = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token is required",
      });
    }

    const icalData = await calendarService.getCalendarFeedByToken(token);

    if (!icalData) {
      return res.status(404).json({
        success: false,
        message: "Calendar feed not found or disabled",
      });
    }

    // Set headers for iCalendar response
    res.set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="team-meetings.ics"',
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });

    return res.send(icalData);
  } catch (error: any) {
    console.error("Get calendar feed error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get calendar feed",
    });
  }
};
