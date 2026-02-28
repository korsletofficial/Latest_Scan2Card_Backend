import { Router } from "express";
import {
  getCrmStatus,
  connectZoho,
  zohoCallback,
  disconnectZoho,
  exportToZoho,
  connectSalesforce,
  salesforceCallback,
  disconnectSalesforce,
  exportToSalesforce,
} from "../controllers/crm.controller";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// ==================== CRM STATUS ====================
// GET /api/crm/status - Get connection status for Zoho & Salesforce
router.get(
  "/status",
  authenticateToken,
  authorizeRoles("ENDUSER", "EXHIBITOR", "TEAMMANAGER"),
  getCrmStatus
);

// ==================== ZOHO ====================
// GET /api/crm/zoho/connect - Get Zoho OAuth URL
router.get(
  "/zoho/connect",
  authenticateToken,
  authorizeRoles("ENDUSER", "EXHIBITOR", "TEAMMANAGER"),
  connectZoho
);

// GET /api/crm/zoho/callback - Zoho OAuth callback (no auth needed, Zoho redirects here)
router.get("/zoho/callback", zohoCallback);

// POST /api/crm/zoho/disconnect - Disconnect Zoho
router.post(
  "/zoho/disconnect",
  authenticateToken,
  authorizeRoles("ENDUSER", "EXHIBITOR", "TEAMMANAGER"),
  disconnectZoho
);

// GET /api/crm/zoho/export - Export leads to Zoho
router.get(
  "/zoho/export",
  authenticateToken,
  authorizeRoles("ENDUSER", "EXHIBITOR", "TEAMMANAGER"),
  exportToZoho
);

// ==================== SALESFORCE ====================
// GET /api/crm/salesforce/connect - Get Salesforce OAuth URL
router.get(
  "/salesforce/connect",
  authenticateToken,
  authorizeRoles("ENDUSER", "EXHIBITOR", "TEAMMANAGER"),
  connectSalesforce
);

// GET /api/crm/salesforce/callback - Salesforce OAuth callback (no auth needed)
router.get("/salesforce/callback", salesforceCallback);

// POST /api/crm/salesforce/disconnect - Disconnect Salesforce
router.post(
  "/salesforce/disconnect",
  authenticateToken,
  authorizeRoles("ENDUSER", "EXHIBITOR", "TEAMMANAGER"),
  disconnectSalesforce
);

// GET /api/crm/salesforce/export - Export leads to Salesforce
router.get(
  "/salesforce/export",
  authenticateToken,
  authorizeRoles("ENDUSER", "EXHIBITOR", "TEAMMANAGER"),
  exportToSalesforce
);

export default router;
