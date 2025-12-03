import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as feedbackService from "../services/feedback.service";
import { sanitizeEmptyStrings } from "../utils/sanitize.util";

// Get all feedback (Admin only)
export const getAllFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const category = req.query.category as string;

    const result = await feedbackService.getAllFeedback({
      page,
      limit,
      status,
      category,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get all feedback error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get feedback",
    });
  }
};

// Update feedback status (Admin only)
export const updateFeedbackStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const sanitizedData = sanitizeEmptyStrings({ status });
    const feedback = await feedbackService.updateFeedbackStatus(id, sanitizedData.status);

    res.status(200).json({
      success: true,
      message: "Feedback status updated successfully",
      data: { feedback },
    });
  } catch (error: any) {
    console.error("❌ Update feedback status error:", error);

    if (error.message === "Feedback not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(400).json({
      success: false,
      message: error.message || "Failed to update feedback status",
    });
  }
};

// Get feedback statistics (Admin only)
export const getFeedbackStats = async (req: AuthRequest, res: Response) => {
  try {
    const stats = await feedbackService.getFeedbackStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error("❌ Get feedback stats error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get feedback statistics",
    });
  }
};
