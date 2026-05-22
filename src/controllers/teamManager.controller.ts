import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as teamManagerService from "../services/teamManager.service";

// Get all meetings for team manager's team members
export const getTeamMeetings = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const {
      page = 1,
      limit = 10,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await teamManagerService.getTeamMeetings(
      teamManagerId!,
      Number(page),
      Number(limit),
      sortBy as 'startAt' | 'createdAt' | undefined,
      sortOrder as 'asc' | 'desc' | undefined
    );

    res.status(200).json({
      success: true,
      data: result.meetings,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error("❌ Get team meetings error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get team meetings",
    });
  }
};

// Get all leads for manager
export const getAllLeadsForManager = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { eventId, memberId, page = 1, limit = 10, search = "", licenseKey = "" } = req.query;

    const result = await teamManagerService.getAllLeadsForManager(
      teamManagerId!,
      eventId as string,
      memberId as string,
      Number(page),
      Number(limit),
      search as string,
      licenseKey as string
    );

    res.status(200).json({
      success: true,
      data: result.leads,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error("❌ Get all manager leads error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get all manager leads",
    });
  }
};

// Get leads for a specific team member
export const getMemberLeads = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { memberId } = req.params;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required",
      });
    }

    const leads = await teamManagerService.getMemberLeads(
      teamManagerId!,
      memberId
    );

    res.status(200).json({
      success: true,
      data: leads,
    });
  } catch (error: any) {
    console.error("❌ Get member leads error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get member leads",
    });
  }
};

// Get team manager dashboard stats
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;

    const stats = await teamManagerService.getDashboardStats(teamManagerId!);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error("❌ Get dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get dashboard stats",
    });
  }
};

// Get leads graph data (hourly or daily)
export const getLeadsGraph = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { eventId, period = "hourly" } = req.query;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const graphData = await teamManagerService.getLeadsGraph(
      teamManagerId!,
      eventId as string,
      period as string
    );

    res.status(200).json({
      success: true,
      data: graphData,
    });
  } catch (error: any) {
    console.error("❌ Get leads graph error:", error);

    if (error.message === "Event not found or access denied") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to get leads graph",
    });
  }
};

// Get team members with their lead count
export const getTeamMembers = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { page = 1, limit = 10, search = "" } = req.query;

    // Validate pagination parameters
    const pageNum = Number(page);
    const limitNum = Number(limit);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: "Page must be a positive number",
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: "Limit must be between 1 and 100",
      });
    }

    // Validate search parameter length (max 100 chars)
    if (search && String(search).length > 100) {
      return res.status(400).json({
        success: false,
        message: "Search term must not exceed 100 characters",
      });
    }

    const result = await teamManagerService.getTeamMembers(
      teamManagerId!,
      pageNum,
      limitNum,
      search as string
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get team members error:", error);

    if (error.message === "Team manager not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to get team members",
    });
  }
};

// Get team manager's events
export const getMyEvents = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;

    const events = await teamManagerService.getMyEvents(teamManagerId!);

    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    console.error("❌ Get my events error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get events",
    });
  }
};

// Get all license keys for team manager
export const getAllLicenseKeys = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { page = 1, limit = 10, search = "" } = req.query;

    const result = await teamManagerService.getAllLicenseKeys(
      teamManagerId!,
      Number(page),
      Number(limit),
      search as string
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get all license keys error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get license keys",
    });
  }
};

// Revoke event access for a team member
export const revokeEventAccess = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { memberId } = req.params;
    const { eventId } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required",
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const rsvp = await teamManagerService.revokeEventAccess(
      teamManagerId!,
      memberId,
      eventId
    );

    res.status(200).json({
      success: true,
      message: "Event access revoked successfully",
      data: rsvp,
    });
  } catch (error: any) {
    console.error("❌ Revoke event access error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("already revoked")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to revoke event access",
    });
  }
};

