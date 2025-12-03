import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { AuthRequest } from "./auth.middleware";

/**
 * Rate Limiting Middleware with Resource-Based Tracking
 *
 * Philosophy: Track by resource (email, userId) instead of IP to support
 * event scenarios where 100+ users share the same WiFi network.
 */

// ============================================================================
// HELPER FUNCTIONS - Key Generators
// ============================================================================

/**
 * Generates key based on email from request body
 * Used for authentication endpoints (register, login, OTP, password reset)
 */
const generateEmailKey = (req: Request): string => {
  const email = req.body?.email?.toLowerCase()?.trim();
  return email || 'no-email';
};

/**
 * Generates key based on authenticated userId
 * Used for all authenticated endpoints
 */
const generateUserKey = (req: Request): string => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.userId || authReq.user?._id;
  return userId ? `${userId}` : 'no-user';
};

/**
 * Skip function for login - only count failed login attempts
 * Successful logins should not count toward rate limit
 */
const skipSuccessfulLogin = (req: Request, res: Response): boolean => {
  // If response is successful (2xx), skip rate limiting
  return res.statusCode >= 200 && res.statusCode < 300;
};

// ============================================================================
// STANDARD ERROR HANDLER
// ============================================================================

const standardHandler = (req: Request, res: Response) => {
  res.status(429).json({
    success: false,
    message: "Too many requests. Please try again later.",
    error: "Rate limit exceeded",
    retryAfter: res.getHeader("Retry-After"),
  });
};

// ============================================================================
// TIER 1: STRICT (Authentication & Security Endpoints)
// ============================================================================

/**
 * Registration Rate Limiter - Per Email
 * Prevents spam registration to same email
 * Limit: 3 attempts per email per hour
 */
export const registerEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.RATE_LIMIT_AUTH_REGISTER_PER_EMAIL) || 3,
  keyGenerator: generateEmailKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many registration attempts for this email. Please try again later.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

/**
 * Registration Rate Limiter - Per IP (Catch-All)
 * Handles event scenarios with many users on same WiFi
 * Limit: 500 registrations per IP per hour
 */
export const registerIPLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.RATE_LIMIT_AUTH_REGISTER_PER_IP) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many registration attempts from this network. Please try again later.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

/**
 * Login Rate Limiter - Per Email (Failed Attempts Only)
 * Prevents brute force attacks on specific accounts
 * Limit: 10 failed attempts per email per 15 minutes
 */
export const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_AUTH_LOGIN_FAILED_PER_EMAIL) || 10,
  keyGenerator: generateEmailKey,
  skip: skipSuccessfulLogin,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many failed login attempts for this account. Please try again later or reset your password.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

/**
 * Login Rate Limiter - Per IP (Catch-All)
 * Prevents mass brute force attacks from single IP
 * Limit: 1000 attempts per IP per 15 minutes
 */
export const loginIPLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_AUTH_LOGIN_PER_IP) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many login attempts from this network. Please try again later.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

/**
 * OTP Send Rate Limiter - Per Email/Phone
 * Prevents SMS/Email spam bombing to specific number/email
 * Limit: 5 OTP sends per email/phone per hour
 */
export const otpSendResourceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.RATE_LIMIT_AUTH_OTP_SEND_PER_RESOURCE) || 5,
  keyGenerator: generateEmailKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many OTP requests for this account. Please try again later.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

/**
 * OTP Send Rate Limiter - Per IP (Catch-All)
 * Prevents mass OTP spam from single IP
 * Limit: 500 OTP sends per IP per hour
 */
export const otpSendIPLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.RATE_LIMIT_AUTH_OTP_SEND_PER_IP) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many OTP requests from this network. Please try again later.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

/**
 * OTP Verify Rate Limiter - Per Email/Phone
 * Prevents OTP guessing attacks on specific account
 * Limit: 10 verification attempts per email/phone per 15 minutes
 */
export const otpVerifyResourceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_AUTH_OTP_VERIFY_PER_RESOURCE) || 10,
  keyGenerator: generateEmailKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many OTP verification attempts for this account. Please request a new OTP.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

/**
 * OTP Verify Rate Limiter - Per IP (Catch-All)
 * Prevents mass OTP guessing from single IP
 * Limit: 500 verification attempts per IP per hour
 */
export const otpVerifyIPLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.RATE_LIMIT_AUTH_OTP_VERIFY_PER_IP) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many OTP verification attempts from this network. Please try again later.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

/**
 * Password Reset Rate Limiter - Per Email
 * Prevents targeting specific accounts with reset requests
 * Limit: 3 reset requests per email per hour
 */
export const passwordResetEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.RATE_LIMIT_AUTH_PASSWORD_RESET_PER_EMAIL) || 3,
  keyGenerator: generateEmailKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many password reset attempts for this account. Please try again later.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

