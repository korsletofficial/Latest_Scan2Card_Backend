import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware";
import {
  generateToken,
  revokeToken,
  getFeedStatus,
  getCalendarFeed,
} from "../controllers/calendar.controller";
import {
  getOAuthStatus,
  initiateGoogleOAuth,
  handleGoogleCallback,
  initiateMicrosoftOAuth,
  handleMicrosoftCallback,
  disconnectCalendar,
} from "../controllers/calendarOAuth.controller";
import { adminLimiter } from "../middleware/rateLimiter.middleware";

const router = Router();

// ============================================
// Calendar Feed Routes (iCalendar subscription - fallback)
// ============================================

// Authenticated routes (TEAMMANAGER only)
router.post("/token", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, generateToken);
router.delete("/token", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, revokeToken);
router.get("/status", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, getFeedStatus);

// Public route - calendar feed (no auth required, token in URL)
router.get("/feed/:token", getCalendarFeed);

// ============================================
// Calendar OAuth Routes (Google & Microsoft integration)
// ============================================

// Get OAuth connection status and available providers
router.get("/oauth/status", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, getOAuthStatus);

// Google Calendar OAuth
router.get("/oauth/google", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, initiateGoogleOAuth);
router.get("/oauth/google/callback", handleGoogleCallback); // Public - OAuth redirect

// Microsoft Outlook OAuth
router.get("/oauth/outlook", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, initiateMicrosoftOAuth);
router.get("/oauth/outlook/callback", handleMicrosoftCallback); // Public - OAuth redirect

// Disconnect calendar integration
router.delete("/oauth/disconnect", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, disconnectCalendar);

export default router;
