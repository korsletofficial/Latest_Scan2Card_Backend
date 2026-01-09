import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as meetingService from "../services/meeting.service";
import { sanitizeEmptyStrings } from "../utils/sanitize.util";

// Create Meeting
export const createMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const {
      leadId,
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

    // Validate title
    if (typeof title !== 'string' || title.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Meeting title must be at least 3 characters",
      });
    }

    if (title.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Meeting title must not exceed 200 characters",
      });
    }

    // Validate description if provided
    if (description && typeof description === 'string' && description.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Meeting description must not exceed 2000 characters",
      });
    }

    // Validate meetingMode
    const validModes = ['online', 'offline', 'phone'];
    if (!validModes.includes(meetingMode)) {
      return res.status(400).json({
        success: false,
        message: "Meeting mode must be one of: online, offline, phone",
      });
    }

    // Validate location if mode is offline
    if (meetingMode === 'offline' && !location) {
      return res.status(400).json({
        success: false,
        message: "Location is required for offline meetings",
      });
    }

    if (location && typeof location === 'string' && location.length > 300) {
      return res.status(400).json({
        success: false,
        message: "Location must not exceed 300 characters",
      });
    }

    // Validate that startAt is before endAt
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "startAt and endAt must be valid dates",
      });
    }

    if (startDate < new Date()) {
      return res.status(400).json({
        success: false,
        message: "startAt must be today or in the future",
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: "startAt must be before endAt",
      });
    }

    const sanitizedData = sanitizeEmptyStrings({
      userId: userId!,
      leadId,
      title: title.trim(),
      description,
      meetingMode,
      startAt: startDate,
      endAt: endDate,
      location: location?.trim(),
      notifyAttendees,
    });

    const meeting = await meetingService.createMeeting(sanitizedData);

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
      meetingStatus,
      meetingMode,
      sortBy,
      sortOrder,
    } = req.query;

    // Input validation
    const pageNum = Number(page);
    const limitNum = Number(limit);

    if (pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: "Page must be greater than or equal to 1",
      });
    }

    if (limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: "Limit must be between 1 and 100",
      });
    }

    // Validate sortBy if provided
    if (sortBy && !['startAt', 'createdAt'].includes(sortBy as string)) {
      return res.status(400).json({
        success: false,
        message: "sortBy must be one of: startAt, createdAt",
      });
    }

    // Validate sortOrder if provided
    if (sortOrder && !['asc', 'desc'].includes(sortOrder as string)) {
      return res.status(400).json({
        success: false,
        message: "sortOrder must be one of: asc, desc",
      });
    }

    // Validate meetingMode if provided
    if (meetingMode && !['online', 'offline', 'phone'].includes(meetingMode as string)) {
      return res.status(400).json({
        success: false,
        message: "meetingMode must be one of: online, offline, phone",
      });
    }

    // Validate meetingStatus if provided
    if (meetingStatus && !['scheduled', 'completed', 'cancelled', 'rescheduled'].includes(meetingStatus as string)) {
      return res.status(400).json({
        success: false,
        message: "meetingStatus must be one of: scheduled, completed, cancelled, rescheduled",
      });
    }

    const result = await meetingService.getMeetings({
      userId: userId!,
      leadId: leadId as string,
      meetingStatus: meetingStatus as string,
      meetingMode: meetingMode as string,
      page: pageNum,
      limit: limitNum,
      sortBy: sortBy as "startAt" | "createdAt" | undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
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

    // Validate title if provided
    if (title && (typeof title !== 'string' || title.trim().length < 3)) {
      return res.status(400).json({
        success: false,
        message: "Meeting title must be at least 3 characters",
      });
    }

    if (title && title.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Meeting title must not exceed 200 characters",
      });
    }

    // Validate description if provided
    if (description && typeof description === 'string' && description.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Meeting description must not exceed 2000 characters",
      });
    }

    // Validate meetingMode if provided
    if (meetingMode && !['online', 'offline', 'phone'].includes(meetingMode)) {
      return res.status(400).json({
        success: false,
        message: "Meeting mode must be one of: online, offline, phone",
      });
    }

    // Validate meetingStatus if provided
    if (meetingStatus && !['scheduled', 'completed', 'cancelled', 'rescheduled'].includes(meetingStatus)) {
      return res.status(400).json({
        success: false,
        message: "Meeting status must be one of: scheduled, completed, cancelled, rescheduled",
      });
    }

    // Validate location if provided
    if (location && typeof location === 'string' && location.length > 300) {
      return res.status(400).json({
        success: false,
        message: "Location must not exceed 300 characters",
      });
    }

    // Validate that startAt is before endAt if both are provided
    if (startAt && endAt) {
      const startDate = new Date(startAt);
      const endDate = new Date(endAt);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "startAt and endAt must be valid dates",
        });
      }

      if (startDate >= endDate) {
        return res.status(400).json({
          success: false,
          message: "startAt must be before endAt",
        });
      }
    }

    const sanitizedData = sanitizeEmptyStrings({
      title: title?.trim(),
      description,
      meetingMode,
      meetingStatus,
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
      location: location?.trim(),
      notifyAttendees,
      isActive,
    });

    const meeting = await meetingService.updateMeeting(id, userId!, sanitizedData);

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
