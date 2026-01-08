import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as eventService from "../services/event.service";
import { sanitizeEmptyStrings } from "../utils/sanitize.util";

// Create Event (Exhibitor only)
export const createEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { eventName, description, type, startDate, endDate, location } = req.body;
    const exhibitorId = req.user?.userId;

    // Validation - Required fields
    if (!eventName || !type || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "eventName, type, startDate, and endDate are required",
      });
    }

    // Validate eventName length (3-200)
    if (String(eventName).length < 3 || String(eventName).length > 200) {
      return res.status(400).json({
        success: false,
        message: "eventName must be between 3 and 200 characters",
      });
    }

    // Validate description length (max 2000)
    if (description && String(description).length > 2000) {
      return res.status(400).json({
        success: false,
        message: "description must not exceed 2000 characters",
      });
    }

    // Validate event type
    if (!["Offline", "Online", "Hybrid"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be Offline, Online, or Hybrid",
      });
    }

    // Validate location fields if provided
    if (location) {
      if (location.venue && String(location.venue).length > 150) {
        return res.status(400).json({
          success: false,
          message: "Location venue must not exceed 150 characters",
        });
      }
      if (location.address && String(location.address).length > 300) {
        return res.status(400).json({
          success: false,
          message: "Location address must not exceed 300 characters",
        });
      }
      if (location.city && String(location.city).length > 100) {
        return res.status(400).json({
          success: false,
          message: "Location city must not exceed 100 characters",
        });
      }
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check if dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    // Get today's date at midnight (in local timezone, treated as UTC for comparison)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Allow start date to be today or in the future
    if (start < today) {
      return res.status(400).json({
        success: false,
        message: "Event start date must be today or in the future",
      });
    }

    if (end < start) {
      return res.status(400).json({
        success: false,
        message: "End date must be after or equal to start date",
      });
    }

    const sanitizedData = sanitizeEmptyStrings({
      exhibitorId: exhibitorId!,
      eventName,
      description,
      type,
      startDate: start,
      endDate: end,
      location,
    });

    const event = await eventService.createEvent(sanitizedData);

    return res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: event,
    });
  } catch (error: any) {
    console.error("❌ Create event error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create event",
    });
  }
};

// Get all events for exhibitor
export const getEvents = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const exhibitorId = req.user?.userId;

    const result = await eventService.getEvents(
      exhibitorId!,
      Number(page),
      Number(limit),
      search as string
    );

    return res.status(200).json({
      success: true,
      message: "Events retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get events error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve events",
    });
  }
};

// Get single event by ID
export const getEventById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const exhibitorId = req.user?.userId;

    const event = await eventService.getEventById(id, exhibitorId!);

    return res.status(200).json({
      success: true,
      message: "Event retrieved successfully",
      data: event,
    });
  } catch (error: any) {
    console.error("❌ Get event error:", error);
    return res.status(error.message === "Event not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to retrieve event",
    });
  }
};

// Update event
export const updateEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { eventName, description, type, startDate, endDate, location, isActive } = req.body;
    const exhibitorId = req.user?.userId;

    // Validate event type if provided
    if (type && !["Offline", "Online", "Hybrid"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be Offline, Online, or Hybrid",
      });
    }

    const sanitizedData = sanitizeEmptyStrings({
      eventName,
      description,
      type,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      location,
      isActive,
    });

    const event = await eventService.updateEvent(id, exhibitorId!, sanitizedData);

    return res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: event,
    });
  } catch (error: any) {
    console.error("❌ Update event error:", error);

    if (error.message === "Event not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update event",
    });
  }
};

// Delete event (soft delete)
export const deleteEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const exhibitorId = req.user?.userId;

    await eventService.deleteEvent(id, exhibitorId!);

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error: any) {
    console.error("❌ Delete event error:", error);
    return res.status(error.message === "Event not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to delete event",
    });
  }
};

