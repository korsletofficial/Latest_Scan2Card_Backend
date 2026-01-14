import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware";
import {
  generateToken,
  revokeToken,
  getFeedStatus,
  getCalendarFeed,
} from "../controllers/calendar.controller";
import { adminLimiter } from "../middleware/rateLimiter.middleware";

const router = Router();

// Authenticated routes (TEAMMANAGER only)
router.post("/token", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, generateToken);
router.delete("/token", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, revokeToken);
router.get("/status", authenticateToken, authorizeRoles("TEAMMANAGER"), adminLimiter, getFeedStatus);

// Public route - calendar feed (no auth required, token in URL)
router.get("/feed/:token", getCalendarFeed);

export default router;
