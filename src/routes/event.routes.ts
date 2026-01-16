import { Router } from "express";
import {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  generateLicenseKeyForEvent,
  bulkGenerateLicenseKeys,
  getLicenseKeys,
  updateLicenseKey,
  getExhibitorDashboardStats,
  getTopEventsByLeads,
  getLeadsTrend,
  getEventPerformance,
  getStallPerformance,
} from "../controllers/event.controller";

import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware";
import {
  adminDashboardLimiter,
  eventWriteLimiter,
  readLimiter
} from "../middleware/rateLimiter.middleware";

const router = Router();

// Dashboard routes - High limit for frequent polling (500/min per user)
router.get("/dashboard/stats", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getExhibitorDashboardStats);
router.get("/dashboard/top-events", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getTopEventsByLeads);
router.get("/dashboard/leads-trend", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getLeadsTrend);
router.get("/dashboard/event-performance", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getEventPerformance);
router.get("/dashboard/stall-performance", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getStallPerformance);


// Event CRUD routes - All require authentication and EXHIBITOR role
// Write operations - Moderate limit (100/min per user)
router.post("/", authenticateToken, authorizeRoles("EXHIBITOR"), eventWriteLimiter, createEvent);
router.put("/:id", authenticateToken, authorizeRoles("EXHIBITOR"), eventWriteLimiter, updateEvent);
router.delete("/:id", authenticateToken, authorizeRoles("EXHIBITOR"), eventWriteLimiter, deleteEvent);

// Read operations - Standard limit (200/min per user)
router.get("/", authenticateToken, authorizeRoles("EXHIBITOR"), readLimiter, getEvents);
router.get("/:id", authenticateToken, authorizeRoles("EXHIBITOR"), readLimiter, getEventById);

// License key routes - Write operations (100/min per user)
router.post("/:id/license-keys", authenticateToken, authorizeRoles("EXHIBITOR"), eventWriteLimiter, generateLicenseKeyForEvent);
router.post("/:id/license-keys/bulk", authenticateToken, authorizeRoles("EXHIBITOR"), eventWriteLimiter, bulkGenerateLicenseKeys);
router.get("/:id/license-keys", authenticateToken, authorizeRoles("EXHIBITOR"), readLimiter, getLicenseKeys);
router.put("/:id/license-keys/:licenseKeyId", authenticateToken, authorizeRoles("EXHIBITOR"), eventWriteLimiter, updateLicenseKey);

export default router;
