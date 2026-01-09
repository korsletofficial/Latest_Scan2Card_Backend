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

    // Validate firstName length (1-100) if provided
    if (firstName && (String(firstName).length < 1 || String(firstName).length > 100)) {
      return res.status(400).json({
        success: false,
        message: "firstName must be between 1 and 100 characters",
      });
    }

    // Validate lastName length (1-100) if provided
    if (lastName && (String(lastName).length < 1 || String(lastName).length > 100)) {
      return res.status(400).json({
        success: false,
        message: "lastName must be between 1 and 100 characters",
      });
    }

    // Validate phoneNumber length and format if provided
    if (phoneNumber) {
      if (String(phoneNumber).length > 20) {
        return res.status(400).json({
          success: false,
          message: "Phone number must not exceed 20 characters",
        });
      }
      const phoneRegex = /^[\d\s\-\+\(\)]+$/;
      if (!phoneRegex.test(String(phoneNumber))) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone format (use digits, spaces, dashes, plus, or parentheses)",
        });
      }
    }

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

    // Validate profileImageUrl if provided as string
    if (profileImageUrl && typeof profileImageUrl === 'string') {
      if (profileImageUrl.length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Profile image URL must not exceed 1000 characters',
        });
      }
      try {
        new URL(profileImageUrl);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid URL format for profile image',
        });
      }
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

    // Input validation
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Feedback message is required and must be a string',
      });
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Feedback message must be at least 10 characters',
      });
    }

    if (trimmedMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Feedback message must not exceed 2000 characters',
      });
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      const ratingNum = Number(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be a number between 1 and 5',
        });
      }
    }

    // Validate category if provided
    if (category && !['bug', 'feature_request', 'improvement', 'other'].includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Category must be one of: bug, feature_request, improvement, other',
      });
    }

    const sanitizedData = sanitizeEmptyStrings({
      message: trimmedMessage,
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
