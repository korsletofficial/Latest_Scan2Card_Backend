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
  exportLeads,
} from "../controllers/lead.controller";
import multer from 'multer';
const leadUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 3 } });
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware";

const router = express.Router();

// All routes require authentication and ENDUSER or EXHIBITOR role
router.use(authenticateToken);
router.use(authorizeRoles("ENDUSER", "EXHIBITOR"));

// Business card scanning route
router.post("/scan-card", scanCard);
// QR code scanning route (digital business card)
router.post("/scan-qr", scanQRCode);

// Lead CRUD routes
// Lead CRUD routes (accept up to 3 images for createLead)
router.post("/", leadUpload.array('images', 3), createLead);
router.get("/", getLeads);
router.get("/analytics", getLeadAnalytics);
router.get("/stats", getLeadStats);
router.get("/export", exportLeads);
router.get("/:id", getLeadById);
router.put("/:id", updateLead);
router.delete("/:id", deleteLead);

export default router;
