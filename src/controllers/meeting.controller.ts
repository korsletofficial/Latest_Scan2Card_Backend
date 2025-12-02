import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as meetingService from "../services/meeting.service";

// Create Meeting
export const createMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const {
      leadId,
      eventId,
      title,
      description,
      meetingMode,
      startAt,
      endAt,
      location,
      notifyAttendees,
    } = req.body;
    const userId = req.user?.userId;

    // Validation
    if (!leadId || !title || !meetingMode || !startAt || !endAt) {
      return res.status(400).json({
        success: false,
        message: "leadId, title, meetingMode, startAt, and endAt are required",
      });
    }

    // Validate that startAt is before endAt
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: "startAt must be before endAt",
      });
    }

    const meeting = await meetingService.createMeeting({
      userId: userId!,
      leadId,
      eventId,
      title,
      description,
      meetingMode,
      startAt: startDate,
      endAt: endDate,
      location,
      notifyAttendees,
    });

    return res.status(201).json({
      success: true,
      message: "Meeting scheduled successfully",
      data: meeting,
    });
  } catch (error: any) {
    console.error("❌ Create meeting error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to schedule meeting",
    });
  }
};

// Get All Meetings (with pagination and filters)
export const getMeetings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const {
      page = 1,
      limit = 10,
      leadId,
      eventId,
      meetingStatus,
      meetingMode,
    } = req.query;

    const result = await meetingService.getMeetings({
      userId: userId!,
      leadId: leadId as string,
      eventId: eventId as string,
      meetingStatus: meetingStatus as string,
      meetingMode: meetingMode as string,
      page: Number(page),
      limit: Number(limit),
    });

    return res.status(200).json({
      success: true,
      data: result.meetings,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error("❌ Get meetings error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve meetings",
    });
  }
};

// Get Meeting by ID
export const getMeetingById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const meeting = await meetingService.getMeetingById(id, userId!);

    return res.status(200).json({
      success: true,
      data: meeting,
    });
  } catch (error: any) {
    console.error("❌ Get meeting by ID error:", error);
    return res.status(error.message === "Meeting not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to retrieve meeting",
    });
  }
};

// Update Meeting
export const updateMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const {
      title,
      description,
      meetingMode,
      meetingStatus,
      startAt,
      endAt,
      location,
      notifyAttendees,
      isActive,
    } = req.body;

    // Validate that startAt is before endAt if both are provided
    if (startAt && endAt) {
      const startDate = new Date(startAt);
      const endDate = new Date(endAt);

      if (startDate >= endDate) {
        return res.status(400).json({
          success: false,
          message: "startAt must be before endAt",
        });
      }
    }

    const meeting = await meetingService.updateMeeting(id, userId!, {
      title,
      description,
      meetingMode,
      meetingStatus,
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
      location,
      notifyAttendees,
      isActive,
    });

    return res.status(200).json({
      success: true,
      message: "Meeting updated successfully",
      data: meeting,
    });
  } catch (error: any) {
    console.error("❌ Update meeting error:", error);
    return res.status(error.message === "Meeting not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to update meeting",
    });
  }
};

// Delete Meeting (soft delete)
export const deleteMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    await meetingService.deleteMeeting(id, userId!);

    return res.status(200).json({
      success: true,
      message: "Meeting deleted successfully",
    });
  } catch (error: any) {
    console.error("❌ Delete meeting error:", error);
    return res.status(error.message === "Meeting not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to delete meeting",
    });
  }
};
