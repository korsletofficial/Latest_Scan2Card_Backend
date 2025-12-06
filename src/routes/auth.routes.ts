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
  refreshToken
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

// Verify OTP: Track by email (10/15min) + IP catch-all (500/hour)
router.post("/verify-otp", otpVerifyResourceLimiter, otpVerifyIPLimiter, verifyLoginOTP);

// User verification routes
// Send OTP: Track by email/phone (5/hour) + IP catch-all (500/hour)
router.post("/send-verification-otp", otpSendResourceLimiter, otpSendIPLimiter, sendVerificationOTP);

// Verify User: Track by email (10/15min) + IP catch-all (500/hour)
router.post("/verify-user", otpVerifyResourceLimiter, otpVerifyIPLimiter, verifyUserOTP);

// Password reset routes (forgot password)
// Forgot Password: Track by email (5/hour) + IP catch-all (500/hour)
router.post("/forgot-password", otpSendResourceLimiter, otpSendIPLimiter, forgotPassword);

// Reset Password: Track by email (3/hour) + IP catch-all (200/hour)
router.post("/reset-password", passwordResetEmailLimiter, passwordResetIPLimiter, resetPasswordWithOTP);

// Protected routes - Authenticated endpoints with user-based rate limiting
router.get("/profile", authenticateToken, readLimiter, getProfile);
router.post("/change-password", authenticateToken, profileWriteLimiter, changePassword);

export default router;