// Generate license key for event
export const generateLicenseKeyForEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { stallName, email, maxActivations = 1, expiresAt } = req.body;
    const exhibitorId = req.user?.userId;

    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Email length and format validation (255 chars max)
    if (String(email).length > 255) {
      return res.status(400).json({
        success: false,
        message: "Email must not exceed 255 characters",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email))) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Validate stallName if provided (150 chars max)
    if (stallName && String(stallName).length > 150) {
      return res.status(400).json({
        success: false,
        message: "stallName must not exceed 150 characters",
      });
    }

    // Validate maxActivations (1-10000)
    const maxAct = Number(maxActivations);
    if (isNaN(maxAct) || maxAct < 1 || maxAct > 10000) {
      return res.status(400).json({
        success: false,
        message: "maxActivations must be between 1 and 10000",
      });
    }

    // Validate expiration date
    if (!expiresAt) {
      return res.status(400).json({
        success: false,
        message: "Expiration date is required",
      });
    }

    const expirationDate = new Date(expiresAt);
    if (isNaN(expirationDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid expiration date format",
      });
    }

    // Set expiration to end of day in IST (23:59:59.999 IST = 18:29:59.999 UTC)
    // IST is UTC+5:30, so we set UTC hours to 18:29:59.999 to get 23:59:59.999 IST
    expirationDate.setUTCHours(18, 29, 59, 999);

    // Get today's date at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expirationDate < today) {
      return res.status(400).json({
        success: false,
        message: "Expiration date must be today or in the future",
      });
    }

    const sanitizedData = sanitizeEmptyStrings({
      stallName,
      email,
      maxActivations: maxAct,
      expiresAt: expirationDate,
    });

    const result = await eventService.generateLicenseKeyForEvent(id, exhibitorId!, sanitizedData);

    return res.status(201).json({
      success: true,
      message: "License key generated and team manager created successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Generate license key error:", error);
    return res.status(error.message === "Event not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to generate license key",
    });
  }
};

// Bulk generate license keys from CSV
export const bulkGenerateLicenseKeys = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { licenseKeys } = req.body;
    const exhibitorId = req.user?.userId;

    if (!licenseKeys || !Array.isArray(licenseKeys) || licenseKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: "License keys array is required",
      });
    }

    // Sanitize each license key object in the array
    const sanitizedLicenseKeys = licenseKeys.map((key: any) => sanitizeEmptyStrings(key));

    const result = await eventService.bulkGenerateLicenseKeys(
      id,
      exhibitorId!,
      sanitizedLicenseKeys
    );

    return res.status(201).json({
      success: true,
      message: `Successfully generated ${result.totalGenerated} license keys`,
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Bulk generate license keys error:", error);
    return res.status(error.message === "Event not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to generate license keys",
    });
  }
};

// Get license keys for an event
export const getLicenseKeys = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const exhibitorId = req.user?.userId;

    const result = await eventService.getLicenseKeys(id, exhibitorId!);

    return res.status(200).json({
      success: true,
      message: "License keys retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get license keys error:", error);
    return res.status(error.message === "Event not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to retrieve license keys",
    });
  }
};

// Get exhibitor dashboard stats
export const getExhibitorDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const exhibitorId = req.user?.userId;

    const stats = await eventService.getExhibitorDashboardStats(exhibitorId!);

    return res.status(200).json({
      success: true,
      message: "Dashboard stats retrieved successfully",
      data: stats,
    });
  } catch (error: any) {
    console.error("❌ Get exhibitor dashboard stats error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve dashboard stats",
    });
  }
};

// Get top events by leads
export const getTopEventsByLeads = async (req: AuthRequest, res: Response) => {
  try {
    const exhibitorId = req.user?.userId;
    const limit = Number(req.query.limit) || 5;

    const topEvents = await eventService.getTopEventsByLeads(exhibitorId!, limit);

    return res.status(200).json({
      success: true,
      message: "Top events retrieved successfully",
      data: { topEvents },
    });
  } catch (error: any) {
    console.error("❌ Get top events error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve top events",
    });
  }
};

// Get leads trend
export const getLeadsTrend = async (req: AuthRequest, res: Response) => {
  try {
    const exhibitorId = req.user?.userId;
    const days = Number(req.query.days) || 30;

    const result = await eventService.getLeadsTrend(exhibitorId!, days);

    return res.status(200).json({
      success: true,
      message: "Leads trend retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get leads trend error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve leads trend",
    });
  }
};

// Get event performance (bar graph data)
export const getEventPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const exhibitorId = req.user?.userId;
    const limit = Number(req.query.limit) || 10;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    // Set end date to end of day if provided
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }
    // Set start date to beginning of day if provided
    if (startDate) {
      startDate.setHours(0, 0, 0, 0);
    }

    const result = await eventService.getEventPerformance(exhibitorId!, limit, startDate, endDate);

    return res.status(200).json({
      success: true,
      message: "Event performance retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get event performance error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve event performance",
    });
  }
};

// Get stall performance (bar graph data)
export const getStallPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const exhibitorId = req.user?.userId;
    const eventId = req.query.eventId as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    // Set end date to end of day if provided
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }
    // Set start date to beginning of day if provided
    if (startDate) {
      startDate.setHours(0, 0, 0, 0);
    }

    const result = await eventService.getStallPerformance(exhibitorId!, eventId, startDate, endDate);

    return res.status(200).json({
      success: true,
      message: "Stall performance retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get stall performance error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve stall performance",
    });
  }
};
