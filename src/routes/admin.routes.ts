import { Request, RequestHandler, Router } from "express";
import {
  createExhibitor,
  getExhibitors,
  getExhibitorById,
  updateExhibitor,
  deleteExhibitor,
  getDashboardStats,
  getEventsTrend,
  getLeadsTrend,
  getLicenseKeysTrend,
  getTopPerformers,
  getExhibitorKeys,
  updateKeyPaymentStatus
} from "../controllers/admin.controller";
import { authenticateToken, AuthRequest } from "../middleware/auth.middleware";
import {
  adminDashboardLimiter,
  adminLimiter
} from "../middleware/rateLimiter.middleware";

const router = Router();

const ensureSuperAdmin: RequestHandler = (req, res, next) => {
  const { user } = req as AuthRequest;
  if (!user || user.activeRole !== "SUPERADMIN") {
    return res.status(403).json({ message: "Only SUPERADMIN users can perform this action." });
  }
  return next();
};

// Dashboard routes - High limit for frequent polling (500/min per user)
router.get("/dashboard/stats", authenticateToken, ensureSuperAdmin, adminDashboardLimiter, getDashboardStats);
router.get("/dashboard/trends/events", authenticateToken, ensureSuperAdmin, adminDashboardLimiter, getEventsTrend);
router.get("/dashboard/trends/leads", authenticateToken, ensureSuperAdmin, adminDashboardLimiter, getLeadsTrend);
router.get("/dashboard/trends/keys", authenticateToken, ensureSuperAdmin, adminDashboardLimiter, getLicenseKeysTrend);

// Exhibitor CRUD routes - Admin limit (300/min per user)
router.post("/exhibitors", authenticateToken, ensureSuperAdmin, adminLimiter, createExhibitor);
router.get("/exhibitors", authenticateToken, ensureSuperAdmin, adminLimiter, getExhibitors);
router.get("/exhibitors/top-performers", authenticateToken, ensureSuperAdmin, adminLimiter, getTopPerformers);
router.get("/exhibitors/:id", authenticateToken, ensureSuperAdmin, adminLimiter, getExhibitorById);
router.get("/exhibitors/:id/keys", authenticateToken, ensureSuperAdmin, adminLimiter, getExhibitorKeys);
router.put("/exhibitors/:id", authenticateToken, ensureSuperAdmin, adminLimiter, updateExhibitor);
router.delete("/exhibitors/:id", authenticateToken, ensureSuperAdmin, adminLimiter, deleteExhibitor);

// License Key Payment Status - Admin limit (300/min per user)
router.put("/events/:eventId/keys/:keyId/payment-status", authenticateToken, ensureSuperAdmin, adminLimiter, updateKeyPaymentStatus);

export default router;
