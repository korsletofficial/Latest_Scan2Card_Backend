import { NextFunction, Request, Response } from "express";
import { registerUser } from "../services/auth.service";
import * as adminService from "../services/admin.service";
import { sanitizeEmptyStrings } from "../utils/sanitize.util";

type CreateExhibitorBody = {
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  companyName?: string;
  password?: string;
  address?: string;
};

const REQUIRED_FIELDS: Array<keyof CreateExhibitorBody> = ["firstName", "lastName"];

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const generateRandomPassword = (length = 12) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@$%*?";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const sanitizeUser = (user: unknown) => {
  if (!user) return user;
  if (typeof user === "object" && user !== null) {
    const plain =
      typeof (user as any).toJSON === "function" ? (user as any).toJSON() : { ...(user as Record<string, unknown>) };
    delete (plain as Record<string, unknown>).password;
    delete (plain as Record<string, unknown>).salt;
    return plain;
  }
  return user;
};

export const createExhibitor = async (
  req: Request<unknown, unknown, CreateExhibitorBody>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { firstName, lastName, email, phoneNumber, companyName, password, address } = req.body;

    // Validate required fields
    const missingFields = REQUIRED_FIELDS.filter((field) => !req.body?.[field]);
    if (missingFields.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required field(s): ${missingFields.join(", ")}`,
      });
    }

    // Validate at least one contact method
    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "At least one of email or phoneNumber must be provided",
      });
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format",
        });
      }
    }

    // Validate password length if provided
    if (password && password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const normalizedEmail = email ? normalizeEmail(email) : undefined;
    const finalPassword = password || generateRandomPassword();

    const sanitizedData = sanitizeEmptyStrings({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      ...(normalizedEmail && { email: normalizedEmail }),
      ...(phoneNumber && { phoneNumber: phoneNumber.trim() }),
      ...(companyName && { companyName: companyName.trim() }),
      password: finalPassword,
      roleName: "EXHIBITOR" as const,
    });

    const exhibitor = await registerUser(sanitizedData as any);

    const responsePayload: Record<string, unknown> = {
      success: true,
      message: "Exhibitor created successfully",
      data: sanitizeUser(exhibitor),
    };

    if (!password) {
      responsePayload.temporaryPassword = finalPassword;
    }

    return res.status(201).json(responsePayload);
  } catch (error: any) {
    console.error("❌ Create exhibitor error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create exhibitor",
    });
  }
};

// Get all exhibitors
export const getExhibitors = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const result = await adminService.getExhibitors(
      Number(page),
      Number(limit),
      search as string
    );

    return res.status(200).json({
      success: true,
      message: "Exhibitors retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get exhibitors error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve exhibitors",
    });
  }
};

// Get single exhibitor by ID
export const getExhibitorById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const exhibitor = await adminService.getExhibitorById(id);

    return res.status(200).json({
      success: true,
      message: "Exhibitor retrieved successfully",
      data: exhibitor,
    });
  } catch (error: any) {
    console.error("❌ Get exhibitor error:", error);
    return res.status(error.message === "Exhibitor not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to retrieve exhibitor",
    });
  }
};

// Update exhibitor
export const updateExhibitor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phoneNumber, companyName, password, address, isActive } = req.body;

    const sanitizedData = sanitizeEmptyStrings({
      firstName,
      lastName,
      email,
      phoneNumber,
      companyName,
      password,
      address,
      isActive,
    });

    const updatedExhibitor = await adminService.updateExhibitor(id, sanitizedData);

    return res.status(200).json({
      success: true,
      message: "Exhibitor updated successfully",
      data: updatedExhibitor,
    });
  } catch (error: any) {
    console.error("❌ Update exhibitor error:", error);

    if (error.message === "Exhibitor not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update exhibitor",
    });
  }
};

// Delete exhibitor (soft delete)
export const deleteExhibitor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await adminService.deleteExhibitor(id);

    return res.status(200).json({
      success: true,
      message: "Exhibitor deleted successfully",
    });
  } catch (error: any) {
    console.error("❌ Delete exhibitor error:", error);
    return res.status(error.message === "Exhibitor not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to delete exhibitor",
    });
  }
};

// Get dashboard stats
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const stats = await adminService.getDashboardStats();

    return res.status(200).json({
      success: true,
      message: "Dashboard stats retrieved successfully",
      data: stats,
    });
  } catch (error: any) {
    console.error("❌ Get dashboard stats error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve dashboard stats",
    });
  }
};

// Get events trend only
export const getEventsTrend = async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;

    const result = await adminService.getEventsTrend(Number(days));

    return res.status(200).json({
      success: true,
      message: "Events trend retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get events trend error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve events trend",
    });
  }
};

// Get leads trend only
export const getLeadsTrend = async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;

    const result = await adminService.getLeadsTrend(Number(days));

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

// Get license keys trend only
export const getLicenseKeysTrend = async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;

    const result = await adminService.getLicenseKeysTrend(Number(days));

    return res.status(200).json({
      success: true,
      message: "License keys trend retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get license keys trend error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve license keys trend",
    });
  }
};

// Get all license keys for a specific exhibitor
export const getExhibitorKeys = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await adminService.getExhibitorKeys(id);

    return res.status(200).json({
      success: true,
      message: "Exhibitor keys retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get exhibitor keys error:", error);
    return res.status(error.message === "Exhibitor not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to retrieve exhibitor keys",
    });
  }
};

// Update Payment Status for a License Key
export const updateKeyPaymentStatus = async (req: Request, res: Response) => {
  try {
    const { eventId, keyId } = req.params;
    const { paymentStatus } = req.body;

    const sanitizedData = sanitizeEmptyStrings({ paymentStatus });

    const result = await adminService.updateKeyPaymentStatus(
      eventId,
      keyId,
      sanitizedData.paymentStatus
    );

    return res.status(200).json({
      success: true,
      message: `Payment status updated to ${paymentStatus}`,
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Update payment status error:", error);

    if (error.message === "Event or license key not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update payment status",
    });
  }
};

export const getTopPerformers = async (req: Request, res: Response) => {
  try {
    const result = await adminService.getTopPerformers();

    return res.status(200).json({
      success: true,
      message: "Top performers retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get top performers error:", error);
    return res.status(error.message === "Exhibitor role not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to retrieve top performers",
    });
  }
};
