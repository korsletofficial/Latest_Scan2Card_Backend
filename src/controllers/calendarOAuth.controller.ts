/**
 * Calendar OAuth Controller
 *
 * Handles OAuth flows for Google Calendar and Microsoft Outlook integrations.
 * Only Team Managers can connect calendar accounts.
 */

import { Request, Response } from "express";
import UserModel from "../models/user.model";
import { encrypt } from "../utils/encryption.util";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens as exchangeGoogleCode,
  revokeGoogleAccess,
  isGoogleCalendarConfigured,
} from "../services/googleCalendar.service";
import {
  getMicrosoftAuthUrl,
  exchangeMicrosoftCodeForTokens,
  isMicrosoftCalendarConfigured,
} from "../services/outlookCalendar.service";
import { getCalendarIntegrationStatus } from "../services/calendarIntegration.service";

// Extended Request with user from auth middleware
interface AuthRequest extends Request {
  user?: {
    _id: string;
    role: string;
  };
}

/**
 * Get available calendar providers and connection status
 * GET /api/calendar/oauth/status
 */
export const getOAuthStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const status = await getCalendarIntegrationStatus(userId);

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error("Error getting OAuth status:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get calendar status",
    });
  }
};

/**
 * Initiate Google OAuth flow
 * GET /api/calendar/oauth/google
 */
export const initiateGoogleOAuth = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isGoogleCalendarConfigured()) {
      return res.status(400).json({
        success: false,
        message: "Google Calendar integration is not configured on this server",
      });
    }

    // Check if user already has a calendar connected
    const user = await UserModel.findById(userId).select("calendarProvider");
    if (user?.calendarProvider) {
      return res.status(400).json({
        success: false,
        message: `You already have ${user.calendarProvider} calendar connected. Please disconnect it first.`,
      });
    }

    // Generate OAuth URL with user ID as state
    const authUrl = getGoogleAuthUrl(userId);

    return res.status(200).json({
      success: true,
      data: {
        authUrl,
        provider: "google",
      },
    });
  } catch (error: any) {
    console.error("Error initiating Google OAuth:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to initiate Google OAuth",
    });
  }
};

/**
 * Handle Google OAuth callback
 * GET /api/calendar/oauth/google/callback
 */
export const handleGoogleCallback = async (req: Request, res: Response) => {
  try {
    const { code, state, error: oauthError } = req.query;

    // Get frontend URL for redirects
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    if (oauthError) {
      console.error("Google OAuth error:", oauthError);
      return res.redirect(
        `${frontendUrl}/settings/calendar?error=${encodeURIComponent(String(oauthError))}`
      );
    }

    if (!code || !state) {
      return res.redirect(
        `${frontendUrl}/settings/calendar?error=${encodeURIComponent("Missing authorization code or state")}`
      );
    }

    const userId = state as string;

    // Verify user exists and is a Team Manager
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.redirect(
        `${frontendUrl}/settings/calendar?error=${encodeURIComponent("User not found")}`
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeGoogleCode(code as string);

    // Store encrypted tokens
    user.calendarProvider = "google";
    user.calendarAccessToken = encrypt(tokens.accessToken);
    user.calendarRefreshToken = encrypt(tokens.refreshToken);
    user.calendarTokenExpiry = tokens.expiryDate || undefined;
    user.calendarConnectedAt = new Date();
    user.calendarEmail = tokens.email || undefined;
    await user.save();

    // Redirect to frontend with success
    return res.redirect(
      `${frontendUrl}/settings/calendar?success=true&provider=google`
    );
  } catch (error: any) {
    console.error("Error handling Google OAuth callback:", error);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(
      `${frontendUrl}/settings/calendar?error=${encodeURIComponent(error.message || "Failed to connect Google Calendar")}`
    );
  }
};

/**
 * Initiate Microsoft OAuth flow
 * GET /api/calendar/oauth/outlook
 */
export const initiateMicrosoftOAuth = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isMicrosoftCalendarConfigured()) {
      return res.status(400).json({
        success: false,
        message: "Microsoft Outlook integration is not configured on this server",
      });
    }

    // Check if user already has a calendar connected
    const user = await UserModel.findById(userId).select("calendarProvider");
    if (user?.calendarProvider) {
      return res.status(400).json({
        success: false,
        message: `You already have ${user.calendarProvider} calendar connected. Please disconnect it first.`,
      });
    }

    // Generate OAuth URL with user ID as state
    const authUrl = getMicrosoftAuthUrl(userId);

    return res.status(200).json({
      success: true,
      data: {
        authUrl,
        provider: "outlook",
      },
    });
  } catch (error: any) {
    console.error("Error initiating Microsoft OAuth:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to initiate Microsoft OAuth",
    });
  }
};

/**
 * Handle Microsoft OAuth callback
 * GET /api/calendar/oauth/outlook/callback
 */
export const handleMicrosoftCallback = async (req: Request, res: Response) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    // Get frontend URL for redirects
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    if (oauthError) {
      console.error("Microsoft OAuth error:", oauthError, error_description);
      return res.redirect(
        `${frontendUrl}/settings/calendar?error=${encodeURIComponent(String(error_description || oauthError))}`
      );
    }

    if (!code || !state) {
      return res.redirect(
        `${frontendUrl}/settings/calendar?error=${encodeURIComponent("Missing authorization code or state")}`
      );
    }

    const userId = state as string;

    // Verify user exists
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.redirect(
        `${frontendUrl}/settings/calendar?error=${encodeURIComponent("User not found")}`
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeMicrosoftCodeForTokens(code as string);

    // Store encrypted tokens
    user.calendarProvider = "outlook";
    user.calendarAccessToken = encrypt(tokens.accessToken);
    user.calendarRefreshToken = encrypt(tokens.refreshToken);
    user.calendarTokenExpiry = tokens.expiryDate;
    user.calendarConnectedAt = new Date();
    user.calendarEmail = tokens.email || undefined;
    await user.save();

    // Redirect to frontend with success
    return res.redirect(
      `${frontendUrl}/settings/calendar?success=true&provider=outlook`
    );
  } catch (error: any) {
    console.error("Error handling Microsoft OAuth callback:", error);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(
      `${frontendUrl}/settings/calendar?error=${encodeURIComponent(error.message || "Failed to connect Outlook Calendar")}`
    );
  }
};

/**
 * Disconnect calendar integration
 * DELETE /api/calendar/oauth/disconnect
 */
export const disconnectCalendar = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await UserModel.findById(userId).select(
      "+calendarRefreshToken calendarProvider"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.calendarProvider) {
      return res.status(400).json({
        success: false,
        message: "No calendar is connected",
      });
    }

    const provider = user.calendarProvider;

    // Try to revoke access token (best effort)
    if (provider === "google" && user.calendarRefreshToken) {
      try {
        await revokeGoogleAccess(user.calendarRefreshToken);
      } catch (revokeError) {
        console.error("Error revoking Google access:", revokeError);
        // Continue with disconnect even if revoke fails
      }
    }
    // Note: Microsoft doesn't support programmatic token revocation

    // Clear calendar fields
    user.calendarProvider = undefined;
    user.calendarAccessToken = undefined;
    user.calendarRefreshToken = undefined;
    user.calendarTokenExpiry = undefined;
    user.calendarConnectedAt = undefined;
    user.calendarEmail = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `${provider === "google" ? "Google Calendar" : "Outlook Calendar"} disconnected successfully`,
    });
  } catch (error: any) {
    console.error("Error disconnecting calendar:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to disconnect calendar",
    });
  }
};
