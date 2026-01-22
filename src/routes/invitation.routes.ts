import { Router } from "express";
import { getTeamManagers, sendInvitations } from "../controllers/invitation.controller";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware";
import { readLimiter, eventWriteLimiter } from "../middleware/rateLimiter.middleware";

const router = Router();

// Get all team managers for the exhibitor (for recipient selection)
router.get(
  "/team-managers",
  authenticateToken,
  authorizeRoles("EXHIBITOR"),
  readLimiter,
  getTeamManagers
);

// Send invitations to recipients
router.post(
  "/send",
  authenticateToken,
  authorizeRoles("EXHIBITOR"),
  eventWriteLimiter,
  sendInvitations
);

export default router;
