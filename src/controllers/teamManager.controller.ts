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
    const { eventId, memberId, page = 1, limit = 10, search = "" } = req.query;

    const result = await teamManagerService.getAllLeadsForManager(
      teamManagerId!,
      eventId as string,
      memberId as string,
      Number(page),
      Number(limit),
      search as string
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

    const result = await teamManagerService.getTeamMembers(
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
