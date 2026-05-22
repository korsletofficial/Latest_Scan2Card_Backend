import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import UserDashboardPreferences from "../models/userDashboardPreferences.model";

export const getDashboardPreferences = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const prefs = await UserDashboardPreferences.findOne({ userId });

    return res.status(200).json({
      success: true,
      message: "Preferences fetched successfully",
      data: {
        pinnedWidgets: prefs?.pinnedWidgets ?? [],
        analyticsOrder: prefs?.analyticsOrder ?? [],
      },
    });
  } catch (error) {
    console.error("getDashboardPreferences error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch preferences",
    });
  }
};

export const saveDashboardPreferences = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { pinnedWidgets, analyticsOrder } = req.body;

    if (!Array.isArray(pinnedWidgets)) {
      return res.status(400).json({ success: false, message: "pinnedWidgets must be an array of strings" });
    }
    if (!Array.isArray(analyticsOrder)) {
      return res.status(400).json({ success: false, message: "analyticsOrder must be an array of strings" });
    }
    if (pinnedWidgets.some((v: unknown) => typeof v !== "string")) {
      return res.status(400).json({ success: false, message: "pinnedWidgets must be an array of strings" });
    }
    if (analyticsOrder.some((v: unknown) => typeof v !== "string")) {
      return res.status(400).json({ success: false, message: "analyticsOrder must be an array of strings" });
    }
    if (pinnedWidgets.length > 30 || analyticsOrder.length > 30) {
      return res.status(400).json({ success: false, message: "Array length must not exceed 30" });
    }

    const saved = await UserDashboardPreferences.findOneAndUpdate(
      { userId },
      { $set: { pinnedWidgets, analyticsOrder, updatedAt: new Date() } },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Preferences saved successfully",
      data: {
        pinnedWidgets: saved!.pinnedWidgets,
        analyticsOrder: saved!.analyticsOrder,
      },
    });
  } catch (error) {
    console.error("saveDashboardPreferences error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save preferences",
    });
  }
};
