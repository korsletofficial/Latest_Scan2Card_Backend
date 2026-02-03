import express from "express";
import {
  scanCard,
  scanQRCode,
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  getLeadStats,
  getLeadAnalytics,
  getLeadStatsByPeriod,
  exportLeads,
  getTrialStatus,
} from "../controllers/lead.controller";
import multer from 'multer';
const leadUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 4 } });
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware";
import {
  scanLimiter,
  leadWriteLimiter,
  readLimiter
} from "../middleware/rateLimiter.middleware";

const router = express.Router();

// All routes require authentication and ENDUSER, EXHIBITOR or TEAMMANAGER role
router.use(authenticateToken);
router.use(authorizeRoles("ENDUSER", "EXHIBITOR", "TEAMMANAGER"));

// Business card scanning routes - High limit for rapid scanning (150/min per user)
router.post("/scan-card", scanLimiter, scanCard);
router.post("/scan-qr", scanLimiter, scanQRCode);

// Lead CRUD routes
// Create lead (with file upload) - Moderate limit (100/min per user)
// Accepts: images (max 3) and noteAudio (max 1 audio file for notes)
router.post("/", leadWriteLimiter, leadUpload.fields([
  { name: 'images', maxCount: 3 },
  { name: 'noteAudio', maxCount: 1 }
]), createLead);

// Read operations - Standard limit (200/min per user)
router.get("/", readLimiter, getLeads);
router.get("/analytics", readLimiter, getLeadAnalytics);
router.get("/stats", readLimiter, getLeadStats);
router.get("/stats-by-period", readLimiter, getLeadStatsByPeriod);
router.get("/trial-status", readLimiter, getTrialStatus);
router.get("/export", readLimiter, exportLeads);
router.get("/:id", readLimiter, getLeadById);

// Update/Delete - Moderate limit (100/min per user)
// Update lead (with optional audio file upload for notes)
router.put("/:id", leadWriteLimiter, leadUpload.fields([
  { name: 'noteAudio', maxCount: 1 }
]), updateLead);
router.delete("/:id", leadWriteLimiter, deleteLead);

export default router;
