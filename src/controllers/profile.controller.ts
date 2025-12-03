import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as profileService from "../services/profile.service";
import * as feedbackService from "../services/feedback.service";
import { sanitizeEmptyStrings } from "../utils/sanitize.util";

// Update user profile
// Supports both JSON and multipart/form-data
// If file is uploaded, it will be uploaded to S3 automatically
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { firstName, lastName, phoneNumber } = req.body;
    const userId = req.user.userId;

    let profileImageUrl = req.body.profileImage;

    // If a file is uploaded, upload to S3 first
    if (req.file) {
      console.log(`📤 Uploading profile image for user ${userId}`);

      // Validate file type
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'Only image files (JPEG, PNG, GIF, WebP) are allowed for profile images',
        });
      }

      // Import uploadFileToS3 dynamically
      const { uploadFileToS3 } = await import('../services/awsS3.service');

      // Upload to S3 (make PUBLIC for profile images so they don't expire)
      const result = await uploadFileToS3(req.file, {
        folder: 'profile-images',
        makePublic: true, // PUBLIC so no expiry!
        expiresIn: 31536000, // 1 year (only relevant if private)
      });

      profileImageUrl = result.publicUrl || result.url;
      console.log(`✅ Profile image uploaded: ${result.key}`);
    }

    const sanitizedData = sanitizeEmptyStrings({
      firstName,
      lastName,
      phoneNumber,
      profileImage: profileImageUrl,
    });

    const user = await profileService.updateUserProfile(userId, sanitizedData);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: { user },
    });
  } catch (error: any) {
    console.error("❌ Update profile error:", error);
    res.status(error.message === "User not found" ? 404 : 400).json({
      success: false,
      message: error.message || "Failed to update profile",
    });
  }
};

// Change password
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    await profileService.changeUserPassword(userId, currentPassword, newPassword);

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error: any) {
    console.error("❌ Change password error:", error);

    const statusCode =
      error.message === "User not found" ? 404 :
      error.message === "Current password is incorrect" ? 400 : 400;

    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to change password",
    });
  }
};

// Submit feedback
export const submitFeedback = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { message, rating, category } = req.body;
    const userId = req.user.userId;

    const sanitizedData = sanitizeEmptyStrings({
      message,
      rating,
      category,
    });

    const feedback = await feedbackService.submitFeedback(userId, sanitizedData);

    res.status(201).json({
      success: true,
      message: "Feedback submitted successfully",
      data: { feedback },
    });
  } catch (error: any) {
    console.error("❌ Submit feedback error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to submit feedback",
    });
  }
};

// Get user's feedback history
export const getMyFeedback = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userId = req.user.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await feedbackService.getUserFeedback(userId, page, limit);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Get feedback error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get feedback",
    });
  }
};

// Toggle 2FA
export const toggle2FA = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { enabled } = req.body;
    const userId = req.user.userId;

    const sanitizedData = sanitizeEmptyStrings({ enabled });
    const user = await profileService.toggle2FA(userId, sanitizedData.enabled);

    res.status(200).json({
      success: true,
      message: `2FA ${enabled ? "enabled" : "disabled"} successfully`,
      data: { user },
    });
  } catch (error: any) {
    console.error("❌ Toggle 2FA error:", error);
    res.status(error.message === "User not found" ? 404 : 400).json({
      success: false,
      message: error.message || "Failed to toggle 2FA",
    });
  }
};