// Restore event access for a team member
export const restoreEventAccess = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { memberId } = req.params;
    const { eventId } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required",
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const rsvp = await teamManagerService.restoreEventAccess(
      teamManagerId!,
      memberId,
      eventId
    );

    res.status(200).json({
      success: true,
      message: "Event access restored successfully",
      data: rsvp,
    });
  } catch (error: any) {
    console.error("❌ Restore event access error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("not revoked")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to restore event access",
    });
  }
};

// Get team member's events with revocation status
export const getTeamMemberEvents = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { memberId } = req.params;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required",
      });
    }

    const events = await teamManagerService.getTeamMemberEvents(
      teamManagerId!,
      memberId
    );

    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    console.error("❌ Get team member events error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to get team member events",
    });
  }
};

// ==========================================
// MEETING PERMISSION MANAGEMENT CONTROLLERS
// ==========================================

// Revoke meeting permission for a SINGLE team member
export const revokeMeetingPermission = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { memberId } = req.params;
    const { eventId } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required",
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const rsvp = await teamManagerService.revokeMeetingPermission(
      teamManagerId!,
      memberId,
      eventId
    );

    res.status(200).json({
      success: true,
      message: "Meeting permission revoked successfully",
      data: rsvp,
    });
  } catch (error: any) {
    console.error("❌ Revoke meeting permission error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("already revoked")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to revoke meeting permission",
    });
  }
};

// Restore meeting permission for a SINGLE team member
export const restoreMeetingPermission = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { memberId } = req.params;
    const { eventId } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required",
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const rsvp = await teamManagerService.restoreMeetingPermission(
      teamManagerId!,
      memberId,
      eventId
    );

    res.status(200).json({
      success: true,
      message: "Meeting permission restored successfully",
      data: rsvp,
    });
  } catch (error: any) {
    console.error("❌ Restore meeting permission error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("not revoked")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to restore meeting permission",
    });
  }
};

// Bulk revoke meeting permission for ALL team members by license key
export const bulkRevokeMeetingPermission = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { eventId, licenseKey } = req.body;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        message: "License key is required",
      });
    }

    const result = await teamManagerService.bulkRevokeMeetingPermissionByLicenseKey(
      teamManagerId!,
      eventId,
      licenseKey
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Bulk revoke meeting permission error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to bulk revoke meeting permission",
    });
  }
};

// Bulk restore meeting permission for ALL team members by license key
export const bulkRestoreMeetingPermission = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { eventId, licenseKey } = req.body;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        message: "License key is required",
      });
    }

    const result = await teamManagerService.bulkRestoreMeetingPermissionByLicenseKey(
      teamManagerId!,
      eventId,
      licenseKey
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Bulk restore meeting permission error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to bulk restore meeting permission",
    });
  }
};

// Get license key meeting permission status
export const getLicenseKeyMeetingPermissionStatus = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { eventId, licenseKey } = req.query;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        message: "License key is required",
      });
    }

    const status = await teamManagerService.getLicenseKeyMeetingPermissionStatus(
      teamManagerId!,
      eventId as string,
      licenseKey as string
    );

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error("❌ Get license key meeting permission status error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to get license key meeting permission status",
    });
  }
};

// ==========================================
// CALENDAR PERMISSION MANAGEMENT CONTROLLERS
// ==========================================

// Grant calendar permission to a team member (allows them to use their own calendar)
export const grantCalendarPermission = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { memberId } = req.params;
    const { eventId } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required",
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const rsvp = await teamManagerService.grantCalendarPermission(
      teamManagerId!,
      memberId,
      eventId
    );

    res.status(200).json({
      success: true,
      message: "Calendar permission granted successfully. Member can now connect their own Google/Outlook calendar.",
      data: rsvp,
    });
  } catch (error: any) {
    console.error("❌ Grant calendar permission error:", error);

    if (error.message.includes("already granted")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to grant calendar permission",
    });
  }
};

