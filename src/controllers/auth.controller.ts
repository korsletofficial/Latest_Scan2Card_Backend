import { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { AuthRequest } from "../middleware/auth.middleware";
import { sanitizeEmptyStrings } from "../utils/sanitize.util";

// Register new user
export const register = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, phoneNumber, password, roleName, companyName, exhibitorId } = req.body;

    // Validation
    if (!firstName || !lastName || !password || !roleName) {
      return res.status(400).json({
        success: false,
        message: "firstName, lastName, password, and roleName are required",
      });
    }

    // Validate at least one contact method
    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "At least one of email or phoneNumber must be provided",
      });
    }

    // Email validation (only if provided)
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format",
        });
      }
    }

    // Password validation (minimum 6 characters)
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    // Role validation
    const validRoles = ["SUPERADMIN", "EXHIBITOR", "TEAMMANAGER", "ENDUSER"];
    if (!validRoles.includes(roleName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
      });
    }

    const sanitizedData = sanitizeEmptyStrings({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      roleName,
      companyName,
      exhibitorId,
    });

    const result = await authService.registerUser(sanitizedData as any);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Registration error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Registration failed",
    });
  }
};

// Login user
export const login = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber, password } = req.body;

    // Validation - at least one of email or phoneNumber must be provided
    if ((!email && !phoneNumber) || !password) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number and password are required",
      });
    }

    const result = await authService.loginUser({ email, phoneNumber, password });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error: any) {
    // Special handling for 2FA
    if (error.requires2FA || (error.message && error.message.includes("2FA"))) {
      // Determine where OTP was sent based on error data
      const sentVia = error.data?.sentVia || (error.data?.phoneNumber ? "phone" : "email");
      const destination = sentVia === "phoneNumber" || sentVia === "phone"
        ? "mobile number"
        : "email";

      return res.status(200).json({
        success: true,
        requires2FA: true,
        message: `OTP sent to your ${destination}`,
        data: error.data,
      });
    }

    console.error("❌ Login error:", error);
    res.status(401).json({
      success: false,
      message: error.message || "Login failed",
    });
  }
};

// Unified OTP Verification (supports type parameter for all verification types)
export const verifyLoginOTP = async (req: Request, res: Response) => {
  try {
    const { userId, otp, type } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP are required",
      });
    }

    // Default to "login" for backward compatibility, or use provided type
    const verificationType = type || "login";

    // Validate type if provided
    const validTypes = ["login", "verification", "forgot_password"];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Use the unified verification
    const result = await authService.verifyOTPUnified(userId, otp, verificationType);

    // Type-specific response messages
    const messages: { [key: string]: string } = {
      login: "2FA verification successful",
      verification: "User verified successfully",
      forgot_password: "OTP verified. You may now reset your password",
    };

    res.status(200).json({
      success: true,
      message: messages[verificationType] || "OTP verification successful",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Verify OTP error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "OTP verification failed",
    });
  }
};

// Get current user profile
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const user = await authService.getUserById(req.user.userId);

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error: any) {
    console.error("❌ Get profile error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to get profile",
    });
  }
};

// Send verification OTP to user's phone/email
export const sendVerificationOTP = async (req: Request, res: Response) => {
  try {
    const { userId, phoneNumber } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const result = await authService.sendVerificationOTP(userId, phoneNumber);

    res.status(200).json({
      success: true,
      message: "Verification OTP sent successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Send verification OTP error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to send verification OTP",
    });
  }
};

// Verify user with OTP (Legacy - Uses unified verification internally)
export const verifyUserOTP = async (req: Request, res: Response) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP are required",
      });
    }

    // Use the new unified verification with type="verification"
    const result = await authService.verifyOTPUnified(userId, otp, "verification");

    res.status(200).json({
      success: true,
      message: "User verified successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Verify user OTP error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "User verification failed",
    });
  }
};

// Forgot password - Send OTP
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;

    console.log("Forgot password request received:", { email, phoneNumber });

    // Validate that at least one identifier is provided
    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number is required",
      });
    }

    const result = await authService.sendForgotPasswordOTP(email, phoneNumber);

    res.status(200).json({
      success: true,
      message: "Password reset OTP sent successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Forgot password error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to send password reset OTP",
    });
  }
};

// Reset password with OTP (Legacy - Uses unified verification + new reset internally)
export const resetPasswordWithOTP = async (req: Request, res: Response) => {
  try {
    const { userId, otp, newPassword } = req.body;

    console.log("Reset password request received (legacy endpoint):", {
      userId,
      otpLength: otp?.length,
      hasNewPassword: !!newPassword
    });

    // Validation
    if (!userId || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "User ID, OTP, and new password are required",
      });
    }

    // Step 1: Verify OTP using unified verification to get verification token
    const otpVerification = await authService.verifyOTPUnified(userId, otp, "forgot_password");

    if (!otpVerification.verificationToken) {
      throw new Error("Failed to generate verification token");
    }

    // Step 2: Reset password using the verification token
    const result = await authService.resetPasswordWithVerificationToken(
      userId,
      otpVerification.verificationToken,
      newPassword
    );

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Reset password error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Password reset failed",
    });
  }
};

// Change password (for logged-in users) - using profile service
import * as profileService from "../services/profile.service";

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { currentPassword, newPassword } = req.body;

    await profileService.changeUserPassword(
      req.user.userId,
      currentPassword,
      newPassword
    );

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error: any) {
    console.error("❌ Change password error:", error);

    const statusCode =
      error.message === "User not found"
        ? 404
        : error.message === "Current password is incorrect"
        ? 401
        : 400;

    res.status(statusCode).json({
      success: false,
      message: error.message || "Password change failed",
    });
  }
};

// Refresh Access Token
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    const result = await authService.refreshAccessToken(refreshToken);

    res.status(200).json({
      success: true,
      message: "Access token refreshed successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Refresh token error:", error);

    const statusCode = error.message.includes("expired") ? 401 : 400;

    res.status(statusCode).json({
      success: false,
      message: error.message || "Token refresh failed",
    });
  }
};

// Unified OTP Verification Controller
export const verifyOTPUnified = async (req: Request, res: Response) => {
  try {
    const { userId, otp, type } = req.body;

    // Validation
    if (!userId || !otp || !type) {
      return res.status(400).json({
        success: false,
        message: "userId, otp, and type are required",
      });
    }

    // Type validation
    const validTypes = ["login", "verification", "forgot_password"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    const result = await authService.verifyOTPUnified(userId, otp, type);

    // Type-specific response messages
    const messages: { [key: string]: string } = {
      login: "2FA verification successful",
      verification: "User verified successfully",
      forgot_password: "OTP verified. You may now reset your password",
    };

    res.status(200).json({
      success: true,
      message: messages[type],
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Unified OTP verification error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "OTP verification failed",
    });
  }
};

// Reset Password with Verification Token Controller
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { userId, verificationToken, newPassword } = req.body;

    // Validation
    if (!userId || !verificationToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "userId, verificationToken, and newPassword are required",
      });
    }

    const result = await authService.resetPasswordWithVerificationToken(
      userId,
      verificationToken,
      newPassword
    );

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Reset password error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Password reset failed",
    });
  }
};

// Logout Controller
export const logout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    await authService.logoutUser(req.user.userId);

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error: any) {
    console.error("❌ Logout error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Logout failed",
    });
  }
};