/**
 * Password Reset Rate Limiter - Per IP (Catch-All)
 * Prevents mass password reset spam from single IP
 * Limit: 200 reset requests per IP per hour
 */
export const passwordResetIPLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.RATE_LIMIT_AUTH_PASSWORD_RESET_PER_IP) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many password reset attempts from this network. Please try again later.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

// ============================================================================
// TIER 2: MODERATE (Write Operations & File Uploads)
// ============================================================================

/**
 * Card Scanning Rate Limiter
 * High limit to support rapid card scanning at events (50+ cards/min)
 * Limit: 150 scans per user per minute
 */
export const scanLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_SCAN_WINDOW) * 60 * 1000 || 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_SCAN_PER_USER) || 150,
  keyGenerator: generateUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "You are scanning too quickly. Please slow down and try again.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

/**
 * Lead Write Operations Rate Limiter
 * Limit: 100 requests per user per minute
 */
export const leadWriteLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WRITE_WINDOW) * 60 * 1000 || 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_WRITE_LEADS_PER_USER) || 100,
  keyGenerator: generateUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: standardHandler,
});

/**
 * Event Write Operations Rate Limiter
 * Limit: 100 requests per user per minute
 */
export const eventWriteLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WRITE_WINDOW) * 60 * 1000 || 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_WRITE_EVENTS_PER_USER) || 100,
  keyGenerator: generateUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: standardHandler,
});

/**
 * Meeting Write Operations Rate Limiter
 * Limit: 100 requests per user per minute
 */
export const meetingWriteLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WRITE_WINDOW) * 60 * 1000 || 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_WRITE_MEETINGS_PER_USER) || 100,
  keyGenerator: generateUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: standardHandler,
});

/**
 * Profile Update Rate Limiter
 * Lower limit as profile updates are less frequent
 * Limit: 30 requests per user per minute
 */
export const profileWriteLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WRITE_WINDOW) * 60 * 1000 || 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_WRITE_PROFILE_PER_USER) || 30,
  keyGenerator: generateUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: standardHandler,
});

/**
 * RSVP Operations Rate Limiter
 * Limit: 50 requests per user per minute
 */
export const rsvpWriteLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WRITE_WINDOW) * 60 * 1000 || 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_WRITE_RSVP_PER_USER) || 50,
  keyGenerator: generateUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: standardHandler,
});

/**
 * File Upload Rate Limiter
 * Strict limit as uploads are resource-intensive
 * Limit: 20 uploads per user per 5 minutes
 */
export const uploadLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_UPLOAD_WINDOW) * 60 * 1000 || 5 * 60 * 1000, // 5 minutes
  max: Number(process.env.RATE_LIMIT_UPLOAD_PER_USER) || 20,
  keyGenerator: generateUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many file uploads. Please wait a few minutes before uploading again.",
      error: "Rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

// ============================================================================
// TIER 3: STANDARD (Read Operations)
// ============================================================================

/**
 * Read Operations Rate Limiter
 * Generous limit for GET requests to support dashboard polling
 * Limit: 200 requests per user per minute
 */
export const readLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_READ_WINDOW) * 60 * 1000 || 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_READ_PER_USER) || 200,
  keyGenerator: generateUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: standardHandler,
});

// ============================================================================
// TIER 4: ADMIN (Dashboard & Analytics)
// ============================================================================

/**
 * Admin Operations Rate Limiter
 * Higher limit for trusted admin users
 * Limit: 300 requests per user per minute
 */
export const adminLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_ADMIN_WINDOW) * 60 * 1000 || 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_ADMIN_PER_USER) || 300,
  keyGenerator: generateUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: standardHandler,
});

/**
 * Admin Dashboard Rate Limiter
 * Very high limit for dashboard stats endpoints that poll frequently
 * Limit: 500 requests per user per minute
 */
export const adminDashboardLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_ADMIN_WINDOW) * 60 * 1000 || 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_ADMIN_DASHBOARD_PER_USER) || 500,
  keyGenerator: generateUserKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  handler: standardHandler,
});

// ============================================================================
// GLOBAL CATCH-ALL RATE LIMITER
// ============================================================================

/**
 * Global Rate Limiter - Per IP (Catch-All Protection)
 * Very high limit to handle event WiFi scenarios with 100+ concurrent users
 * Only triggers in extreme abuse scenarios
 * Limit: 5000 requests per IP per 15 minutes
 */
export const globalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_GLOBAL_WINDOW) * 60 * 1000 || 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_GLOBAL_PER_IP) || 5000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests from this network. Please contact support if you believe this is an error.",
      error: "Global rate limit exceeded",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});
