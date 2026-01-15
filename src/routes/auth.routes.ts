import { Router } from "express";
import {
  register,
  login,
  getProfile,
  verifyLoginOTP,
  sendVerificationOTP,
  verifyUserOTP,
  forgotPassword,
  resetPasswordWithOTP,
  changePassword,
  refreshToken,
  verifyOTPUnified,
  resetPassword,
  logout,
  deleteAccount
} from "../controllers/auth.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import {
  registerEmailLimiter,
  registerIPLimiter,
  loginEmailLimiter,
  loginIPLimiter,
  otpSendResourceLimiter,
  otpSendIPLimiter,
  otpVerifyResourceLimiter,
  otpVerifyIPLimiter,
  otpVerifyTypeLimiter,
  passwordResetEmailLimiter,
  passwordResetIPLimiter,
  readLimiter,
  profileWriteLimiter
} from "../middleware/rateLimiter.middleware";

const router = Router();

// Public routes - Authentication endpoints with resource-based rate limiting
// Register: Track by email (3/hour) + IP catch-all (500/hour)
router.post("/register", registerEmailLimiter, registerIPLimiter, register);

// Login: Track failed attempts by email (10/15min) + IP catch-all (1000/15min)
router.post("/login", loginEmailLimiter, loginIPLimiter, login);

// Refresh Token: Public route (no auth required) - Track by IP (100/15min)
router.post("/refresh-token", loginIPLimiter, refreshToken);

// ========================================================================
// UNIFIED OTP VERIFICATION ENDPOINT
// ========================================================================
// Unified OTP Verification: Supports optional 'type' parameter for all verification types
// Type-aware rate limiting: login/verification: 10/15min, forgot_password: 3/hour
// Backward compatible: defaults to "login" if type not provided
router.post("/verify-otp", otpVerifyTypeLimiter, otpVerifyIPLimiter, verifyLoginOTP);

// Send OTP: Track by email/phone (5/hour) + IP catch-all (500/hour)
router.post("/send-verification-otp", otpSendResourceLimiter, otpSendIPLimiter, sendVerificationOTP);

// Verify User: Legacy endpoint (use /verify-otp with type="verification" instead)
router.post("/verify-user", otpVerifyResourceLimiter, otpVerifyIPLimiter, verifyUserOTP);

// Forgot Password: Track by email (5/hour) + IP catch-all (500/hour)
router.post("/forgot-password", otpSendResourceLimiter, otpSendIPLimiter, forgotPassword);

// Reset Password (with Verification Token): Track by email (3/hour) + IP catch-all (200/hour)
// Step 3 of forgot password flow: After verifying OTP with /verify-otp (type=forgot_password)
router.post("/reset-password", passwordResetEmailLimiter, passwordResetIPLimiter, resetPassword);

// Protected routes - Authenticated endpoints with user-based rate limiting
router.get("/profile", authenticateToken, readLimiter, getProfile);
router.post("/change-password", authenticateToken, profileWriteLimiter, changePassword);
router.post("/logout", authenticateToken, profileWriteLimiter, logout);
router.delete("/delete-account", authenticateToken, profileWriteLimiter, deleteAccount);

export default router;