// Revoke calendar permission from a team member
export const revokeCalendarPermission = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { memberId } = req.params;
    const { eventId } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required",
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const rsvp = await teamManagerService.revokeCalendarPermission(
      teamManagerId!,
      memberId,
      eventId
    );

    res.status(200).json({
      success: true,
      message: "Calendar permission revoked successfully. Member's meetings will now sync to your calendar.",
      data: rsvp,
    });
  } catch (error: any) {
    console.error("❌ Revoke calendar permission error:", error);

    if (error.message.includes("already revoked")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to revoke calendar permission",
    });
  }
};

// Get license key usage details (who is using it and their lead counts)
export const getLicenseKeyUsageDetails = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const { eventId, licenseKey } = req.query;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        message: "License key is required",
      });
    }

    const usageDetails = await teamManagerService.getLicenseKeyUsageDetails(
      teamManagerId!,
      eventId as string,
      licenseKey as string
    );

    res.status(200).json({
      success: true,
      data: usageDetails,
    });
  } catch (error: any) {
    console.error("❌ Get license key usage details error:", error);

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to get license key usage details",
    });
  }
};

// Get License ROI per license key for the calling Team Manager
export const getLicenseROI = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;

    const result = await teamManagerService.getLicenseROIPerTeamManager(teamManagerId!);

    return res.status(200).json({
      success: true,
      message: "License ROI analytics retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get license ROI error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get license ROI analytics",
    });
  }
};

export const getLeadsMoMGrowth = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId;
    const rawMonths = req.query.months;
    let months = 12;

    if (rawMonths !== undefined) {
      months = parseInt(rawMonths as string, 10);
      if (isNaN(months) || months < 1 || months > 24) {
        return res.status(400).json({
          success: false,
          message: "months must be a number between 1 and 24",
        });
      }
    }

    const result = await teamManagerService.getLeadsMoMGrowth(teamManagerId!, months);

    return res.status(200).json({
      success: true,
      message: "MoM lead growth retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get team manager MoM lead growth error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve MoM lead growth",
    });
  }
};

// ─────────────────────────────────────────────
// NEW ANALYTICS CONTROLLERS
// ─────────────────────────────────────────────

export const getActiveMembersToday = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId!;
    const eventId = req.query.eventId as string | undefined;
    const result = await teamManagerService.getActiveMembersToday(teamManagerId, eventId);
    res.status(200).json({ success: true, message: "Active members today retrieved", data: result });
  } catch (error: any) {
    console.error("❌ getActiveMembersToday error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to retrieve active members" });
  }
};

export const getMeetingOutcomeAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId!;
    const result = await teamManagerService.getMeetingOutcomeAnalytics(teamManagerId);
    res.status(200).json({ success: true, message: "Meeting outcome analytics retrieved", data: result });
  } catch (error: any) {
    console.error("❌ getMeetingOutcomeAnalytics error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to retrieve meeting outcomes" });
  }
};

export const getDuplicateLeadsInTeam = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId!;
    const eventId = req.query.eventId as string | undefined;
    const result = await teamManagerService.getDuplicateLeadsInTeam(teamManagerId, eventId);
    res.status(200).json({ success: true, message: "Duplicate leads in team retrieved", data: result });
  } catch (error: any) {
    console.error("❌ getDuplicateLeadsInTeam error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to retrieve duplicate leads" });
  }
};

export const getStallUnderperformanceAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const teamManagerId = req.user?.userId!;
    const result = await teamManagerService.getStallUnderperformanceAlerts(teamManagerId);
    res.status(200).json({ success: true, message: "Stall underperformance alerts retrieved", data: result });
  } catch (error: any) {
    console.error("❌ getStallUnderperformanceAlerts error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to retrieve stall alerts" });
  }
};

// ─────────────────────────────────────────────
// END NEW ANALYTICS CONTROLLERS
// ─────────────────────────────────────────────
