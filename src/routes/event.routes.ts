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
  getLeadsMoMGrowth,
  getEventPerformance,
  getStallPerformance,
  getEventROIAnalytics,
  getLeadQualityAnalytics,
  getTeamMemberPerformance,
  getMeetingConversionAnalytics,
  getDuplicateLeads,
  getLeadCaptureHeatmap,
  getEventComparison,
  getLeadDemographics,
  getExhibitorExpiringKeysAlert,
  getStallCoverageByDay,
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
router.get("/dashboard/leads-mom-growth", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getLeadsMoMGrowth);
router.get("/dashboard/event-roi", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getEventROIAnalytics);

// New analytics routes
router.get("/dashboard/lead-quality", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getLeadQualityAnalytics);
router.get("/dashboard/team-performance", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getTeamMemberPerformance);
router.get("/dashboard/meeting-conversion", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getMeetingConversionAnalytics);
router.get("/dashboard/duplicate-leads", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getDuplicateLeads);
router.get("/dashboard/lead-capture-heatmap", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getLeadCaptureHeatmap);
router.get("/dashboard/event-comparison", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getEventComparison);
router.get("/dashboard/lead-demographics", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getLeadDemographics);
router.get("/dashboard/expiring-keys-alert", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getExhibitorExpiringKeysAlert);
router.get("/dashboard/stall-coverage-by-day", authenticateToken, authorizeRoles("EXHIBITOR"), adminDashboardLimiter, getStallCoverageByDay);

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
