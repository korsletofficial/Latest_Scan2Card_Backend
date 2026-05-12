import express from "express";
import {
  createRsvp,
  getMyRsvps,
  getEventRsvps,
  cancelRsvp,
  getRsvpById,
  validateLicenseKey,
  exitEvent,
  rejoinEvent,
} from "../controllers/rsvp.controller";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware";
import {
  rsvpWriteLimiter,
  readLimiter
} from "../middleware/rateLimiter.middleware";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Write operations - Moderate limit (50/min per user)
router.post("/validate", rsvpWriteLimiter, validateLicenseKey);
router.post("/", rsvpWriteLimiter, createRsvp);
router.patch("/event/:eventId/exit", rsvpWriteLimiter, exitEvent);
router.patch("/event/:eventId/rejoin", rsvpWriteLimiter, rejoinEvent);
router.delete("/:rsvpId", rsvpWriteLimiter, cancelRsvp);

// Read operations - Standard limit (200/min per user)
router.get("/my-rsvps", readLimiter, getMyRsvps);
router.get("/:rsvpId", readLimiter, getRsvpById);
router.get("/event/:eventId", authorizeRoles("EXHIBITOR"), readLimiter, getEventRsvps);

export default router;
