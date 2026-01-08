import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as rsvpService from "../services/rsvp.service";
import { sanitizeEmptyStrings } from "../utils/sanitize.util";

// Create RSVP by License Key
export const createRsvp = async (req: AuthRequest, res: Response) => {
  try {
    const { rsvpLicenseKey } = req.body;
    const userId = req.user?._id;

    // Input validation
    if (!rsvpLicenseKey || typeof rsvpLicenseKey !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'License key is required and must be a string',
      });
    }

    const trimmedKey = rsvpLicenseKey.trim();
    if (trimmedKey.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'License key cannot be empty',
      });
    }

    if (trimmedKey.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'License key must not exceed 100 characters',
      });
    }

    const sanitizedData = sanitizeEmptyStrings({
      userId: userId!,
      rsvpLicenseKey: trimmedKey.toUpperCase(),
    });

    const rsvp = await rsvpService.createRsvp(sanitizedData);

    res.status(201).json({
      success: true,
      message: "Successfully registered for the event",
      data: { rsvp },
    });
  } catch (error: any) {
    console.error("Error creating RSVP:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to register for event",
    });
  }
};

// Get User's RSVPs
export const getMyRsvps = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const sanitizedQuery = sanitizeEmptyStrings({ search: req.query.search });
    const search = (sanitizedQuery.search as string)?.trim() || "";
    const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;

    // Input validation
    if (page < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page must be greater than or equal to 1',
      });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 100',
      });
    }

    if (search && search.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Search term must not exceed 100 characters',
      });
    }

    const result = await rsvpService.getUserRsvps(userId!, page, limit, search, isActive);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching RSVPs:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch RSVPs",
    });
  }
};

// Get Event RSVPs (For Exhibitors)
export const getEventRsvps = async (req: AuthRequest, res: Response) => {
  try {
    const { eventId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const exhibitorId = req.user?._id;

    const result = await rsvpService.getEventRsvps(
      eventId,
      exhibitorId!,
      page,
      limit
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching event RSVPs:", error);

    if (error.message === "Event not found or access denied") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch event RSVPs",
    });
  }
};

// Cancel RSVP
export const cancelRsvp = async (req: AuthRequest, res: Response) => {
  try {
    const { rsvpId } = req.params;
    const userId = req.user?._id;

    await rsvpService.cancelRsvp(rsvpId, userId!);

    res.status(200).json({
      success: true,
      message: "RSVP cancelled successfully",
    });
  } catch (error: any) {
    console.error("Error cancelling RSVP:", error);

    if (error.message === "RSVP not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel RSVP",
    });
  }
};

// Get RSVP Details
export const getRsvpById = async (req: AuthRequest, res: Response) => {
  try {
    const { rsvpId } = req.params;
    const userId = req.user?._id;

    const rsvp = await rsvpService.getRsvpById(rsvpId, userId!);

    res.status(200).json({
      success: true,
      data: { rsvp },
    });
  } catch (error: any) {
    console.error("Error fetching RSVP:", error);

    if (error.message === "RSVP not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch RSVP details",
    });
  }
};

// Validate License Key (Before Registration)
export const validateLicenseKey = async (req: AuthRequest, res: Response) => {
  try {
    const { licenseKey } = req.body;

    // Input validation
    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'License key is required and must be a string',
      });
    }

    const trimmedKey = licenseKey.trim();
    if (trimmedKey.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'License key cannot be empty',
      });
    }

    if (trimmedKey.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'License key must not exceed 100 characters',
      });
    }

    const sanitizedData = sanitizeEmptyStrings({ licenseKey: trimmedKey.toUpperCase() });
    const result = await rsvpService.validateLicenseKey(sanitizedData.licenseKey);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error validating license key:", error);

    if (error.message.includes("Invalid") || error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to validate license key",
    });
  }
};
